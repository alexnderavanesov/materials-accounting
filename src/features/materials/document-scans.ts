import { documentFileSelectionError } from './document-file-limits'
import { fileBase64 } from './request-print-ui'
import type {
  DocumentRegistry,
  DocumentFileManifest,
} from './document-registry'

export type DocumentCatalog = DocumentRegistry & {
  workspaceRevision: string
  manifest: DocumentFileManifest
}
export type ScanSelection = {
  files: File[]
  expectedFileIds: string[]
  replace: boolean
}
export async function checkedDocumentResponse(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? 'Не удалось загрузить документы.')
  }
  return response
}
export async function loadDocumentCatalog(
  signal?: AbortSignal,
): Promise<DocumentCatalog> {
  return (
    await checkedDocumentResponse(
      await fetch('/api/documents', { cache: 'no-store', signal }),
    )
  ).json()
}
/** Caller persists the source operation first. Never infer the link from a filename. */
export async function uploadDocumentScans(
  documentId: string,
  selection: ScanSelection,
) {
  const error = documentFileSelectionError(selection.files)
  if (error) throw new Error(error)
  if (!selection.files.length) return
  const files = []
  for (const file of selection.files)
    files.push({ name: file.name, base64: await fileBase64(file) })
  const current = await loadDocumentCatalog()
  if (!current.documents.some((doc) => doc.id === documentId))
    throw new Error(
      'Сохранённый документ не найден. Проверьте сохранение получения и повторите загрузку.',
    )
  await checkedDocumentResponse(
    await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload-files',
        documentId,
        files,
        workspaceRevision: current.workspaceRevision,
        filesRevision: current.manifest.revision,
        expectedFileIds: selection.expectedFileIds,
        replaceFileIds: selection.replace ? selection.expectedFileIds : [],
      }),
    }),
  )
}
