import { createFileRoute } from '@tanstack/react-router'
import { handleDocuments } from '#/features/materials/documents-api.server'
import { workspaceResponse } from '#/features/materials/workspace-access.server'

export const Route = createFileRoute('/api/documents')({
  server: {
    handlers: {
      GET: ({ request }) => workspaceResponse(request, handleDocuments),
      POST: ({ request }) => workspaceResponse(request, handleDocuments),
    },
  },
})
