import { useId, useRef, useState } from 'react'
import { FileCheck2, Plus, X } from 'lucide-react'
import { documentFileSelectionError } from './document-file-limits'

const fileKey = (file: File) =>
  JSON.stringify([file.name, file.size, file.lastModified])
const fileSize = (size: number) =>
  size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`
    : `${Math.ceil(size / 1024)} КБ`

export function DocumentFileInput({
  files,
  onChange,
  disabled = false,
}: {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const errorId = useId()
  const [dragging, setDragging] = useState(false)
  const error = documentFileSelectionError(files)

  function selectFiles(selected: FileList | null) {
    if (disabled || !selected?.length) return
    const combined = new Map(files.map((file) => [fileKey(file), file]))
    for (const file of Array.from(selected)) combined.set(fileKey(file), file)
    onChange([...combined.values()])
  }

  return (
    <div className="grid gap-3">
      <span className="text-sm">Файлы оригиналов</span>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-label="Файлы оригиналов"
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
        aria-label={
          files.length
            ? 'Добавить файлы оригиналов'
            : 'Выбрать файлы оригиналов'
        }
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
        className={`flex min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50/70 hover:border-slate-400 hover:bg-slate-100/70'}`}
      >
        <span className="pointer-events-none flex size-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
          <Plus size={26} />
        </span>
        <span className="pointer-events-none grid gap-1.5">
          <span className="font-medium text-slate-800">
            {dragging
              ? 'Отпустите файлы здесь'
              : files.length
                ? 'Добавьте ещё файлы или перетащите их сюда'
                : 'Выберите файлы или перетащите их сюда'}
          </span>
          <span id={hintId} className="text-xs text-slate-500">
            PDF, PNG, JPEG, XLSX или DOCX · до 20 МБ каждый · до 50 файлов и 100
            МБ за раз
          </span>
        </span>
      </button>
      {files.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
            <span>
              Выбрано файлов: {files.length} ·{' '}
              {fileSize(files.reduce((sum, file) => sum + file.size, 0))}
            </span>
            <button
              type="button"
              className="shrink-0 hover:underline disabled:opacity-50"
              disabled={disabled}
              onClick={() => onChange([])}
            >
              Убрать все
            </button>
          </div>
          <ul className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {files.map((file) => (
              <li
                key={fileKey(file)}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <FileCheck2 size={18} className="shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 break-words">{file.name}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {fileSize(file.size)}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  className="shrink-0 rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                  aria-label={`Убрать файл: ${file.name}`}
                  onClick={() =>
                    onChange(files.filter((item) => item !== file))
                  }
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
