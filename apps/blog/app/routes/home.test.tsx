import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { RelayScope } from '~/components/relay-scope'
import type { Route } from './+types/home'
import Home, { headers, loader, meta } from './home'

const posts = [
  {
    id: 'post-1',
    slug: 'first-note',
    title: 'First note',
    markdownContent: 'Something **worth** saying & more.',
    publishedAt: '2026-01-02T00:00:00.000Z',
  },
]

const stubApi = (data: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 })),
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

const renderHome = (records: Awaited<ReturnType<typeof loader>>['records']) =>
  render(
    <MemoryRouter>
      <RelayScope records={records}>
        <Home />
      </RelayScope>
    </MemoryRouter>,
  )

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('renders the dispatches returned by the public GraphQL API', {
  tags: ['integration'],
}, async () => {
  stubApi({ posts })

  const { records } = await loader()
  renderHome(records)

  expect(
    await screen.findByRole('heading', { name: 'First note' }),
  ).toBeTruthy()
  expect(screen.getByText('1 entries')).toBeTruthy()
  expect(screen.getByText('Something worth saying more...')).toBeTruthy()
  expect(screen.getByText('Jan 2, 2026')).toBeTruthy()
})

test('caches the index and describes it for search engines', {
  tags: ['unit'],
}, () => {
  expect(headers({} as Route.HeadersArgs)).toEqual({
    'cache-control': 'public, max-age=60, s-maxage=300',
  })
  expect(meta({} as Route.MetaArgs)).toEqual([
    { title: 'Field Notes | Observations worth keeping' },
    {
      name: 'description',
      content:
        'A collection of considered notes, observations, and small ideas.',
    },
  ])
})
