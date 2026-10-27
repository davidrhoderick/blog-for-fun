import { expect, test } from 'vitest'
import { featureGrep, selectFeatureTests } from './playwright'

test('builds a boundary-aware exact feature-tag pattern', {
  tags: ['unit'],
}, () => {
  const grep = featureGrep('@feature-INS-123')
  expect(grep).toBe('(^|\\s)@feature-INS-123(\\s|$)')
  expect(new RegExp(grep).test('persist comment @feature-INS-123 @smoke')).toBe(
    true,
  )
  expect(
    new RegExp(grep).test('persist comment @feature-INS-1234 @smoke'),
  ).toBe(false)
})

test('selects listed test identifiers and rejects empty or mismatched selections', {
  tags: ['unit'],
}, () => {
  const listing = [
    'Listing tests:',
    '  [chromium] › tests/comments.spec.ts:4:3 › persists a comment',
    'Total: 1 test in 1 file',
  ].join('\n')

  expect(selectFeatureTests(listing, 'INS-123', '@feature-INS-123')).toEqual([
    '[chromium] › tests/comments.spec.ts:4:3 › persists a comment',
  ])

  expect(() =>
    selectFeatureTests(
      'Listing tests:\nTotal: 0 tests',
      'INS-123',
      '@feature-INS-123',
    ),
  ).toThrow(/no tests/i)
  expect(() =>
    selectFeatureTests(listing, 'INS-123', '@feature-INS-1234'),
  ).toThrow(/tag/i)
})
