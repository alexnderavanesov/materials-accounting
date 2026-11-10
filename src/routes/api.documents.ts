import { createFileRoute } from '@tanstack/react-router'
import { handleDocuments } from '#/features/materials/documents-api.server'
import { authenticatedWorkspaceResponse } from '#/features/materials/workspace-auth.server'

export const Route = createFileRoute('/api/documents')({
  server: {
    handlers: {
      GET: ({ request }) =>
        authenticatedWorkspaceResponse(request, handleDocuments),
      POST: ({ request }) =>
        authenticatedWorkspaceResponse(request, handleDocuments),
    },
  },
})
