import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Paperclip, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { DocumentFileInput } from './document-file-input'
import { DocumentFilePreview } from './document-file-preview'
import { documentFileSelectionError } from './document-file-limits'
import type { DocumentFile } from './document-registry'
import type { ScanSelection } from './document-scans'

export function ScanPaperclip({
  label,
  count,
  pending = 0,
  onClick,
  disabled = false,
}: {
  label: string
  count: number
  pending?: number
  onClick: () => void
  disabled?: boolean
}) {
  const hint = `${label}: ${count ? `загружено файлов — ${count}` : 'нет загруженных файлов'}${pending ? `, выбрано — ${pending}` : ''}`
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      disabled={disabled}
      title={hint}
      aria-label={`Сканы: ${label}`}
      onClick={onClick}
      className={`relative h-10 w-10 shrink-0 ${count ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'text-slate-400'}`}
    >
      <Paperclip size={18} />
      {pending > 0 && (
        <span className="absolute -right-1 -top-1 rounded-full bg-blue-600 px-1 text-[10px] text-white">
          {pending}
        </span>
      )}
    </Button>
  )
}

export function ExistingScanFiles({ files }: { files: DocumentFile[] }) {
  const [preview, setPreview] = useState<DocumentFile | null>(null)
  return (
    <>
      {files.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Ранее загружено: {files.length}</p>
          <ul className="grid max-h-48 gap-1 overflow-auto">
            {files.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md bg-slate-50 p-2 text-left text-sm text-blue-700 hover:bg-slate-100"
                  onClick={() => setPreview(file)}
                  aria-label={`Посмотреть: ${file.name}`}
                >
                  <Eye size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 break-words">
                    {file.name}
                  </span>
                  <span className="shrink-0">Посмотреть</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview && (
        <DocumentFilePreview file={preview} onClose={() => setPreview(null)} />
      )}
    </>
  )
}

export function ScanReplacementChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: 'replace' | 'keep' | null
  onChange: (value: 'replace' | 'keep') => void
  disabled?: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Повторная загрузка"
      className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
    >
      <p>
        У этого документа уже есть загруженные файлы. Заменить их или оставить
        несколько?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          variant={value === 'replace' ? 'default' : 'outline'}
          aria-pressed={value === 'replace'}
          onClick={() => onChange('replace')}
        >
          Заменить
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          variant={value === 'keep' ? 'default' : 'outline'}
          aria-pressed={value === 'keep'}
          onClick={() => onChange('keep')}
        >
          Оставить несколько
        </Button>
      </div>
      {value === 'replace' && (
        <p>
          Все ранее загруженные файлы этого документа будут заменены выбранными
          после успешной загрузки.
        </p>
      )}
    </div>
  )
}

export function DocumentScanDialog({
  label,
  stored,
  initial,
  loading,
  error,
  requirement = '',
  onRefresh,
  onConfirm,
  onClose,
}: {
  label: string
  stored: DocumentFile[]
  initial?: ScanSelection
  loading: boolean
  error: string
  requirement?: string
  onRefresh: () => void
  onConfirm: (selection: ScanSelection) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [files, setFiles] = useState(initial?.files ?? [])
  const [choice, setChoice] = useState<'replace' | 'keep' | null>(null)
  const signature = stored
    .map((file) => file.id)
    .sort()
    .join(',')
  useEffect(() => {
    setChoice(null)
  }, [signature])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.showModal()
    return () => previous?.focus()
  }, [])
  return createPortal(
    <dialog
      ref={ref}
      aria-label={`Сканы: ${label}`}
      className="m-auto max-h-[90dvh] w-[min(620px,96vw)] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
    >
      <div className="flex max-h-[90dvh] flex-col">
        <header className="flex items-center gap-3 border-b p-4">
          <h2 className="min-w-0 flex-1 break-words font-semibold">{label}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Закрыть сканы"
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        </header>
        <div className="grid gap-4 overflow-auto p-4">
          {requirement && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {requirement}
            </p>
          )}
          {loading && <p role="status">Проверяем загруженные файлы…</p>}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <ExistingScanFiles files={stored} />
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={onRefresh}
          >
            Обновить список файлов
          </Button>
          <DocumentFileInput
            files={files}
            onChange={setFiles}
            disabled={loading || !!error || !!requirement}
          />
          {!!stored.length && !!files.length && (
            <ScanReplacementChoice value={choice} onChange={setChoice} />
          )}
          <p className="text-xs text-slate-500">
            Файлы появятся во вкладке «Документы» после сохранения получения, с
            привязкой к этому документу и его материалам.
          </p>
        </div>
        <footer className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={
              loading ||
              !!error ||
              !!requirement ||
              !!documentFileSelectionError(files) ||
              (!!stored.length && !!files.length && !choice)
            }
            onClick={() =>
              onConfirm({
                files,
                expectedFileIds: stored.map((file) => file.id),
                replace: choice === 'replace',
              })
            }
          >
            {files.length ? `Прикрепить (${files.length})` : 'Готово'}
          </Button>
        </footer>
      </div>
    </dialog>,
    document.body,
  )
}
