import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { postRevisions, posts } from '../../db/schema'

const tempDirectory = await mkdtemp(join(tmpdir(), 'blog-revision-test-'))
process.env.TURSO_CONNECTION_URL = `file:${join(tempDirectory, 'test.db')}`
process.env.TURSO_AUTH_TOKEN = 'test-token'

const { db } = await import('../../db')
const { getPost } = await import('../posts')
const { MAX_PAGE_SIZE } = await import('./pagination')
const { getPostRevisions } = await import('./service')

const migrationsFolder = fileURLToPath(
  new URL('../../../migrations', import.meta.url),
)

before(async () => {
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

after(async () => {
  await rm(tempDirectory, { recursive: true, force: true })
})

const requirePost = async (id: string) => {
  const post = await getPost(id)
  assert.ok(post)
  return post
}

test('returns the first revision page', async () => {
  const connection = await getPostRevisions(
    await requirePost('post-with-revisions'),
    { first: 2 },
  )

  assert.deepEqual(
    connection.nodes.map(({ revisionNumber }) => revisionNumber),
    [5, 4],
  )
  assert.deepEqual(
    connection.edges.map(({ node }) => node),
    connection.nodes,
  )
  assert.equal(connection.pageInfo.hasNextPage, true)
  assert.equal(connection.pageInfo.hasPreviousPage, false)
  assert.equal(connection.pageInfo.startCursor, connection.edges[0]?.cursor)
  assert.equal(connection.pageInfo.endCursor, connection.edges[1]?.cursor)
})

test('returns a subsequent revision page', async () => {
  const post = await requirePost('post-with-revisions')
  const firstPage = await getPostRevisions(post, { first: 2 })
  const secondPage = await getPostRevisions(post, {
    first: 2,
    after: firstPage.pageInfo.endCursor,
  })

  assert.deepEqual(
    secondPage.nodes.map(({ revisionNumber }) => revisionNumber),
    [3, 2],
  )
  assert.equal(secondPage.pageInfo.hasNextPage, true)
  assert.equal(secondPage.pageInfo.hasPreviousPage, true)
})

test('rejects invalid and cross-post cursors', async () => {
  const post = await requirePost('post-with-revisions')
  await assert.rejects(
    getPostRevisions(post, { after: 'not-a-valid-cursor' }),
    { message: 'Invalid revision cursor' },
  )
  await assert.rejects(getPostRevisions(post, { after: '' }), {
    message: 'Invalid revision cursor',
  })

  const otherConnection = await getPostRevisions(
    await requirePost('large-post'),
    {
      first: 1,
    },
  )
  await assert.rejects(
    getPostRevisions(post, { after: otherConnection.pageInfo.endCursor }),
    { message: 'Invalid revision cursor' },
  )
})

test('returns an empty connection when there are no revisions', async () => {
  const connection = await getPostRevisions(await requirePost('empty-post'))

  assert.deepEqual(connection.edges, [])
  assert.deepEqual(connection.nodes, [])
  assert.deepEqual(connection.pageInfo, {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
  })
})

test('enforces page-size limits', async () => {
  const post = await requirePost('large-post')
  const connection = await getPostRevisions(post, { first: MAX_PAGE_SIZE })

  assert.equal(connection.nodes.length, MAX_PAGE_SIZE)
  assert.equal(connection.pageInfo.hasNextPage, true)
  await assert.rejects(getPostRevisions(post, { first: MAX_PAGE_SIZE + 1 }), {
    message: `first cannot exceed ${MAX_PAGE_SIZE}`,
  })
  await assert.rejects(getPostRevisions(post, { first: -1 }), {
    message: 'first must be a non-negative integer',
  })
})
