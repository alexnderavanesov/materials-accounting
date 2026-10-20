import { createFileRoute } from '@tanstack/react-router'
import { handleRequestPrint } from '#/features/materials/request-print-api.server'

export const Route = createFileRoute('/api/request-print')({
  server: {
    handlers: {
      GET: ({ request }) => handleRequestPrint(request),
      POST: ({ request }) => handleRequestPrint(request),
    },
  },
})
