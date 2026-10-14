import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import type { Route } from './+types/login'
import Login, { action, loader } from './login'

const viewer = {
  id: 'viewer-1',
  email: 'admin@example.com',
  displayName: 'Blog Administrator',
  roles: ['ADMINISTRATOR'],
}

const jsonResponse = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers })

const stubViewer = (data: unknown, headers: Record<string, string> = {}) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ data }, headers)),
  )

const formRequest = (fields: Record<string, string>) => {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  return new Request('http://localhost/admin/login', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body,
  })
}

const callAction = (request: Request) =>
  action({ request } as unknown as Parameters<typeof action>[0])

const actionData = async (request: Request) =>
  (await callAction(request)) as unknown as {
    init: { status: number }
    data: { error: string }
  }

const callLoader = (request: Request) =>
  loader({ request } as unknown as Parameters<typeof loader>[0])

const renderLogin = (props: Record<string, unknown>) => {
  const router = createMemoryRouter([
    {
      path: '/',
      Component: () => (
        <Login {...(props as unknown as Route.ComponentProps)} />
      ),
    },
  ])
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('signs in and redirects to the console with the session cookie', {
  tags: ['integration'],
}, async () => {
  stubViewer({ login: viewer }, { 'set-cookie': 'admin_session=next; Path=/' })

  const response = (await callAction(
    formRequest({ email: 'admin@example.com', password: 'correct horse' }),
  )) as unknown as Response

  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe('/')
  expect(response.headers.get('set-cookie')).toBe('admin_session=next; Path=/')
})

test('sends a signed-in viewer straight to the console', {
  tags: ['integration'],
}, async () => {
  stubViewer({ viewer })

  const response = (await callLoader(
    new Request('http://localhost/admin/login'),
  )) as unknown as Response

  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe('/')
})

test('renders the sign-in form for anonymous visitors', {
  tags: ['integration'],
}, async () => {
  stubViewer({ viewer: null })

  const loaderData = await callLoader(
    new Request('http://localhost/admin/login'),
  )
  renderLogin({ loaderData, actionData: null })

  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
  expect(screen.getByLabelText('Email')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Enter workspace' })).toBeTruthy()
})

test('reports a rejected sign-in', { tags: ['unit'] }, async () => {
  stubViewer({ login: null }, { 'set-cookie': 'admin_session=; Max-Age=0' })

  const response = await actionData(
    formRequest({ email: 'admin@example.com', password: 'wrong' }),
  )
  renderLogin({ actionData: response.data })

  expect(response.init.status).toBe(400)
  expect(response.data).toEqual({
    error: 'The email or password is incorrect.',
  })
  expect(screen.getByRole('alert').textContent).toBe(
    'The email or password is incorrect.',
  )
})

test('requires email and password', { tags: ['unit'] }, async () => {
  const response = await actionData(formRequest({ email: 'admin@example.com' }))

  expect(response.init.status).toBe(400)
  expect(response.data).toEqual({ error: 'Enter your email and password.' })
})

test('rejects cross-origin sign-in attempts', { tags: ['unit'] }, async () => {
  const request = new Request('http://localhost/admin/login', {
    method: 'POST',
    headers: { origin: 'http://evil.example.com' },
    body: new FormData(),
  })

  const error = (await callAction(request).catch((thrown) => thrown)) as {
    init: { status: number }
  }

  expect(error.init.status).toBe(403)
})
