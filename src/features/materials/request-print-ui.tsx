import { createPortal } from 'react-dom'
import { readPrintBundle } from './print-output'
import type { PrintBundle } from './print-output'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Download, LoaderCircle, Printer, Upload, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { PrintTemplateEditor } from './print-template-editor'
import {
  cellPosition,
  maxTemplateBytes,
  printHeaderFields,
  printLineFields,
  samplePrintData,
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
  excel,
  pdfError,
  onClose,
}: {
  pdf: Blob | null
  excel?: Blob
  pdfError?: string
  name: string
  onClose: () => void
}) {
  const [url, setUrl] = useState('')
  const [excelUrl, setExcelUrl] = useState('')
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const created = pdf ? URL.createObjectURL(pdf) : ''
    const workbookUrl = excel ? URL.createObjectURL(excel) : ''
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setUrl(created)
    setExcelUrl(workbookUrl)
    close.current?.focus()
    return () => {
      if (created) URL.revokeObjectURL(created)
      if (workbookUrl) URL.revokeObjectURL(workbookUrl)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [pdf, excel])
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Предпросмотр PDF"
        className="flex h-[calc(100dvh-2rem)] max-h-[1100px] w-full max-w-7xl flex-col overflow-hidden rounded-xl border bg-white p-4 shadow-xl"
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
          {excel && (
            <Button
              variant="outline"
              disabled={!excelUrl}
              onClick={() =>
                download(excelUrl, `${name.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`)
              }
            >
              <Download size={16} />
              Скачать Excel
            </Button>
          )}
          {url && (
            <a
              href={url || undefined}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-200 px-4 text-sm font-medium"
            >
              <Printer size={16} />
              Открыть PDF для печати
            </a>
          )}
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
        {pdfError && (
          <p
            role="alert"
            className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900"
          >
            {pdfError} Excel доступен для скачивания.
          </p>
        )}
        {url ? (
          <Suspense fallback={<p role="status">Загрузка просмотра PDF…</p>}>
            <RequestPrintPreview url={url} />
          </Suspense>
        ) : null}
      </div>
    </div>,
    document.body,
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
    [bundle, setBundle] = useState<PrintBundle | null>(null)
  async function print() {
    setBusy(true)
    setError('')
    try {
      const workspaceRevision = await prepare()
      const template = await loadPrintTemplate()
      const response = await post({
        action: 'print',
        format: 'bundle',
        entryId,
        workspaceRevision,
        templateRevision: template.revision,
      })
      setBundle(await readPrintBundle(response))
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
      {bundle ? (
        <PdfPreview
          pdf={bundle.pdf}
          excel={bundle.excel}
          pdfError={bundle.pdfError}
          name={bundle.name || `Заявка ${number}`}
          onClose={() => setBundle(null)}
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
  const [dirty, setDirty] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
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
    setEditorVersion((version) => version + 1)
    setNotice(
      'Бланк загружен. Если вы перемещали ячейки, укажите для полей новые места. Затем проверьте PDF.',
    )
  }
  function assign(fieldId: string, address: string) {
    if (!template) return
    const config = structuredClone(template.config)
    const [scope, key] = fieldId.split(':')
    if (scope === 'field' && cellPosition(address).row === config.repeatRow)
      return 'Данные заявки разместите выше или ниже строки материалов.'
    for (const field of Object.keys(config.fields) as Array<PrintHeaderField>)
      if (config.fields[field] === address) config.fields[field] = ''
    for (const field of Object.keys(config.columns) as Array<PrintLineField>)
      if (`${config.columns[field]}${config.repeatRow}` === address)
        config.columns[field] = ''
    if (scope === 'field') config.fields[key as PrintHeaderField] = address
    else config.columns[key as PrintLineField] = address.replace(/\d/g, '')
    change(config)
  }
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-semibold">1. Бланк заявки</h3>
      <p className="mt-2 text-sm text-slate-500">
        Готовый образец уже настроен. Можно сразу посмотреть PDF. Чтобы изменить
        оформление, скачайте Excel, отредактируйте его и загрузите обратно.
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
              setEditorVersion((version) => version + 1)
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
            <PrintTemplateEditor
              key={editorVersion}
              sheet={template.sheet}
              groups={[
                {
                  id: 'fields',
                  label: 'Данные заявки',
                  description:
                    'Заполняются один раз: номер, дата, заявитель и другие данные всей заявки.',
                  fields: Object.entries(printHeaderFields).map(
                    ([key, label]) => ({
                      id: `field:${key}`,
                      label,
                      example:
                        key === 'numberAndDate'
                          ? 'Заявка № ЗП-2026-0001 от 16.10.2026'
                          : samplePrintData.headers[
                              key as Exclude<PrintHeaderField, 'numberAndDate'>
                            ],
                      addresses: template.config.fields[key as PrintHeaderField]
                        ? [template.config.fields[key as PrintHeaderField]]
                        : [],
                    }),
                  ),
                },
                {
                  id: 'materials',
                  label: 'Таблица материалов',
                  description:
                    'Выберите место для каждого значения в первой строке материала. Не выбирайте заголовок столбца.',
                  table: {
                    enabled: true,
                    row: template.config.repeatRow,
                    onRowChange: (repeatRow) =>
                      change({ ...template.config, repeatRow }),
                  },
                  fields: Object.entries(printLineFields).map(
                    ([key, label]) => ({
                      id: `column:${key}`,
                      label:
                        (
                          {
                            unit: 'Единица измерения',
                            altUnit: 'Альтернативная единица',
                            altQuantity: 'Альтернативное количество',
                          } as Record<string, string>
                        )[key] ?? label,
                      example:
                        key === 'nameWithDetails'
                          ? 'Отвод 108×4, ГОСТ 17375-2001, 09Г2С'
                          : String(
                              samplePrintData.rows[0]![
                                key as Exclude<
                                  PrintLineField,
                                  'nameWithDetails'
                                >
                              ] ?? '',
                            ),
                      addresses: template.config.columns[key as PrintLineField]
                        ? [
                            `${template.config.columns[key as PrintLineField]}${template.config.repeatRow}`,
                          ]
                        : [],
                    }),
                  ),
                },
              ]}
              onAssign={assign}
              onRemove={(fieldId) => {
                const [scope, key] = fieldId.split(':')
                change(
                  scope === 'field'
                    ? {
                        ...template.config,
                        fields: { ...template.config.fields, [key!]: '' },
                      }
                    : {
                        ...template.config,
                        columns: { ...template.config.columns, [key!]: '' },
                      },
                )
              }}
            />
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Параметры страницы
              </summary>
              <p className="my-3 text-sm text-slate-500">
                Оформление, ширину столбцов и подписи меняйте в Excel. Один
                лист, без формул и макросов.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Печатать ячейки от и до
                  <Input
                    aria-label="Область печати"
                    placeholder="A1:I13"
                    value={template.config.printArea}
                    onChange={(e) =>
                      change({
                        ...template.config,
                        printArea: e.target.value.toUpperCase(),
                      })
                    }
                  />
                  <span className="text-xs text-slate-500">
                    Например, A1:I13 — от A1 до I13, включая подписи.
                  </span>
                </label>
                <label className="text-sm">
                  Повторять заголовки на каждой странице
                  <Input
                    aria-label="Повторять заголовки"
                    placeholder="7:7"
                    value={template.config.headerRows}
                    onChange={(e) =>
                      change({ ...template.config, headerRows: e.target.value })
                    }
                  />
                  <span className="text-xs text-slate-500">
                    7:7 — только строка 7; 6:7 — две строки. Можно оставить
                    пустым.
                  </span>
                </label>
              </div>
            </details>
          </fieldset>
          <h4 className="mt-5 font-semibold">
            3. Проверьте результат и сохраните
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            PDF покажет заполненный бланк на примерных данных. Изменения начнут
            действовать после сохранения.
          </p>
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
