import { orderProjectChanges } from './project-change-types'
import { z } from 'zod'
import { documentKinds } from './document-numbering'
import { emptyQualityWorkflow } from './quality-workflow'
import type { WorkspaceSnapshot } from './workspace-snapshot'

export const collections = [
  'projectChanges',
  'stockTransfers',
  'lines',
  'materialTypeSettings',
  'materialRequests',
  'materialReceipts',
  'materialIssues',
  'm15Reconciliations',
  'cases',
  'receiptDocuments',
  'customerReturns',
  'settings',
  'numbering',
] as const
export type Collection = (typeof collections)[number]
export type Json = z.infer<ReturnType<typeof z.json>>
export type Entity = {
  collection: Collection
  id: string
  value: Json
  position: number
}
export type StoredEntity = Omit<Entity, 'value'> & {
  value: Json | null
  version: number
}
export type EntityVersions = Record<
  string,
  { version: number; position: number }
>
export type WorkspaceSync = {
  accountingGeneration?: string
  storage: 'postgres'
  versions: EntityVersions
  groups: Record<string, number>
}
export const entityKey = (collection: Collection, id: string) =>
  `${collection}/${id}`
export const recordKey = (entity: Pick<Entity, 'collection' | 'id'>) =>
  entityKey(entity.collection, entity.id)

const entityChangeSchema = z
  .object({
    collection: z.enum(collections),
    id: z.string().min(1).max(500),
    value: z.json().nullable(),
    expectedVersion: z.number().int().positive().nullable(),
    position: z.number().finite(),
  })
  .strict()
export const workspacePatchSchema = z
  .object({
    accountingGeneration: z.uuid().optional(),
    mutationId: z.uuid(),
    changes: z.array(entityChangeSchema).min(1).max(100000),
    groups: z.record(z.string(), z.number().int().positive().nullable()),
    creatingGroups: z.array(z.string().max(600)).max(100000).optional(),
  })
  .strict()
export type WorkspacePatch = z.infer<typeof workspacePatchSchema>
export type WorkspaceConflict = { key: string; current: StoredEntity | null }
export type PatchResult =
  | {
      status: 'saved'
      revision: string
      records: StoredEntity[]
      groups: Record<string, number>
    }
  | { status: 'conflict'; conflicts: WorkspaceConflict[]; message: string }
  | { status: 'rejected'; message: string }
export type WorkspaceChanges = {
  accountingGeneration?: string
  revision: string
  records: StoredEntity[]
  groups: Record<string, number>
  hasMore: boolean
}

export function emptyWorkspace(): WorkspaceSnapshot {
  return {
    configuredAlloys: [],
    configuredCiphers: [],
    configuredDocuments: [],
    configuredUnits: [],
    lines: [],
    materialTypeSettings: [],
    materialRequests: [],
    materialReceipts: [],
    materialIssues: [],
  }
}

/** Values retain their references: editing one cell never clones the whole workspace. */
export function workspaceEntities(
  workspace: WorkspaceSnapshot,
  only?: ReadonlySet<Collection>,
): Map<string, Entity> {
  const result = new Map<string, Entity>()
  const put = (
    collection: Collection,
    id: string,
    value: Json,
    position = 0,
  ) => {
    const key = entityKey(collection, id)
    if (result.has(key)) throw new Error(`Повторяющийся ID: ${key}`)
    result.set(key, { collection, id, value, position })
  }
  for (const collection of [
    'projectChanges',
    'stockTransfers',
    'lines',
    'materialTypeSettings',
    'materialRequests',
    'materialReceipts',
    'materialIssues',
    'm15Reconciliations',
  ] as const) {
    if (only && !only.has(collection)) continue
    workspace[collection]?.forEach((value, index) => {
      if (typeof value.id !== 'string' || !value.id)
        throw new Error(`Не указан ID: ${collection}`)
      put(collection, value.id, value, index)
    })
  }
  for (const key of [
    'configuredAlloys',
    'configuredCiphers',
    'configuredDocuments',
    'configuredUnits',
  ] as const)
    if (!only || only.has('settings')) put('settings', key, workspace[key])
  if (workspace.qualityWorkflow) {
    if (!only || only.has('settings'))
      put('settings', 'qualityDefaults', workspace.qualityWorkflow.defaults)
    for (const collection of [
      'cases',
      'receiptDocuments',
      'customerReturns',
    ] as const)
      if (!only || only.has(collection))
        workspace.qualityWorkflow[collection]?.forEach((value, index) =>
          put(collection, value.id, value, index),
        )
  }
  if (workspace.documentNumbering && (!only || only.has('numbering')))
    for (const kind of documentKinds)
      put('numbering', kind, workspace.documentNumbering[kind])
  return result
}

/** Rebuild only collections touched by remote changes, preserving references elsewhere. */
export function applyWorkspaceEntities(
  workspace: WorkspaceSnapshot,
  records: StoredEntity[],
): WorkspaceSnapshot {
  if (!records.length) return workspace
  const next = { ...workspace }
  for (const collection of collections) {
    const updates = records.filter((item) => item.collection === collection)
    if (!updates.length) continue
    if (collection === 'settings') {
      for (const item of updates) {
        if (item.id === 'qualityDefaults') {
          next.qualityWorkflow =
            item.value === null
              ? undefined
              : {
                  ...(next.qualityWorkflow ?? emptyQualityWorkflow()),
                  defaults: item.value as NonNullable<
                    WorkspaceSnapshot['qualityWorkflow']
                  >['defaults'],
                }
        } else if (
          [
            'configuredAlloys',
            'configuredCiphers',
            'configuredDocuments',
            'configuredUnits',
          ].includes(item.id)
        ) {
          const key = item.id as 'configuredAlloys'
          next[key] = (item.value ?? []) as string[]
        }
      }
    } else if (collection === 'numbering') {
      const numbering = { ...next.documentNumbering }
      for (const item of updates) {
        const kind = item.id as (typeof documentKinds)[number]
        if (item.value === null) delete numbering[kind]
        else
          numbering[kind] = item.value as NonNullable<
            WorkspaceSnapshot['documentNumbering']
          >[typeof kind]
      }
      next.documentNumbering = Object.keys(numbering).length
        ? (numbering as WorkspaceSnapshot['documentNumbering'])
        : undefined
    } else {
      const quality =
        collection === 'cases' ||
        collection === 'receiptDocuments' ||
        collection === 'customerReturns'
      const source = quality
        ? (next.qualityWorkflow?.[collection] ?? [])
        : (next[collection] ?? [])
      const byId = new Map(updates.map((item) => [item.id, item]))
      const rows: Json[] = []
      for (const row of source) {
        const id = String(row.id)
        const update = byId.get(id)
        if (!update) rows.push(row)
        else if (update.value !== null) rows.push(update.value)
        byId.delete(id)
      }
      // New records carry an order key; existing rows retain their stable ordering.
      const added = [...byId.values()]
        .filter((item) => item.value !== null)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      const prepend = added
        .filter((item) => item.position < 0)
        .map((item) => item.value!)
      rows.unshift(...prepend)
      rows.push(
        ...added
          .filter((item) => item.position >= 0)
          .map((item) => item.value!),
      )
      if (quality)
        next.qualityWorkflow = {
          ...(next.qualityWorkflow ?? emptyQualityWorkflow()),
          [collection]: rows,
        }
      else Object.assign(next, { [collection]: rows })
    }
  }
  if (records.some((row) => row.collection === 'projectChanges'))
    next.projectChanges = orderProjectChanges(next.projectChanges ?? [])
  if (records.some((row) => row.collection === 'stockTransfers'))
    next.stockTransfers = [...(next.stockTransfers ?? [])].sort(
      (a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id),
    )
  return next
}

export function entitiesWorkspace(
  records: Array<Entity | StoredEntity>,
): WorkspaceSnapshot {
  const sorted = [...records].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  )
  return applyWorkspaceEntities(
    emptyWorkspace(),
    sorted.map((item) => ({
      ...item,
      version: 'version' in item ? item.version : 1,
    })),
  )
}

export const jsonEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) return true
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  )
    return false
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEqual(value, right[index]))
    )
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>
  const keys = Object.keys(a).filter((key) => a[key] !== undefined)
  return (
    keys.length ===
      Object.keys(b).filter((key) => b[key] !== undefined).length &&
    keys.every((key) => jsonEqual(a[key], b[key]))
  )
}

export function entityGroups(
  entity: Pick<Entity, 'collection' | 'value'>,
): string[] {
  if (
    !entity.value ||
    typeof entity.value !== 'object' ||
    Array.isArray(entity.value)
  )
    return []
  if (entity.collection === 'projectChanges' || entity.collection === 'lines') {
    const { project, cipher } = entity.value
    return typeof project === 'string' && typeof cipher === 'string'
      ? [`project:${JSON.stringify([project, cipher])}`]
      : []
  }
  const field =
    entity.collection === 'materialRequests'
      ? 'number'
      : entity.collection === 'materialIssues'
        ? 'document'
        : null
  const number = field && entity.value[field]
  const groups =
    typeof number === 'string' && number.trim()
      ? [`${entity.collection}:${number.trim()}`]
      : []
  const receiptIds: string[] = []
  if (
    entity.collection === 'materialReceipts' &&
    typeof entity.value.id === 'string'
  )
    receiptIds.push(entity.value.id)
  if (
    ['materialIssues', 'customerReturns', 'stockTransfers'].includes(
      entity.collection,
    ) &&
    typeof entity.value.receiptId === 'string'
  )
    receiptIds.push(entity.value.receiptId)
  if (entity.collection === 'm15Reconciliations') {
    const record = entity.value as unknown as {
      id: string
      mode?: string
      allocations: Array<{ receiptId: string }>
    }
    groups.push(`m15:${record.id}`)
    if (record.mode === 'linked')
      receiptIds.push(...record.allocations.map((link) => link.receiptId))
  }
  if (entity.collection === 'cases') {
    const item = entity.value as unknown as {
      revisions?: Array<{ zni: { rows: Array<{ receiptId: string }> } }>
    }
    for (const revision of item.revisions ?? [])
      for (const row of revision.zni.rows) receiptIds.push(row.receiptId)
  }
  return [...groups, ...new Set(receiptIds.map((id) => `stock:${id}`))]
}
