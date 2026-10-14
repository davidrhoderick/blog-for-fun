import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import Posts from './posts'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('shows a loading state before hydrating the post list', {
  tags: ['unit'],
}, () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { posts: [] } }), { status: 200 }),
    ),
  )

  render(
    <MemoryRouter>
      <Posts />
    </MemoryRouter>,
  )

  expect(screen.getByText('Loading posts...')).toBeTruthy()
})

test('hydrates into the client post list', {
  tags: ['integration'],
}, async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              posts: [
                {
                  id: 'post-1',
                  slug: 'first-note',
                  title: 'First note',
                  publishedAt: null,
                  updatedAt: '2026-01-03T00:00:00.000Z',
                },
              ],
            },
          }),
          { status: 200 },
        ),
    ),
  )

  render(
    <MemoryRouter>
      <Posts />
    </MemoryRouter>,
  )

  expect(await screen.findByText('First note')).toBeTruthy()
})
