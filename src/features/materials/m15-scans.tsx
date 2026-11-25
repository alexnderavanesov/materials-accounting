import { RefreshCw } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { useEffect, useState } from 'react'
import { DocumentFileInput } from './document-file-input'
import { ExistingScanFiles } from './document-scan-picker'
import { loadDocumentCatalog, uploadDocumentScans } from './document-scans'
import type { DocumentFile } from './document-registry'
import type { DraftScanDocument, ScanSelection } from './document-scans'

export const m15ScanDocumentId = (id: string) =>
  JSON.stringify(['receipt-document', id])
export async function uploadM15Scans(
  id: string,
  files: File[],
  policy: Omit<ScanSelection, 'files'>,
  draftDocument?: DraftScanDocument,
) {
  await uploadDocumentScans(
    m15ScanDocumentId(id),
    { ...policy, files },
    draftDocument,
  )
}
const noFiles: DocumentFile[] = []
export function useM15ScanCatalog(id: string, saved = true, revision = 0) {
  const documentId = m15ScanDocumentId(id)
  const [snapshot, setSnapshot] = useState<{
    files: DocumentFile[]
    workspaceRevision: string
    filesRevision: string
  } | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!saved) return
    const abort = new AbortController()
    setError('')
    setSnapshot(null)
    void loadDocumentCatalog(abort.signal)
      .then(({ manifest, workspaceRevision }) => {
        if (!abort.signal.aborted)
          setSnapshot({
            files: manifest.files.filter(
              (file) => file.documentId === documentId,
            ),
            filesRevision: manifest.revision,
            workspaceRevision,
          })
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Не удалось прочитать сканы.',
          )
      })
    return () => abort.abort()
  }, [documentId, saved, revision, attempt])

  return {
    files: saved ? (snapshot?.files ?? null) : noFiles,
    error,
    refresh: () => setAttempt((value) => value + 1),
  }
}
export function M15Scans({
  documentId,
  revision,
  files,
  onChange,
  onPolicyChange,
  disabled,
}: {
  documentId: string
  revision: number
  files: File[]
  onChange: (files: File[]) => void
  onPolicyChange: (policy: Omit<ScanSelection, 'files'> | null) => void
  disabled?: boolean
}) {
  const catalog = useM15ScanCatalog(documentId, true, revision)
  const stored = catalog.files
  const loading = stored === null && !catalog.error
  useEffect(() => {
    onPolicyChange(
      stored
        ? { expectedFileIds: stored.map((file) => file.id), replace: true }
        : null,
    )
  }, [stored, onPolicyChange])
  return (
    <section
      aria-label="Сканы М-15"
      className="grid gap-3 rounded-xl border border-slate-200 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Сканы М-15</h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || loading}
          onClick={catalog.refresh}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Обновить список файлов
        </Button>
      </div>
      {catalog.error && (
        <p role="alert" className="text-sm text-amber-800">
          {catalog.error}
        </p>
      )}
      {loading && <p role="status">Проверяем загруженные файлы…</p>}
      <ExistingScanFiles files={stored ?? noFiles} disabled={disabled} />
      <DocumentFileInput
        singlePdf
        buttonLabel={stored?.length ? 'Заменить PDF-скан' : 'Добавить PDF-скан'}
        files={files}
        onChange={onChange}
        disabled={disabled || loading || !!catalog.error}
      />
      <p className="text-sm text-slate-500">
        {stored?.length
          ? 'Новый PDF заменит ранее загруженный скан после сохранения. При ошибке загрузки прежний файл сохранится.'
          : 'PDF-скан обязателен для сохранения М-15.'}
      </p>
    </section>
  )
}
