import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NODE_ENV = 'production'

const { SESSION_COOKIE_NAME, createBlankSessionCookie, createSessionCookie } =
  await import('./cookie')

test('production cookies use the host prefix and secure attributes', () => {
  const sessionCookie = createSessionCookie('token', {
    expiresAt: new Date(Date.now() + 60_000),
  })
  const blankCookie = createBlankSessionCookie()

  assert.equal(SESSION_COOKIE_NAME, '__Host-admin_session')
  assert.match(sessionCookie, /^__Host-admin_session=token/)
  assert.match(sessionCookie, /HttpOnly/i)
  assert.match(sessionCookie, /Secure/i)
  assert.match(sessionCookie, /SameSite=Lax/i)
  assert.doesNotMatch(sessionCookie, /Domain=/i)
  assert.match(blankCookie, /Max-Age=0/i)
})
