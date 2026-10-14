import type {
  SaveWorkspaceResult,
  WorkspaceSnapshot,
} from './workspace-snapshot'

export type WorkspaceSaveStatus = 'saved' | 'saving' | 'error' | 'conflict'

/** One in-flight save; intermediate changes are coalesced into the latest snapshot. */
export function createWorkspaceSaver(options: {
  initial: WorkspaceSnapshot
  revision: string | null
  pending?: boolean
  save: (
    workspace: WorkspaceSnapshot,
    revision: string | null,
  ) => Promise<SaveWorkspaceResult>
  cache: (
    workspace: WorkspaceSnapshot,
    revision: string | null,
    pending: boolean,
  ) => void
  onStatus: (status: WorkspaceSaveStatus) => void
}) {
  let revision = options.revision
  let lastRequested = options.pending ? '' : JSON.stringify(options.initial)
  let latest = options.initial
  let pending: WorkspaceSnapshot | null = null
  let running: Promise<void> | null = null
  let blocked = false
  function cache(workspace: WorkspaceSnapshot, isPending: boolean) {
    // localStorage failure must not prevent server persistence.
    try {
      options.cache(workspace, revision, isPending)
    } catch {
      /* Server save remains authoritative. */
    }
  }
  const hasPending = () => pending !== null
  async function drain() {
    while (pending && !blocked) {
      const workspace = pending
      pending = null
      options.onStatus('saving')
      try {
        const result = await options.save(workspace, revision)
        if (result.status === 'conflict') {
          pending ??= workspace
          blocked = true
          options.onStatus('conflict')
          return
        }
        revision = result.revision
        // Do not roll the local cache back if a later edit arrived during save.
        cache(latest, hasPending())
        if (!hasPending()) options.onStatus('saved')
      } catch {
        pending ??= workspace
        blocked = true
        options.onStatus('error')
      }
    }
  }
  function flush(): Promise<void> {
    if (!running && pending && !blocked) {
      running = drain().finally(() => {
        running = null
        if (pending && !blocked) void flush()
      })
    }
    return running ?? Promise.resolve()
  }
  return {
    update(workspace: WorkspaceSnapshot) {
      const serialized = JSON.stringify(workspace)
      if (serialized === lastRequested) return
      lastRequested = serialized
      latest = workspace
      pending = workspace
      cache(workspace, true)
      void flush()
    },
    retry() {
      blocked = false
      return flush()
    },
    flush,
    getLatest: () => latest,
  }
}
