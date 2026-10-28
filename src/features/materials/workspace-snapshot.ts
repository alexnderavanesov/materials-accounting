import { z } from 'zod'
import { qualityWorkflowSchema } from './quality-workflow'

const records = z.array(z.record(z.string(), z.json()))

// Keep the existing on-disk format; reject incomplete/invalid replacements.
export const workspaceSnapshotSchema = z
  .object({
    configuredAlloys: z.array(z.string()),
    configuredCiphers: z.array(z.string()),
    configuredDocuments: z.array(z.string()),
    configuredUnits: z.array(z.string()),
    lines: records,
    materialTypeSettings: records,
    materialIssues: records,
    materialReceipts: records,
    materialRequests: records,
    // Old empty envelopes may still have this key; legacy controls are not accepted.
    qualityControls: z.array(z.never()).max(0).optional(),
    qualityWorkflow: qualityWorkflowSchema.optional(),
  })
  .strict()

export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>
export type LoadedWorkspace = {
  workspace: WorkspaceSnapshot | null
  revision: string | null
}
export type SaveWorkspaceResult =
  | { status: 'saved'; revision: string }
  | { status: 'conflict' }

export const saveWorkspaceInputSchema = z.object({
  workspace: workspaceSnapshotSchema,
  expectedRevision: z.string().nullable(),
})

export const workspaceStorageKey = 'materials.projectWorkspace.v1'
const syncKey = `${workspaceStorageKey}.sync`

function preserveRecovery(storage: Storage, raw: string) {
  const prefix = `${workspaceStorageKey}.recovery.`
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key?.startsWith(prefix) && storage.getItem(key) === raw) return
  }
  storage.setItem(`${prefix}${crypto.randomUUID()}`, raw)
}

export function readWorkspaceCache(server: LoadedWorkspace, storage: Storage) {
  let raw: string | null = null
  try {
    raw = storage.getItem(workspaceStorageKey)
    if (!raw)
      return {
        workspace: server.workspace,
        recovery: null,
        cacheEnabled: true,
        pending: false,
      }
    const local = workspaceSnapshotSchema.parse(JSON.parse(raw))
    if (
      !server.workspace ||
      JSON.stringify(local) === JSON.stringify(server.workspace)
    ) {
      return {
        workspace: local,
        recovery: null,
        cacheEnabled: true,
        pending: !server.workspace,
      }
    }
    const meta = JSON.parse(storage.getItem(syncKey) ?? 'null') as {
      pending?: boolean
      revision?: string | null
      writing?: boolean
    } | null
    if (meta?.pending && !meta.writing && meta.revision === server.revision) {
      return {
        workspace: local,
        recovery: null,
        cacheEnabled: true,
        pending: true,
      }
    }
    // A legacy/stale browser must not overwrite a newer server snapshot.
    preserveRecovery(storage, raw)
    return {
      workspace: server.workspace,
      recovery: raw,
      cacheEnabled: true,
      pending: false,
    }
  } catch {
    // If recovery cannot be written (quota/privacy), leave the old key intact.
    return {
      workspace: server.workspace,
      recovery: raw,
      cacheEnabled: false,
      pending: false,
    }
  }
}

export function writeWorkspaceCache(
  storage: Storage,
  workspace: WorkspaceSnapshot,
  revision: string | null,
  pending: boolean,
  writerId = 'legacy',
) {
  const serialized = JSON.stringify(workspace)
  const previousRaw = storage.getItem(workspaceStorageKey)
  const previousMeta = JSON.parse(storage.getItem(syncKey) ?? 'null') as {
    pending?: boolean
    writerId?: string
  } | null
  if (
    previousRaw &&
    previousRaw !== serialized &&
    previousMeta?.pending &&
    previousMeta.writerId !== writerId
  ) {
    // Another tab may have unsaved edits even while our own request succeeds.
    preserveRecovery(storage, previousRaw)
  }
  // A two-key write can fail between metadata and payload (quota, interruption).
  // Only a completed write may restore offline edits against this revision.
  storage.setItem(
    syncKey,
    JSON.stringify({ revision, pending: true, writerId, writing: true }),
  )
  storage.setItem(workspaceStorageKey, serialized)
  storage.setItem(syncKey, JSON.stringify({ revision, pending, writerId }))
}

export function toWorkspaceSnapshot(value: unknown): WorkspaceSnapshot {
  return workspaceSnapshotSchema.parse(JSON.parse(JSON.stringify(value)))
}
