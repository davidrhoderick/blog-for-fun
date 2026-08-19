import { getPostRevision } from '../../../../services/post-revisions'
import type { QueryResolvers } from './../../../types.generated'

export const postRevision: NonNullable<QueryResolvers['postRevision']> = async (
  _parent,
  { id },
) => getPostRevision(id)
