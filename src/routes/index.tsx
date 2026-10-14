import { createFileRoute } from '@tanstack/react-router'

import { ProjectWorkspace } from '#/features/materials/project-workspace'
import {
  getSubobjectMaterialPlan,
  loadProjectWorkspaceSnapshot,
} from '#/features/materials/functions'

export const Route = createFileRoute('/')({
  ssr: false,
  loader: async () => {
    const [plan, storedWorkspace] = await Promise.all([
      getSubobjectMaterialPlan({ data: { subobjectId: 'project-1' } }),
      loadProjectWorkspaceSnapshot(),
    ])

    return { plan, storedWorkspace }
  },
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()

  return (
    <ProjectWorkspace
      initialData={data.plan}
      initialStoredData={data.storedWorkspace}
    />
  )
}
