import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { projectWorkspaceStore } from './workspace-snapshot.server'
import { saveWorkspaceInputSchema } from './workspace-snapshot'
import { workspacePatchSchema } from './workspace-protocol'
import { postgresWorkspaceStore } from './workspace-postgres.server'
import {
  currentWorkspaceUser,
  requireWorkspaceUser,
} from './workspace-auth.server'
import type { LoadedWorkspace } from './workspace-snapshot'

export const loadProjectWorkspaceSnapshot = createServerFn({
  method: 'GET',
}).handler(async (): Promise<LoadedWorkspace> => {
  setResponseHeader('Cache-Control', 'no-store')
  const user = await currentWorkspaceUser(getRequest())
  if (!user)
    return {
      workspace: null,
      revision: null,
      user: null,
      authenticationRequired: true,
    }
  return {
    ...(await projectWorkspaceStore.load()),
    user,
    authenticationRequired: true,
  }
})

export const saveProjectWorkspaceSnapshot = createServerFn({ method: 'POST' })
  .validator(saveWorkspaceInputSchema)
  .handler(async ({ data }) => {
    await requireWorkspaceUser(getRequest())
    return projectWorkspaceStore.save(data.workspace, data.expectedRevision)
  })

export const saveProjectWorkspaceChanges = createServerFn({ method: 'POST' })
  .validator(workspacePatchSchema)
  .handler(async ({ data }) => {
    const user = await requireWorkspaceUser(getRequest())
    return postgresWorkspaceStore().patch(data, `${user.id}:${user.name}`)
  })

export const loadProjectWorkspaceChanges = createServerFn({ method: 'GET' })
  .validator(z.object({ revision: z.string().regex(/^pg:\d+$/) }))
  .handler(async ({ data }) => {
    await requireWorkspaceUser(getRequest())
    setResponseHeader('Cache-Control', 'no-store')
    return postgresWorkspaceStore().changes(data.revision)
  })
