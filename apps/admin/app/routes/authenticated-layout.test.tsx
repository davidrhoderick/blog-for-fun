import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import type { Route } from './+types/authenticated-layout'
import AuthenticatedLayout, { loader } from './authenticated-layout'

const viewer = {
  id: 'viewer-1',
  email: 'admin@example.com',
  displayName: 'Blog Administrator',
  roles: ['ADMINISTRATOR'],
}

const callLoader = (request: Request) =>
  loader({ request } as unknown as Parameters<typeof loader>[0])

const renderLayout = (pageTitle: string) => {
  const props = { loaderData: { viewer } } as unknown as Route.ComponentProps
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AuthenticatedLayout {...props} />,
        children: [
          {
            index: true,
            Component: () => null,
            handle: { pageTitle },
          },
        ],
      },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('redirects anonymous visitors to sign in', {
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

  const response = (await callLoader(
    new Request('http://localhost/admin/posts'),
  )) as unknown as Response

  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe('/login')
})

test('returns the viewer and any refreshed cookie', {
  tags: ['integration'],
}, async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { viewer } }), {
          status: 200,
          headers: { 'set-cookie': 'admin_session=next; Path=/' },
        }),
    ),
  )

  const response = (await callLoader(
    new Request('http://localhost/admin/posts'),
  )) as unknown as { init: { headers: unknown }; data: unknown }

  expect(response.init.headers).toEqual({
    'set-cookie': 'admin_session=next; Path=/',
  })
  expect(response.data).toEqual({ viewer })
})

test('shows the viewer on the home page', {
  tags: ['integration'],
}, async () => {
  renderLayout('Home')

  expect(await screen.findByText('Blog Administrator')).toBeTruthy()
  expect(screen.getByText('admin@example.com')).toBeTruthy()
  expect(screen.getByText('Home')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
})

test('shows a breadcrumb on child pages', { tags: ['unit'] }, async () => {
  renderLayout('Posts')

  expect(await screen.findByRole('link', { name: 'Home' })).toBeTruthy()
  expect(screen.getByText('Posts')).toBeTruthy()
})
