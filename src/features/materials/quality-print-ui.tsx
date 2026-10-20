import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  downloadTemplate,
  fileBase64,
  PdfPreview,
  SheetGrid,
} from './request-print-ui'
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
    [pdf, setPdf] = useState<Blob | null>(null)
  async function print() {
    setBusy(true)
    setError('')
    try {
      const workspaceRevision = await prepare(),
        template = await load(kind)
      setPdf(
        await (
          await post({
            action: 'print',
            kind,
            caseId,
            revision,
            workspaceRevision,
            templateRevision: template.revision,
          })
        ).blob(),
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
      {pdf && (
        <PdfPreview
          pdf={pdf}
          name={`${kind === 'zni' ? 'ЗНИ' : 'АВК'} · ревизия ${revision}`}
          onClose={() => setPdf(null)}
        />
      )}
    </div>
  )
}
export function QualityPrintSettings({ kind }: { kind: QualityPrintKind }) {
  const [template, setTemplate] = useState<QualityPrintTemplate | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [selected, setSelected] = useState(''),
    [binding, setBinding] = useState('field:number'),
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
  function bind() {
    if (!selected || !template) return
    const config = structuredClone(template.config),
      [scope, key] = binding.split(':')
    // A cell has only one source. Repeated header fields may have multiple destinations.
    for (const addresses of Object.values(config.fields)) {
      const index = addresses.indexOf(selected)
      if (index >= 0) addresses.splice(index, 1)
    }
    for (const table of config.tables)
      for (const [field, column] of Object.entries(table.columns))
        if (`${column}${table.row}` === selected) delete table.columns[field]
    if (scope === 'field')
      config.fields[key!] = [...(config.fields[key!] ?? []), selected]
    else {
      const table = config.tables.find((item) => item.kind === scope)
      if (!table) {
        setError('Сначала включите соответствующую таблицу.')
        return
      }
      if (cellPosition(selected).row !== table.row) {
        setError('Выберите ячейку в строке образца этой таблицы.')
        return
      }
      table.columns[key!] = columnName(cellPosition(selected).column)
    }
    change(config)
  }
  const bindings: Record<string, string> = {}
  if (template) {
    for (const [key, addresses] of Object.entries(template.config.fields))
      for (const address of addresses)
        bindings[address] =
          qualityPrintFields[key as keyof typeof qualityPrintFields]
    for (const table of template.config.tables)
      for (const [key, column] of Object.entries(table.columns))
        bindings[`${column}${table.row}`] = (
          table.kind === 'materials'
            ? qualityMaterialColumns
            : qualityDocumentColumns
        )[key as 'name']
  }
  return (
    <section className="grid min-w-0 gap-4 rounded-xl border p-4">
      <h3 className="text-lg font-semibold">
        Шаблон печати · {kind === 'zni' ? 'ЗНИ' : 'АВК'}
      </h3>
      <p className="text-sm text-slate-500">
        Скачайте образец, измените оформление в Excel и загрузите .xlsx.
        Выберите ячейку на листе и назначьте поле. Изменения вступят в силу
        после сохранения шаблона. Формулы не поддерживаются.
      </p>
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
                  ...result,
                  fileName: file.name,
                  base64,
                })
                setDirty(true)
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
              setSelected('')
            })
          }
        >
          Отменить изменения / загрузить сохранённое
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
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              Область печати
              <Input
                value={template.config.printArea}
                onChange={(e) =>
                  change({
                    ...template.config,
                    printArea: e.target.value.toUpperCase(),
                  })
                }
              />
            </label>
            <label>
              Повторяемые строки заголовка
              <Input
                placeholder="Например 1:5; можно оставить пустым"
                value={template.config.headerRows}
                onChange={(e) =>
                  change({ ...template.config, headerRows: e.target.value })
                }
              />
            </label>
          </div>
          <SheetGrid
            sheet={template.sheet}
            bindings={bindings}
            selected={selected}
            onSelect={setSelected}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span>Ячейка: {selected || 'не выбрана'}</span>
            <select
              aria-label="Поле для подстановки"
              className="rounded-lg border p-2"
              value={binding}
              onChange={(e) => setBinding(e.target.value)}
            >
              <optgroup label="Реквизиты документа">
                {Object.entries(qualityPrintFields).map(([key, label]) => (
                  <option key={key} value={`field:${key}`}>
                    {label}
                  </option>
                ))}
              </optgroup>
              {template.config.tables.map((table) => (
                <optgroup
                  key={table.kind}
                  label={
                    table.kind === 'materials'
                      ? 'Материалы'
                      : 'Документы качества'
                  }
                >
                  {Object.entries(
                    table.kind === 'materials'
                      ? qualityMaterialColumns
                      : qualityDocumentColumns,
                  ).map(([key, label]) => (
                    <option key={key} value={`${table.kind}:${key}`}>
                      {label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Button variant="outline" disabled={!selected} onClick={bind}>
              Привязать ячейку
            </Button>
            <Button
              variant="ghost"
              disabled={!selected}
              onClick={() => {
                const config = structuredClone(template.config)
                for (const [key, addresses] of Object.entries(config.fields))
                  config.fields[key] = addresses.filter(
                    (address) => address !== selected,
                  )
                for (const table of config.tables)
                  for (const [key, column] of Object.entries(table.columns))
                    if (`${column}${table.row}` === selected)
                      delete table.columns[key]
                change(config)
              }}
            >
              Убрать привязку
            </Button>
          </div>
          {(['materials', 'documents'] as const).map((tableKind) => {
            const table = template.config.tables.find(
              (item) => item.kind === tableKind,
            )
            return (
              <div
                className="flex flex-wrap items-center gap-3"
                key={tableKind}
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!table}
                    onChange={(e) =>
                      change({
                        ...template.config,
                        tables: e.target.checked
                          ? [
                              ...template.config.tables,
                              { kind: tableKind, row: 1, columns: {} },
                            ]
                          : template.config.tables.filter(
                              (item) => item.kind !== tableKind,
                            ),
                      })
                    }
                  />
                  {tableKind === 'materials'
                    ? 'Таблица материалов'
                    : 'Таблица документов качества'}
                </label>
                {table && (
                  <label className="flex items-center gap-2">
                    Строка образца
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      className="w-24"
                      value={table.row}
                      onChange={(e) =>
                        change({
                          ...template.config,
                          tables: template.config.tables.map((item) =>
                            item.kind === tableKind
                              ? { ...item, row: Number(e.target.value) }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                )}
              </div>
            )
          })}
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
