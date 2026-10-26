import { expect, test } from 'vitest'
import { blogHeaders, DEFAULT_CACHE_CONTROL } from './headers'

test('returns the default cache-control header', { tags: ['unit'] }, () => {
  expect(blogHeaders()({} as never)).toEqual({
    'cache-control': DEFAULT_CACHE_CONTROL,
  })
})

test('spreads overrides over the defaults', { tags: ['unit'] }, () => {
  expect(
    blogHeaders({ 'cache-control': 'no-store', 'x-extra': '1' })({} as never),
  ).toEqual({
    'cache-control': 'no-store',
    'x-extra': '1',
  })
})
