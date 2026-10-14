import { requirePermission } from '../../../../auth/authorization'
import { deletePost as removePost } from '../../../../services/posts'
import type { MutationResolvers } from '../../../types.generated'

export const deletePost: NonNullable<MutationResolvers['deletePost']> = (
  _parent,
  { id },
  context,
) => {
  requirePermission(context, 'posts:delete')
  return removePost(id)
}
