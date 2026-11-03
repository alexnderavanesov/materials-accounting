import { readPrintBundle } from './print-output'
import type { PrintBundle } from './print-output'
import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { PrintTemplateEditor } from './print-template-editor'
import { sampleQualityPrintData } from './quality-print-data'
import { downloadTemplate, fileBase64, PdfPreview } from './request-print-ui'
import { cellPosition, columnName, maxTemplateBytes } from './request-print'
import {
  qualityDocumentColumns,
  qualityMaterialColumns,
  qualityPrintFields,
} from './quality-print'
import type {
  QualityPrintConfig,
  QualityPrintKind,
  QualityPrintTemplate,
} from './quality-print'

const endpoint = '/api/quality-print'
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Не удалось выполнить действие.'
async function checked(response: Response) {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error ?? 'Сервер печати недоступен.')
  }
  return response
}
async function load(
  kind: QualityPrintKind,
  sample = false,
): Promise<QualityPrintTemplate> {
  return (
    await checked(
      await fetch(`${endpoint}?kind=${kind}${sample ? '&sample=1' : ''}`, {
        cache: 'no-store',
      }),
    )
  ).json()
}
const post = async (body: unknown) =>
  checked(
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
export function QualityPrintButton({
  kind,
  caseId,
  revision,
  prepare,
}: {
  kind: QualityPrintKind
  caseId: string
  revision: number
  prepare: () => Promise<string>
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [bundle, setBundle] = useState<PrintBundle | null>(null)
  async function print() {
    setBusy(true)
    setError('')
    try {
      const workspaceRevision = await prepare(),
        template = await load(kind)
      setBundle(
        await readPrintBundle(
          await post({
            action: 'print',
            format: 'bundle',
            kind,
            caseId,
            revision,
            workspaceRevision,
            templateRevision: template.revision,
          }),
        ),
      )
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-1">
      <Button variant="outline" disabled={busy} onClick={() => void print()}>
        <Printer size={15} />
        {busy ? 'Формирование…' : `Печать ${kind === 'zni' ? 'ЗНИ' : 'АВК'}`}
      </Button>
      {error && (
        <p role="alert" className="max-w-sm text-sm text-red-700">
          {error}
        </p>
      )}
      {bundle && (
        <PdfPreview
          pdf={bundle.pdf}
          excel={bundle.excel}
          pdfError={bundle.pdfError}
          name={bundle.name}
          onClose={() => setBundle(null)}
        />
      )}
    </div>
  )
}
const signatureFields = new Set([
  'signatureLine',
  'customer',
  'generalContractor',
  'contractor',
  'issuerRole',
  'issuerName',
  'customerRepresentative',
  'generalRepresentative',
  'contractorRepresentative',
  'chairmanRole',
  'chairmanName',
  'contractorRole',
  'generalRole',
  'customerRole',
  'buyer',
  'supplier',
  'manufacturer',
])
const resultFields = new Set([
  'remarks',
  'acceptedMark',
  'remarksMark',
  'rejectedMark',
  'conclusion',
  'attachments',
  'photosYes',
  'photosNo',
])
const qualityFieldGroup = (key: string) =>
  signatureFields.has(key)
    ? 'people'
    : resultFields.has(key) || key.startsWith('check')
      ? 'results'
      : 'main'
const qualityFieldGroups = [
  {
    id: 'main',
    label: 'Данные документа',
    description:
      'Номер, даты и основание берутся из ЗНИ или АВК. Одно поле можно разместить в нескольких ячейках.',
  },
  {
    id: 'people',
    label: 'Организации и подписи',
    description:
      'Участники и организации из реквизитов документа. Оставьте в Excel постоянные подписи, а для переменных данных выберите ячейки.',
  },
  {
    id: 'results',
    label: 'Результаты контроля',
    description: 'Результат, замечания и отметки из ЗНИ или АВК.',
  },
]

export function QualityPrintSettings({ kind }: { kind: QualityPrintKind }) {
  const [editorVersion, setEditorVersion] = useState(0)
  const [template, setTemplate] = useState<QualityPrintTemplate | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [pdf, setPdf] = useState<Blob | null>(null)
  useEffect(() => {
    let cancelled = false
    void load(kind)
      .then((value) => {
        if (!cancelled) setTemplate(value)
      })
      .catch((cause) => {
        if (!cancelled) setError(message(cause))
      })
    return () => {
      cancelled = true
    }
  }, [kind])
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
    }
  }
  function change(config: QualityPrintConfig) {
    if (template) {
      setTemplate({ ...template, config })
      setDirty(true)
    }
  }
  function assign(fieldId: string, address: string) {
    if (!template) return
    const config = structuredClone(template.config),
      [scope, key] = fieldId.split(':')
    if (
      scope === 'field' &&
      config.tables.some((table) => table.row === cellPosition(address).row)
    )
      return 'Данные документа разместите выше или ниже повторяемых строк таблиц.'
    for (const [field, addresses] of Object.entries(config.fields))
      config.fields[field] = addresses.filter((item) => item !== address)
    for (const table of config.tables)
      for (const [field, column] of Object.entries(table.columns))
        if (`${column}${table.row}` === address) delete table.columns[field]
    if (scope === 'field')
      config.fields[key!] = [...(config.fields[key!] ?? []), address]
    else {
      const table = config.tables.find((item) => item.kind === scope)
      if (!table) return 'Сначала включите таблицу.'
      table.columns[key!] = columnName(cellPosition(address).column)
    }
    change(config)
  }
  function remove(fieldId: string, address: string) {
    if (!template) return
    const config = structuredClone(template.config),
      [scope, key] = fieldId.split(':')
    if (scope === 'field')
      config.fields[key!] = (config.fields[key!] ?? []).filter(
        (item) => item !== address,
      )
    else {
      const table = config.tables.find((item) => item.kind === scope)
      if (table) delete table.columns[key!]
    }
    change(config)
  }
  return (
    <section className="grid min-w-0 gap-4 rounded-xl border p-4">
      <div>
        <h3 className="text-lg font-semibold">
          1. Бланк {kind === 'zni' ? 'ЗНИ' : 'АВК'}
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Готовый образец уже настроен. Чтобы изменить оформление, скачайте
          Excel, отредактируйте его и загрузите обратно.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => downloadTemplate(await load(kind, true)))
          }
        >
          Скачать образец
        </Button>
        {template && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => downloadTemplate(template)}
          >
            Скачать текущий Excel
          </Button>
        )}
        <label className="cursor-pointer rounded-lg border px-3 py-2 text-sm">
          Загрузить .xlsx
          <input
            type="file"
            aria-label={`Загрузить шаблон ${kind}`}
            accept=".xlsx"
            disabled={busy || !template}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void run(async () => {
                if (
                  !file.name.toLowerCase().endsWith('.xlsx') ||
                  file.size > maxTemplateBytes
                )
                  throw new Error('Нужен файл .xlsx размером до 5 МБ.')
                const base64 = await fileBase64(file)
                const result = (await (
                  await post({ action: 'inspect', kind, base64 })
                ).json()) as Pick<QualityPrintTemplate, 'config' | 'sheet'>
                setTemplate({
                  ...template!,
                  sheet: result.sheet,
                  config: { ...template!.config, sheetName: result.sheet.name },
                  fileName: file.name,
                  base64,
                })
                setDirty(true)
                setEditorVersion((version) => version + 1)
                setNotice(
                  'Бланк загружен. Укажите места для полей и проверьте PDF перед сохранением.',
                )
              })
            }}
          />
        </label>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setTemplate(await load(kind))
              setDirty(false)
              setEditorVersion((version) => version + 1)
              setNotice('Загружен сохранённый шаблон.')
            })
          }
        >
          Отменить изменения
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {template && (
        <fieldset disabled={busy} className="grid min-w-0 gap-4">
          <p className="text-sm text-slate-500">
            {template.fileName} · лист «{template.sheet.name}»
            {dirty ? ' · есть несохранённые изменения' : ''}
          </p>
          <PrintTemplateEditor
            key={editorVersion}
            sheet={template.sheet}
            groups={[
              ...qualityFieldGroups.map((group) => ({
                id: group.id,
                label: group.label,
                description: group.description,
                fields: Object.entries(qualityPrintFields)
                  .filter(([key]) => qualityFieldGroup(key) === group.id)
                  .map(([key, label]) => ({
                    id: `field:${key}`,
                    label,
                    example: String(
                      sampleQualityPrintData.fields[key] ?? 'Из документа',
                    ),
                    addresses: template.config.fields[key] ?? [],
                  })),
              })),
              ...(['materials', 'documents'] as const).map((tableKind) => {
                const table = template.config.tables.find(
                  (item) => item.kind === tableKind,
                )
                return {
                  id: tableKind,
                  label:
                    tableKind === 'materials'
                      ? 'Таблица материалов'
                      : 'Документы качества',
                  description:
                    tableKind === 'materials'
                      ? `Каждый материал — отдельная строка. Количество берётся ${kind === 'zni' ? 'из предъявленного по ЗНИ' : 'из принятого по ЗНИ'}.`
                      : 'Паспорта, сертификаты и другие документы — по одному в строке.',
                  table: {
                    enabled: !!table,
                    row: table?.row ?? 1,
                    onEnabledChange: (enabled: boolean) =>
                      change({
                        ...template.config,
                        tables: enabled
                          ? [
                              ...template.config.tables,
                              { kind: tableKind, row: 1, columns: {} },
                            ]
                          : template.config.tables.filter(
                              (item) => item.kind !== tableKind,
                            ),
                      }),
                    onRowChange: (row: number) =>
                      change({
                        ...template.config,
                        tables: template.config.tables.map((item) =>
                          item.kind === tableKind ? { ...item, row } : item,
                        ),
                      }),
                  },
                  fields: Object.entries(
                    tableKind === 'materials'
                      ? qualityMaterialColumns
                      : qualityDocumentColumns,
                  ).map(([key, label]) => ({
                    id: `${tableKind}:${key}`,
                    label:
                      key === 'quantity'
                        ? kind === 'zni'
                          ? 'Предъявленное количество'
                          : 'Принятое количество'
                        : key === 'accepted'
                          ? 'Принято по ЗНИ'
                          : label,
                    example: String(
                      (tableKind === 'materials'
                        ? sampleQualityPrintData.materials[0]!
                        : sampleQualityPrintData.documents[0]!)[key] ??
                        'Из документа',
                    ),
                    addresses: table?.columns[key]
                      ? [`${table.columns[key]}${table.row}`]
                      : [],
                  })),
                }
              }),
            ]}
            onAssign={assign}
            onRemove={remove}
          />
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Параметры страницы
            </summary>
            <p className="my-3 text-sm text-slate-500">
              Оформление и подписи меняйте в Excel. Один лист, без формул и
              макросов.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                Печатать ячейки от и до
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
                <span className="text-xs text-slate-500">
                  Например, A1:G38 — от A1 до G38, включая подписи.
                </span>
              </label>
              <label className="text-sm">
                Повторять заголовки на каждой странице
                <Input
                  aria-label="Повторять заголовки"
                  placeholder="Например, 1:5"
                  value={template.config.headerRows}
                  onChange={(e) =>
                    change({ ...template.config, headerRows: e.target.value })
                  }
                />
                <span className="text-xs text-slate-500">
                  1:5 — строки с 1 по 5. Можно оставить пустым.
                </span>
              </label>
            </div>
          </details>
          <div>
            <h4 className="font-semibold">
              3. Проверьте результат и сохраните
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              PDF покажет заполненный бланк на примерных данных. Изменения
              начнут действовать после сохранения.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void run(async () =>
                  setPdf(
                    await (
                      await post({
                        action: 'preview',
                        kind,
                        base64: template.base64,
                        config: template.config,
                      })
                    ).blob(),
                  ),
                )
              }
            >
              Предпросмотр PDF
            </Button>
            <Button
              disabled={!dirty}
              onClick={() =>
                void run(async () => {
                  setTemplate(
                    (await (
                      await post({
                        action: 'save',
                        kind,
                        base64: template.base64,
                        fileName: template.fileName,
                        config: template.config,
                        expectedRevision: template.revision,
                      })
                    ).json()) as QualityPrintTemplate,
                  )
                  setDirty(false)
                  setNotice('Шаблон сохранён.')
                })
              }
            >
              Сохранить шаблон
            </Button>
          </div>
        </fieldset>
      )}
      {busy && <p role="status">Обработка…</p>}
      {pdf && (
        <PdfPreview
          pdf={pdf}
          name={`Предпросмотр ${kind === 'zni' ? 'ЗНИ' : 'АВК'}`}
          onClose={() => setPdf(null)}
        />
      )}
    </section>
  )
}
