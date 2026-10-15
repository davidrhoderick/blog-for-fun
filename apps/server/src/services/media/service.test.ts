import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { mockClient } from 'aws-sdk-client-mock'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

const tempDirectory = await mkdtemp(join(tmpdir(), 'blog-media-test-'))
process.env.TURSO_CONNECTION_URL = `file:${join(tempDirectory, 'test.db')}`
process.env.TURSO_AUTH_TOKEN = 'test-token'
process.env.AWS_REGION = 'us-east-1'
process.env.AWS_ACCESS_KEY_ID = 'test'
process.env.AWS_SECRET_ACCESS_KEY = 'test'
process.env.AWS_ENDPOINT_URL_S3 = 'http://127.0.0.1:9000'
process.env.BUCKET_NAME = 'media-test'
process.env.S3_FORCE_PATH_STYLE = 'true'
process.env.MEDIA_OBJECT_ACL = 'public-read'
process.env.MEDIA_PUBLIC_URL = 'http://127.0.0.1:9000/media-test'

// The S3 client is mocked at the SDK level: `getSignedUrl` still signs locally
// (no network), and HeadObject/DeleteObject responses stand in for a real store.
const s3Mock = mockClient(S3Client)

const { db } = await import('../../db')
const { mediaAssets, posts } = await import('../../db/schema')
const { finalizeMediaUpload, getMediaAssets, prepareMediaUpload } =
  await import('./index')
const migrationsFolder = fileURLToPath(
  new URL('../../../migrations', import.meta.url),
)
const postId = crypto.randomUUID()

beforeAll(async () => {
  await migrate(db, { migrationsFolder })
  await db.insert(posts).values({
    id: postId,
    slug: 'media-test',
    title: 'Media test',
    markdownContent: '',
  })
})

beforeEach(() => {
  s3Mock.reset()
})

afterAll(async () => {
  await rm(tempDirectory, { recursive: true, force: true })
})

test('keeps prepared uploads hidden until the object is verified', {
  tags: ['integration'],
}, async () => {
  const content = 'verified image bytes'
  const prepared = await prepareMediaUpload({
    filename: 'verified.png',
    contentType: 'image/png',
    size: Buffer.byteLength(content),
    altText: 'Verified image',
    attachedPostId: postId,
  })

  expect(prepared.asset.status).toBe('PENDING')
  expect(prepared.uploadUrl).toContain('X-Amz-Signature')
  expect(await getMediaAssets()).toEqual([])

  s3Mock.on(HeadObjectCommand).resolves({
    ContentLength: Buffer.byteLength(content),
    ContentType: 'image/png',
  })

  const finalized = await finalizeMediaUpload(String(prepared.asset.id))
  expect(finalized.status).toBe('READY')
  expect(finalized.attachedPostId).toBe(postId)
  expect((await getMediaAssets()).length).toBe(1)
})

test('removes an upload when object metadata does not match', {
  tags: ['unit'],
}, async () => {
  const prepared = await prepareMediaUpload({
    filename: 'invalid.png',
    contentType: 'image/png',
    size: 999,
    altText: 'Invalid image',
  })

  s3Mock.on(HeadObjectCommand).resolves({
    ContentLength: 9,
    ContentType: 'image/png',
  })

  await expect(finalizeMediaUpload(String(prepared.asset.id))).rejects.toThrow(
    'Uploaded object does not match its metadata',
  )
  expect(s3Mock.commandCalls(DeleteObjectCommand).length).toBe(1)
  const remaining = await db.select().from(mediaAssets)
  expect(remaining.some((asset) => asset.id === prepared.asset.id)).toBe(false)
})

test('rejects attachment to a missing post', { tags: ['unit'] }, async () => {
  await expect(
    prepareMediaUpload({
      filename: 'missing-post.png',
      contentType: 'image/png',
      size: 10,
      altText: 'Missing post',
      attachedPostId: crypto.randomUUID(),
    }),
  ).rejects.toThrow('Attached post not found')
})
