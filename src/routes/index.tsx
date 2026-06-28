import { createFileRoute } from '@tanstack/react-router'

import { ProjectWorkspace } from '#/features/materials/project-workspace'
import { getSubobjectMaterialPlan } from '#/features/materials/functions'

export const Route = createFileRoute('/')({
  loader: () => getSubobjectMaterialPlan({ data: { subobjectId: 'project-1' } }),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()

  return <ProjectWorkspace initialData={data} />
}
