import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { relayEnvironment } from '../lib/relay-environment.client'
import PostsClient from './posts.client'

const posts = [
  {
    id: 'post-1',
    slug: 'first-note',
    title: 'First note',
    publishedAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  },
  {
    id: 'post-2',
    slug: 'second-note',
    title: 'Second note',
    publishedAt: null,
    updatedAt: '2026-01-04T00:00:00.000Z',
  },
]

const stubGraphQL = (data: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 })),
  )

const clearRelayStore = () =>
  (
    relayEnvironment.getStore().getSource() as unknown as {
      clear(): void
    }
  ).clear()

afterEach(() => {
  vi.unstubAllGlobals()
  clearRelayStore()
})

test('lists posts fetched through the GraphQL proxy', {
  tags: ['integration'],
}, async () => {
  stubGraphQL({ posts })

  render(
    <MemoryRouter>
      <PostsClient />
    </MemoryRouter>,
  )

  expect(await screen.findByText('First note')).toBeTruthy()
  expect(screen.getByText('/first-note')).toBeTruthy()
  expect(screen.getByText('Published')).toBeTruthy()
  expect(screen.getByText('Draft')).toBeTruthy()
  expect(screen.getByText('Updated Jan 3, 2026')).toBeTruthy()
})

test('reports when there are no posts', { tags: ['unit'] }, async () => {
  stubGraphQL({ posts: [] })

  render(
    <MemoryRouter>
      <PostsClient />
    </MemoryRouter>,
  )

  expect(await screen.findByText('No posts yet.')).toBeTruthy()
})
