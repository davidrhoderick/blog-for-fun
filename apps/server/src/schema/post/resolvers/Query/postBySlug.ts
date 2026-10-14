import { hasPermission } from '../../../../auth/authorization'
import {
  getPostBySlug,
  getPublishedPostBySlug,
} from '../../../../services/posts'
import type { QueryResolvers } from './../../../types.generated'

export const postBySlug: NonNullable<QueryResolvers['postBySlug']> = async (
  _parent,
  { slug },
  context,
) =>
  context.principal &&
  hasPermission(context.principal.roles, 'posts:readUnpublished')
    ? getPostBySlug(slug)
    : getPublishedPostBySlug(slug)
