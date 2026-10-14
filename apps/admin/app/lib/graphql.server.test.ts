import { expect, test } from 'vitest'
import { resolveGraphQLUrl } from './graphql.server'

test('uses the local HTTP fallback outside production', {
  tags: ['integration'],
}, () => {
  expect(resolveGraphQLUrl(undefined, 'development')).toBe(
    'http://localhost:4000/graphql',
  )
})

test('requires an explicit HTTPS GraphQL URL in production', {
  tags: ['unit'],
}, () => {
  expect(() => resolveGraphQLUrl(undefined, 'production')).toThrow(
    'GRAPHQL_URL is required in production',
  )
  expect(() =>
    resolveGraphQLUrl('http://api.example.com/graphql', 'production'),
  ).toThrow('GRAPHQL_URL must use HTTPS in production')
  expect(
    resolveGraphQLUrl('https://api.example.com/graphql', 'production'),
  ).toBe('https://api.example.com/graphql')
})

test('rejects non-HTTP URL schemes', { tags: ['unit'] }, () => {
  expect(() => resolveGraphQLUrl('file:///tmp/graphql', 'development')).toThrow(
    'GRAPHQL_URL must use HTTP or HTTPS',
  )
})
