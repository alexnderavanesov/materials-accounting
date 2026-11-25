import { documentFileStore } from './document-files.server'
import { workspaceDocumentScanError } from './required-document-scans'
import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { projectWorkspaceStore } from './workspace-snapshot.server'
import { saveWorkspaceInputSchema } from './workspace-snapshot'
import { workspacePatchSchema } from './workspace-protocol'
import { postgresWorkspaceStore } from './workspace-postgres.server'
import { checkWorkspaceOrigin } from './workspace-access.server'
import type { LoadedWorkspace } from './workspace-snapshot'

export const loadProjectWorkspaceSnapshot = createServerFn({
  method: 'GET',
}).handler(async (): Promise<LoadedWorkspace> => {
  setResponseHeader('Cache-Control', 'no-store')
  checkWorkspaceOrigin(getRequest())
  return projectWorkspaceStore.load()
})

export const saveProjectWorkspaceSnapshot = createServerFn({ method: 'POST' })
  .validator(saveWorkspaceInputSchema)
  .handler(async ({ data }) => {
    checkWorkspaceOrigin(getRequest())
    return projectWorkspaceStore.save(data.workspace, data.expectedRevision)
  })

export const saveProjectWorkspaceChanges = createServerFn({ method: 'POST' })
  .validator(workspacePatchSchema)
  .handler(async ({ data }) => {
    checkWorkspaceOrigin(getRequest())
    if (
      data.changes.some(
        (change) =>
          change.value !== null &&
          [
            'receiptDocuments',
            'materialReceipts',
            'm15Reconciliations',
          ].includes(change.collection),
      )
    ) {
      const scanError = workspaceDocumentScanError(
        data,
        (await documentFileStore.load()).files,
      )
      if (scanError) return { status: 'rejected' as const, message: scanError }
    }
    return postgresWorkspaceStore().patch(data, 'local:Локальный пользователь')
  })

export const loadProjectWorkspaceChanges = createServerFn({ method: 'GET' })
  .validator(z.object({ revision: z.string().regex(/^pg:\d+$/) }))
  .handler(async ({ data }) => {
    checkWorkspaceOrigin(getRequest())
    setResponseHeader('Cache-Control', 'no-store')
    return postgresWorkspaceStore().changes(data.revision)
  })
