import { afterEach, expect, test, vi } from 'vitest'
import { resolveGraphQLUrl } from './relay.server'

afterEach(() => {
  vi.unstubAllEnvs()
})

test('defaults to the local GraphQL endpoint', { tags: ['unit'] }, () => {
  expect(resolveGraphQLUrl()).toBe('http://localhost:4000/graphql')
})

test('rejects unsafe GraphQL URLs', { tags: ['unit'] }, () => {
  vi.stubEnv('GRAPHQL_URL', 'file:///tmp/graphql')
  expect(() => resolveGraphQLUrl()).toThrow(
    'GRAPHQL_URL must use HTTP or HTTPS',
  )

  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('GRAPHQL_URL', 'http://api.example.com/graphql')
  expect(() => resolveGraphQLUrl()).toThrow(
    'GRAPHQL_URL must use HTTPS in production',
  )

  vi.stubEnv('GRAPHQL_URL', 'http://localhost:4000/graphql')
  expect(resolveGraphQLUrl()).toBe('http://localhost:4000/graphql')
})
