import {
  documentFileSelectionError,
  requiredDocumentScanError,
} from './document-file-limits'
import { receiptDocumentLabel } from './receipt-documents'
import type { ReceiptDocument } from './receipt-documents'
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
export type DraftScanDocument = ReceiptDocument & { lineIds: string[] }
/** Draft originals are stored by the same stable ID before the operation is saved. */
export async function uploadDocumentScans(
  documentId: string,
  selection: ScanSelection,
  draftDocument?: DraftScanDocument,
) {
  const error = documentFileSelectionError(selection.files)
  if (error) throw new Error(error)
  if (!selection.files.length) return
  const files = []
  for (const file of selection.files)
    files.push({ name: file.name, base64: await fileBase64(file) })
  const current = await loadDocumentCatalog()
  const existing = current.documents.some((doc) => doc.id === documentId)
  if (!draftDocument && !existing)
    throw new Error(
      'Сохранённый документ не найден. Проверьте сохранение получения и повторите загрузку.',
    )
  const response = await checkedDocumentResponse(
    await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload-files',
        documentId,
        draftDocument: existing ? undefined : draftDocument,
        files,
        workspaceRevision: current.workspaceRevision,
        filesRevision: current.manifest.revision,
        expectedFileIds: selection.expectedFileIds,
        replaceFileIds: selection.replace ? selection.expectedFileIds : [],
      }),
    }),
  )
  const manifest: DocumentFileManifest = await response.json()
  window.dispatchEvent(new Event('materials:document-files-changed'))
  return manifest
}

export async function requireUploadedDocument(document: ReceiptDocument) {
  const catalog = await loadDocumentCatalog()
  const files = catalog.manifest.files.filter(
    (file) =>
      file.documentId === JSON.stringify(['receipt-document', document.id]),
  )
  const error = requiredDocumentScanError(document.kind, files)
  if (error) throw new Error(`${receiptDocumentLabel(document)}: ${error}`)
  return catalog
}
