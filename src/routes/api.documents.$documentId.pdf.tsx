import { createFileRoute } from '@tanstack/react-router'

import { renderDocumentPdf } from '#/features/materials/pdf.server'

export const Route = createFileRoute('/api/documents/$documentId/pdf')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const pdf = await renderDocumentPdf(params.documentId)

        return new Response(new Uint8Array(pdf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${params.documentId}.pdf"`,
          },
        })
      },
    },
  },
})
