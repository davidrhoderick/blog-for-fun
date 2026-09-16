import { asc, eq } from 'drizzle-orm'
import { GraphQLError } from 'graphql'
import { db } from '../../db'
import { posts } from '../../db/schema'
import type { AddPostInput, Post } from '../../schema/types.generated'

export const toPost = (post: typeof posts.$inferSelect): Post => ({
  id: post.id,
  slug: post.slug,
  title: post.title,
  markdownContent: post.markdownContent,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
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

export const addPost = async (input: AddPostInput) => {
  if (await getPostBySlug(input.slug)) {
    throw new GraphQLError('A post already uses this slug')
  }

  try {
    const [post] = await db
      .insert(posts)
      .values({ ...input, title: input.title.trim() })
      .returning()
    return toPost(post)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('UNIQUE constraint failed: posts.slug')
    ) {
      throw new GraphQLError('A post already uses this slug')
    }

    throw error
  }
}

export const deletePost = async (id: string) => {
  const deletedPosts = await db
    .delete(posts)
    .where(eq(posts.id, id))
    .returning()
  const [post] = deletedPosts

  return post ? { id: post.id, __typename: 'DeletedPost' as const } : null
}
