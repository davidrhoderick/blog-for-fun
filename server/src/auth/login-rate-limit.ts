import { createHash } from 'node:crypto'
import { GraphQLError } from 'graphql'

const WINDOW_MS = 15 * 60 * 1_000
const MAX_IDENTITY_ATTEMPTS = 10
const MAX_CONCURRENT_PASSWORD_CHECKS = 4

type AttemptWindow = {
  startedAt: number
  attempts: number
}

const attemptsByIdentity = new Map<string, AttemptWindow>()
let activePasswordChecks = 0

const currentWindow = (window: AttemptWindow, now: number) =>
  now - window.startedAt >= WINDOW_MS ? { startedAt: now, attempts: 0 } : window

const identityKey = (email: string) =>
  createHash('sha256').update(email).digest('hex')

const rateLimitError = () =>
  new GraphQLError('Invalid email or password', {
    extensions: { code: 'UNAUTHENTICATED' },
  })

export const assertLoginAllowed = (email: string, now = Date.now()) => {
  const key = identityKey(email)
  const identityAttempts = currentWindow(
    attemptsByIdentity.get(key) ?? { startedAt: now, attempts: 0 },
    now,
  )
  if (identityAttempts.attempts >= MAX_IDENTITY_ATTEMPTS) {
    throw rateLimitError()
  }
}

export const recordLoginFailure = (email: string, now = Date.now()) => {
  const key = identityKey(email)
  const identityAttempts = currentWindow(
    attemptsByIdentity.get(key) ?? { startedAt: now, attempts: 0 },
    now,
  )
  identityAttempts.attempts += 1

  if (!attemptsByIdentity.has(key) && attemptsByIdentity.size >= 1_000) {
    const oldestKey = attemptsByIdentity.keys().next().value
    if (oldestKey) attemptsByIdentity.delete(oldestKey)
  }
  attemptsByIdentity.set(key, identityAttempts)
}

export const acquirePasswordCheck = () => {
  if (activePasswordChecks >= MAX_CONCURRENT_PASSWORD_CHECKS) {
    throw rateLimitError()
  }

  activePasswordChecks += 1
  let released = false
  return () => {
    if (released) return
    released = true
    activePasswordChecks -= 1
  }
}

export const clearLoginAttempts = (email: string) => {
  attemptsByIdentity.delete(identityKey(email))
}
