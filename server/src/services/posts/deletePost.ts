import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { posts } from '../../db/schema'

export const deletePost = async (id: string) => {
  const deletedPosts = await db
    .delete(posts)
    .where(eq(posts.id, id))
    .returning()
  const [post] = deletedPosts

  return post ? { id: post.id, __typename: 'DeletedPost' as const } : null
}
