import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { databaseUrl } from '../src/db/connection.server'
import { createPostgresWorkspaceStore } from '../src/features/materials/workspace-postgres.server'
import { workspaceSnapshotSchema } from '../src/features/materials/workspace-snapshot'
import {
  emptyWorkspace,
  jsonEqual,
  workspaceEntities,
} from '../src/features/materials/workspace-protocol'

const command = process.argv[2] ?? 'import'
const url =
  command === 'migrate-test' ? process.env.DATABASE_URL_TEST : databaseUrl()
if (!url) throw new Error('Не настроена DATABASE_URL_TEST.')
if (
  command === 'migrate-test' &&
  (!new URL(url).pathname.endsWith('_test') ||
    new URL(url).pathname === new URL(databaseUrl()).pathname)
)
  throw new Error('Нужна отдельная база с именем, оканчивающимся на _test.')
const sql = postgres(url, { max: 1, onnotice: () => {} })
try {
  const target = new URL(url)
  console.log(
    `База: ${target.hostname}:${target.port || '5432'}${target.pathname}`,
  )
  // Drizzle changes postgres.js JSON serializers; keep its connection separate from the store.
  const migrationSql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(migrationSql), { migrationsFolder: './drizzle' })
  } finally {
    await migrationSql.end()
  }
  if (command === 'migrate' || command === 'migrate-test')
    console.log('Миграции выполнены.')
  else if (command === 'import') {
    const store = createPostgresWorkspaceStore(sql)
    const [exists] = await sql`select id from workspace_meta where id = 1`
    if (exists)
      throw new Error(
        'База уже содержит данные. Повторный импорт остановлен без изменения данных.',
      )
    const file = resolve(
      process.env.MATERIALS_WORKSPACE_DIR ?? '.materials-workspace',
      'workspace.json',
    )
    let workspace = emptyWorkspace()
    try {
      workspace = workspaceSnapshotSchema.parse(
        JSON.parse(await readFile(file, 'utf8')),
      )
      const folder = resolve('.materials-workspace/backups')
      await mkdir(folder, { recursive: true, mode: 0o700 })
      const backup = resolve(
        folder,
        `before-postgres-${new Date().toISOString().replaceAll(':', '-')}.json`,
      )
      await copyFile(file, backup)
      console.log(`Резервная копия: ${backup}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const result = await store.importWorkspace(workspace)
    const loaded = await store.load()
    const before = workspaceEntities(workspace),
      after = workspaceEntities(loaded.workspace!)
    if (
      before.size !== after.size ||
      [...before].some(
        ([key, item]) => !jsonEqual(item.value, after.get(key)?.value),
      )
    )
      throw new Error(
        'Сверка переноса не пройдена. Исходный JSON и резервная копия сохранены.',
      )
    console.log(
      `Перенесено и сверено ${result.records} записей. Версия ${loaded.revision}. Исходный JSON сохранён.`,
    )
  } else throw new Error('Команды: import, migrate')
} finally {
  await sql.end()
}
