import { useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { WorkflowDialog } from './workflow-dialog'
import { ExistingScanFiles } from './document-scan-picker'
import { DocumentFilePreview } from './document-file-preview'
import { uploadM15Scans, useM15ScanCatalog } from './m15-scans'
import { DocumentFileInput } from './document-file-input'
import { m15FileSelectionError } from './document-file-limits'
import { receiptDocumentLabel } from './receipt-documents'
import type { ReceiptDocument } from './receipt-documents'
import type { M15Reconciliation } from './m15-reconciliation'

export function M15DocumentPreview({
  document,
  composition,
  chooseFile,
  onClose,
  onEdit,
}: {
  document: ReceiptDocument
  composition?: M15Reconciliation
  chooseFile: boolean
  onClose: () => void
  onEdit: () => void
}) {
  const { files, error, refresh } = useM15ScanCatalog(document.id)
  const [index, setIndex] = useState(0)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [notice, setNotice] = useState('')
  const uploadInFlight = useRef(false)
  const busy = uploading
  async function upload() {
    if (
      uploadInFlight.current ||
      files === null ||
      error ||
      !selectedFiles.length
    )
      return
    uploadInFlight.current = true
    setUploading(true)
    setUploadError('')
    setNotice('')
    try {
      await uploadM15Scans(document.id, selectedFiles, {
        expectedFileIds: files.map((file) => file.id),
        replace: true,
      })
      setSelectedFiles([])
      setNotice('PDF-скан сохранён.')
      refresh()
    } catch (cause) {
      setUploadError(
        cause instanceof Error
          ? cause.message
          : 'Не удалось добавить документы.',
      )
    } finally {
      uploadInFlight.current = false
      setUploading(false)
    }
  }
  const showComposition = files?.length === 0 && !error
  if (!chooseFile && files?.length)
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
      busy={busy}
      dirty={selectedFiles.length > 0}
      compact={!showComposition}
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="outline" disabled={busy} onClick={close}>
            Закрыть
          </Button>
          {showComposition && (
            <Button
              disabled={busy || selectedFiles.length > 0}
              onClick={onEdit}
            >
              Открыть карточку М-15
            </Button>
          )}
          {selectedFiles.length > 0 && (
            <Button
              disabled={
                busy ||
                files === null ||
                !!error ||
                !!m15FileSelectionError(selectedFiles)
              }
              onClick={() => void upload()}
            >
              {uploading
                ? 'Загрузка…'
                : files?.length
                  ? 'Заменить скан'
                  : 'Загрузить скан'}
            </Button>
          )}
        </>
      )}
    >
      {error && (
        <div role="alert">
          {error}
          <Button variant="outline" onClick={refresh}>
            Повторить
          </Button>
        </div>
      )}
      {files === null ? (
        !error && <p role="status">Загрузка документа…</p>
      ) : files.length ? (
        <ExistingScanFiles files={files} disabled={busy} />
      ) : (
        <p className="text-sm text-slate-500">Скан не загружен</p>
      )}
      <div className="mt-4 grid gap-3">
        <DocumentFileInput
          compact
          singlePdf
          buttonLabel={
            files?.length ? 'Заменить PDF-скан' : 'Добавить PDF-скан'
          }
          files={selectedFiles}
          disabled={busy || files === null || !!error}
          onChange={(next) => {
            setSelectedFiles(next)
            setUploadError('')
            setNotice('')
          }}
        />
        {selectedFiles.length > 0 && (
          <p className="text-xs text-slate-500">
            Для М-15 хранится один PDF. Новый скан заменит ранее загруженные
            файлы; при ошибке загрузки прежние файлы сохранятся.
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-emerald-700">
            {notice}
          </p>
        )}
        {uploadError && (
          <div role="alert" className="grid gap-2 text-sm text-red-700">
            {uploadError}
            <Button
              variant="outline"
              disabled={busy || files === null}
              onClick={refresh}
            >
              Обновить список файлов
            </Button>
          </div>
        )}
      </div>
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
