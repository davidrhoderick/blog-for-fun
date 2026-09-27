type GraphQLResponse<T> = {
  data?: T
  errors?: { message: string }[]
}

const resolveGraphQLUrl = () => {
  const value = process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql'
  const url = new URL(value)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('GRAPHQL_URL must use HTTP or HTTPS')
  }
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    !loopback
  ) {
    throw new Error('GRAPHQL_URL must use HTTPS in production')
  }

  return url.toString()
}

export const requestPublicGraphQL = async <T>(
  query: string,
  variables?: Record<string, unknown>,
) => {
  const response = await fetch(resolveGraphQLUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!response.ok) {
    throw new Error(`GraphQL server returned HTTP ${response.status}`)
  }

  const body = (await response.json()) as GraphQLResponse<T>
  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join(', '))
  }

  return body.data
}
