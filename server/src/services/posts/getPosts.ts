import { asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { posts } from '../../db/schema'
import { toPost } from './toPost'

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
