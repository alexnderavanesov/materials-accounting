import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Download, LoaderCircle, Printer, Upload, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  cellPosition,
  cellRange,
  columnName,
  maxTemplateBytes,
  printHeaderFields,
  printLineFields,
} from './request-print'
import type {
  PrintConfig,
  PrintHeaderField,
  PrintLineField,
  PrintTemplate,
  TemplateSheet,
} from './request-print'

const RequestPrintPreview = lazy(() => import('./request-print-preview'))
const endpoint = '/api/request-print'
async function checked(response: Response) {
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(error?.error ?? 'Не удалось связаться с сервером печати.')
  }
  return response
}
export async function loadPrintTemplate(
  sample = false,
): Promise<PrintTemplate> {
  return (
    await checked(
      await fetch(`${endpoint}${sample ? '?sample=1' : ''}`, {
        cache: 'no-store',
      }),
    )
  ).json()
}
async function post(body: unknown) {
  return checked(
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить действие.'
}
function download(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
export function downloadTemplate(
  template: Pick<PrintTemplate, 'fileName' | 'base64'>,
) {
  const binary = atob(template.base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  download(url, template.fileName)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1]!)
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'))
    reader.readAsDataURL(file)
  })
}

export function PdfPreview({
  pdf,
  name,
  onClose,
}: {
  pdf: Blob
  name: string
  onClose: () => void
}) {
  const [url, setUrl] = useState('')
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const created = URL.createObjectURL(pdf)
    setUrl(created)
    close.current?.focus()
    return () => {
      URL.revokeObjectURL(created)
      previous?.focus()
    }
  }, [pdf])
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Предпросмотр PDF"
      className="fixed inset-0 z-[100] flex flex-col bg-white p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
        if (event.key === 'Tab') {
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href]',
          )
          const first = controls[0],
            last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">{name}</h2>
        <Button
          variant="outline"
          disabled={!url}
          onClick={() =>
            download(url, `${name.replace(/[\\/:*?"<>|]/g, '-')}.pdf`)
          }
        >
          <Download size={16} />
          Скачать PDF
        </Button>
        <a
          href={url || undefined}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-200 px-4 text-sm font-medium"
        >
          <Printer size={16} />
          Открыть PDF для печати
        </a>
        <Button
          ref={close}
          variant="ghost"
          size="icon"
          aria-label="Закрыть PDF"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      {url ? (
        <Suspense fallback={<p role="status">Загрузка просмотра PDF…</p>}>
          <RequestPrintPreview url={url} />
        </Suspense>
      ) : null}
    </div>
  )
}

export function RequestPrintButton({
  entryId,
  number,
  prepare,
  iconOnly = false,
}: {
  entryId: string
  number: string
  prepare: () => Promise<string>
  iconOnly?: boolean
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pdf, setPdf] = useState<Blob | null>(null)
  async function print() {
    setBusy(true)
    setError('')
    try {
      const workspaceRevision = await prepare()
      const template = await loadPrintTemplate()
      const response = await post({
        action: 'print',
        entryId,
        workspaceRevision,
        templateRevision: template.revision,
      })
      setPdf(await response.blob())
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        size={iconOnly ? 'icon' : 'default'}
        aria-label={busy ? 'Формирование…' : 'Печать'}
        title={
          iconOnly ? (busy ? 'Формирование…' : 'Печать заявки') : undefined
        }
        aria-busy={busy}
        disabled={busy}
        onClick={() => void print()}
      >
        {busy && iconOnly ? (
          <LoaderCircle size={15} className="animate-spin" />
        ) : (
          <Printer size={15} />
        )}
        {!iconOnly && (busy ? 'Формирование…' : 'Печать')}
      </Button>
      {error ? (
        <p role="alert" className="max-w-xs text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {pdf ? (
        <PdfPreview
          pdf={pdf}
          name={`Заявка ${number}`}
          onClose={() => setPdf(null)}
        />
      ) : null}
    </div>
  )
}

export function RequestPrintSettings() {
  const [template, setTemplate] = useState<PrintTemplate | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false),
    [selected, setSelected] = useState(''),
    [binding, setBinding] = useState('field:number')
  const [pdf, setPdf] = useState<Blob | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let cancelled = false
    void loadPrintTemplate()
      .then((value) => {
        if (!cancelled) setTemplate(value)
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause))
      })
    return () => {
      cancelled = true
    }
  }, [])
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  function change(config: PrintConfig) {
    if (template) {
      setTemplate({ ...template, config })
      setDirty(true)
      setNotice('')
    }
  }
  async function upload(file: File) {
    if (!template) return
    if (
      !file.name.toLowerCase().endsWith('.xlsx') ||
      file.size > maxTemplateBytes
    )
      throw new Error('Выберите файл .xlsx размером до 5 МБ.')
    const base64 = await fileBase64(file)
    const inspected = (await (
      await post({ action: 'inspect', base64 })
    ).json()) as { sheet: TemplateSheet; config: PrintConfig }
    setTemplate({
      ...template,
      base64,
      fileName: file.name,
      sheet: inspected.sheet,
      config: { ...template.config, sheetName: inspected.sheet.name },
    })
    setDirty(true)
    setSelected('')
    setNotice(
      'Файл загружен. Проверьте привязки и предпросмотр, затем сохраните шаблон.',
    )
  }
  function bind() {
    if (!template || !selected) return
    const config = template.config
    const [kind, key] = binding.split(':')
    if (kind === 'field')
      change({ ...config, fields: { ...config.fields, [key!]: selected } })
    else
      change({
        ...config,
        repeatRow: cellPosition(selected).row,
        columns: { ...config.columns, [key!]: selected.replace(/\d/g, '') },
      })
  }
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-semibold">
        Шаблоны печати → Заявка на получение
      </h3>
      <p className="mt-2 text-sm text-slate-500">
        Один общий бланк для всех заявок. Оформление и подписи меняются в Excel,
        подстановки — здесь. Поддерживается один лист без формул, макросов и
        сложных объектов.
      </p>
      {error ? (
        <p
          role="alert"
          className="my-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="my-3 text-sm text-blue-800">
          {notice}
        </p>
      ) : null}
      <div className="my-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              downloadTemplate(await loadPrintTemplate(true))
            })
          }
        >
          <Download size={15} />
          Скачать образец
        </Button>
        <Button
          variant="outline"
          disabled={busy || !template}
          onClick={() => template && downloadTemplate(template)}
        >
          Скачать текущий Excel
        </Button>
        <Button
          variant="outline"
          disabled={busy || !template}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={15} />
          Загрузить Excel
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setTemplate(await loadPrintTemplate())
              setDirty(false)
              setSelected('')
              setNotice('Загружен сохранённый шаблон.')
            })
          }
        >
          Отменить изменения
        </Button>
        <input
          ref={fileInput}
          aria-label="Файл шаблона заявки"
          className="hidden"
          type="file"
          accept=".xlsx"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void run(() => upload(file))
          }}
        />
      </div>
      {template ? (
        <>
          <p className="mb-4 text-sm text-slate-600">
            {template.fileName} · лист «{template.sheet.name}»
            {dirty ? ' · есть несохранённые изменения' : ''}
          </p>
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Строка материалов
                <Input
                  aria-label="Строка материалов"
                  type="number"
                  min={1}
                  max={200}
                  value={template.config.repeatRow}
                  onChange={(e) =>
                    change({
                      ...template.config,
                      repeatRow: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="text-sm">
                Область печати
                <Input
                  aria-label="Область печати"
                  value={template.config.printArea}
                  onChange={(e) =>
                    change({
                      ...template.config,
                      printArea: e.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
              <label className="text-sm">
                Повторять заголовки (строки)
                <Input
                  aria-label="Повторять заголовки"
                  placeholder="7:7"
                  value={template.config.headerRows}
                  onChange={(e) =>
                    change({ ...template.config, headerRows: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-2 rounded border border-blue-100 bg-blue-50/40 p-3">
              <label className="grid gap-1 text-sm">
                Поле для подстановки
                <select
                  aria-label="Поле для подстановки"
                  className="h-10 rounded border border-slate-200 bg-white px-2"
                  value={binding}
                  onChange={(e) => setBinding(e.target.value)}
                >
                  <optgroup label="Реквизиты">
                    {Object.entries(printHeaderFields).map(([key, label]) => (
                      <option key={key} value={`field:${key}`}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Материалы">
                    {Object.entries(printLineFields).map(([key, label]) => (
                      <option key={key} value={`column:${key}`}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <Button variant="outline" disabled={!selected} onClick={bind}>
                Связать с {selected || 'ячейкой'}
              </Button>
              <p className="text-xs text-slate-500">
                Выберите ячейку на листе. Для материала её строка станет
                повторяемой.
              </p>
            </div>
            <SheetGrid
              sheet={template.sheet}
              config={template.config}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 font-medium">Реквизиты — адреса ячеек</h4>
                <div className="grid gap-2">
                  {Object.entries(printHeaderFields).map(([key, label]) => (
                    <label
                      key={key}
                      className="grid grid-cols-[1fr_100px] items-center gap-2 text-sm"
                    >
                      {label}
                      <Input
                        aria-label={`Ячейка: ${label}`}
                        placeholder="Не выводить"
                        value={template.config.fields[key as PrintHeaderField]}
                        onChange={(e) =>
                          change({
                            ...template.config,
                            fields: {
                              ...template.config.fields,
                              [key]: e.target.value.toUpperCase(),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="mb-2 font-medium">Материалы — столбцы</h4>
                <div className="grid gap-2">
                  {Object.entries(printLineFields).map(([key, label]) => (
                    <label
                      key={key}
                      className="grid grid-cols-[1fr_100px] items-center gap-2 text-sm"
                    >
                      {label}
                      <Input
                        aria-label={`Столбец: ${label}`}
                        placeholder="Не выводить"
                        value={template.config.columns[key as PrintLineField]}
                        onChange={(e) =>
                          change({
                            ...template.config,
                            columns: {
                              ...template.config.columns,
                              [key]: e.target.value.toUpperCase(),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Пустая привязка отключает подстановку; сам столбец можно убрать в
              Excel. Номер и дату можно связать с одной общей ячейкой. Для
              наименования доступно общее поле с нормативным документом и
              составом. Обязательны номер, дата, наименование, ЕИ и количество.
              Альтернативные количества подставляются автоматически.
            </p>
          </fieldset>
          <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const response = await post({
                    action: 'preview',
                    base64: template.base64,
                    config: template.config,
                  })
                  setPdf(await response.blob())
                })
              }
            >
              Предпросмотр PDF
            </Button>
            <Button
              disabled={busy || !dirty}
              onClick={() =>
                void run(async () => {
                  const saved = (await (
                    await post({
                      action: 'save',
                      base64: template.base64,
                      fileName: template.fileName,
                      config: template.config,
                      expectedRevision: template.revision,
                    })
                  ).json()) as PrintTemplate
                  setTemplate(saved)
                  setDirty(false)
                  setNotice('Шаблон сохранён. Он применяется ко всем заявкам.')
                })
              }
            >
              Сохранить шаблон
            </Button>
            {busy ? (
              <span
                role="status"
                className="self-center text-sm text-slate-500"
              >
                Обработка…
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          {error
            ? 'Исправьте причину ошибки и повторите загрузку.'
            : 'Загрузка шаблона…'}
        </p>
      )}
      {pdf ? (
        <PdfPreview
          pdf={pdf}
          name="Предпросмотр заявки"
          onClose={() => setPdf(null)}
        />
      ) : null}
    </section>
  )
}

export function SheetGrid({
  sheet,
  config,
  bindings,
  selected,
  onSelect,
}: {
  sheet: TemplateSheet
  config?: PrintConfig
  bindings?: Record<string, string>
  selected: string
  onSelect: (value: string) => void
}) {
  const cells = new Map(sheet.cells.map((cell) => [cell.address, cell.text]))
  const merges = sheet.merges.map(cellRange)
  const labels = new Map<string, string>(Object.entries(bindings ?? {}))
  Object.entries(config?.fields ?? {}).forEach(([key, address]) => {
    if (address) labels.set(address, printHeaderFields[key as PrintHeaderField])
  })
  Object.entries(config?.columns ?? {}).forEach(([key, col]) => {
    if (col)
      labels.set(
        `${col}${config!.repeatRow}`,
        printLineFields[key as PrintLineField],
      )
  })
  return (
    <div
      className="max-h-80 overflow-auto rounded border border-slate-200"
      aria-label="Лист шаблона"
    >
      <table className="border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-slate-100">
          <tr>
            <th className="p-2">№</th>
            {Array.from({ length: sheet.columns }, (_, col) => (
              <th key={col} className="border px-3 py-2">
                {columnName(col + 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: sheet.rows }, (_, rowIndex) => {
            const row = rowIndex + 1
            return (
              <tr key={row}>
                <th className="border bg-slate-50 p-2">{row}</th>
                {Array.from({ length: sheet.columns }, (_cell, colIndex) => {
                  const col = colIndex + 1,
                    address = `${columnName(col)}${row}`
                  const merge = merges.find(
                    (r) =>
                      row >= r.top &&
                      row <= r.bottom &&
                      col >= r.left &&
                      col <= r.right,
                  )
                  if (merge && (merge.top !== row || merge.left !== col))
                    return null
                  return (
                    <td
                      key={address}
                      colSpan={merge ? merge.right - merge.left + 1 : 1}
                      rowSpan={merge ? merge.bottom - merge.top + 1 : 1}
                      className="border border-slate-200 p-0"
                    >
                      <button
                        type="button"
                        aria-label={`Ячейка ${address}`}
                        aria-pressed={selected === address}
                        onClick={() => onSelect(address)}
                        className={`block min-h-10 w-full min-w-24 px-2 py-1 text-left ${selected === address ? 'bg-blue-100 outline-2 outline-blue-500' : labels.has(address) ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'}`}
                      >
                        <span className="block text-[10px] text-slate-400">
                          {address}
                        </span>
                        <span className="block max-w-xl whitespace-pre-wrap">
                          {labels.get(address)
                            ? `‹${labels.get(address)}›`
                            : cells.get(address) || '\u00a0'}
                        </span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
