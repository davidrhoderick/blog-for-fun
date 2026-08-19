import { getPost } from '../../../../services/posts'
import type { QueryResolvers } from './../../../types.generated'

export const post: NonNullable<QueryResolvers['post']> = async (
  _parent,
  { id },
) => getPost(id)
