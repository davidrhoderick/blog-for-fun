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

const graphQLUrl = () => {
  const value = process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql'
  try {
    return new URL(value).toString()
  } catch {
    throw new Error('GRAPHQL_URL must be an absolute URL')
  }
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
  const response = await fetch(graphQLUrl(), {
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
