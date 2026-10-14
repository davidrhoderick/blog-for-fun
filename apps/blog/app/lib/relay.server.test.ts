import { afterEach, expect, test, vi } from 'vitest'
import { requestPublicGraphQL } from './relay.server'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('posts the query to the public GraphQL endpoint and returns its data', {
  tags: ['integration'],
}, async () => {
  const fetchMock = vi.fn(async () => jsonResponse({ data: { posts: [] } }))
  vi.stubGlobal('fetch', fetchMock)

  const data = await requestPublicGraphQL<{ posts: unknown[] }>(
    'query { posts }',
    {
      first: 1,
    },
  )

  expect(data).toEqual({ posts: [] })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:4000/graphql',
    expect.objectContaining({ method: 'POST' }),
  )
})

test('surfaces HTTP and GraphQL errors', { tags: ['unit'] }, async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({}, 500)),
  )
  await expect(requestPublicGraphQL('query { posts }')).rejects.toThrow(
    'GraphQL server returned HTTP 500',
  )

  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      jsonResponse({ errors: [{ message: 'first' }, { message: 'second' }] }),
    ),
  )
  await expect(requestPublicGraphQL('query { posts }')).rejects.toThrow(
    'first, second',
  )
})

test('rejects unsafe GraphQL URLs', { tags: ['unit'] }, async () => {
  vi.stubGlobal('fetch', vi.fn())
  vi.stubEnv('GRAPHQL_URL', 'file:///tmp/graphql')
  await expect(requestPublicGraphQL('query { posts }')).rejects.toThrow(
    'GRAPHQL_URL must use HTTP or HTTPS',
  )

  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('GRAPHQL_URL', 'http://api.example.com/graphql')
  await expect(requestPublicGraphQL('query { posts }')).rejects.toThrow(
    'GRAPHQL_URL must use HTTPS in production',
  )

  vi.stubEnv('GRAPHQL_URL', 'http://localhost:4000/graphql')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ data: { posts: [] } })),
  )
  await expect(requestPublicGraphQL('query { posts }')).resolves.toEqual({
    posts: [],
  })
})
