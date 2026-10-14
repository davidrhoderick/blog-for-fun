import { requirePermission } from '../../../../auth/authorization'
import { unpublishPost as unpublish } from '../../../../services/posts'
import type { MutationResolvers } from './../../../types.generated'

export const unpublishPost: NonNullable<MutationResolvers['unpublishPost']> = (
  _parent,
  { id },
  context,
) => {
  requirePermission(context, 'posts:update')
  return unpublish(id)
}
