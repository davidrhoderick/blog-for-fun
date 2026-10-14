import { expect, test } from 'vitest'
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
  verifyPassword,
} from './password'

test('hashes and verifies a password', { tags: ['integration'] }, async () => {
  const hash = await hashPassword('a long enough password')

  expect(hash).not.toContain('a long enough password')
  expect(await verifyPassword(hash, 'a long enough password')).toBe(true)
  expect(await verifyPassword(hash, 'the wrong password')).toBe(false)
})

test('rejects passwords outside the allowed length', { tags: ['unit'] }, () => {
  expect(() => validateNewPassword('too short')).toThrow(
    `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
  )
  expect(() =>
    validateNewPassword('a'.repeat(MAX_PASSWORD_LENGTH + 1)),
  ).toThrow('Password must be between')
  expect(() =>
    validateNewPassword('a'.repeat(MIN_PASSWORD_LENGTH)),
  ).not.toThrow()
})

test('treats oversized or malformed hashes as non-matches', {
  tags: ['unit'],
}, async () => {
  expect(await verifyPassword('not-a-real-hash', 'any password')).toBe(false)
  expect(await verifyPassword('hash', 'a'.repeat(2_000))).toBe(false)
})
