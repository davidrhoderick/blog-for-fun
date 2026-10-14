import { afterEach, expect, test, vi } from 'vitest'
import { action } from './api.graphql'

const callAction = (request: Request) =>
  action({ request } as unknown as Parameters<typeof action>[0])

afterEach(() => {
  vi.unstubAllGlobals()
})

test('proxies POST requests to the GraphQL server', {
  tags: ['integration'],
}, async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { viewer: null } }), {
          status: 200,
        }),
    ),
  )

  const response = await callAction(
    new Request('http://localhost/admin/api/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ viewer { id } }' }),
    }),
  )

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ data: { viewer: null } })
})

test('rejects non-POST methods', { tags: ['unit'] }, async () => {
  const error = (await callAction(
    new Request('http://localhost/admin/api/graphql', { method: 'GET' }),
  ).catch((thrown) => thrown)) as { init: { status: number } }

  expect(error.init.status).toBe(405)
})
