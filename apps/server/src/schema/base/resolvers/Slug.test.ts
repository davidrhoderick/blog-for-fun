import { Kind } from 'graphql'
import { expect, test } from 'vitest'
import { Slug } from './Slug'

test('normalizes valid slugs from values and literals', {
  tags: ['integration'],
}, () => {
  expect(Slug.parseValue?.('  Field-Notes  ')).toBe('field-notes')
  expect(Slug.serialize?.('field-notes')).toBe('field-notes')
  expect(
    Slug.parseLiteral?.({ kind: Kind.STRING, value: ' Field-Notes ' } as never),
  ).toBe('field-notes')
})

test('rejects non-string and malformed slugs', { tags: ['unit'] }, () => {
  expect(() => Slug.parseValue?.(42)).toThrow('Slug must be a string')
  expect(() =>
    Slug.parseLiteral?.({ kind: Kind.INT, value: '1' } as never),
  ).toThrow('Slug must be a string')
  expect(() => Slug.parseValue?.('Not A Slug')).toThrow(
    'Slug must use lowercase letters, numbers, and single hyphens only',
  )
})
