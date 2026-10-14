import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { desc, eq } from 'drizzle-orm'
import { GraphQLError } from 'graphql'
import { db } from '../../db'
import { mediaAssets, posts } from '../../db/schema'
import type { MediaAsset } from '../../schema/types.generated'

const allowedContentTypes = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const maxUploadSize = 10 * 1024 * 1024

const requiredStorageEnv = (name: string) => {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing required storage environment variable: ${name}`)
  return value
}

const storage = () => {
  const endpoint = requiredStorageEnv('AWS_ENDPOINT_URL_S3')
  return {
    bucket: requiredStorageEnv('BUCKET_NAME'),
    client: new S3Client({
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      region: process.env.AWS_REGION ?? 'auto',
      credentials: {
        accessKeyId: requiredStorageEnv('AWS_ACCESS_KEY_ID'),
        secretAccessKey: requiredStorageEnv('AWS_SECRET_ACCESS_KEY'),
      },
    }),
  }
}

const publicUrl = (objectKey: string) => {
  const baseUrl =
    process.env.MEDIA_PUBLIC_URL ??
    `https://${requiredStorageEnv('BUCKET_NAME')}.t3.tigrisfiles.io`
  return `${baseUrl.replace(/\/$/, '')}/${objectKey}`
}

const toMediaAsset = (asset: typeof mediaAssets.$inferSelect): MediaAsset => ({
  id: asset.id,
  filename: asset.filename,
  contentType: asset.contentType,
  size: asset.size,
  altText: asset.altText,
  status: asset.status === 'ready' ? 'READY' : 'PENDING',
  attachedPostId: asset.attachedPostId,
  width: asset.width,
  height: asset.height,
  finalizedAt: asset.finalizedAt,
  url: publicUrl(asset.objectKey),
  createdAt: asset.createdAt,
})

export const getMediaAssets = async () =>
  (
    await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.status, 'ready'))
      .orderBy(desc(mediaAssets.createdAt))
  ).map(toMediaAsset)

export const prepareMediaUpload = async (input: {
  filename: string
  contentType: string
  size: number
  altText: string
  attachedPostId?: string | null
}) => {
  if (
    !allowedContentTypes.has(input.contentType) ||
    input.size < 1 ||
    input.size > maxUploadSize
  ) {
    throw new GraphQLError('Upload a supported image smaller than 10 MB')
  }

  const filename = input.filename.replaceAll(/[^a-zA-Z0-9._-]/g, '-')
  if (!filename) throw new GraphQLError('A valid filename is required')

  const id = crypto.randomUUID()
  const objectKey = `media/${id}/${filename}`
  const { bucket, client } = storage()
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      ...(process.env.MEDIA_OBJECT_ACL
        ? { ACL: process.env.MEDIA_OBJECT_ACL as 'public-read' }
        : {}),
      Bucket: bucket,
      Key: objectKey,
      ContentType: input.contentType,
    }),
    { expiresIn: 300 },
  )
  if (input.attachedPostId) {
    const [post] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.id, input.attachedPostId))
      .limit(1)
    if (!post) throw new GraphQLError('Attached post not found')
  }

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id,
      objectKey,
      filename,
      contentType: input.contentType,
      size: input.size,
      altText: input.altText.trim(),
      attachedPostId: input.attachedPostId,
    })
    .returning()

  return { asset: toMediaAsset(asset), uploadUrl }
}

export const finalizeMediaUpload = async (id: string) => {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1)
  if (!asset) throw new GraphQLError('Media upload not found')
  if (asset.status === 'ready') return toMediaAsset(asset)

  const { bucket, client } = storage()
  let object: { ContentLength?: number; ContentType?: string }
  try {
    object = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: asset.objectKey }),
    )
  } catch {
    throw new GraphQLError('Uploaded object could not be verified')
  }

  if (
    object.ContentLength !== asset.size ||
    object.ContentType !== asset.contentType
  ) {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: asset.objectKey }),
    )
    await db.delete(mediaAssets).where(eq(mediaAssets.id, id))
    throw new GraphQLError('Uploaded object does not match its metadata')
  }

  const [finalizedAsset] = await db
    .update(mediaAssets)
    .set({ status: 'ready', finalizedAt: new Date() })
    .where(eq(mediaAssets.id, id))
    .returning()

  return toMediaAsset(finalizedAsset)
}

export const configureMediaCors = async () => {
  const { bucket, client } = storage()
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['content-type'],
            AllowedMethods: ['GET', 'HEAD', 'PUT'],
            AllowedOrigins: [
              'http://localhost:3001',
              'https://blog-for-fun.fly.dev',
            ],
            MaxAgeSeconds: 300,
          },
        ],
      },
    }),
  )
}
