import { render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import Logout, { action, loader } from './logout'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('revokes the session and returns to the sign-in page', {
  tags: ['integration'],
}, async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { logout: true } }), {
          status: 200,
          headers: { 'set-cookie': 'admin_session=; Max-Age=0' },
        }),
    ),
  )

  const response = await action({
    request: new Request('http://localhost/admin/logout', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    }),
  } as unknown as Parameters<typeof action>[0])

  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe('/login')
  expect(response.headers.get('set-cookie')).toBe('admin_session=; Max-Age=0')
})

test('sends signed-out visitors home', { tags: ['unit'] }, async () => {
  const response = await loader()

  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe('/')
})

test('renders nothing', { tags: ['unit'] }, () => {
  const { container } = render(<Logout />)

  expect(container.textContent).toBe('')
})
