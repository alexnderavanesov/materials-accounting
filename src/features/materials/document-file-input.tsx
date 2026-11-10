import { useId, useRef, useState } from 'react'
import { FileCheck2, Plus } from 'lucide-react'

export function DocumentFileInput({
  file,
  onChange,
  disabled = false,
}: {
  file: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const errorId = useId()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  function selectFiles(files: FileList | null) {
    if (disabled || !files?.length) return
    const selected = files[0]!
    const message =
      files.length > 1
        ? 'Выберите один файл.'
        : !/\.(pdf|png|jpe?g|xlsx|docx)$/i.test(selected.name)
          ? 'Выберите PDF, PNG, JPEG, XLSX или DOCX.'
          : selected.size === 0
            ? 'Файл пуст. Выберите другой файл.'
            : selected.size > 20 * 1024 * 1024
              ? 'Максимальный размер файла — 20 МБ.'
              : ''
    setError(message)
    onChange(message ? null : selected)
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm">Файл оригинала</span>
      <input
        ref={input}
        type="file"
        className="hidden"
        aria-label="Файл оригинала"
        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx"
        disabled={disabled}
        onChange={(event) => {
          selectFiles(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={file ? 'Заменить файл оригинала' : 'Выбрать файл оригинала'}
        aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
        onClick={() => input.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault()
          if (!disabled && event.dataTransfer.types.includes('Files'))
            setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          selectFiles(event.dataTransfer.files)
        }}
        className={`flex min-h-48 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-7 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
          dragging
            ? 'border-blue-400 bg-blue-50'
            : error
              ? 'border-red-300 bg-red-50/40'
              : 'border-slate-200 bg-slate-50/70 hover:border-slate-400 hover:bg-slate-100/70'
        }`}
      >
        <span className="pointer-events-none flex size-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
          {file ? <FileCheck2 size={24} /> : <Plus size={26} />}
        </span>
        <span className="pointer-events-none grid min-w-0 max-w-full gap-1.5">
          <span className="font-medium break-words text-slate-800">
            {dragging
              ? 'Отпустите файл здесь'
              : file
                ? file.name
                : 'Выберите файл или перетащите его сюда'}
          </span>
          {file && (
            <span className="text-sm text-slate-500">
              {file.size >= 1024 * 1024
                ? `${(file.size / (1024 * 1024)).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`
                : `${Math.max(1, Math.ceil(file.size / 1024))} КБ`}
              {' · Нажмите, чтобы заменить'}
            </span>
          )}
          <span id={hintId} className="text-xs text-slate-500">
            PDF, PNG, JPEG, XLSX или DOCX · до 20 МБ
          </span>
        </span>
      </button>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
