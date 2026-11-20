import { createHash, randomUUID } from 'node:crypto'
import type postgres from 'postgres'
import type { StoredEntity } from './workspace-protocol'

export const operationCollections = [
  'materialRequests',
  'materialReceipts',
  'materialIssues',
  'm15Reconciliations',
  'cases',
  'receiptDocuments',
  'customerReturns',
  'stockTransfers',
] as const

/** Administrative, one-time transition. Never exposed by an HTTP/RPC route.
 * The caller must stop the app and back up both PostgreSQL and original files. */
export async function resetTestOperations(
  sql: postgres.Sql,
  expectedRevision: string,
) {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(43187, 1)`
    const [meta] =
      await tx`select revision from workspace_meta where id = 1 for update`
    if (!meta || `pg:${meta.revision}` !== expectedRevision)
      throw new Error(
        'База изменилась после резервного копирования. Очистка отменена.',
      )
    const [already] =
      await tx`select key from workspace_records where key = 'settings/accountingGeneration'`
    if (already)
      throw new Error('Переход уже выполнен. Повторная очистка запрещена.')
    const removed =
      await tx`select collection, id, position from workspace_records where collection = any(${tx.array([...operationCollections])}::text[])`
    const numbering =
      await tx`select id, value, position from workspace_records where collection = 'numbering'`
    const version = Number(meta.revision) + 1
    const generation = randomUUID()
    const records: StoredEntity[] = removed.map((row) => ({
      collection: row.collection,
      id: row.id,
      position: Number(row.position),
      version,
      value: null,
    }))
    await tx`delete from workspace_records where collection = any(${tx.array([...operationCollections])}::text[])`
    for (const row of numbering) {
      const value = { ...row.value, lastValue: 0 }
      await tx`update workspace_records set value = ${tx.json(value)}, version = ${version} where collection = 'numbering' and id = ${row.id}`
      records.push({
        collection: 'numbering',
        id: row.id,
        position: Number(row.position),
        version,
        value,
      })
    }
    await tx`insert into workspace_records (key, collection, id, value, version, position, links, unique_keys) values ('settings/accountingGeneration', 'settings', 'accountingGeneration', ${tx.json(generation)}, ${version}, 0, '{}', '{}')`
    records.push({
      collection: 'settings',
      id: 'accountingGeneration',
      value: generation,
      version,
      position: 0,
    })
    // Document-number reservations are obsolete. Project concurrency groups remain.
    await tx`delete from workspace_groups where key not like 'project:%'`
    await tx`update workspace_meta set revision = ${version} where id = 1`
    await tx`insert into workspace_commits (revision, mutation_id, actor, changes, groups, request_hash) values (${version}, ${randomUUID()}, 'local:Разовый чистый старт АПП/М-15', ${tx.json(records)}, '{}', ${createHash('sha256').update(JSON.stringify(records)).digest('hex')})`
    return {
      revision: `pg:${version}`,
      accountingGeneration: generation,
      removed: removed.length,
    }
  })
}
