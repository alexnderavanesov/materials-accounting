import { createFileRoute } from '@tanstack/react-router'
import { handleQualityPrint } from '#/features/materials/quality-print-api.server'
import { authenticatedWorkspaceResponse } from '#/features/materials/workspace-auth.server'

export const Route = createFileRoute('/api/quality-print')({
  server: {
    handlers: {
      GET: ({ request }) =>
        authenticatedWorkspaceResponse(request, handleQualityPrint),
      POST: ({ request }) =>
        authenticatedWorkspaceResponse(request, handleQualityPrint),
    },
  },
})
