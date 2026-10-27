import { expect, test } from 'vitest'
import { parseFeatureOptions } from './options'

test('parses feature workflow options', { tags: ['unit'] }, () => {
  expect(
    parseFeatureOptions(['--id', 'INS-123', '--capture', '--keep', '2']),
  ).toEqual({ id: 'INS-123', capture: true, keep: 2 })
})

test('rejects unknown flags, missing values, and missing feature IDs', {
  tags: ['unit'],
}, () => {
  expect(() => parseFeatureOptions(['--id', 'INS-123', '--wat'])).toThrow(
    /unknown/i,
  )
  expect(() => parseFeatureOptions(['--id'])).toThrow(/requires a value/i)
  expect(() => parseFeatureOptions(['--capture'])).toThrow(/--id/i)
})
