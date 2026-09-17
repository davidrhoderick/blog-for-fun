import type { QueryResolvers } from './../../../types.generated'
import { toViewer } from '../../toViewer'

export const viewer: NonNullable<QueryResolvers['viewer']> = (
  _parent,
  _args,
  context,
) => (context.principal ? toViewer(context.principal) : null)
