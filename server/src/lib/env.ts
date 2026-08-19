import { config } from 'dotenv'

config({ path: '.env' })

const requiredEnv = (name: string) => {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export const env = {
  tursoConnectionUrl: requiredEnv('TURSO_CONNECTION_URL'),
  tursoAuthToken: requiredEnv('TURSO_AUTH_TOKEN'),
}
