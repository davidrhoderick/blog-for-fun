import { expect, test } from 'vitest'
import {
  hasPermission,
  requireAuthenticatedUser,
  requirePermission,
} from './authorization'
import type { AuthContext } from './context'
import type { Role } from './types'

const contextFor = (roles: Role[]): AuthContext => ({
  request: new Request('http://localhost/graphql'),
  responseHeaders: new Headers(),
  sessionToken: null,
  session: null,
  principal: {
    id: 'user-1',
    displayName: 'User',
    email: 'user@example.com',
    roles,
  },
})

const anonymousContext: AuthContext = {
  ...contextFor([]),
  principal: null,
}

const codeOf = (error: unknown) =>
  (error as { extensions?: { code?: string } }).extensions?.code

test('administrators hold every permission', { tags: ['unit'] }, () => {
  expect(hasPermission(['administrator'], 'posts:create')).toBe(true)
  expect(hasPermission(['administrator'], 'posts:delete')).toBe(true)
  expect(hasPermission([], 'posts:readUnpublished')).toBe(false)
})

test('requires an authenticated principal', { tags: ['unit'] }, () => {
  expect(requireAuthenticatedUser(contextFor([])).id).toBe('user-1')
  expect(() => requireAuthenticatedUser(anonymousContext)).toThrow(
    'Authentication required',
  )
  try {
    requireAuthenticatedUser(anonymousContext)
  } catch (error) {
    expect(codeOf(error)).toBe('UNAUTHENTICATED')
  }
})

test('denies permissions the roles do not grant', { tags: ['unit'] }, () => {
  expect(
    requirePermission(contextFor(['administrator']), 'media:write').id,
  ).toBe('user-1')

  try {
    requirePermission(contextFor([]), 'media:write')
  } catch (error) {
    expect(codeOf(error)).toBe('FORBIDDEN')
  }
})
