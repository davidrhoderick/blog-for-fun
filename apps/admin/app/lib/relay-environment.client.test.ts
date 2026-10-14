import type { FetchGraphQL } from '@blog/graphql-runtime'
import type { RequestParameters } from 'relay-runtime'
import { afterEach, expect, test, vi } from 'vitest'

const captured = vi.hoisted(() => ({
  fetchGraphQL: undefined as FetchGraphQL | undefined,
}))

vi.mock('@blog/graphql-runtime', () => ({
  createRelayEnvironment: (fetchGraphQL: FetchGraphQL) => {
    captured.fetchGraphQL = fetchGraphQL
    return { fetchGraphQL }
  },
}))

// Importing the module runs createRelayEnvironment and captures its callback.
await import('./relay-environment.client')

const fetchGraphQL = captured.fetchGraphQL as FetchGraphQL

const request: RequestParameters = {
  name: 'PostsListQuery',
  text: 'query PostsListQuery { posts { id } }',
  operationKind: 'query',
  id: null,
  metadata: {},
  cacheID: 'viewer-query',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('posts operations to the GraphQL proxy and returns the body', {
  tags: ['integration'],
}, async () => {
  const fetchMock = vi.fn(
    async (_url: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: { posts: [] } }), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)

  const response = await fetchGraphQL(request, { first: 1 })

  expect(response).toEqual({ data: { posts: [] } })
  const [, init] = fetchMock.mock.calls[0] ?? []
  expect(init?.credentials).toBe('include')
  expect(JSON.parse(String(init?.body))).toEqual({
    operationName: 'PostsListQuery',
    query: request.text,
    variables: { first: 1 },
  })
})

test('rejects operations without query text', { tags: ['unit'] }, async () => {
  await expect(fetchGraphQL({ ...request, text: null }, {})).rejects.toThrow(
    'Relay operation PostsListQuery has no query text',
  )
})

test('rejects failed proxy responses', { tags: ['unit'] }, async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 502 })),
  )

  await expect(fetchGraphQL(request, {})).rejects.toThrow(
    'GraphQL proxy returned HTTP 502',
  )
})
