import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, beforeAll, expect, test } from 'vitest'

type S3rverInstance = {
  run: () => Promise<{ address: string; port: number }>
  close: () => Promise<void>
}

type S3rverConstructor = new (options: {
  address: string
  allowMismatchedSignatures: boolean
  configureBuckets: Array<{ name: string }>
  directory: string
  port: number
  resetOnClose: boolean
  silent: boolean
  vhostBuckets: boolean
}) => S3rverInstance

const require = createRequire(import.meta.url)
const S3rver = require('s3rver') as S3rverConstructor
const tempDirectory = await mkdtemp(join(tmpdir(), 'blog-media-test-'))
const bucketName = 'media-test'
process.env.TURSO_CONNECTION_URL = `file:${join(tempDirectory, 'test.db')}`
process.env.TURSO_AUTH_TOKEN = 'test-token'
process.env.AWS_REGION = 'us-east-1'
process.env.AWS_ACCESS_KEY_ID = 'S3RVER'
process.env.AWS_SECRET_ACCESS_KEY = 'S3RVER'
process.env.BUCKET_NAME = bucketName
process.env.S3_FORCE_PATH_STYLE = 'true'
process.env.MEDIA_OBJECT_ACL = 'public-read'

const s3 = new S3rver({
  address: '127.0.0.1',
  allowMismatchedSignatures: true,
  configureBuckets: [{ name: bucketName }],
  directory: join(tempDirectory, 'objects'),
  port: 0,
  resetOnClose: true,
  silent: true,
  vhostBuckets: false,
})

const { db } = await import('../../db')
const { mediaAssets, posts } = await import('../../db/schema')
const { finalizeMediaUpload, getMediaAssets, prepareMediaUpload } =
  await import('./index')
const migrationsFolder = fileURLToPath(
  new URL('../../../migrations', import.meta.url),
)
const postId = crypto.randomUUID()

beforeAll(async () => {
  const { port } = await s3.run()
  process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${port}`
  process.env.MEDIA_PUBLIC_URL = `${process.env.AWS_ENDPOINT_URL_S3}/${process.env.BUCKET_NAME}`
  await migrate(db, { migrationsFolder })
  await db.insert(posts).values({
    id: postId,
    slug: 'media-test',
    title: 'Media test',
    markdownContent: '',
  })
})

afterAll(async () => {
  await s3.close()
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
  expect(await getMediaAssets()).toEqual([])
  const response = await fetch(prepared.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: content,
  })
  expect(response.ok).toBe(true)

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
  const response = await fetch(prepared.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: 'too short',
  })
  expect(response.ok).toBe(true)

  await expect(finalizeMediaUpload(String(prepared.asset.id))).rejects.toThrow(
    'Uploaded object does not match its metadata',
  )
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
