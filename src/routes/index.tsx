import { createFileRoute } from '@tanstack/react-router'
import { ProjectWorkspace } from '#/features/materials/project-workspace'
import { loadProjectWorkspaceSnapshot } from '#/features/materials/functions'

export const Route = createFileRoute('/')({
  ssr: false,
  loader: () => loadProjectWorkspaceSnapshot(),
  component: Home,
})
function Home() {
  const storedWorkspace = Route.useLoaderData()
  return <ProjectWorkspace initialStoredData={storedWorkspace} />
}
