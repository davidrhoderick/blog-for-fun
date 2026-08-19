import { drizzle } from 'drizzle-orm/libsql'
import { env } from '../lib/env'
import { relations } from './schema'

export const db = drizzle({
  connection: {
    url: env.tursoConnectionUrl,
    authToken: env.tursoAuthToken,
  },
  relations,
})
