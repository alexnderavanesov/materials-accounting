import { validateQualityWorkspace } from '../src/features/materials/quality-workflow'
import { validateProjectAccounting } from '../src/features/materials/project-changes'
import { validateM15Workspace } from '../src/features/materials/m15-reconciliation'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { databaseUrl, workspaceSql } from '../src/db/connection.server'
import { createPostgresWorkspaceStore } from '../src/features/materials/workspace-postgres.server'
import { createDocumentFileStore } from '../src/features/materials/document-files.server'
import {
  operationCollections,
  resetTestOperations,
} from '../src/features/materials/workspace-reset.server'
import {
  jsonEqual,
  workspaceEntities,
  entitiesWorkspace,
} from '../src/features/materials/workspace-protocol'

// One-time administrative transition, explicitly requested by the owner.
// Run without --apply to inspect. With --apply the local app MUST be stopped.
const sql = workspaceSql()
const directory = resolve(
  process.env.MATERIALS_WORKSPACE_DIR ?? '.materials-workspace',
)
const hash = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex')
const operationKinds = new Set([
  'app',
  'm15',
  'request',
  'zni',
  'avk',
  'issue',
  'return',
])
const operationPrefixes = new Set([
  'receipt-document',
  'receipt-field',
  'request',
  'zni',
  'avk',
  'quality-document',
  'issue',
  'site-return',
  'return',
])

function command(name: string, args: string[], env = process.env) {
  const result = spawnSync(name, args, { env, encoding: 'utf8' })
  if (result.error || result.status !== 0)
    throw new Error(`${name}: ${result.error?.message ?? result.stderr}`)
  return result.stdout
}

async function fileHashes(
  root: string,
  prefix = '',
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const path = join(prefix, entry.name)
    if (entry.isDirectory()) Object.assign(result, await fileHashes(root, path))
    else if (entry.isFile())
      result[path] = hash(await readFile(join(root, path)))
    else throw new Error(`Неподдерживаемый файл резервной копии: ${path}`)
  }
  return result
}

try {
  const store = createPostgresWorkspaceStore(sql)
  const before = await store.load()
  if (!before.workspace || !before.revision)
    throw new Error('Рабочая база не найдена.')
  if (before.accountingGeneration) throw new Error('Чистый старт уже выполнен.')
  const files = createDocumentFileStore(directory)
  const manifest = await files.load()
  const removeIds = new Set(
    manifest.documents
      .filter((doc) => operationKinds.has(doc.kind))
      .map((doc) => doc.id),
  )
  for (const file of manifest.files) {
    try {
      const id: unknown = JSON.parse(file.documentId)
      if (Array.isArray(id) && operationPrefixes.has(String(id[0])))
        removeIds.add(file.documentId)
    } catch {
      /* Standalone project document. */
    }
  }
  const removedFiles = manifest.files.filter((file) =>
    removeIds.has(file.documentId),
  )
  const keptFiles = manifest.files.filter(
    (file) => !removeIds.has(file.documentId),
  )
  const projected = entitiesWorkspace(
    [...workspaceEntities(before.workspace).values()].filter(
      (entity) =>
        !(operationCollections as readonly string[]).includes(
          entity.collection,
        ),
    ),
  )
  validateQualityWorkspace(projected, projected)
  validateProjectAccounting(projected, projected)
  validateM15Workspace(projected, projected)
  const counts =
    await sql`select collection, count(*)::int as count from workspace_records group by collection order by collection`
  const report = {
    revision: before.revision,
    collections: counts,
    filesToRemove: removedFiles.length,
    filesToKeep: keptFiles.length,
    projectLines: before.workspace.lines.length,
    projectChanges: before.workspace.projectChanges?.length ?? 0,
  }
  console.log(JSON.stringify(report, null, 2))
  if (process.argv.includes('--apply')) {
    const listening = spawnSync(
      'lsof',
      ['-nP', '-iTCP:43187', '-sTCP:LISTEN'],
      { encoding: 'utf8' },
    )
    if (listening.error || listening.status !== 1 || listening.stdout.trim())
      throw new Error('Сначала остановите materials на порту 43187.')
    const backup = join(
      directory,
      'backups',
      `before-independent-m15-${new Date().toISOString().replaceAll(':', '-')}`,
    )
    await mkdir(backup, { recursive: true, mode: 0o700 })
    const url = new URL(databaseUrl())
    const pgEnv = {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      ...(url.searchParams.has('sslmode')
        ? { PGSSLMODE: url.searchParams.get('sslmode')! }
        : {}),
    }
    const dump = join(backup, 'database.dump')
    command(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-acl', '--file', dump],
      pgEnv,
    )
    const toc = command('pg_restore', ['--list', dump])
    if (!toc.includes('workspace_records'))
      throw new Error('В копии отсутствует рабочая база.')
    await writeFile(join(backup, 'before.json'), JSON.stringify(before), {
      mode: 0o600,
    })
    await writeFile(
      join(backup, 'plan.json'),
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    )
    for (const name of ['document-files', 'print-templates']) {
      const source = join(directory, name)
      const hashes = await fileHashes(source)
      await cp(source, join(backup, name), {
        recursive: true,
        errorOnExist: true,
        force: false,
      })
      if (!jsonEqual(hashes, await fileHashes(join(backup, name))))
        throw new Error(`Не совпала копия ${name}.`)
    }
    await cp(join(directory, 'workspace.json'), join(backup, 'workspace.json'))
    await writeFile(
      join(backup, 'sha256.json'),
      JSON.stringify(await fileHashes(backup), null, 2),
      { mode: 0o600 },
    )
    if ((await files.load()).revision !== manifest.revision)
      throw new Error('Реестр файлов изменился после копирования.')
    if ((await store.load()).revision !== before.revision)
      throw new Error('База изменилась после копирования.')
    const result = await resetTestOperations(sql, before.revision)
    const after = await store.load()
    const oldEntities = workspaceEntities(before.workspace)
    const nextEntities = workspaceEntities(after.workspace!)
    for (const [key, entity] of oldEntities) {
      if (
        (operationCollections as readonly string[]).includes(
          entity.collection,
        ) ||
        entity.collection === 'numbering'
      )
        continue
      if (!jsonEqual(entity.value, nextEntities.get(key)?.value))
        throw new Error(
          `Изменилась сохраняемая запись ${key}. Восстановление: ${backup}`,
        )
    }
    if (
      [...nextEntities.values()].some((entity) =>
        (operationCollections as readonly string[]).includes(entity.collection),
      )
    )
      throw new Error('Операции остались после очистки.')
    const sharedBlobs = new Map<string, string>()
    const deduplicated = []
    for (const file of keptFiles) {
      const sha256 = hash((await files.read(file.id)).bytes)
      const blobId = sharedBlobs.get(sha256) ?? file.blobId ?? file.id
      sharedBlobs.set(sha256, blobId)
      deduplicated.push({ ...file, sha256, blobId })
    }
    const cleaned = {
      files: deduplicated,
      documents: manifest.documents.filter((doc) => !removeIds.has(doc.id)),
    }
    const temporary = join(directory, 'document-files', `${randomUUID()}.tmp`)
    await writeFile(temporary, JSON.stringify(cleaned), {
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporary, join(directory, 'document-files', 'manifest.json'))
    const liveBlobs = new Set(deduplicated.map((file) => file.blobId))
    for (const blob of new Set(
      removedFiles.map((file) => file.blobId ?? file.id),
    ))
      if (!liveBlobs.has(blob))
        await rm(join(directory, 'document-files', `${blob}.bin`))
    // The old file snapshot must not offer an obsolete operations set for recovery.
    await writeFile(
      join(directory, 'workspace.json'),
      JSON.stringify(after.workspace, null, 2),
      { mode: 0o600 },
    )
    for (const file of keptFiles) {
      const current = await files.read(file.id)
      const original = await readFile(
        join(backup, 'document-files', `${file.blobId ?? file.id}.bin`),
      )
      if (!current.bytes.equals(original))
        throw new Error('Изменился сохранённый проектный документ.')
    }
    await writeFile(join(backup, 'after.json'), JSON.stringify(after), {
      mode: 0o600,
    })
    console.log(
      JSON.stringify(
        {
          ...result,
          backup,
          filesRemoved: removedFiles.length,
          filesRetained: keptFiles.length,
          projectLines: after.workspace!.lines.length,
          projectChanges: after.workspace!.projectChanges?.length ?? 0,
        },
        null,
        2,
      ),
    )
  }
} finally {
  await sql.end()
}
