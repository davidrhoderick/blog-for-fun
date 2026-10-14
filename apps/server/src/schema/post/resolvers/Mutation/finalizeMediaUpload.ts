import { requirePermission } from '../../../../auth/authorization'
import { finalizeMediaUpload as finalizeUpload } from '../../../../services/media'
import type { MutationResolvers } from '../../../types.generated'

export const finalizeMediaUpload: NonNullable<
  MutationResolvers['finalizeMediaUpload']
> = (_parent, { id }, context) => {
  requirePermission(context, 'media:write')
  return finalizeUpload(id)
}
