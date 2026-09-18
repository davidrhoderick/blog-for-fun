import { requirePermission } from '../../../../auth/authorization'
import { publishPost as publish } from '../../../../services/posts'
import type { MutationResolvers } from './../../../types.generated'

export const publishPost: NonNullable<MutationResolvers['publishPost']> = (
  _parent,
  { id, publishedAt },
  context,
) => {
  requirePermission(context, 'posts:update')
  return publish(id, publishedAt)
}
