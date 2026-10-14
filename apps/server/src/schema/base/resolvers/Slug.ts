import { GraphQLError, GraphQLScalarType, Kind } from 'graphql'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const parseSlug = (value: unknown) => {
  if (typeof value !== 'string') {
    throw new GraphQLError('Slug must be a string')
  }

  const normalizedValue = value.trim().toLowerCase()
  if (!slugPattern.test(normalizedValue)) {
    throw new GraphQLError(
      'Slug must use lowercase letters, numbers, and single hyphens only',
    )
  }

  return normalizedValue
}

export const Slug = new GraphQLScalarType({
  name: 'Slug',
  description:
    'A lowercase HTTP URL slug using letters, numbers, and single hyphens.',
  serialize: parseSlug,
  parseValue: parseSlug,
  parseLiteral: (ast) => {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError('Slug must be a string')
    }

    return parseSlug(ast.value)
  },
})
