import { defineConfig } from 'drizzle-kit'
import { env } from './src/lib/env'

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './migrations',
  dialect: 'turso',
  dbCredentials: {
    url: env.tursoConnectionUrl,
    authToken: env.tursoAuthToken,
  },
})
