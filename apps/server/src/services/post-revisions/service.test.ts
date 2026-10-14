import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { AuthContext } from '../../auth/context'
import { postRevisions, posts } from '../../db/schema'

const tempDirectory = await mkdtemp(join(tmpdir(), 'blog-revision-test-'))
process.env.TURSO_CONNECTION_URL = `file:${join(tempDirectory, 'test.db')}`
process.env.TURSO_AUTH_TOKEN = 'test-token'

const { db } = await import('../../db')
const { getPost } = await import('../posts')
const { MAX_PAGE_SIZE } = await import('./pagination')
const { getPostRevisions } = await import('./service')
const { postRevisions: resolvePostRevisions } = await import(
  '../../schema/post/resolvers/Query/postRevisions'
)

const callPostRevisionsResolver = resolvePostRevisions as unknown as (
  parent: unknown,
  args: { postId: string; first?: number | null; after?: string | null },
  context: AuthContext,
) => ReturnType<typeof getPostRevisions>

const administratorContext: AuthContext = {
  request: new Request('http://localhost/graphql'),
  responseHeaders: new Headers(),
  sessionToken: null,
  session: null,
  principal: {
    id: 'test-administrator',
    email: 'admin@example.com',
    displayName: 'Test Administrator',
    roles: ['administrator'],
  },
}

const migrationsFolder = fileURLToPath(
  new URL('../../../migrations', import.meta.url),
)

beforeAll(async () => {
  await migrate(db, { migrationsFolder })

  await db.insert(posts).values([
    {
      id: 'post-with-revisions',
      slug: 'post-with-revisions',
      title: 'Post with revisions',
      markdownContent: 'Current content',
    },
    {
      id: 'empty-post',
      slug: 'empty-post',
      title: 'Empty post',
      markdownContent: 'Current content',
    },
    {
      id: 'large-post',
      slug: 'large-post',
      title: 'Large post',
      markdownContent: 'Current content',
    },
  ])

  await db.insert(postRevisions).values([
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `revision-${index + 1}`,
      postId: 'post-with-revisions',
      revisionNumber: index + 1,
      title: `Revision ${index + 1}`,
      markdownContent: `Content ${index + 1}`,
    })),
    ...Array.from({ length: MAX_PAGE_SIZE + 1 }, (_, index) => ({
      id: `large-revision-${index + 1}`,
      postId: 'large-post',
      revisionNumber: index + 1,
      title: `Large revision ${index + 1}`,
      markdownContent: `Large content ${index + 1}`,
    })),
  ])
})

afterAll(async () => {
  await rm(tempDirectory, { recursive: true, force: true })
})

const requirePost = async (id: string) => {
  const post = await getPost(id)
  if (!post) throw new Error(`Post ${id} not found`)
  return post
}

test('returns the first revision page', { tags: ['integration'] }, async () => {
  const connection = await getPostRevisions(
    await requirePost('post-with-revisions'),
    { first: 2 },
  )

  expect(connection.nodes.map(({ revisionNumber }) => revisionNumber)).toEqual([
    5, 4,
  ])
  expect(connection.edges.map(({ node }) => node)).toEqual(connection.nodes)
  expect(connection.pageInfo.hasNextPage).toBe(true)
  expect(connection.pageInfo.hasPreviousPage).toBe(false)
  expect(connection.pageInfo.startCursor).toBe(connection.edges[0]?.cursor)
  expect(connection.pageInfo.endCursor).toBe(connection.edges[1]?.cursor)
})

test('returns a subsequent revision page', {
  tags: ['integration'],
}, async () => {
  const post = await requirePost('post-with-revisions')
  const firstPage = await getPostRevisions(post, { first: 2 })
  const secondPage = await getPostRevisions(post, {
    first: 2,
    after: firstPage.pageInfo.endCursor,
  })

  expect(secondPage.nodes.map(({ revisionNumber }) => revisionNumber)).toEqual([
    3, 2,
  ])
  expect(secondPage.pageInfo.hasNextPage).toBe(true)
  expect(secondPage.pageInfo.hasPreviousPage).toBe(true)
})

test('root query resolver delegates to the revision connection', {
  tags: ['integration'],
}, async () => {
  const connection = await callPostRevisionsResolver(
    null,
    {
      postId: 'post-with-revisions',
      first: 2,
    },
    administratorContext,
  )

  expect(connection.nodes.map(({ revisionNumber }) => revisionNumber)).toEqual([
    5, 4,
  ])
  expect(connection.pageInfo.hasNextPage).toBe(true)
})

test('root query resolver rejects a missing post', {
  tags: ['unit'],
}, async () => {
  await expect(
    callPostRevisionsResolver(
      null,
      { postId: 'missing-post' },
      administratorContext,
    ),
  ).rejects.toThrow('Post not found')
})

test('rejects invalid and cross-post cursors', { tags: ['unit'] }, async () => {
  const post = await requirePost('post-with-revisions')
  await expect(
    getPostRevisions(post, { after: 'not-a-valid-cursor' }),
  ).rejects.toThrow('Invalid revision cursor')
  await expect(getPostRevisions(post, { after: '' })).rejects.toThrow(
    'Invalid revision cursor',
  )

  const otherConnection = await getPostRevisions(
    await requirePost('large-post'),
    {
      first: 1,
    },
  )
  await expect(
    getPostRevisions(post, { after: otherConnection.pageInfo.endCursor }),
  ).rejects.toThrow('Invalid revision cursor')
})

test('returns an empty connection when there are no revisions', {
  tags: ['unit'],
}, async () => {
  const connection = await getPostRevisions(await requirePost('empty-post'))

  expect(connection.edges).toEqual([])
  expect(connection.nodes).toEqual([])
  expect(connection.pageInfo).toEqual({
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
  })
})

test('enforces page-size limits', { tags: ['unit'] }, async () => {
  const post = await requirePost('large-post')
  const connection = await getPostRevisions(post, { first: MAX_PAGE_SIZE })

  expect(connection.nodes.length).toBe(MAX_PAGE_SIZE)
  expect(connection.pageInfo.hasNextPage).toBe(true)
  await expect(
    getPostRevisions(post, { first: MAX_PAGE_SIZE + 1 }),
  ).rejects.toThrow(`first cannot exceed ${MAX_PAGE_SIZE}`)
  await expect(getPostRevisions(post, { first: -1 })).rejects.toThrow(
    'first must be a non-negative integer',
  )
})
