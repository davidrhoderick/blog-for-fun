import { and, desc, eq, lt } from 'drizzle-orm'
import { db } from '../../db'
import { postRevisions } from '../../db/schema'
import type {
  Post,
  PostRevision,
  PostRevisionConnection,
} from '../../schema/types.generated'
import { getPost } from '../posts'
import {
  decodeRevisionCursor,
  encodeRevisionCursor,
  getRevisionPageSize,
  type PostRevisionPagination,
} from './pagination'

const toPostRevision = (
  revision: typeof postRevisions.$inferSelect,
  post: Post,
): PostRevision => ({
  id: revision.id,
  revisionNumber: revision.revisionNumber,
  title: revision.title,
  markdownContent: revision.markdownContent,
  createdAt: revision.createdAt,
  post,
})

export const getPostRevision = async (id: string) => {
  const [revision] = await db
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.id, id))
  if (!revision) return null

  const post = await getPost(revision.postId)
  if (!post) throw new Error('Post revision references a missing post')
  return toPostRevision(revision, post)
}

export const getPostRevisions = async (
  post: Post,
  { first, after }: PostRevisionPagination = {},
): Promise<PostRevisionConnection> => {
  const postId = String(post.id)
  const pageSize = getRevisionPageSize(first)
  const afterRevisionNumber =
    after === null || after === undefined
      ? null
      : decodeRevisionCursor(after, postId)
  const results = await db
    .select()
    .from(postRevisions)
    .where(
      afterRevisionNumber === null
        ? eq(postRevisions.postId, postId)
        : and(
            eq(postRevisions.postId, postId),
            lt(postRevisions.revisionNumber, afterRevisionNumber),
          ),
    )
    .orderBy(desc(postRevisions.revisionNumber))
    .limit(pageSize + 1)

  const hasNextPage = results.length > pageSize
  const page = hasNextPage ? results.slice(0, pageSize) : results
  const edges = page.map((revision) => ({
    cursor: encodeRevisionCursor(postId, revision.revisionNumber),
    node: toPostRevision(revision, post),
  }))

  return {
    edges,
    nodes: edges.map(({ node }) => node),
    pageInfo: {
      hasNextPage,
      hasPreviousPage: afterRevisionNumber !== null,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges.at(-1)?.cursor ?? null,
    },
  }
}
