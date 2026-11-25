import { requiredDocumentScanError } from './document-file-limits'
import type { DocumentFile } from './document-registry'
import type { WorkspacePatch } from './workspace-protocol'

/** Validate only operations being saved; old incomplete records remain readable. */
export function workspaceDocumentScanError(
  patch: WorkspacePatch,
  files: DocumentFile[],
) {
  const required = new Map<string, 'app' | 'm15'>()
  for (const change of patch.changes) {
    const value = change.value
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    if (
      change.collection === 'receiptDocuments' &&
      (value.kind === 'app' || value.kind === 'm15')
    )
      required.set(
        change.id,
        required.get(change.id) === 'm15' ? 'm15' : value.kind,
      )
    if (change.collection === 'materialReceipts') {
      if (typeof value.appDocumentId !== 'string' || !value.appDocumentId)
        return 'Для получения обязателен АПП с загруженным документом.'
      if (!required.has(value.appDocumentId))
        required.set(value.appDocumentId, 'app')
    }
    if (change.collection === 'm15Reconciliations')
      required.set(change.id, 'm15')
  }
  const byDocument = new Map<string, DocumentFile[]>()
  for (const file of files) {
    const group = byDocument.get(file.documentId) ?? []
    group.push(file)
    byDocument.set(file.documentId, group)
  }
  for (const [id, kind] of required) {
    const error = requiredDocumentScanError(
      kind,
      byDocument.get(JSON.stringify(['receipt-document', id])) ?? [],
    )
    if (error) return error
  }
  return ''
}
