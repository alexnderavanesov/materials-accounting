import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const connectionString =
  process.env.DATABASE_URL ??
  'postgres://materials:materials@localhost:55432/materials'

const client = postgres(connectionString, {
  max: 10,
  prepare: false,
})

export const db = drizzle(client, { schema })
export type DbClient = typeof db
