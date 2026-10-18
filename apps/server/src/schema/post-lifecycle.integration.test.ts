import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, beforeAll, expect, test } from 'vitest'

const tempDirectory = await mkdtemp(join(tmpdir(), 'blog-posts-test-'))
process.env.TURSO_CONNECTION_URL = `file:${join(tempDirectory, 'test.db')}`
process.env.TURSO_AUTH_TOKEN = 'test-token'

const { db } = await import('../db')
const { bootstrapAdministrator } = await import('../auth/account')
const { createApp } = await import('../server')

const migrationsFolder = fileURLToPath(
  new URL('../../migrations', import.meta.url),
)

const administrator = {
  email: 'admin@example.com',
  displayName: 'Blog Administrator',
  password: 'a long test password',
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder })
  await bootstrapAdministrator(administrator)
})

afterAll(async () => {
  await rm(tempDirectory, { recursive: true, force: true })
})

const app = createApp()

const responseJson = (response: Response) =>
  response.json() as Promise<{
    data?: Record<string, unknown>
    errors?: Array<{ message: string; extensions?: { code?: string } }>
  }>

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

const login = async () => {
  const response = await graphql(
    `mutation Login($input: LoginInput!) { login(input: $input) { id } }`,
    { input: { email: administrator.email, password: administrator.password } },
  )
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) throw new Error('Login did not set a session cookie')
  return setCookie.split(';', 1)[0] as string
}

let cookie: string

beforeAll(async () => {
  cookie = await login()
})

const putPost = async (input: Record<string, unknown>) => {
  const response = await responseJson(
    await graphql(
      `mutation Save($input: PutPostInput!) {
        putPost(input: $input) { id slug title markdownContent publishedAt }
      }`,
      { input },
      cookie,
    ),
  )
  if (response.errors) throw new Error(response.errors[0]?.message)
  return response.data?.putPost as {
    id: string
    slug: string
    title: string
    markdownContent: string
    publishedAt: string | null
  }
}

test('creates a draft and reads it back through every query', {
  tags: ['integration'],
}, async () => {
  const created = await putPost({
    slug: 'lifecycle-draft',
    title: '  Lifecycle draft  ',
    markdownContent: 'First draft',
  })

  expect(typeof created.id).toBe('string')
  expect(created.slug).toBe('lifecycle-draft')
  expect(created.title).toBe('Lifecycle draft')
  expect(created.publishedAt).toBeNull()

  const adminRead = await responseJson(
    await graphql(
      `query Read($id: ID!) {
        posts { id slug }
        post(id: $id) { id }
        postBySlug(slug: "lifecycle-draft") { id }
      }`,
      { id: created.id },
      cookie,
    ),
  )
  expect(adminRead.data).toEqual({
    posts: [{ id: created.id, slug: 'lifecycle-draft' }],
    post: { id: created.id },
    postBySlug: { id: created.id },
  })

  const anonymousRead = await responseJson(
    await graphql('query { posts { id } post(id: "missing") { id } }'),
  )
  expect(anonymousRead.data).toEqual({ posts: [], post: null })
})

test('updates a post, recording a revision only when content changes', {
  tags: ['integration'],
}, async () => {
  const created = await putPost({
    slug: 'lifecycle-update',
    title: 'Original title',
    markdownContent: 'Original content',
  })

  const titleOnly = await putPost({ id: created.id, title: 'Renamed' })
  expect(titleOnly.title).toBe('Renamed')

  const noChange = await putPost({ id: created.id, title: 'Renamed' })
  expect(noChange.title).toBe('Renamed')

  const contentChange = await putPost({
    id: created.id,
    markdownContent: 'New content',
  })
  expect(contentChange.markdownContent).toBe('New content')

  const slugChange = await putPost({
    id: created.id,
    slug: 'lifecycle-renamed',
  })
  expect(slugChange.slug).toBe('lifecycle-renamed')

  const revisions = await responseJson(
    await graphql(
      `query Revisions($postId: ID!) {
        postRevisions(postId: $postId) {
          nodes { id revisionNumber title markdownContent }
        }
      }`,
      { postId: created.id },
      cookie,
    ),
  )
  const revisionConnection = revisions.data?.postRevisions as
    | { nodes: Array<{ id: string; revisionNumber: number; title: string }> }
    | undefined
  const revisionNodes = revisionConnection?.nodes ?? []
  expect(revisionNodes).toHaveLength(2)
  expect(revisionNodes[0]).toMatchObject({
    revisionNumber: 2,
    title: 'Renamed',
    markdownContent: 'Original content',
  })

  const revision = await responseJson(
    await graphql(
      `query Revision($id: ID!) {
        postRevision(id: $id) { id revisionNumber post { id } }
      }`,
      { id: revisionNodes[0]?.id },
      cookie,
    ),
  )
  expect(revision.data?.postRevision).toMatchObject({
    id: revisionNodes[0]?.id,
    revisionNumber: 2,
    post: { id: created.id },
  })
})

test('rejects conflicting slugs and missing posts', {
  tags: ['unit'],
}, async () => {
  const conflict = await putPost({
    slug: 'lifecycle-conflict',
    title: 'Conflict',
    markdownContent: 'Body',
  })

  const duplicate = await responseJson(
    await graphql(
      `mutation Save($input: PutPostInput!) { putPost(input: $input) { id } }`,
      {
        input: {
          slug: 'lifecycle-conflict',
          title: 'Conflict again',
          markdownContent: 'Body',
        },
      },
      cookie,
    ),
  )
  expect(duplicate.errors?.[0]?.message).toBe('A post already uses this slug')

  const incomplete = await responseJson(
    await graphql(
      `mutation Save($input: PutPostInput!) { putPost(input: $input) { id } }`,
      { input: { slug: 'only-slug' } },
      cookie,
    ),
  )
  expect(incomplete.errors?.[0]?.message).toBe(
    'slug, title, and markdownContent are required when creating a post',
  )

  const missingPost = await responseJson(
    await graphql(
      `mutation Save($input: PutPostInput!) { putPost(input: $input) { id } }`,
      { input: { id: 'missing-post', title: 'Nope' } },
      cookie,
    ),
  )
  expect(missingPost.errors?.[0]?.message).toBe('Post not found')

  const nullField = await responseJson(
    await graphql(
      `mutation Save($input: PutPostInput!) { putPost(input: $input) { id } }`,
      { input: { id: conflict.id, title: null } },
      cookie,
    ),
  )
  expect(nullField.errors?.[0]?.message).toBe('Post fields cannot be null')
})

test('controls publication timing and keeps scheduled posts private', {
  tags: ['integration'],
}, async () => {
  const created = await putPost({
    slug: 'lifecycle-publication',
    title: 'Publication',
    markdownContent: 'Body',
  })

  const unpublishedNoop = await responseJson(
    await graphql(
      `mutation Unpublish($id: ID!) { unpublishPost(id: $id) { publishedAt } }`,
      { id: created.id },
      cookie,
    ),
  )
  expect(unpublishedNoop.data?.unpublishPost).toEqual({ publishedAt: null })

  const scheduledAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString()
  const scheduled = await responseJson(
    await graphql(
      `mutation Schedule($id: ID!, $publishedAt: DateTimeISO!) {
        publishPost(id: $id, publishedAt: $publishedAt) { publishedAt }
      }`,
      { id: created.id, publishedAt: scheduledAt },
      cookie,
    ),
  )
  expect(scheduled.data?.publishPost).toBeTruthy()

  const scheduledRead = await responseJson(
    await graphql(
      'query { posts { id } postBySlug(slug: "lifecycle-publication") { id } }',
    ),
  )
  expect(scheduledRead.data).toEqual({ posts: [], postBySlug: null })

  const published = await responseJson(
    await graphql(
      `mutation Publish($id: ID!) { publishPost(id: $id) { publishedAt } }`,
      { id: created.id },
      cookie,
    ),
  )
  expect(published.data?.publishPost).toBeTruthy()

  const publishAgain = await responseJson(
    await graphql(
      `mutation Publish($id: ID!) { publishPost(id: $id) { publishedAt } }`,
      { id: created.id },
      cookie,
    ),
  )
  expect(publishAgain.data?.publishPost).toEqual(published.data?.publishPost)

  const publicRead = await responseJson(
    await graphql(
      'query { posts { id } postBySlug(slug: "lifecycle-publication") { id } }',
    ),
  )
  expect(publicRead.data).toEqual({
    posts: [{ id: created.id }],
    postBySlug: { id: created.id },
  })

  const unpublished = await responseJson(
    await graphql(
      `mutation Unpublish($id: ID!) { unpublishPost(id: $id) { publishedAt } }`,
      { id: created.id },
      cookie,
    ),
  )
  expect(unpublished.data?.unpublishPost).toEqual({ publishedAt: null })

  const missingPublish = await responseJson(
    await graphql(
      `mutation Publish($id: ID!) { publishPost(id: $id) { id } }`,
      { id: 'missing-post' },
      cookie,
    ),
  )
  expect(missingPublish.errors?.[0]?.message).toBe('Post not found')

  const missingUnpublish = await responseJson(
    await graphql(
      `mutation Unpublish($id: ID!) { unpublishPost(id: $id) { id } }`,
      { id: 'missing-post' },
      cookie,
    ),
  )
  expect(missingUnpublish.errors?.[0]?.message).toBe('Post not found')
})

test('deletes posts and reports an empty media library', {
  tags: ['integration'],
}, async () => {
  const created = await putPost({
    slug: 'lifecycle-delete',
    title: 'Delete me',
    markdownContent: 'Body',
  })

  const deleted = await responseJson(
    await graphql(
      `mutation Delete($id: ID!) { deletePost(id: $id) { __typename id } }`,
      { id: created.id },
      cookie,
    ),
  )
  expect(deleted.data?.deletePost).toEqual({
    __typename: 'DeletedPost',
    id: created.id,
  })

  const deletedAgain = await responseJson(
    await graphql(
      `mutation Delete($id: ID!) { deletePost(id: $id) { id } }`,
      { id: created.id },
      cookie,
    ),
  )
  expect(deletedAgain.data?.deletePost).toBeNull()

  const media = await responseJson(
    await graphql('query { mediaAssets { id } }', undefined, cookie),
  )
  expect(media.data?.mediaAssets).toEqual([])
})

test('rejects malformed slugs before reaching the database', {
  tags: ['unit'],
}, async () => {
  const invalidString = await responseJson(
    await graphql('query { postBySlug(slug: "Not A Slug") { id } }'),
  )
  expect(invalidString.errors?.[0]?.message).toMatch(/lowercase letters/)

  const nonString = await responseJson(
    await graphql('query { postBySlug(slug: 123) { id } }'),
  )
  expect(nonString.errors?.[0]?.message).toMatch(/Slug must be a string/)
})

test('serves only published posts through the public contract', {
  tags: ['integration'],
}, async () => {
  const draft = await putPost({
    slug: 'public-contract-draft',
    title: 'Hidden draft',
    markdownContent: 'Not visible',
  })
  const scheduled = await putPost({
    slug: 'public-contract-scheduled',
    title: 'Scheduled',
    markdownContent: 'Later',
  })
  const visible = await putPost({
    slug: 'public-contract-visible',
    title: 'Visible',
    markdownContent: 'Visible',
  })

  await graphql(
    `mutation Schedule($id: ID!, $publishedAt: DateTimeISO!) {
      publishPost(id: $id, publishedAt: $publishedAt) { id }
    }`,
    {
      id: scheduled.id,
      publishedAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
    },
    cookie,
  )
  await graphql(
    `mutation Publish($id: ID!) { publishPost(id: $id) { id } }`,
    { id: visible.id },
    cookie,
  )

  const list = await responseJson(
    await graphql('query { publishedPosts { id slug publishedAt } }'),
  )
  const published = list.data?.publishedPosts as Array<{
    id: string
    slug: string
    publishedAt: string
  }>
  expect(published.some((post) => post.id === visible.id)).toBe(true)
  expect(published.some((post) => post.id === draft.id)).toBe(false)
  expect(published.some((post) => post.id === scheduled.id)).toBe(false)
  expect(published.every((post) => typeof post.publishedAt === 'string')).toBe(
    true,
  )

  const bySlug = await responseJson(
    await graphql(
      `query {
        visible: publishedPostBySlug(slug: "public-contract-visible") { id publishedAt }
        draft: publishedPostBySlug(slug: "public-contract-draft") { id }
        scheduled: publishedPostBySlug(slug: "public-contract-scheduled") { id }
      }`,
    ),
  )
  expect(bySlug.data).toEqual({
    visible: { id: visible.id, publishedAt: expect.any(String) },
    draft: null,
    scheduled: null,
  })
})
