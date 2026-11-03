export async function printOutput(
  excel: Buffer,
  convert: (bytes: Buffer) => Promise<Buffer>,
  name: string,
  format: 'pdf' | 'xlsx' | 'bundle' = 'pdf',
) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (format === 'bundle') {
    let pdf: Buffer | undefined, pdfError: string | undefined
    try {
      pdf = await convert(excel)
    } catch (cause) {
      pdfError =
        cause instanceof Error ? cause.message : 'Не удалось сформировать PDF.'
    }
    return Response.json(
      {
        name,
        excel: excel.toString('base64'),
        pdf: pdf?.toString('base64'),
        pdfError,
      },
      { headers },
    )
  }
  const bytes = format === 'xlsx' ? excel : await convert(excel)
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...headers,
      'Content-Type':
        format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
      'Content-Disposition': `${format === 'xlsx' ? 'attachment' : 'inline'}; filename="document.${format}"; filename*=UTF-8''${encodeURIComponent(`${name}.${format}`)}`,
    },
  })
}
