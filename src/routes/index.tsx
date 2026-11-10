import { createFileRoute } from '@tanstack/react-router'
import { ProjectWorkspace } from '#/features/materials/project-workspace'
import { loadProjectWorkspaceSnapshot } from '#/features/materials/functions'
import { WorkspaceLogin } from '#/features/materials/workspace-account'
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
  if (storedWorkspace.authenticationRequired && !storedWorkspace.user)
    return <WorkspaceLogin />
  return (
    <ProjectWorkspace
      initialStoredData={storedWorkspace}
      navigation={navigation}
    />
  )
}
