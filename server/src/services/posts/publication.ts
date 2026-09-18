import { eq } from 'drizzle-orm'
import { GraphQLError } from 'graphql'
import { db } from '../../db'
import { posts } from '../../db/schema'
import { getPost } from './getPosts'
import { toPost } from './toPost'

const normalizeTimestamp = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(Math.floor(date.getTime() / 1_000) * 1_000)
}

export const publishPost = async (
  id: string,
  publishedAt?: Date | string | null,
) => {
  const post = await getPost(id)
  if (!post) {
    throw new GraphQLError('Post not found')
  }

  const currentPublishedAt = post.publishedAt
    ? normalizeTimestamp(post.publishedAt)
    : null
  const now = normalizeTimestamp(new Date())
  const nextPublishedAt = publishedAt
    ? normalizeTimestamp(publishedAt)
    : currentPublishedAt && currentPublishedAt <= now
      ? currentPublishedAt
      : now

  if (currentPublishedAt?.getTime() === nextPublishedAt.getTime()) {
    return post
  }

  const [updatedPost] = await db
    .update(posts)
    .set({ publishedAt: nextPublishedAt, updatedAt: new Date() })
    .where(eq(posts.id, id))
    .returning()
  return toPost(updatedPost)
}

export const unpublishPost = async (id: string) => {
  const post = await getPost(id)
  if (!post) {
    throw new GraphQLError('Post not found')
  }

  if (!post.publishedAt) {
    return post
  }

  const [updatedPost] = await db
    .update(posts)
    .set({ publishedAt: null, updatedAt: new Date() })
    .where(eq(posts.id, id))
    .returning()
  return toPost(updatedPost)
}
