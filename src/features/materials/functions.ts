import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { projectWorkspaceStore } from './workspace-snapshot.server'
import { saveWorkspaceInputSchema } from './workspace-snapshot'

export const loadProjectWorkspaceSnapshot = createServerFn({
  method: 'GET',
}).handler(() => {
  setResponseHeader('Cache-Control', 'no-store')
  return projectWorkspaceStore.load()
})

export const saveProjectWorkspaceSnapshot = createServerFn({ method: 'POST' })
  .validator(saveWorkspaceInputSchema)
  .handler(({ data }) =>
    projectWorkspaceStore.save(data.workspace, data.expectedRevision),
  )
