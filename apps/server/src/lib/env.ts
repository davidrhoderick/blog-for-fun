import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

// The server's own .env, beside its package: contained to this app, and read
// whatever cwd the script happens to run from. Absent in production, where the
// environment comes from the platform.
config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
})

const requiredEnv = (name: string) => {
  const value = process.env[name]

  if (!value) throw new Error(`Missing required environment variable: ${name}`)

  return value
}

export const env = {
  tursoConnectionUrl: requiredEnv('TURSO_CONNECTION_URL'),
  tursoAuthToken: requiredEnv('TURSO_AUTH_TOKEN'),
}
