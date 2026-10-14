import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import type { Route } from './+types/post'
import Post from './post'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('loads the editor for the requested post', {
  tags: ['integration'],
}, async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              post: {
                id: 'post-1',
                title: 'First note',
                slug: 'first-note',
                markdownContent: 'Body text.',
                publishedAt: null,
              },
              mediaAssets: [],
            },
          }),
          { status: 200 },
        ),
    ),
  )

  const props = { params: { id: 'post-1' } } as unknown as Route.ComponentProps
  render(
    <MemoryRouter>
      <Post {...props} />
    </MemoryRouter>,
  )

  expect(
    await screen.findByDisplayValue('First note', {}, { timeout: 10_000 }),
  ).toBeTruthy()
})
