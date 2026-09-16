import { addPost as createPost } from '../../../../services/posts'
import type { MutationResolvers } from '../../../types.generated'

export const addPost: NonNullable<MutationResolvers['addPost']> = (
  _parent,
  { input },
) => createPost(input)
