import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, beforeAll, expect, test } from 'vitest'

const tempDirectory = await mkdtemp(join(tmpdir(), 'blog-auth-test-'))
process.env.TURSO_CONNECTION_URL = `file:${join(tempDirectory, 'test.db')}`
process.env.TURSO_AUTH_TOKEN = 'test-token'

const { db } = await import('../db')
const {
  authAuditEvents,
  authPasswordCredentials,
  authSessions,
  authUsers,
  users,
} = await import('../db/schema')
const { bootstrapAdministrator, recoverAdministratorPassword } = await import(
  './account'
)
const { SESSION_COOKIE_NAME } = await import('./cookie')
const {
  SESSION_IDLE_DURATION_MS,
  createSession,
  hashSessionToken,
  revokeUserSessions,
  validateSessionToken,
} = await import('./session')
const { hashPassword } = await import('./password')
const { createApp } = await import('../server')

const migrationsFolder = fileURLToPath(
  new URL('../../migrations', import.meta.url),
)

const administrator = {
  email: 'admin@example.com',
  displayName: 'Blog Administrator',
  password: 'a long test password',
}

let authenticatedPostId: string

beforeAll(async () => {
  await migrate(db, { migrationsFolder })
  await bootstrapAdministrator(administrator)
})

afterAll(async () => {
  await rm(tempDirectory, { recursive: true, force: true })
})

const app = createApp()

const graphql = async (
  query: string,
  variables?: Record<string, unknown>,
  cookie?: string,
) =>
  app.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ query, variables }),
  })

const responseJson = async (response: Response) =>
  response.json() as Promise<{
    data?: Record<string, unknown>
    errors?: Array<{ message: string; extensions?: { code?: string } }>
  }>

const login = async () => {
  const response = await graphql(
    `mutation Login($input: LoginInput!) {
      login(input: $input) { id email displayName roles }
    }`,
    { input: { email: administrator.email, password: administrator.password } },
  )
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) throw new Error('Login did not set a session cookie')
  const cookie = setCookie.split(';', 1)[0]
  return { response, setCookie, cookie }
}

test('bootstrap creates one explicit administrator and cannot run twice', {
  tags: ['integration'],
}, async () => {
  const [role] = await db.query.authUserRoles.findMany()
  expect(role.role).toBe('administrator')

  await expect(bootstrapAdministrator(administrator)).rejects.toThrow(
    'Bootstrap refused because an authentication user already exists',
  )
})

test('login uses a secure opaque cookie and stores only its hash', {
  tags: ['integration'],
}, async () => {
  const { response, setCookie, cookie } = await login()
  const body = await responseJson(response)

  expect(body.errors).toBeUndefined()
  expect(setCookie).toMatch(/HttpOnly/i)
  expect(setCookie).toMatch(/SameSite=Lax/i)
  expect(setCookie).toMatch(/Path=\//i)
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`))

  const token = cookie.slice(cookie.indexOf('=') + 1)
  const [session] = await db.select().from(authSessions)
  expect(session.id).not.toBe(token)
  expect(session.id).toBe(hashSessionToken(token))
})

test('invalid and unknown credentials return the same public error', {
  tags: ['integration'],
}, async () => {
  const query = `mutation Login($input: LoginInput!) {
      login(input: $input) { id }
    }`
  const wrongPassword = await responseJson(
    await graphql(query, {
      input: { email: administrator.email, password: 'wrong password' },
    }),
  )
  const unknownEmail = await responseJson(
    await graphql(query, {
      input: { email: 'unknown@example.com', password: 'wrong password' },
    }),
  )

  expect(wrongPassword.errors?.[0]?.message).toBe('Invalid email or password')
  expect(unknownEmail.errors?.[0]?.message).toBe('Invalid email or password')
  expect(wrongPassword.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
  expect(unknownEmail.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
})

test('authenticated viewer and administrator mutation use the session', {
  tags: ['integration'],
}, async () => {
  const { cookie } = await login()
  const viewer = await responseJson(
    await graphql('{ viewer { email displayName roles } }', undefined, cookie),
  )
  expect(viewer.data?.viewer).toEqual({
    email: administrator.email,
    displayName: administrator.displayName,
    roles: ['ADMINISTRATOR'],
  })

  const mutation = await responseJson(
    await graphql(
      `mutation {
          putPost(input: {
            slug: "authenticated-post"
            title: "Authenticated post"
            markdownContent: "Private edit"
          }) { id slug publishedAt }
        }`,
      undefined,
      cookie,
    ),
  )
  const createdPost = mutation.data?.putPost as
    | {
        id: string
        slug: string
        publishedAt: string | null
      }
    | undefined
  if (!createdPost) throw new Error('putPost returned no post')
  expect(createdPost).toEqual({
    id: createdPost.id,
    slug: 'authenticated-post',
    publishedAt: null,
  })
  expect(typeof createdPost.id).toBe('string')
  authenticatedPostId = createdPost.id
})

test('public reads remain open while anonymous and roleless writes fail', {
  tags: ['integration'],
}, async () => {
  const publicRead = await responseJson(
    await graphql(
      `query DraftVisibility($id: ID!) {
          posts { id }
          post(id: $id) { id }
          postBySlug(slug: "authenticated-post") { id }
        }`,
      { id: authenticatedPostId },
    ),
  )
  expect(publicRead.data).toEqual({
    posts: [],
    post: null,
    postBySlug: null,
  })

  const anonymousWrite = await responseJson(
    await graphql('mutation { deletePost(id: "authenticated-post") { id } }'),
  )
  expect(anonymousWrite.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
  const anonymousPublish = await responseJson(
    await graphql(
      `mutation Publish($id: ID!) {
          publishPost(id: $id) { id }
        }`,
      { id: authenticatedPostId },
    ),
  )
  expect(anonymousPublish.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED')
  const anonymousMediaUpload = await responseJson(
    await graphql(
      `mutation {
          prepareMediaUpload(input: {
            filename: "image.png"
            contentType: "image/png"
            size: 100
            altText: "Image"
          }) { uploadUrl }
        }`,
    ),
  )
  expect(anonymousMediaUpload.errors?.[0]?.extensions?.code).toBe(
    'UNAUTHENTICATED',
  )
  const anonymousMediaFinalize = await responseJson(
    await graphql('mutation { finalizeMediaUpload(id: "missing") { id } }'),
  )
  expect(anonymousMediaFinalize.errors?.[0]?.extensions?.code).toBe(
    'UNAUTHENTICATED',
  )

  const rolelessUserId = crypto.randomUUID()
  await db.insert(authUsers).values({ id: rolelessUserId })
  await db.insert(users).values({ id: rolelessUserId, displayName: 'Roleless' })
  await db.insert(authPasswordCredentials).values({
    authUserId: rolelessUserId,
    email: 'roleless@example.com',
    passwordHash: await hashPassword('another long test password'),
  })
  const { token } = await createSession(rolelessUserId)
  const rolelessCookie = `${SESSION_COOKIE_NAME}=${token}`
  const rolelessRead = await responseJson(
    await graphql(
      `query DraftVisibility($id: ID!) {
          posts { id }
          post(id: $id) { id }
          postBySlug(slug: "authenticated-post") { id }
        }`,
      { id: authenticatedPostId },
      rolelessCookie,
    ),
  )
  expect(rolelessRead.data).toEqual(publicRead.data)

  const rolelessWrite = await responseJson(
    await graphql(
      'mutation { deletePost(id: "authenticated-post") { id } }',
      undefined,
      rolelessCookie,
    ),
  )
  expect(rolelessWrite.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
  const rolelessUnpublish = await responseJson(
    await graphql(
      `mutation Unpublish($id: ID!) {
          unpublishPost(id: $id) { id }
        }`,
      { id: authenticatedPostId },
      rolelessCookie,
    ),
  )
  expect(rolelessUnpublish.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
})

test('administrator can read drafts and control publication timing', {
  tags: ['integration'],
}, async () => {
  const { cookie } = await login()
  const administratorRead = await responseJson(
    await graphql(
      `query DraftVisibility($id: ID!) {
          posts { id publishedAt }
          post(id: $id) { id publishedAt }
          postBySlug(slug: "authenticated-post") { id publishedAt }
        }`,
      { id: authenticatedPostId },
      cookie,
    ),
  )
  const draft = { id: authenticatedPostId, publishedAt: null }
  expect(administratorRead.data).toEqual({
    posts: [draft],
    post: draft,
    postBySlug: draft,
  })

  const scheduledAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString()
  const schedule = await responseJson(
    await graphql(
      `mutation Schedule($id: ID!, $publishedAt: DateTimeISO!) {
          publishPost(id: $id, publishedAt: $publishedAt) {
            id
            publishedAt
            revisions { nodes { id } }
          }
        }`,
      { id: authenticatedPostId, publishedAt: scheduledAt },
      cookie,
    ),
  )
  expect(schedule.errors).toBeUndefined()
  expect(
    (schedule.data?.publishPost as { publishedAt?: string })?.publishedAt,
  ).toBeTruthy()
  expect(
    (schedule.data?.publishPost as { revisions?: { nodes: unknown[] } })
      ?.revisions?.nodes,
  ).toEqual([])

  const scheduledRead = await responseJson(
    await graphql(
      `query ScheduledVisibility($id: ID!) {
          posts { id }
          post(id: $id) { id }
          postBySlug(slug: "authenticated-post") { id }
        }`,
      { id: authenticatedPostId },
    ),
  )
  expect(scheduledRead.data).toEqual({
    posts: [],
    post: null,
    postBySlug: null,
  })

  const publish = await responseJson(
    await graphql(
      `mutation Publish($id: ID!) {
          publishPost(id: $id) {
            publishedAt
          }
        }`,
      { id: authenticatedPostId },
      cookie,
    ),
  )
  expect(
    (publish.data?.publishPost as { publishedAt?: string })?.publishedAt,
  ).toBeTruthy()

  const publishedRead = await responseJson(
    await graphql(
      `query PublishedVisibility($id: ID!) {
          posts { id }
          post(id: $id) { id }
          postBySlug(slug: "authenticated-post") { id }
        }`,
      { id: authenticatedPostId },
    ),
  )
  const published = { id: authenticatedPostId }
  expect(publishedRead.data).toEqual({
    posts: [published],
    post: published,
    postBySlug: published,
  })

  const unpublish = await responseJson(
    await graphql(
      `mutation Unpublish($id: ID!) {
          unpublishPost(id: $id) {
            publishedAt
          }
        }`,
      { id: authenticatedPostId },
      cookie,
    ),
  )
  expect(unpublish.data?.unpublishPost).toEqual({
    publishedAt: null,
  })

  const unpublishedRead = await responseJson(
    await graphql(
      '{ posts { id } postBySlug(slug: "authenticated-post") { id } }',
    ),
  )
  expect(unpublishedRead.data).toEqual({ posts: [], postBySlug: null })
})

test('logout revokes the session and clears its cookie', {
  tags: ['integration'],
}, async () => {
  const { cookie } = await login()
  const response = await graphql('mutation { logout }', undefined, cookie)
  const body = await responseJson(response)
  const setCookie = response.headers.get('set-cookie')

  expect(body.data).toEqual({ logout: true })
  expect(setCookie ?? '').toMatch(/Max-Age=0/i)

  const viewer = await responseJson(
    await graphql('{ viewer { id } }', undefined, cookie),
  )
  expect(viewer.data?.viewer).toBeNull()
})

test('expired and disabled-user sessions are rejected and deleted', {
  tags: ['integration'],
}, async () => {
  const [administratorUser] = await db.select().from(authUsers)
  const expired = await createSession(
    administratorUser.id,
    new Date(Date.now() - SESSION_IDLE_DURATION_MS - 1_000),
  )
  const expiredResult = await validateSessionToken(expired.token)
  expect(expiredResult.session).toBeNull()

  const disabledUserId = crypto.randomUUID()
  await db.insert(authUsers).values({ id: disabledUserId, status: 'disabled' })
  await db.insert(users).values({ id: disabledUserId, displayName: 'Disabled' })
  await db.insert(authPasswordCredentials).values({
    authUserId: disabledUserId,
    email: 'disabled@example.com',
    passwordHash: await hashPassword('disabled long test password'),
  })
  const disabled = await createSession(disabledUserId)
  const disabledResult = await validateSessionToken(disabled.token)
  expect(disabledResult.session).toBeNull()
  expect(
    await db.query.authSessions.findFirst({
      where: { id: hashSessionToken(disabled.token) },
    }),
  ).toBeUndefined()
})

test('sessions renew inside the renewal window and can be revoked together', {
  tags: ['integration'],
}, async () => {
  const [administratorUser] = await db.select().from(authUsers)
  const now = new Date()
  const createdAt = new Date(
    now.getTime() - SESSION_IDLE_DURATION_MS + 10 * 24 * 60 * 60 * 1_000,
  )
  const renewable = await createSession(administratorUser.id, createdAt)
  const result = await validateSessionToken(renewable.token, now)

  expect(result.renewed).toBe(true)
  if (!result.session) throw new Error('renewal returned no session')
  expect(result.session.expiresAt.getTime()).toBeGreaterThan(
    renewable.session.expiresAt.getTime(),
  )

  await revokeUserSessions(administratorUser.id)
  expect(
    await db.query.authSessions.findFirst({
      where: { authUserId: administratorUser.id },
    }),
  ).toBeUndefined()
})

test('recovering a password replaces the credential, revokes sessions, and audits it', {
  tags: ['integration'],
}, async () => {
  const [credential] = await db
    .select({ authUserId: authPasswordCredentials.authUserId })
    .from(authPasswordCredentials)
    .where(eq(authPasswordCredentials.email, administrator.email))
  const priorSession = await createSession(credential.authUserId)
  const newPassword = 'a replacement long password'

  const authUserId = await recoverAdministratorPassword(
    administrator.email,
    newPassword,
  )
  expect(authUserId).toBe(credential.authUserId)

  const newLogin = await responseJson(
    await graphql(
      `mutation Login($input: LoginInput!) {
          login(input: $input) { email }
        }`,
      { input: { email: administrator.email, password: newPassword } },
    ),
  )
  expect(newLogin.data?.login).toEqual({ email: administrator.email })

  const oldLogin = await responseJson(
    await graphql(
      `mutation Login($input: LoginInput!) {
          login(input: $input) { email }
        }`,
      {
        input: {
          email: administrator.email,
          password: administrator.password,
        },
      },
    ),
  )
  expect(oldLogin.errors?.[0]?.message).toBe('Invalid email or password')

  const survivor = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, hashSessionToken(priorSession.token)))
  expect(survivor).toEqual([])

  const auditEvents = await db
    .select()
    .from(authAuditEvents)
    .where(
      and(
        eq(authAuditEvents.subjectAuthUserId, credential.authUserId),
        eq(authAuditEvents.eventType, 'administrator.password.recovered'),
      ),
    )
  expect(auditEvents).toHaveLength(1)
})

test('recovery refuses an unknown email address', {
  tags: ['integration'],
}, async () => {
  await expect(
    recoverAdministratorPassword(
      'missing@example.com',
      'a replacement long password',
    ),
  ).rejects.toThrow('No account exists with that email address')
})

test('recovery refuses a disabled account', {
  tags: ['integration'],
}, async () => {
  const disabledUserId = crypto.randomUUID()
  await db.insert(authUsers).values({ id: disabledUserId, status: 'disabled' })
  await db
    .insert(users)
    .values({ id: disabledUserId, displayName: 'Disabled recovery' })
  await db.insert(authPasswordCredentials).values({
    authUserId: disabledUserId,
    email: 'recovery-disabled@example.com',
    passwordHash: await hashPassword('disabled long test password'),
  })

  await expect(
    recoverAdministratorPassword(
      'recovery-disabled@example.com',
      'a replacement long password',
    ),
  ).rejects.toThrow('That account is disabled; enable it before recovering it')
})
