import { expect, test } from 'vitest'

delete process.env.NODE_ENV

const { SESSION_COOKIE_NAME, createBlankSessionCookie, createSessionCookie } =
  await import('./cookie')

test('cookies are secure when the environment is not explicitly local', {
  tags: ['unit'],
}, () => {
  const sessionCookie = createSessionCookie('token', {
    expiresAt: new Date(Date.now() + 60_000),
  })
  const blankCookie = createBlankSessionCookie()

  expect(SESSION_COOKIE_NAME).toBe('__Host-admin_session')
  expect(sessionCookie).toMatch(/^__Host-admin_session=token/)
  expect(sessionCookie).toMatch(/HttpOnly/i)
  expect(sessionCookie).toMatch(/Secure/i)
  expect(sessionCookie).toMatch(/SameSite=Lax/i)
  expect(sessionCookie).not.toMatch(/Domain=/i)
  expect(blankCookie).toMatch(/Max-Age=0/i)
})
