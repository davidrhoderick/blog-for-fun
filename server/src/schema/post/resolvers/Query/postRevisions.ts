import { GraphQLError } from 'graphql'
import { getPostRevisions } from '../../../../services/post-revisions'
import { getPost } from '../../../../services/posts'
import type { QueryResolvers } from './../../../types.generated'

export const postRevisions: NonNullable<
  QueryResolvers['postRevisions']
> = async (_parent, { postId, first, after }) => {
  const post = await getPost(postId)
  if (!post) throw new GraphQLError('Post not found')

  return getPostRevisions(post, { first, after })
}
