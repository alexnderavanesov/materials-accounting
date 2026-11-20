import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { WorkflowDialog } from './workflow-dialog'
import { DocumentFilePreview } from './document-file-preview'
import { loadDocumentCatalog } from './document-scans'
import { m15ScanDocumentId } from './m15-scans'
import { receiptDocumentLabel } from './receipt-documents'
import type { ReceiptDocument } from './receipt-documents'
import type { DocumentFile } from './document-registry'
import type { M15Reconciliation } from './m15-reconciliation'

export function M15DocumentPreview({
  document,
  composition,
  onClose,
  onEdit,
}: {
  document: ReceiptDocument
  composition?: M15Reconciliation
  onClose: () => void
  onEdit: () => void
}) {
  const [files, setFiles] = useState<DocumentFile[] | null>(null)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    setError('')
    setFiles(null)
    void loadDocumentCatalog(abort.signal)
      .then((catalog) => {
        if (!abort.signal.aborted)
          setFiles(
            catalog.manifest.files.filter(
              (file) => file.documentId === m15ScanDocumentId(document.id),
            ),
          )
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Не удалось открыть документ.',
          )
      })
    return () => abort.abort()
  }, [document.id, attempt])
  const showComposition = files?.length === 0 && !error
  if (files?.length)
    return (
      <DocumentFilePreview
        file={files[index]!}
        onClose={onClose}
        navigation={{ index, total: files.length, onChange: setIndex }}
      />
    )
  return (
    <WorkflowDialog
      title={receiptDocumentLabel(document)}
      compact={!showComposition}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Закрыть
          </Button>
          {showComposition && (
            <Button onClick={onEdit}>Открыть карточку М-15</Button>
          )}
        </>
      }
    >
      {error ? (
        <div role="alert">
          {error}
          <Button
            variant="outline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Повторить
          </Button>
        </div>
      ) : files === null ? (
        <p role="status">Загрузка документа…</p>
      ) : (
        <p className="text-sm text-slate-500">Скан не загружен</p>
      )}
      {showComposition && (
        <>
          <p>Шифр: {composition?.cipher || 'не указан'}</p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Материал</th>
                <th>Количество</th>
                <th>Единица</th>
              </tr>
            </thead>
            <tbody>
              {composition?.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2">{line.name}</td>
                  <td>{line.quantity.toLocaleString('ru-RU')}</td>
                  <td>{line.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </WorkflowDialog>
  )
}
