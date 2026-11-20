import { Button } from '#/components/ui/button'
import { useEffect, useState } from 'react'
import { DocumentFileInput } from './document-file-input'
import {
  ExistingScanFiles,
  ScanReplacementChoice,
} from './document-scan-picker'
import { loadDocumentCatalog, uploadDocumentScans } from './document-scans'
import type { DocumentFile } from './document-registry'
import type { ScanSelection } from './document-scans'

export const m15ScanDocumentId = (id: string) =>
  JSON.stringify(['receipt-document', id])
export async function uploadM15Scans(
  id: string,
  files: File[],
  policy: Omit<ScanSelection, 'files'>,
) {
  await uploadDocumentScans(m15ScanDocumentId(id), { ...policy, files })
}
export function M15Scans({
  documentId,
  saved,
  revision,
  files,
  onChange,
  policy,
  onPolicyChange,
  disabled,
}: {
  documentId: string
  saved: boolean
  revision: number
  files: File[]
  onChange: (files: File[]) => void
  policy: Omit<ScanSelection, 'files'> | null
  onPolicyChange: (policy: Omit<ScanSelection, 'files'> | null) => void
  disabled?: boolean
}) {
  const [stored, setStored] = useState<DocumentFile[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(saved)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!saved) {
      onPolicyChange({ expectedFileIds: [], replace: false })
      return
    }
    const abort = new AbortController()
    setError('')
    setLoading(true)
    onPolicyChange(null)
    void loadDocumentCatalog(abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) {
          const existingFiles = value.manifest.files.filter(
            (file) => file.documentId === m15ScanDocumentId(documentId),
          )
          setStored(existingFiles)
          setLoading(false)
          onPolicyChange(
            existingFiles.length
              ? null
              : { expectedFileIds: [], replace: false },
          )
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setLoading(false)
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Не удалось прочитать сканы.',
          )
      })
    return () => abort.abort()
  }, [documentId, saved, revision, onPolicyChange, attempt])
  return (
    <section
      aria-label="Сканы М-15"
      className="grid gap-3 rounded-xl border border-slate-200 p-3"
    >
      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}
        </p>
      )}
      {loading && <p role="status">Проверяем загруженные файлы…</p>}
      <ExistingScanFiles files={stored} />
      {saved && (
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || loading}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Обновить список файлов
        </Button>
      )}
      <DocumentFileInput
        files={files}
        onChange={onChange}
        disabled={disabled || loading || !!error}
      />
      {!!stored.length && !!files.length && (
        <ScanReplacementChoice
          value={policy ? (policy.replace ? 'replace' : 'keep') : null}
          disabled={disabled || loading}
          onChange={(choice) =>
            onPolicyChange({
              expectedFileIds: stored.map((file) => file.id),
              replace: choice === 'replace',
            })
          }
        />
      )}
    </section>
  )
}
