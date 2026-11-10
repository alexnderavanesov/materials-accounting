import { createHash } from 'node:crypto'
import { z } from 'zod'
import { workspaceSql } from '../../db/connection.server'
import { documentKinds, numberingRuleSchema } from './document-numbering'
import {
  qualityDefaultsSchema,
  qualityWorkflowSchema,
  validateQualityWorkspace,
} from './quality-workflow'
import { workspaceSnapshotSchema } from './workspace-snapshot'
import {
  entitiesWorkspace,
  entityGroups,
  entityKey,
  recordKey,
  workspaceEntities,
  workspacePatchSchema,
} from './workspace-protocol'
import type postgres from 'postgres'
import type {
  Entity,
  StoredEntity,
  WorkspacePatch,
  PatchResult,
  WorkspaceChanges,
  Json,
  Collection,
} from './workspace-protocol'
import type { LoadedWorkspace, WorkspaceSnapshot } from './workspace-snapshot'

type DbRecord = StoredEntity & {
  key: string
  links: string[]
  unique_keys: string[]
}
type Transaction = postgres.TransactionSql
const revisionString = (value: number) => `pg:${value}`
export function parseWorkspaceRevision(value: string): number {
  if (!/^pg:\d+$/.test(value))
    throw new Error('Обновите страницу: изменён формат хранилища.')
  const revision = Number(value.slice(3))
  if (!Number.isSafeInteger(revision))
    throw new Error('Некорректная версия данных.')
  return revision
}
const jsonRecord = z.record(z.string(), z.json())
function validateEntity(entity: Pick<Entity, 'collection' | 'id' | 'value'>) {
  if (entity.value === null) return
  const { collection, id, value } = entity
  if (collection === 'settings') {
    if (id === 'qualityDefaults') qualityDefaultsSchema.parse(value)
    else if (
      [
        'configuredAlloys',
        'configuredCiphers',
        'configuredDocuments',
        'configuredUnits',
      ].includes(id)
    )
      z.array(z.string()).parse(value)
    else throw new Error('Неизвестная настройка.')
  } else if (collection === 'numbering') {
    z.enum(documentKinds).parse(id)
    numberingRuleSchema.parse(value)
  } else {
    const parsed = jsonRecord.parse(value)
    if (parsed.id !== id)
      throw new Error('ID записи не совпадает с изменением.')
    if (collection === 'cases')
      qualityWorkflowSchema.shape.cases.element.parse(value)
    if (collection === 'receiptDocuments')
      qualityWorkflowSchema.shape.receiptDocuments.unwrap().element.parse(value)
    if (collection === 'customerReturns')
      qualityWorkflowSchema.shape.customerReturns.unwrap().element.parse(value)
  }
}

export function entityLinks(
  entity: Pick<Entity, 'collection' | 'value'>,
): string[] {
  const links = new Set<string>()
  const add = (collection: Collection, id: unknown) => {
    if (typeof id === 'string' && id) links.add(entityKey(collection, id))
  }
  const value = entity.value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  if (
    ['materialRequests', 'materialReceipts', 'materialIssues'].includes(
      entity.collection,
    )
  )
    add('lines', value.projectLineId)
  if (entity.collection === 'materialReceipts') {
    add('materialRequests', value.requestId)
    add('receiptDocuments', value.appDocumentId)
    add('receiptDocuments', value.m15DocumentId)
  }
  if (
    entity.collection === 'materialIssues' ||
    entity.collection === 'customerReturns'
  )
    add('materialReceipts', value.receiptId)
  if (entity.collection === 'customerReturns') add('cases', value.caseId)
  if (entity.collection === 'cases') {
    const entry = value as unknown as NonNullable<
      WorkspaceSnapshot['qualityWorkflow']
    >['cases'][number]
    add('receiptDocuments', entry.basis.id)
    for (const revision of entry.revisions)
      for (const row of revision.zni.rows) {
        add('materialReceipts', row.receiptId)
        add('lines', row.projectLineId)
      }
  }
  return [...links]
}
function uniqueKeys(entity: Pick<Entity, 'collection' | 'value'>): string[] {
  if (entity.value === null) return []
  if (entity.collection === 'cases') {
    const entry = entity.value as unknown as NonNullable<
      WorkspaceSnapshot['qualityWorkflow']
    >['cases'][number]
    return [
      ...new Set(
        entry.revisions.flatMap((item) => [
          `zni:${item.zni.number.trim()}`,
          ...(item.avk?.number.trim() ? [`avk:${item.avk.number.trim()}`] : []),
        ]),
      ),
    ]
  }
  if (entity.collection === 'receiptDocuments') {
    const doc = entity.value as Record<string, Json>
    return [
      `receipt:${JSON.stringify([doc.kind, String(doc.number).trim().toLocaleLowerCase('ru'), doc.date])}`,
    ]
  }
  return []
}
const publicRecord = (row: DbRecord): StoredEntity => ({
  collection: row.collection,
  id: row.id,
  value: row.value,
  version: Number(row.version),
  position: row.position,
})

/** Expand operational dependencies, without pulling every material sharing a reference document.
 * A changed material/document is also a reverse root so deletions and unit changes stay protected.
 */
async function validationScope(
  sql: Transaction,
  changes: WorkspacePatch['changes'],
  old: DbRecord[],
) {
  const found = new Map(old.map((item) => [item.key, item]))
  const roots = new Set(changes.map(recordKey))
  let pending = [
    ...roots,
    ...changes.flatMap(entityLinks),
    ...old.flatMap((row) => row.links),
    'settings/qualityDefaults',
  ]
  const visited = new Set<string>()
  const uniqueness = [...new Set(changes.flatMap(uniqueKeys))]
  if (uniqueness.length) {
    const collisions = await sql<
      DbRecord[]
    >`select * from workspace_records where unique_keys && ${sql.array(uniqueness)}::text[]`
    for (const row of collisions) {
      found.set(row.key, row)
      pending.push(row.key, ...row.links)
    }
  }
  while (pending.length) {
    const keys = [...new Set(pending)].filter((key) => !visited.has(key))
    if (!keys.length) break
    keys.forEach((key) => visited.add(key))
    const reverse = keys.filter(
      (key) =>
        roots.has(key) ||
        /^(materialRequests|materialReceipts|cases)\//.test(key),
    )
    const rows = await sql<
      DbRecord[]
    >`select * from workspace_records where key = any(${sql.array(keys)}::text[]) or links && ${sql.array(reverse)}::text[]`
    pending = []
    for (const row of rows) {
      found.set(row.key, row)
      pending.push(...row.links)
      if (/^(materialRequests|materialReceipts|cases)\//.test(row.key))
        pending.push(row.key)
    }
  }
  return found
}

function validateReferences(
  changes: WorkspacePatch['changes'],
  next: Map<string, StoredEntity>,
  old: Map<string, DbRecord>,
) {
  for (const entity of next.values())
    for (const link of entityLinks(entity)) {
      if (old.has(link) && !next.has(link))
        throw new Error(
          'Нельзя удалить запись, пока на неё ссылаются сохранённые операции.',
        )
    }
  for (const change of changes) {
    if (change.value === null) continue
    if (change.collection === 'settings' || change.collection === 'numbering')
      continue
    const before = old.get(recordKey(change))
    const previousLinks = before ? entityLinks(before) : []
    for (const link of entityLinks(change)) {
      // Legacy deleted materials remain readable; a new/changed link must resolve.
      if (!next.has(link) && (!previousLinks.includes(link) || old.has(link)))
        throw new Error(
          'Связанная позиция или документ удалены другим пользователем. Обновите выбор.',
        )
    }
    const value = change.value as Record<string, Json>
    if (change.collection === 'materialReceipts') {
      const request = next.get(
        entityKey('materialRequests', String(value.requestId)),
      )?.value as Record<string, Json> | undefined
      if (request && request.projectLineId !== value.projectLineId)
        throw new Error('Материал получения не соответствует позиции заявки.')
    }
    if (change.collection === 'materialIssues') {
      const receipt = next.get(
        entityKey('materialReceipts', String(value.receiptId)),
      )?.value as Record<string, Json> | undefined
      if (receipt && receipt.projectLineId !== value.projectLineId)
        throw new Error('Материал выдачи не соответствует поступлению.')
    }
  }
}

export function createPostgresWorkspaceStore(sql: postgres.Sql) {
  async function load(): Promise<LoadedWorkspace> {
    return sql.begin(
      'isolation level repeatable read read only',
      async (tx) => {
        const [meta] =
          await tx`select revision from workspace_meta where id = 1`
        if (!meta)
          throw new Error(
            'База ещё не подготовлена. Выполните pnpm db:workspace:import.',
          )
        const rows = await tx<
          DbRecord[]
        >`select * from workspace_records order by position, id`
        const groupRows = await tx<
          { key: string; version: number }[]
        >`select * from workspace_groups`
        return {
          workspace: entitiesWorkspace(rows),
          revision: revisionString(Number(meta.revision)),
          storage: 'postgres' as const,
          versions: Object.fromEntries(
            rows.map((row) => [
              row.key,
              { version: Number(row.version), position: row.position },
            ]),
          ),
          groups: Object.fromEntries(
            groupRows.map((row) => [row.key, Number(row.version)]),
          ),
        }
      },
    )
  }
  async function applyPatch(
    input: WorkspacePatch,
    actor: string,
  ): Promise<PatchResult> {
    const patch = workspacePatchSchema.parse(input)
    const keys = patch.changes.map(recordKey)
    if (new Set(keys).size !== keys.length)
      return {
        status: 'rejected',
        message: 'Изменение содержит повторяющиеся ID.',
      }
    try {
      patch.changes.forEach(validateEntity)
      const requestHash = createHash('sha256')
        .update(JSON.stringify(patch))
        .digest('hex')
      return await sql.begin(async (tx): Promise<PatchResult> => {
        // Short database-wide commit queue protects cross-record invariants in every server process.
        // It does not compare workspace revisions: unrelated stale clients can both save.
        await tx`select pg_advisory_xact_lock(43187, 1)`
        const [done] =
          await tx`select * from workspace_commits where mutation_id = ${patch.mutationId}`
        if (done) {
          if (done.request_hash !== requestHash || done.actor !== actor)
            return {
              status: 'rejected',
              message: 'ID операции уже использован для другого запроса.',
            }
          return {
            status: 'saved',
            revision: revisionString(Number(done.revision)),
            records: done.changes as StoredEntity[],
            groups: done.groups as Record<string, number>,
          }
        }
        const old = await tx<
          DbRecord[]
        >`select * from workspace_records where key = any(${tx.array(keys)}::text[])`
        const oldByKey = new Map(old.map((row) => [row.key, row]))
        const conflicts = patch.changes.filter(
          (change) =>
            (Number(oldByKey.get(recordKey(change))?.version) || null) !==
            change.expectedVersion,
        )
        const groupKeys = [
          ...new Set([...old, ...patch.changes].flatMap(entityGroups)),
        ]
        const groupRows = groupKeys.length
          ? await tx<
              { key: string; version: number }[]
            >`select * from workspace_groups where key = any(${tx.array(groupKeys)}::text[])`
          : []
        const groupVersions = new Map(
          groupRows.map((row) => [row.key, Number(row.version)]),
        )
        if (patch.creatingGroups?.some((key) => groupVersions.has(key)))
          return {
            status: 'rejected',
            message:
              'Номер нового документа уже занят другим пользователем. Измените номер документа и сохраните снова.',
          }
        const groupConflict = groupKeys.some(
          (key) => (groupVersions.get(key) ?? null) !== patch.groups[key],
        )
        if (conflicts.length || groupConflict)
          return {
            status: 'conflict',
            message: groupConflict
              ? 'Документ изменён другим пользователем. Сравните изменения перед сохранением.'
              : 'Эти записи уже изменены другим пользователем.',
            conflicts: (conflicts.length ? conflicts : patch.changes).map(
              (change) => ({
                key: recordKey(change),
                current: oldByKey.has(recordKey(change))
                  ? publicRecord(oldByKey.get(recordKey(change))!)
                  : null,
              }),
            ),
          }
        const scope = await validationScope(tx, patch.changes, old)
        const next = new Map<string, StoredEntity>(scope)
        for (const change of patch.changes) {
          if (change.value === null) next.delete(recordKey(change))
          else next.set(recordKey(change), { ...change, version: 0 })
        }
        validateReferences(patch.changes, next, scope)
        validateQualityWorkspace(
          entitiesWorkspace([...next.values()]),
          entitiesWorkspace([...scope.values()]),
        )
        const [meta] =
          await tx`update workspace_meta set revision = revision + 1 where id = 1 returning revision`
        if (!meta) throw new Error('База ещё не подготовлена.')
        const version = Number(meta.revision)
        const records: StoredEntity[] = patch.changes.map((change) => ({
          collection: change.collection,
          id: change.id,
          value: change.value,
          position: change.position,
          version,
        }))
        for (let offset = 0; offset < records.length; offset += 1000) {
          const batch = records.slice(offset, offset + 1000)
          const removed = batch
            .filter((item) => item.value === null)
            .map(recordKey)
          if (removed.length)
            await tx`delete from workspace_records where key = any(${tx.array(removed)}::text[])`
          const changed = batch
            .filter((item) => item.value !== null)
            .map((item) => ({
              key: recordKey(item),
              collection: item.collection,
              id: item.id,
              value: tx.json(item.value),
              version,
              position: item.position,
              links: entityLinks(item),
              unique_keys: uniqueKeys(item),
            }))
          if (changed.length)
            await tx`insert into workspace_records ${tx(changed)} on conflict (key) do update set value = excluded.value, version = excluded.version, position = excluded.position, links = excluded.links, unique_keys = excluded.unique_keys`
        }
        const groups = Object.fromEntries(
          groupKeys.map((key) => [key, version]),
        )
        for (let offset = 0; offset < groupKeys.length; offset += 1000)
          await tx`insert into workspace_groups ${tx(groupKeys.slice(offset, offset + 1000).map((key) => ({ key, version })))} on conflict (key) do update set version = excluded.version`
        await tx`insert into workspace_commits (revision, mutation_id, actor, changes, groups, request_hash) values (${version}, ${patch.mutationId}, ${actor}, ${tx.json(records)}, ${tx.json(groups)}, ${requestHash})`
        return {
          status: 'saved',
          revision: revisionString(version),
          records,
          groups,
        }
      })
    } catch (error) {
      if (error instanceof z.ZodError)
        return {
          status: 'rejected',
          message: 'Некорректные данные документа. Проверьте поля.',
        }
      // Infrastructure errors remain retryable; business failures require correcting the draft.
      if (error && typeof error === 'object' && 'code' in error) throw error
      return {
        status: 'rejected',
        message:
          error instanceof Error
            ? error.message
            : 'Не удалось проверить изменение.',
      }
    }
  }
  async function changes(since: string): Promise<WorkspaceChanges> {
    const revision = parseWorkspaceRevision(since)
    const rows =
      await sql`select revision, changes, groups from workspace_commits where revision > ${revision} order by revision limit 101`
    const batch = rows.slice(0, 100)
    const records = new Map<string, StoredEntity>()
    const groups: Record<string, number> = {}
    for (const row of batch) {
      for (const entity of row.changes as StoredEntity[])
        records.set(recordKey(entity), entity)
      Object.assign(groups, row.groups)
    }
    return {
      revision: revisionString(Number(batch.at(-1)?.revision ?? revision)),
      records: [...records.values()],
      groups,
      hasMore: rows.length > 100,
    }
  }
  async function importWorkspace(value: WorkspaceSnapshot) {
    const workspace = workspaceSnapshotSchema.parse(value)
    validateQualityWorkspace(workspace, workspace)
    const entities = [...workspaceEntities(workspace).values()]
    entities.forEach(validateEntity)
    return sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(43187, 1)`
      const rows = await tx`select id from workspace_meta where id = 1`
      if (rows.length)
        throw new Error(
          'PostgreSQL уже содержит рабочую базу. Повторный импорт не выполняется.',
        )
      for (let offset = 0; offset < entities.length; offset += 1000) {
        const batch = entities.slice(offset, offset + 1000).map((item) => ({
          key: recordKey(item),
          collection: item.collection,
          id: item.id,
          value: tx.json(item.value),
          version: 1,
          position: item.position,
          links: entityLinks(item),
          unique_keys: uniqueKeys(item),
        }))
        await tx`insert into workspace_records ${tx(batch)}`
      }
      const groupKeys = [...new Set(entities.flatMap(entityGroups))]
      for (let offset = 0; offset < groupKeys.length; offset += 1000)
        await tx`insert into workspace_groups ${tx(groupKeys.slice(offset, offset + 1000).map((key) => ({ key, version: 1 })))}`
      await tx`insert into workspace_meta (id, revision) values (1, 1)`
      return { records: entities.length }
    })
  }
  return { load, patch: applyPatch, changes, importWorkspace }
}

export const postgresWorkspaceStore = () =>
  createPostgresWorkspaceStore(workspaceSql())
