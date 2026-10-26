export const resolveGraphQLUrl = () => {
  const value = process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql'
  const url = new URL(value)

  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('GRAPHQL_URL must use HTTP or HTTPS')
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
