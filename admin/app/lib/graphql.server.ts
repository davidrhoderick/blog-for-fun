type GraphQLError = {
  message: string
  extensions?: { code?: string }
}

type GraphQLResponse<T> = {
  data?: T
  errors?: GraphQLError[]
}

export type Viewer = {
  id: string
  email: string
  displayName: string
  roles: string[]
}

export const resolveGraphQLUrl = (
  value = process.env.GRAPHQL_URL,
  environment = process.env.NODE_ENV,
) => {
  if (!value && environment === 'production') {
    throw new Error('GRAPHQL_URL is required in production')
  }

  const configuredValue = value ?? 'http://localhost:4000/graphql'
  let url: URL
  try {
    url = new URL(configuredValue)
  } catch {
    throw new Error('GRAPHQL_URL must be an absolute URL')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('GRAPHQL_URL must use HTTP or HTTPS')
  }
  if (environment === 'production' && url.protocol !== 'https:') {
    throw new Error('GRAPHQL_URL must use HTTPS in production')
  }

  return url.toString()
}

const sessionCookie = (request: Request) => {
  const cookies = request.headers.get('cookie')?.split(';') ?? []
  return cookies
    .map((cookie) => cookie.trim())
    .find(
      (cookie) =>
        cookie.startsWith('admin_session=') ||
        cookie.startsWith('__Host-admin_session='),
    )
}

export const requestGraphQL = async <T>(
  request: Request,
  query: string,
  variables?: Record<string, unknown>,
) => {
  const cookie = sessionCookie(request)
  const response = await fetch(resolveGraphQLUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`GraphQL server returned HTTP ${response.status}`)
  }

  return {
    body: (await response.json()) as GraphQLResponse<T>,
    setCookie: response.headers.get('set-cookie'),
  }
}

export const getViewer = (request: Request) =>
  requestGraphQL<{ viewer: Viewer | null }>(
    request,
    '{ viewer { id email displayName roles } }',
  )

export const responseHeaders = (setCookie: string | null) =>
  setCookie ? { 'set-cookie': setCookie } : undefined
