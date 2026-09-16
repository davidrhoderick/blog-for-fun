import { putPost as savePost } from '../../../../services/posts'
import type { MutationResolvers } from '../../../types.generated'

export const putPost: NonNullable<MutationResolvers['putPost']> = (
  _parent,
  { input },
) => savePost(input)
