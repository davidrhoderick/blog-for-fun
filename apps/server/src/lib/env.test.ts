import { expect, test, vi } from 'vitest'

// Never load a real .env: these cases own the environment they assert on.
vi.mock('dotenv', () => ({ config: () => ({}) }))

test('exposes the libsql connection settings', {
  tags: ['integration'],
}, async () => {
  process.env.TURSO_CONNECTION_URL = 'file:local.db'
  process.env.TURSO_AUTH_TOKEN = 'local-token'

  const { env } = await import('./env')

  expect(env).toEqual({
    tursoConnectionUrl: 'file:local.db',
    tursoAuthToken: 'local-token',
  })
})

test('refuses to boot without a connection variable', {
  tags: ['unit'],
}, async () => {
  vi.resetModules()
  delete process.env.TURSO_CONNECTION_URL

  await expect(import('./env')).rejects.toThrow(
    'Missing required environment variable: TURSO_CONNECTION_URL',
  )

  process.env.TURSO_CONNECTION_URL = 'file:local.db'
})
