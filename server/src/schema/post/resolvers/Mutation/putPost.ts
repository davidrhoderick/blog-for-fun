import { requirePermission } from '../../../../auth/authorization'
import { putPost as savePost } from '../../../../services/posts'
import type { MutationResolvers } from '../../../types.generated'

export const putPost: NonNullable<MutationResolvers['putPost']> = (
  _parent,
  { input },
  context,
) => {
  requirePermission(context, input.id ? 'posts:update' : 'posts:create')
  return savePost(input)
}
