import { requirePermission } from '../../../../auth/authorization'
import { prepareMediaUpload as prepareUpload } from '../../../../services/media'
import type { MutationResolvers } from '../../../types.generated'

export const prepareMediaUpload: NonNullable<
  MutationResolvers['prepareMediaUpload']
> = (_parent, { input }, context) => {
  requirePermission(context, 'media:write')
  return prepareUpload(input)
}
