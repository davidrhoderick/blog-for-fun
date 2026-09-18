import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { posts } from '../../db/schema'
import { toPost } from './toPost'

const isPublished = and(
  isNotNull(posts.publishedAt),
  lte(posts.publishedAt, sql`(unixepoch())`),
)

export const getPost = async (id: string) => {
  const [post] = await db.select().from(posts).where(eq(posts.id, id))
  return post ? toPost(post) : null
}

export const getPostBySlug = async (slug: string) => {
  const [post] = await db.select().from(posts).where(eq(posts.slug, slug))
  return post ? toPost(post) : null
}

export const getPosts = async () => {
  const results = await db.select().from(posts).orderBy(asc(posts.createdAt))
  return results.map(toPost)
}

export const getPublishedPost = async (id: string) => {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), isPublished))
  return post ? toPost(post) : null
}

export const getPublishedPostBySlug = async (slug: string) => {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), isPublished))
  return post ? toPost(post) : null
}

export const getPublishedPosts = async () => {
  const results = await db
    .select()
    .from(posts)
    .where(isPublished)
    .orderBy(asc(posts.createdAt))
  return results.map(toPost)
}
