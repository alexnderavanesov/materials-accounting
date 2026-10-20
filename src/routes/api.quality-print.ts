import { createFileRoute } from '@tanstack/react-router'
import { handleQualityPrint } from '#/features/materials/quality-print-api.server'

export const Route = createFileRoute('/api/quality-print')({
  server: {
    handlers: {
      GET: ({ request }) => handleQualityPrint(request),
      POST: ({ request }) => handleQualityPrint(request),
    },
  },
})
