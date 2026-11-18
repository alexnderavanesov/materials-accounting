import { createFileRoute } from '@tanstack/react-router'
import { handleRequestPrint } from '#/features/materials/request-print-api.server'
import { workspaceResponse } from '#/features/materials/workspace-access.server'

export const Route = createFileRoute('/api/request-print')({
  server: {
    handlers: {
      GET: ({ request }) => workspaceResponse(request, handleRequestPrint),
      POST: ({ request }) => workspaceResponse(request, handleRequestPrint),
    },
  },
})
