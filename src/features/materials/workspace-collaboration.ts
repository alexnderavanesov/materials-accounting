import { z } from 'zod'
import {
  applyWorkspaceEntities,
  collections,
  entityGroups,
  jsonEqual,
  recordKey,
  workspaceEntities,
  workspacePatchSchema,
} from './workspace-protocol'
import type {
  Collection,
  Entity,
  EntityVersions,
  Json,
  PatchResult,
  StoredEntity,
  WorkspaceChanges,
  WorkspacePatch,
} from './workspace-protocol'
import type { WorkspaceSnapshot } from './workspace-snapshot'
import type { WorkspaceSaveStatus } from './workspace-saver'

export type EditConflict = {
  key: string
  before: Json | null
  mine: Json | null
  theirs: Json | null
}
export type EditJournal = {
  accountingGeneration?: string
  changes: WorkspacePatch['changes']
  groups: WorkspacePatch['groups']
  before: Record<string, Json | null>
  request: WorkspacePatch | null
  creatingGroups?: string[]
}
const editJournalSchema = z
  .object({
    accountingGeneration: z.string().optional(),
    changes: z.array(workspacePatchSchema.shape.changes.element).max(100000),
    groups: workspacePatchSchema.shape.groups,
    before: z.record(z.string(), z.json()),
    request: workspacePatchSchema.nullable(),
    creatingGroups: z.array(z.string()).optional(),
  })
  .strict()
type Options = {
  accountingGeneration?: string
  initial: WorkspaceSnapshot
  revision: string
  versions: EntityVersions
  groups: Record<string, number>
  save: (patch: WorkspacePatch) => Promise<PatchResult>
  changes: (revision: string) => Promise<WorkspaceChanges>
  onWorkspace: (workspace: WorkspaceSnapshot) => void
  onStatus: (
    status: WorkspaceSaveStatus,
    message: string,
    conflicts: EditConflict[],
  ) => void
  writeJournal?: (journal: EditJournal | null) => void
  onCacheError?: () => void
  canApplyRemote?: () => boolean
}

/** Incremental outbox. A request keeps its UUID across retries, even after a lost response. */
export function createCollaborativeSaver(options: Options) {
  let latest = options.initial
  const local = workspaceEntities(latest)
  const base = workspaceEntities(latest)
  const dirtyKeys = new Set<string>()
  const localKeys = new Map<Collection, Set<string>>(
    collections.map((collection) => [collection, new Set<string>()]),
  )
  for (const [key, entity] of local) localKeys.get(entity.collection)!.add(key)
  const jsonValues = new WeakMap<object, Json>()
  const versions = { ...options.versions }
  const groups = { ...options.groups }
  const creatingGroups = new Set<string>()
  let cursor = options.revision
  let running: Promise<void> | null = null
  let syncing: Promise<void> | null = null
  let inFlight: WorkspacePatch | null = null
  let blocked: 'network' | 'conflict' | 'rejected' | null = null
  const conflicts = new Map<string, EditConflict>()
  let message = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  const extrema = new Map<string, { min: number; max: number }>()
  for (const [key, meta] of Object.entries(versions)) {
    const collection = key.slice(0, key.indexOf('/'))
    const range = extrema.get(collection) ?? { min: 0, max: 0 }
    range.min = Math.min(range.min, meta.position)
    range.max = Math.max(range.max, meta.position)
    extrema.set(collection, range)
  }
  const newPositions = new Map<string, number>()
  const entityValue = (map: Map<string, Entity>, key: string) =>
    map.get(key)?.value ?? null
  function markDirty(key: string) {
    if (jsonEqual(entityValue(base, key), entityValue(local, key)))
      dirtyKeys.delete(key)
    else dirtyKeys.add(key)
  }
  function updateLocal(workspace: WorkspaceSnapshot) {
    const touched = new Set(
      collections.filter((collection) => {
        if (collection === 'settings')
          return (
            workspace.configuredAlloys !== latest.configuredAlloys ||
            workspace.configuredCiphers !== latest.configuredCiphers ||
            workspace.configuredDocuments !== latest.configuredDocuments ||
            workspace.configuredUnits !== latest.configuredUnits ||
            workspace.qualityWorkflow?.defaults !==
              latest.qualityWorkflow?.defaults
          )
        if (collection === 'numbering')
          return workspace.documentNumbering !== latest.documentNumbering
        if (
          collection === 'cases' ||
          collection === 'receiptDocuments' ||
          collection === 'customerReturns'
        )
          return (
            workspace.qualityWorkflow?.[collection] !==
            latest.qualityWorkflow?.[collection]
          )
        return workspace[collection] !== latest[collection]
      }),
    )
    const changed = workspaceEntities(workspace, touched)
    for (const collection of touched) {
      for (const key of localKeys.get(collection)!)
        if (!changed.has(key)) {
          local.delete(key)
          markDirty(key)
        }
      localKeys.set(collection, new Set())
    }
    for (const [key, entity] of changed) {
      local.set(key, entity)
      localKeys.get(entity.collection)!.add(key)
      markDirty(key)
    }
    latest = workspace
  }
  function serializable(value: Json): Json {
    if (value === null || typeof value !== 'object') return value
    const cached = jsonValues.get(value)
    if (cached !== undefined) return cached
    const parsed = JSON.parse(JSON.stringify(value)) as Json
    jsonValues.set(value, parsed)
    return parsed
  }
  function dirtyChanges(): WorkspacePatch['changes'] {
    const needsOrder = new Set<Collection>()
    for (const key of dirtyKeys) {
      const entity = local.get(key)
      if (entity && !versions[key] && !newPositions.has(key))
        needsOrder.add(entity.collection)
    }
    for (const collection of needsOrder) {
      const keys = [...localKeys.get(collection)!]
      const orderOf = (key: string) =>
        versions[key]?.position ?? newPositions.get(key)
      let left: number | undefined
      for (let index = 0; index < keys.length; ) {
        const known = orderOf(keys[index]!)
        if (known !== undefined) {
          left = known
          index++
          continue
        }
        let end = index + 1
        while (end < keys.length && orderOf(keys[end]!) === undefined) end++
        const right = end < keys.length ? orderOf(keys[end]!) : undefined
        const count = end - index
        const range = extrema.get(collection) ?? { min: 0, max: 0 }
        const step =
          left !== undefined && right !== undefined && left < right
            ? (right - left) / (count + 1)
            : 1
        const start =
          left === undefined
            ? right === undefined
              ? 0
              : right - count
            : right !== undefined && right <= left
              ? range.max + 1
              : left + step
        for (let offset = 0; offset < count; offset++) {
          const position = start + offset * step
          newPositions.set(keys[index + offset]!, position)
          range.min = Math.min(range.min, position)
          range.max = Math.max(range.max, position)
          left = position
        }
        extrema.set(collection, range)
        index = end
      }
    }
    const changed: WorkspacePatch['changes'] = []
    for (const key of dirtyKeys) {
      const before = base.get(key),
        after = local.get(key)
      const entity = after ?? before!
      const position =
        versions[key]?.position ?? newPositions.get(key) ?? entity.position
      changed.push({
        collection: entity.collection,
        id: entity.id,
        value: after ? serializable(after.value) : null,
        expectedVersion: base.has(key)
          ? (versions[key]?.version ?? null)
          : null,
        position,
      })
    }
    return changed
  }
  function groupExpectations(changes: WorkspacePatch['changes']) {
    return Object.fromEntries(
      [
        ...new Set(
          changes.flatMap((change) => [
            ...entityGroups(change),
            ...(base.has(recordKey(change))
              ? entityGroups(base.get(recordKey(change))!)
              : []),
          ]),
        ),
      ].map((key) => {
        if (!(key in groups)) creatingGroups.add(key)
        return [key, groups[key] ?? null]
      }),
    )
  }
  function journal(changes = dirtyChanges()) {
    try {
      options.writeJournal?.(
        changes.length || inFlight
          ? {
              accountingGeneration: options.accountingGeneration,
              changes,
              groups: groupExpectations(changes),
              request: inFlight,
              before: Object.fromEntries(
                changes.map((change) => [
                  recordKey(change),
                  entityValue(base, recordKey(change)),
                ]),
              ),
              creatingGroups: [...creatingGroups],
            }
          : null,
      )
    } catch {
      options.onCacheError?.()
    }
  }
  function status(next: WorkspaceSaveStatus, detail = message) {
    message = detail
    options.onStatus(
      next,
      detail,
      [...conflicts.values()].map((item) => ({
        ...item,
        mine: entityValue(local, item.key),
      })),
    )
  }
  // A project batch is one accounting operation. Resolving one conflicted row
  // must not leave its history, request cancellations or another cipher queued.
  function expandProjectConflicts(changes: WorkspacePatch['changes']) {
    if (!conflicts.size) return
    const lineIds = new Set<string>()
    const markers = changes.filter(
      (change) =>
        change.collection === 'projectChanges' ||
        change.collection === 'stockTransfers',
    )
    if (!markers.length) return
    for (const change of markers) {
      const value = change.value
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      if (change.collection === 'projectChanges' && Array.isArray(value.items))
        for (const item of value.items) {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const after = item.after
            if (
              after &&
              typeof after === 'object' &&
              !Array.isArray(after) &&
              typeof after.id === 'string'
            )
              lineIds.add(after.id)
          }
        }
      for (const field of ['fromProjectLineId', 'toProjectLineId'])
        if (typeof value[field] === 'string') lineIds.add(value[field])
    }
    for (const change of changes) {
      const value = change.value
      const requestLine =
        value && typeof value === 'object' && !Array.isArray(value)
          ? value.projectLineId
          : null
      if (
        !markers.includes(change) &&
        !(change.collection === 'lines' && lineIds.has(change.id)) &&
        !(
          change.collection === 'materialRequests' &&
          typeof requestLine === 'string' &&
          lineIds.has(requestLine)
        )
      )
        continue
      const key = recordKey(change)
      if (!conflicts.has(key))
        conflicts.set(key, {
          key,
          before: entityValue(base, key),
          mine: entityValue(local, key),
          theirs: entityValue(base, key),
        })
    }
  }
  function setBase(record: StoredEntity, preferredValue?: Json) {
    const key = recordKey(record)
    if ((versions[key]?.version ?? 0) > record.version) return
    if (record.value === null) {
      base.delete(key)
      versions[key] = { version: record.version, position: record.position }
    } else {
      base.set(key, { ...record, value: preferredValue ?? record.value })
      versions[key] = { version: record.version, position: record.position }
    }
    markDirty(key)
  }
  function applyRemote(result: WorkspaceChanges) {
    if (result.accountingGeneration !== options.accountingGeneration) {
      blocked = 'rejected'
      status(
        'error',
        'Учёт начат заново. Обновите страницу; старые правки не будут восстановлены.',
      )
      throw new Error('Учёт начат заново. Обновите страницу.')
    }
    const updates: StoredEntity[] = []
    const dirty = dirtyChanges()
    const changedGroups = new Set(
      Object.keys(result.groups).filter(
        (key) => (groups[key] ?? 0) < result.groups[key]!,
      ),
    )
    for (const record of result.records) {
      const key = recordKey(record)
      if ((versions[key]?.version ?? 0) >= record.version) continue
      const before = entityValue(base, key),
        mine = entityValue(local, key)
      if (!jsonEqual(before, mine) && !jsonEqual(mine, record.value)) {
        conflicts.set(key, { key, before, mine, theirs: record.value })
        blocked = 'conflict'
      } else updates.push(record)
      setBase(record)
    }
    for (const change of dirty) {
      if (entityGroups(change).some((key) => changedGroups.has(key))) {
        const key = recordKey(change)
        if (!jsonEqual(entityValue(local, key), entityValue(base, key))) {
          if (!conflicts.has(key))
            conflicts.set(key, {
              key,
              before: entityValue(base, key),
              mine: entityValue(local, key),
              theirs: entityValue(base, key),
            })
          blocked = 'conflict'
        }
      }
    }
    expandProjectConflicts(dirty)
    for (const [key, version] of Object.entries(result.groups))
      groups[key] = Math.max(groups[key] ?? 0, version)
    cursor = result.revision
    if (updates.length) {
      updateLocal(applyWorkspaceEntities(latest, updates))
      options.onWorkspace(latest)
    }
    journal()
    if (blocked === 'conflict')
      status(
        'conflict',
        'Есть одновременные изменения. Сравните значения и выберите, что сохранить.',
      )
  }
  async function refresh(deferWhileEditing = false) {
    if (syncing) {
      await syncing
      if (deferWhileEditing) return
    }
    syncing = (async () => {
      let more = true
      while (more) {
        const result = await options.changes(cursor)
        if (deferWhileEditing && options.canApplyRemote?.() === false) return
        applyRemote(result)
        more = result.hasMore
      }
    })().finally(() => {
      syncing = null
    })
    return syncing
  }
  async function drain() {
    if (syncing) await syncing
    while (!blocked) {
      const changes = dirtyChanges()
      if (!inFlight && !changes.length) {
        status('saved', '')
        journal([])
        return
      }
      if (!inFlight) {
        const expectedGroups = groupExpectations(changes)
        inFlight = {
          accountingGeneration: options.accountingGeneration,
          mutationId: crypto.randomUUID(),
          changes,
          groups: expectedGroups,
          creatingGroups: Object.keys(expectedGroups).filter((key) =>
            creatingGroups.has(key),
          ),
        }
      }
      journal(changes)
      status('saving', '')
      try {
        const sent = inFlight
        const result = await options.save(sent)
        if (result.status === 'conflict') {
          for (const conflict of result.conflicts) {
            conflicts.set(conflict.key, {
              key: conflict.key,
              before: entityValue(base, conflict.key),
              mine: entityValue(local, conflict.key),
              theirs: conflict.current?.value ?? null,
            })
          }
          expandProjectConflicts(sent.changes)
          inFlight = null
          blocked = 'conflict'
          journal()
          status('conflict', result.message)
          return
        }
        if (result.status === 'rejected') {
          inFlight = null
          blocked = 'rejected'
          journal()
          status('error', result.message)
          return
        }
        const sentValues = new Map(
          sent.changes.map((item) => [recordKey(item), item.value]),
        )
        for (const record of result.records) {
          const sentValue = sentValues.get(recordKey(record))
          setBase(record, sentValue ?? undefined)
        }
        for (const [key, version] of Object.entries(result.groups))
          groups[key] = Math.max(groups[key] ?? 0, version)
        for (const key of Object.keys(result.groups)) creatingGroups.delete(key)
        inFlight = null
        journal()
      } catch (error) {
        blocked = 'network'
        status(
          'error',
          error instanceof Error
            ? error.message
            : 'Нет связи с сервером. Повторите сохранение.',
        )
      }
    }
  }
  function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (!running && !blocked)
      running = drain().finally(() => {
        running = null
      })
    return running ?? Promise.resolve()
  }
  const hasPending = () => !!inFlight || dirtyKeys.size > 0
  return {
    update(workspace: WorkspaceSnapshot) {
      updateLocal(workspace)
      const changed = dirtyChanges()
      journal(changed)
      if (!changed.length && !inFlight) {
        blocked = null
        conflicts.clear()
        status('saved', '')
        return
      }
      if (blocked === 'rejected') blocked = null
      if (!blocked && !running) {
        status('saving', '')
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          void flush()
        }, 120)
      }
    },
    async restore(saved: EditJournal | null) {
      if (!saved) return
      const parsed = editJournalSchema.safeParse(saved)
      if (!parsed.success)
        throw new Error(
          'Копия правок вкладки повреждена. Исходная копия сохранена в браузере; автоматическое восстановление остановлено.',
        )
      saved = parsed.data
      if (saved.accountingGeneration !== options.accountingGeneration)
        throw new Error(
          'Учёт начат заново. Старые правки сохранены отдельно и не восстанавливаются в новую базу.',
        )
      for (const key of saved.creatingGroups ?? []) creatingGroups.add(key)
      // Replaying the exact stored UUID safely discovers whether a response was lost.
      let acknowledged: PatchResult | null = null
      if (saved.request) {
        try {
          acknowledged = await options.save(saved.request)
        } catch {
          /* Keep the desired changes below. */
        }
        if (acknowledged?.status === 'saved') {
          for (const record of acknowledged.records) setBase(record)
          for (const [key, version] of Object.entries(acknowledged.groups))
            groups[key] = Math.max(groups[key] ?? 0, version)
          for (const key of Object.keys(acknowledged.groups))
            creatingGroups.delete(key)
        }
      }
      updateLocal(
        applyWorkspaceEntities(
          latest,
          saved.changes.map((change) => ({
            ...change,
            version: change.expectedVersion ?? 0,
          })),
        ),
      )
      for (const change of saved.changes) {
        const key = recordKey(change)
        if (jsonEqual(entityValue(base, key), change.value)) continue
        const ack =
          acknowledged?.status === 'saved'
            ? acknowledged.records.find((item) => recordKey(item) === key)
            : undefined
        const expected = ack?.version ?? change.expectedVersion
        if (
          (versions[key]?.version ?? null) !== expected ||
          entityGroups(change).some(
            (group) =>
              (groups[group] ?? null) !==
              (acknowledged?.status === 'saved'
                ? (acknowledged.groups[group] ?? saved.groups[group])
                : saved.groups[group]),
          )
        ) {
          conflicts.set(key, {
            key,
            before: saved.before[key] ?? null,
            mine: change.value,
            theirs: entityValue(base, key),
          })
          blocked = 'conflict'
        }
      }
      expandProjectConflicts(saved.changes)
      if (saved.request && !acknowledged) {
        inFlight = saved.request
        blocked = 'network'
      }
      options.onWorkspace(latest)
      journal()
      if (blocked)
        status(
          blocked === 'conflict' ? 'conflict' : 'error',
          'Восстановлены несохранённые изменения этой вкладки. Проверьте их перед продолжением.',
        )
      else await flush()
    },
    refresh: () => refresh(),
    async poll() {
      if (running || inFlight || blocked || timer) return
      try {
        await refresh(true)
      } catch {
        /* A read failure must not mark acknowledged edits as unsaved. */
      }
    },
    async resolve(choice: 'mine' | 'server') {
      if (running) await running
      try {
        await refresh()
        if (choice === 'server') {
          const updates = [...conflicts.keys()].map((key) => {
            const entity = base.get(key) ?? local.get(key)!
            return {
              ...entity,
              value: entityValue(base, key),
              version: versions[key]?.version ?? 0,
            }
          })
          updateLocal(applyWorkspaceEntities(latest, updates))
          options.onWorkspace(latest)
        }
        conflicts.clear()
        blocked = null
        inFlight = null
        journal()
        await flush()
      } catch (error) {
        status(
          'error',
          error instanceof Error
            ? error.message
            : 'Не удалось загрузить актуальные данные.',
        )
      }
    },
    retry() {
      if (conflicts.size) return Promise.resolve()
      blocked = null
      return flush()
    },
    flush,
    async waitUntilSaved() {
      await flush()
      while (running) await running
      if (blocked || inFlight || dirtyChanges().length)
        throw new Error(
          message ||
            'Есть несохранённые изменения. Проверьте сообщение над таблицей.',
        )
      await refresh()
      if (conflicts.size || hasPending())
        throw new Error(
          'Есть конфликт или несохранённые изменения. Проверьте их перед печатью.',
        )
      return cursor
    },
    hasPending,
    hasPendingRecord: (collection: Collection, id: string) => {
      const key = recordKey({ collection, id })
      return (
        dirtyKeys.has(key) ||
        Boolean(inFlight?.changes.some((change) => recordKey(change) === key))
      )
    },
    getLatest: () => latest,
    dispose() {
      if (timer) clearTimeout(timer)
    },
  }
}

export function workspaceClientIdentity(userId = 'local') {
  const key = `materials.client.${userId}`
  try {
    let existing = sessionStorage.getItem(key)
    if (!existing && userId === 'local') {
      // Preserve this tab's pending edits when moving away from account login.
      // Never merge journals from different former accounts implicitly.
      const legacy = new Set<string>()
      for (let index = 0; index < sessionStorage.length; index++) {
        const legacyKey = sessionStorage.key(index)
        if (!legacyKey?.startsWith('materials.client.') || legacyKey === key)
          continue
        const clientId = sessionStorage.getItem(legacyKey)
        if (clientId && localStorage.getItem(editJournalKey(clientId)))
          legacy.add(clientId)
      }
      if (legacy.size === 1) existing = [...legacy][0]!
    }
    const id = crypto.randomUUID()
    // Duplicate-tab copies sessionStorage. Give the new document its own outbox,
    // retaining the source journal so an active original tab cannot lose its edits.
    if (existing) {
      const pending = localStorage.getItem(editJournalKey(existing))
      if (pending) localStorage.setItem(editJournalKey(id), pending)
    }
    sessionStorage.setItem(key, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}
export const editJournalKey = (clientId: string) =>
  `materials.pending.v2.${clientId}`
