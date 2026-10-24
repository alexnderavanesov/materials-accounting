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
    } | null
    if (meta?.pending && meta.revision === server.revision) {
      return {
        workspace: local,
        recovery: null,
        cacheEnabled: true,
        pending: true,
      }
    }
    // A legacy/stale browser must not overwrite a newer server snapshot.
    storage.setItem(
      `${workspaceStorageKey}.recovery.${crypto.randomUUID()}`,
      raw,
    )
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
  const previousRaw = storage.getItem(workspaceStorageKey)
  const previousMeta = JSON.parse(storage.getItem(syncKey) ?? 'null') as {
    pending?: boolean
    writerId?: string
  } | null
  if (
    previousRaw &&
    previousRaw !== JSON.stringify(workspace) &&
    previousMeta?.pending &&
    previousMeta.writerId !== writerId
  ) {
    // Another tab may have unsaved edits even while our own request succeeds.
    storage.setItem(
      `${workspaceStorageKey}.recovery.${crypto.randomUUID()}`,
      previousRaw,
    )
  }
  // Mark pending BEFORE changing the payload. Never label newer data as saved.
  storage.setItem(
    syncKey,
    JSON.stringify({ revision, pending: true, writerId }),
  )
  storage.setItem(workspaceStorageKey, JSON.stringify(workspace))
  if (!pending)
    storage.setItem(
      syncKey,
      JSON.stringify({ revision, pending: false, writerId }),
    )
}

export function toWorkspaceSnapshot(value: unknown): WorkspaceSnapshot {
  return workspaceSnapshotSchema.parse(JSON.parse(JSON.stringify(value)))
}
