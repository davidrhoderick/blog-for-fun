import { expect, test } from 'vitest'
import {
  acquirePasswordCheck,
  assertLoginAllowed,
  clearLoginAttempts,
  recordLoginFailure,
} from './login-rate-limit'

const WINDOW_MS = 15 * 60 * 1_000
const MAX_ATTEMPTS = 10

test('blocks an identity once it reaches the attempt limit', {
  tags: ['integration'],
}, () => {
  const email = 'limited@example.com'
  const now = Date.now()

  for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt += 1) {
    recordLoginFailure(email, now)
  }
  expect(() => assertLoginAllowed(email, now)).not.toThrow()

  recordLoginFailure(email, now)
  expect(() => assertLoginAllowed(email, now)).toThrow(
    'Invalid email or password',
  )
})

test('clears an identity after a successful sign-in or a new window', {
  tags: ['unit'],
}, () => {
  const cleared = 'cleared@example.com'
  const now = Date.now()
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    recordLoginFailure(cleared, now)
  }
  clearLoginAttempts(cleared)
  expect(() => assertLoginAllowed(cleared, now)).not.toThrow()

  const expired = 'expired@example.com'
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    recordLoginFailure(expired, now)
  }
  expect(() => assertLoginAllowed(expired, now + WINDOW_MS)).not.toThrow()
})

test('caps concurrent password checks', { tags: ['unit'] }, () => {
  const releases = Array.from({ length: 4 }, () => acquirePasswordCheck())

  expect(() => acquirePasswordCheck()).toThrow('Invalid email or password')

  for (const release of releases) release()

  const release = acquirePasswordCheck()
  release()
  release()
})
