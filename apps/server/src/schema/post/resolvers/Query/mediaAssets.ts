import { requirePermission } from '../../../../auth/authorization'
import { getMediaAssets } from '../../../../services/media'
import type { QueryResolvers } from '../../../types.generated'

export const mediaAssets: NonNullable<QueryResolvers['mediaAssets']> = (
  _parent,
  _args,
  context,
) => {
  requirePermission(context, 'media:read')
  return getMediaAssets()
}
