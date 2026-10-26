import type { posts } from '../../db/schema'
import type { Post, PublishedPost } from '../../schema/types.generated'

export const toPost = (post: typeof posts.$inferSelect): Post => ({
  id: post.id,
  slug: post.slug,
  title: post.title,
  markdownContent: post.markdownContent,
  publishedAt: post.publishedAt,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
  revisions: {
    edges: [],
    nodes: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
  },
})

export const toPublishedPost = (post: Post): PublishedPost => {
  if (!post.publishedAt) {
    throw new Error(`Published post ${post.id} has no publishedAt`)
  }

  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    markdownContent: post.markdownContent,
    publishedAt: post.publishedAt,
  }
}
