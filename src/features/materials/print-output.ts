export type PrintBundle = {
  name: string
  excel: Blob
  pdf: Blob | null
  pdfError?: string
}
export async function readPrintBundle(
  response: Response,
): Promise<PrintBundle> {
  const value = (await response.json()) as {
    name: string
    excel: string
    pdf?: string
    pdfError?: string
  }
  const blob = (base64: string, type: string) =>
    new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], {
      type,
    })
  return {
    name: value.name,
    excel: blob(
      value.excel,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
    pdf: value.pdf ? blob(value.pdf, 'application/pdf') : null,
    pdfError: value.pdfError,
  }
}
