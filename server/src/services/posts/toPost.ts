import type { posts } from '../../db/schema'
import type { Post } from '../../schema/types.generated'

export const toPost = (post: typeof posts.$inferSelect): Post => ({
  id: post.id,
  slug: post.slug,
  title: post.title,
  markdownContent: post.markdownContent,
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
