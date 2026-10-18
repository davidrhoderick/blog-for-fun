import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { RelayScope } from '~/components/relay-scope'
import type { Route } from './+types/post'
import Post, { loader, meta } from './post'

const note = {
  id: 'post-1',
  slug: 'first-note',
  title: 'First note',
  markdownContent: 'Body **text**.',
  publishedAt: '2026-01-02T00:00:00.000Z',
}

const metaData = { description: 'Body text', title: 'First note' }

const callLoader = (params: Record<string, string>) =>
  loader({
    params,
    request: new Request('http://localhost/posts/first-note'),
  } as unknown as Route.LoaderArgs)

const stubFetch = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  )

const stubMatchMedia = () =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('renders a note loaded by slug', { tags: ['integration'] }, async () => {
  stubFetch({ data: { publishedPostBySlug: note } })
  stubMatchMedia()

  const loaderData = await callLoader({ slug: 'first-note' })
  const props = { loaderData } as unknown as Route.ComponentProps
  render(
    <MemoryRouter>
      <RelayScope records={loaderData.records}>
        <Post {...props} />
      </RelayScope>
    </MemoryRouter>,
  )

  expect(
    await screen.findByRole('heading', { name: 'First note' }),
  ).toBeTruthy()
  expect(screen.getByText(/Body/)).toBeTruthy()
  expect(screen.getByText('Jan 2, 2026')).toBeTruthy()
})

test('returns 404 for a missing slug or an unknown note', {
  tags: ['unit'],
}, async () => {
  stubFetch({ data: { publishedPostBySlug: null } })

  const missingSlug = await callLoader({}).catch((error) => error)
  const unknownNote = await callLoader({ slug: 'nope' }).catch((error) => error)

  expect(missingSlug.init.status).toBe(404)
  expect(unknownNote.init.status).toBe(404)
})

test('describes a note and falls back when it is absent', {
  tags: ['unit'],
}, () => {
  expect(
    meta({ loaderData: { meta: metaData } } as unknown as Route.MetaArgs),
  ).toEqual([
    { title: 'First note | Field Notes' },
    { name: 'description', content: 'Body text' },
    { property: 'og:description', content: 'Body text' },
    { property: 'og:title', content: 'First note' },
    { property: 'og:type', content: 'article' },
  ])
  expect(meta({ loaderData: undefined } as unknown as Route.MetaArgs)).toEqual([
    { title: 'Note not found | Field Notes' },
  ])
})
