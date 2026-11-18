import { createFileRoute } from '@tanstack/react-router'
import { handleQualityPrint } from '#/features/materials/quality-print-api.server'
import { workspaceResponse } from '#/features/materials/workspace-access.server'

export const Route = createFileRoute('/api/quality-print')({
  server: {
    handlers: {
      GET: ({ request }) => workspaceResponse(request, handleQualityPrint),
      POST: ({ request }) => workspaceResponse(request, handleQualityPrint),
    },
  },
})
