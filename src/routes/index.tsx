import { createFileRoute } from '@tanstack/react-router'
import { ProjectWorkspace } from '#/features/materials/project-workspace'
import { loadProjectWorkspaceSnapshot } from '#/features/materials/functions'
import {
  useWorkspaceRouteNavigation,
  validateWorkspaceSearch,
} from '#/features/materials/workspace-navigation'

export const Route = createFileRoute('/')({
  ssr: false,
  validateSearch: validateWorkspaceSearch,
  // View changes must not refetch the snapshot or replace in-progress workspace state.
  shouldReload: false,
  loader: () => loadProjectWorkspaceSnapshot(),
  component: Home,
})
function Home() {
  const storedWorkspace = Route.useLoaderData()
  const navigation = useWorkspaceRouteNavigation(
    Route.useSearch(),
    Route.useNavigate(),
  )
  return (
    <ProjectWorkspace
      initialStoredData={storedWorkspace}
      navigation={navigation}
    />
  )
}
