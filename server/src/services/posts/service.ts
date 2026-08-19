import { asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { posts } from '../../db/schema'
import type { Post } from '../../schema/types.generated'

const timestamp = (value: Date) => Math.floor(value.getTime() / 1000)

export const toPost = (post: typeof posts.$inferSelect): Post => ({
  id: post.id,
  slug: post.slug,
  title: post.title,
  markdownContent: post.markdownContent,
  createdAt: timestamp(post.createdAt),
  updatedAt: timestamp(post.updatedAt),
  revisions: [],
})

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
