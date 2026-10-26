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

const { createPublicRelayEnvironment } = await import('./relay')

createPublicRelayEnvironment({ url: 'http://localhost:4000/graphql' })
const fetchGraphQL = captured.fetchGraphQL as FetchGraphQL

const request: RequestParameters = {
  name: 'PublicPostIndexQuery',
  text: 'query PublicPostIndexQuery { posts { id } }',
  operationKind: 'query',
  id: null,
  metadata: {},
  cacheID: 'public-post-index',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('posts operations to the configured GraphQL endpoint', {
  tags: ['integration'],
}, async () => {
  const fetchMock = vi.fn(
    async (_url: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: { posts: [] } }), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)

  const response = await fetchGraphQL(request, { first: 1 })

  expect(response).toEqual({ data: { posts: [] } })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:4000/graphql',
    expect.objectContaining({ method: 'POST' }),
  )
})

test('rejects operations without query text', { tags: ['unit'] }, async () => {
  await expect(fetchGraphQL({ ...request, text: null }, {})).rejects.toThrow(
    'Relay operation PublicPostIndexQuery has no query text',
  )
})

test('rejects failed GraphQL responses', { tags: ['unit'] }, async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 500 })),
  )

  await expect(fetchGraphQL(request, {})).rejects.toThrow(
    'GraphQL server returned HTTP 500',
  )
})
