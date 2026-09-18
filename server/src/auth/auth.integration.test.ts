import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/libsql/migrator'

const tempDirectory = await mkdtemp(join(tmpdir(), 'blog-auth-test-'))
process.env.TURSO_CONNECTION_URL = `file:${join(tempDirectory, 'test.db')}`
process.env.TURSO_AUTH_TOKEN = 'test-token'

const { db } = await import('../db')
const { authPasswordCredentials, authSessions, authUsers, users } =
  await import('../db/schema')
const { bootstrapAdministrator } = await import('./account')
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

before(async () => {
  await migrate(db, { migrationsFolder })
  await bootstrapAdministrator(administrator)
})

after(async () => {
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
  assert.ok(setCookie)
  const cookie = setCookie.split(';', 1)[0]
  return { response, setCookie, cookie }
}

test('bootstrap creates one explicit administrator and cannot run twice', async () => {
  const [role] = await db.query.authUserRoles.findMany()
  assert.equal(role.role, 'administrator')

  await assert.rejects(bootstrapAdministrator(administrator), {
    message: 'Bootstrap refused because an authentication user already exists',
  })
})

test('login uses a secure opaque cookie and stores only its hash', async () => {
  const { response, setCookie, cookie } = await login()
  const body = await responseJson(response)

  assert.equal(body.errors, undefined)
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Lax/i)
  assert.match(setCookie, /Path=\//i)
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=`))

  const token = cookie.slice(cookie.indexOf('=') + 1)
  const [session] = await db.select().from(authSessions)
  assert.notEqual(session.id, token)
  assert.equal(session.id, hashSessionToken(token))
})

test('invalid and unknown credentials return the same public error', async () => {
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

  assert.equal(wrongPassword.errors?.[0]?.message, 'Invalid email or password')
  assert.equal(unknownEmail.errors?.[0]?.message, 'Invalid email or password')
  assert.equal(wrongPassword.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED')
  assert.equal(unknownEmail.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED')
})

test('authenticated viewer and administrator mutation use the session', async () => {
  const { cookie } = await login()
  const viewer = await responseJson(
    await graphql('{ viewer { email displayName roles } }', undefined, cookie),
  )
  assert.deepEqual(viewer.data?.viewer, {
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
  assert.ok(createdPost)
  assert.deepEqual(createdPost, {
    id: createdPost.id,
    slug: 'authenticated-post',
    publishedAt: null,
  })
  assert.equal(typeof createdPost.id, 'string')
  authenticatedPostId = createdPost.id
})

test('public reads remain open while anonymous and roleless writes fail', async () => {
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
  assert.deepEqual(publicRead.data, {
    posts: [],
    post: null,
    postBySlug: null,
  })

  const anonymousWrite = await responseJson(
    await graphql('mutation { deletePost(id: "authenticated-post") { id } }'),
  )
  assert.equal(anonymousWrite.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED')

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
  assert.deepEqual(rolelessRead.data, publicRead.data)

  const rolelessWrite = await responseJson(
    await graphql(
      'mutation { deletePost(id: "authenticated-post") { id } }',
      undefined,
      rolelessCookie,
    ),
  )
  assert.equal(rolelessWrite.errors?.[0]?.extensions?.code, 'FORBIDDEN')
})

test('administrator can read drafts and control publication timing', async () => {
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
  assert.deepEqual(administratorRead.data, {
    posts: [draft],
    post: draft,
    postBySlug: draft,
  })

  const scheduledAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString()
  const schedule = await responseJson(
    await graphql(
      `mutation Schedule($id: ID!, $publishedAt: DateTimeISO!) {
        putPost(input: { id: $id, publishedAt: $publishedAt }) {
          id
          publishedAt
          revisions { nodes { id } }
        }
      }`,
      { id: authenticatedPostId, publishedAt: scheduledAt },
      cookie,
    ),
  )
  assert.equal(schedule.errors, undefined)
  assert.ok((schedule.data?.putPost as { publishedAt?: string })?.publishedAt)
  assert.deepEqual(
    (schedule.data?.putPost as { revisions?: { nodes: unknown[] } })?.revisions
      ?.nodes,
    [],
  )

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
  assert.deepEqual(scheduledRead.data, {
    posts: [],
    post: null,
    postBySlug: null,
  })

  const publishedAt = new Date(Date.now() - 60 * 1_000).toISOString()
  const publish = await responseJson(
    await graphql(
      `mutation Publish($id: ID!, $publishedAt: DateTimeISO!) {
        putPost(input: { id: $id, publishedAt: $publishedAt }) {
          publishedAt
        }
      }`,
      { id: authenticatedPostId, publishedAt },
      cookie,
    ),
  )
  assert.ok((publish.data?.putPost as { publishedAt?: string })?.publishedAt)

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
  assert.deepEqual(publishedRead.data, {
    posts: [published],
    post: published,
    postBySlug: published,
  })

  const unpublish = await responseJson(
    await graphql(
      `mutation Unpublish($id: ID!) {
        putPost(input: { id: $id, publishedAt: null }) {
          publishedAt
        }
      }`,
      { id: authenticatedPostId },
      cookie,
    ),
  )
  assert.deepEqual(unpublish.data?.putPost, {
    publishedAt: null,
  })

  const unpublishedRead = await responseJson(
    await graphql(
      '{ posts { id } postBySlug(slug: "authenticated-post") { id } }',
    ),
  )
  assert.deepEqual(unpublishedRead.data, { posts: [], postBySlug: null })
})

test('logout revokes the session and clears its cookie', async () => {
  const { cookie } = await login()
  const response = await graphql('mutation { logout }', undefined, cookie)
  const body = await responseJson(response)
  const setCookie = response.headers.get('set-cookie')

  assert.deepEqual(body.data, { logout: true })
  assert.match(setCookie ?? '', /Max-Age=0/i)

  const viewer = await responseJson(
    await graphql('{ viewer { id } }', undefined, cookie),
  )
  assert.equal(viewer.data?.viewer, null)
})

test('expired and disabled-user sessions are rejected and deleted', async () => {
  const [administratorUser] = await db.select().from(authUsers)
  const expired = await createSession(
    administratorUser.id,
    new Date(Date.now() - SESSION_IDLE_DURATION_MS - 1_000),
  )
  const expiredResult = await validateSessionToken(expired.token)
  assert.equal(expiredResult.session, null)

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
  assert.equal(disabledResult.session, null)
  assert.equal(
    await db.query.authSessions.findFirst({
      where: { id: hashSessionToken(disabled.token) },
    }),
    undefined,
  )
})

test('sessions renew inside the renewal window and can be revoked together', async () => {
  const [administratorUser] = await db.select().from(authUsers)
  const now = new Date()
  const createdAt = new Date(
    now.getTime() - SESSION_IDLE_DURATION_MS + 10 * 24 * 60 * 60 * 1_000,
  )
  const renewable = await createSession(administratorUser.id, createdAt)
  const result = await validateSessionToken(renewable.token, now)

  assert.equal(result.renewed, true)
  assert.ok(result.session)
  assert.ok(result.session.expiresAt > renewable.session.expiresAt)

  await revokeUserSessions(administratorUser.id)
  assert.equal(
    await db.query.authSessions.findFirst({
      where: { authUserId: administratorUser.id },
    }),
    undefined,
  )
})
