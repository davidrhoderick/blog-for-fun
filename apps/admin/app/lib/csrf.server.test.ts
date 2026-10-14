import { expect, test } from 'vitest'
import { requireSameOrigin } from './csrf.server'

test('accepts same-origin form posts', { tags: ['integration'] }, () => {
  const request = new Request('http://localhost/admin/login', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
  })

  expect(() => requireSameOrigin(request)).not.toThrow()
})

test('rejects cross-origin form posts', { tags: ['unit'] }, () => {
  const request = new Request('http://localhost/admin/login', {
    method: 'POST',
    headers: { origin: 'http://evil.example.com' },
  })

  const error = (() => {
    try {
      requireSameOrigin(request)
      return null
    } catch (thrown) {
      return thrown as { init: { status: number } }
    }
  })()

  expect(error?.init.status).toBe(403)
})
