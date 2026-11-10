import { spawn } from 'node:child_process'
import { chmod, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { databaseUrl } from '../src/db/connection.server'

const url = new URL(databaseUrl())
const folder = resolve('.materials-workspace/backups')
await mkdir(folder, { recursive: true, mode: 0o700 })
const file = resolve(
  folder,
  `materials-${new Date().toISOString().replaceAll(':', '-')}.dump`,
)
await new Promise<void>((done, reject) => {
  const child = spawn(
    'pg_dump',
    ['--format=custom', '--no-owner', '--no-acl', '--file', file],
    {
      env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        ...(url.searchParams.has('sslmode')
          ? { PGSSLMODE: url.searchParams.get('sslmode')! }
          : {}),
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  )
  child.once('error', reject)
  child.once('exit', (code) =>
    code === 0
      ? done()
      : reject(new Error(`pg_dump завершился с кодом ${code}`)),
  )
})
await chmod(file, 0o600)
console.log(`Резервная копия PostgreSQL: ${file}`)
console.log(
  'Вложения и шаблоны хранятся отдельно: сохраните document-files и print-templates из MATERIALS_WORKSPACE_DIR.',
)
