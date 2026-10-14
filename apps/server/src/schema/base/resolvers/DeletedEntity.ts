import type { DeletedEntityResolvers } from '../../types.generated'

export const DeletedEntity: DeletedEntityResolvers = {
  __resolveType: (entity) => entity.__typename,
}
