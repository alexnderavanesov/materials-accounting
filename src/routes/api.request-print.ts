import { createFileRoute } from '@tanstack/react-router'
import { handleRequestPrint } from '#/features/materials/request-print-api.server'
import { authenticatedWorkspaceResponse } from '#/features/materials/workspace-auth.server'

export const Route = createFileRoute('/api/request-print')({
  server: {
    handlers: {
      GET: ({ request }) =>
        authenticatedWorkspaceResponse(request, handleRequestPrint),
      POST: ({ request }) =>
        authenticatedWorkspaceResponse(request, handleRequestPrint),
    },
  },
})
