import {
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { desc } from 'drizzle-orm'
import { GraphQLError } from 'graphql'
import { db } from '../../db'
import { mediaAssets } from '../../db/schema'
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
  url: publicUrl(asset.objectKey),
  createdAt: asset.createdAt,
})

export const getMediaAssets = async () =>
  (
    await db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt))
  ).map(toMediaAsset)

export const createMediaUpload = async (input: {
  filename: string
  contentType: string
  size: number
  altText: string
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
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id,
      objectKey,
      ...input,
      filename,
      altText: input.altText.trim(),
    })
    .returning()
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

  return { asset: toMediaAsset(asset), uploadUrl }
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
