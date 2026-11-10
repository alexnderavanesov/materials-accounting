import { defineConfig } from 'drizzle-kit'
import { loadEnvFile } from 'node:process'

try {
  loadEnvFile('.env')
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://materials:materials@localhost:55432/materials',
  },
})
