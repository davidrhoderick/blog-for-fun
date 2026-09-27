import { requirePermission } from '../../../../auth/authorization'
import { createMediaUpload as createUpload } from '../../../../services/media'
import type { MutationResolvers } from '../../../types.generated'

export const createMediaUpload: NonNullable<
  MutationResolvers['createMediaUpload']
> = (_parent, { input }, context) => {
  requirePermission(context, 'media:write')
  return createUpload(input)
}
