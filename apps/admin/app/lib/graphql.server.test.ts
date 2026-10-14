import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveGraphQLUrl } from './graphql.server'

test('uses the local HTTP fallback outside production', () => {
  assert.equal(
    resolveGraphQLUrl(undefined, 'development'),
    'http://localhost:4000/graphql',
  )
})

test('requires an explicit HTTPS GraphQL URL in production', () => {
  assert.throws(() => resolveGraphQLUrl(undefined, 'production'), {
    message: 'GRAPHQL_URL is required in production',
  })
  assert.throws(
    () => resolveGraphQLUrl('http://api.example.com/graphql', 'production'),
    { message: 'GRAPHQL_URL must use HTTPS in production' },
  )
  assert.equal(
    resolveGraphQLUrl('https://api.example.com/graphql', 'production'),
    'https://api.example.com/graphql',
  )
})

test('rejects non-HTTP URL schemes', () => {
  assert.throws(() => resolveGraphQLUrl('file:///tmp/graphql', 'development'), {
    message: 'GRAPHQL_URL must use HTTP or HTTPS',
  })
})
