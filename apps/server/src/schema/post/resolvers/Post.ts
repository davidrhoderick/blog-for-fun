import { requirePermission } from '../../../auth/authorization'
import { getPostRevisions } from '../../../services/post-revisions'
import type { PostResolvers } from './../../types.generated'

export const Post: PostResolvers = {
  revisions: (post, pagination, context) => {
    requirePermission(context, 'postRevisions:read')
    return getPostRevisions(post, pagination)
  },
}
