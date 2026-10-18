import { expect, test } from 'vitest'
import { requirePublishedAt } from './post-content'

const publishedAt = '2026-01-02T00:00:00.000Z'

test('returns the publish time of a public post', { tags: ['unit'] }, () => {
  expect(requirePublishedAt({ id: 'post-1', publishedAt })).toBe(publishedAt)
})

test('throws when a public post has no publish time', {
  tags: ['unit'],
}, () => {
  expect(() => requirePublishedAt({ id: 'post-1', publishedAt: null })).toThrow(
    'Published post post-1 is missing publishedAt',
  )
})
