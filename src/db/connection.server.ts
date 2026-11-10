import { loadEnvFile } from 'node:process'
import postgres from 'postgres'

try {
  loadEnvFile('.env')
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

export function databaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url)
    throw new Error(
      'Не настроена PostgreSQL: выполните pnpm db:local:start и pnpm db:workspace:import.',
    )
  return url
}

let connection: ReturnType<typeof postgres> | undefined
export function workspaceSql() {
  connection ??= postgres(databaseUrl(), {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
    onnotice: () => {},
  })
  return connection
}
