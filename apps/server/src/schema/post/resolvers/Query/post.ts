import { hasPermission } from '../../../../auth/authorization'
import { getPost, getPublishedPost } from '../../../../services/posts'
import type { QueryResolvers } from './../../../types.generated'

export const post: NonNullable<QueryResolvers['post']> = async (
  _parent,
  { id },
  context,
) =>
  context.principal &&
  hasPermission(context.principal.roles, 'posts:readUnpublished')
    ? getPost(id)
    : getPublishedPost(id)
