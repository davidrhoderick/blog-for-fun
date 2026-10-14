import { afterEach, expect, test, vi } from 'vitest'
import {
  getViewer,
  proxyGraphQL,
  requestGraphQL,
  responseHeaders,
} from './graphql.server'

const graphqlRequest = (options: { cookie?: string } = {}) =>
  new Request('http://localhost/admin/api/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify({ query: '{ viewer { id } }' }),
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('proxies the request and forwards session cookies', {
  tags: ['integration'],
}, async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { viewer: null } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'admin_session=rotated; Path=/',
        },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)

  const response = await proxyGraphQL(
    graphqlRequest({ cookie: 'other=1; admin_session=abc' }),
  )

  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:4000/graphql',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ cookie: 'admin_session=abc' }),
    }),
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('set-cookie')).toBe(
    'admin_session=rotated; Path=/',
  )
})

test('returns the GraphQL body and any refreshed cookie', {
  tags: ['integration'],
}, async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { viewer: { id: 'viewer-1' } } }), {
          status: 200,
          headers: { 'set-cookie': 'admin_session=next; Path=/' },
        }),
    ),
  )

  const result = await requestGraphQL<{ viewer: { id: string } }>(
    graphqlRequest(),
    '{ viewer { id } }',
  )

  expect(result.body.data).toEqual({ viewer: { id: 'viewer-1' } })
  expect(result.setCookie).toBe('admin_session=next; Path=/')
})

test('throws when the GraphQL server is unavailable', {
  tags: ['unit'],
}, async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 503 })),
  )

  await expect(
    requestGraphQL(graphqlRequest(), '{ viewer { id } }'),
  ).rejects.toThrow('GraphQL server returned HTTP 503')
})

test('getViewer asks for the signed-in viewer', {
  tags: ['integration'],
}, async () => {
  const fetchMock = vi.fn(
    async (_url: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: { viewer: { id: 'viewer-1' } } }), {
        status: 200,
      }),
  )
  vi.stubGlobal('fetch', fetchMock)

  const { body } = await getViewer(graphqlRequest())

  expect(body.data?.viewer?.id).toBe('viewer-1')
  const [, init] = fetchMock.mock.calls[0] ?? []
  const sentBody = JSON.parse(String(init?.body))
  expect(sentBody.query).toContain('viewer')
})

test('builds response headers only when a cookie is refreshed', {
  tags: ['unit'],
}, () => {
  expect(responseHeaders(null)).toBeUndefined()
  expect(responseHeaders('admin_session=next')).toEqual({
    'set-cookie': 'admin_session=next',
  })
})
