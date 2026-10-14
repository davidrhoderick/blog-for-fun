import { expect, test } from 'vitest'
import { normalizeEmail, validateEmail } from './email'

test('normalizes valid emails', { tags: ['unit'] }, () => {
  expect(normalizeEmail('  Admin@Example.COM ')).toBe('admin@example.com')
  expect(validateEmail(' Admin@Example.COM ')).toBe('admin@example.com')
})

test('rejects malformed and over-long emails', { tags: ['unit'] }, () => {
  expect(() => validateEmail('not-an-email')).toThrow(
    'Enter a valid email address',
  )
  expect(() => validateEmail(`${'a'.repeat(250)}@example.com`)).toThrow(
    'Enter a valid email address',
  )
})
