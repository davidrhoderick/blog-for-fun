import { requirePermission } from '../../../../auth/authorization'
import { getPostRevision } from '../../../../services/post-revisions'
import type { QueryResolvers } from './../../../types.generated'

export const postRevision: NonNullable<QueryResolvers['postRevision']> = async (
  _parent,
  { id },
  context,
) => {
  requirePermission(context, 'postRevisions:read')
  return getPostRevision(id)
}
