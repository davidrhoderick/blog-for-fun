import { hasPermission } from '../../../../auth/authorization'
import { getPosts, getPublishedPosts } from '../../../../services/posts'
import type { QueryResolvers } from './../../../types.generated'

export const posts: NonNullable<QueryResolvers['posts']> = async (
  _parent,
  _args,
  context,
) =>
  context.principal &&
  hasPermission(context.principal.roles, 'posts:readUnpublished')
    ? getPosts()
    : getPublishedPosts()
