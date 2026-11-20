import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AppSelect } from '#/components/ui/app-select'
import {
  downloadM15ImportTemplate,
  findM15Template,
  guessM15Columns,
  m15ImportRows,
  mergeM15Import,
  readM15Workbook,
  validateM15Import,
} from './m15-import'
import type { M15ImportColumns, M15ImportRow, M15Sheet } from './m15-import'
import type { M15Line, M15Reconciliation } from './m15-reconciliation'

export default function M15ImportPanel({
  value,
  materials = value.lines,
  onApply,
  onCancel,
}: {
  value: M15Reconciliation
  materials?: ReadonlyArray<Pick<M15Line, 'name' | 'unit'>>
  onApply: (value: M15Reconciliation) => void
  onCancel: () => void
}) {
  const [sheets, setSheets] = useState<M15Sheet[]>([]),
    [sheetIndex, setSheetIndex] = useState(0),
    [header, setHeader] = useState(1)
  const [columns, setColumns] = useState<M15ImportColumns>({
    name: -1,
    unit: -1,
    quantity: -1,
    position: -1,
  })
  const [rows, setRows] = useState<M15ImportRow[] | null>(null),
    [page, setPage] = useState(0),
    [changePage, setChangePage] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [filename, setFilename] = useState(''),
    [confirm, setConfirm] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [templateMode, setTemplateMode] = useState(false)
  const generation = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const sheet = sheets[sheetIndex]
  const problems = useMemo(() => (rows ? validateM15Import(rows) : []), [rows])
  const merged = useMemo(
    () => (rows && !problems.length ? mergeM15Import(value, rows) : null),
    [value, rows, problems],
  )
  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )
  function reset(nextSheets: M15Sheet[], index: number, line: number) {
    setSheets(nextSheets)
    setSheetIndex(index)
    setHeader(line)
    setColumns(guessM15Columns(nextSheets[index]?.rows[line - 1] ?? []))
    setRows(null)
    setTemplateMode(false)
    setError('')
    setConfirm(false)
    setPage(0)
    setChangePage(0)
  }
  async function read(file: File) {
    const current = ++generation.current
    setBusy(true)
    setFilename(file.name)
    setSheets([])
    setSettingsOpen(false)
    setRows(null)
    setError('')
    setConfirm(false)
    try {
      if (!/\.xlsx?$/i.test(file.name))
        throw new Error('Выберите Excel в формате .xlsx или .xls.')
      if (file.size > 20 * 1024 * 1024)
        throw new Error('Размер Excel должен быть не больше 20 МБ.')
      const next = readM15Workbook(await file.arrayBuffer())
      if (current !== generation.current) return
      if (!next.length) throw new Error('В файле нет листов.')
      const template = findM15Template(next)
      if (template) {
        reset(next, template.sheetIndex, template.headerRow)
        const imported = m15ImportRows(
          next[template.sheetIndex]!,
          template.headerRow,
          template.columns,
        ).filter(
          (row) =>
            !['linked', 'independent'].includes(value.mode ?? '') ||
            row.quantity !== '',
        )
        if (!imported.length)
          throw new Error(
            'Заполните количество хотя бы для одного материала в шаблоне.',
          )
        if (!validateM15Import(imported).length) {
          // This updates only the editor draft. Persistence remains an explicit save.
          onApply(mergeM15Import(value, imported).value)
          return
        }
        setTemplateMode(true)
        setRows(imported)
      } else {
        reset(next, 0, 1)
        setSettingsOpen(true)
      }
    } catch (cause) {
      if (current === generation.current) {
        setSheets([])
        setError(
          cause instanceof Error
            ? cause.message
            : 'Не удалось прочитать Excel.',
        )
      }
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  function edit(index: number, patch: Partial<M15ImportRow>) {
    setRows((current) =>
      current!.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
    setConfirm(false)
  }
  return (
    <div
      className="grid gap-4 rounded-lg border bg-stone-50 p-4"
      aria-label="Импорт состава М-15"
    >
      <h3 className="font-semibold">Импорт состава М-15 из Excel</h3>

      <label className="grid gap-1 text-sm">
        Файл Excel
        <input
          ref={fileInput}
          hidden
          aria-label="Файл Excel М-15"
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void read(file)
            event.target.value = ''
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          Выбрать Excel
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            try {
              downloadM15ImportTemplate(materials)
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Не удалось скачать шаблон.',
              )
            }
          }}
        >
          <Download size={16} />
          Скачать шаблон
        </Button>
        <span className="text-sm text-slate-500">
          {filename || 'Файл не выбран'}
        </span>
      </div>
      {busy && <p role="status">Чтение Excel…</p>}
      {sheet && (
        <div className="grid gap-3">
          <Button
            variant="ghost"
            className="justify-self-start"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            Настройки чтения файла
          </Button>
          {settingsOpen && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1 text-sm">
                  <span>Лист Excel</span>
                  <AppSelect
                    label="Лист Excel"
                    value={String(sheetIndex)}
                    options={sheets.map((item, i) => ({
                      value: String(i),
                      label: item.name,
                    }))}
                    onChange={(index) => reset(sheets, Number(index), 1)}
                  />
                </div>
                <label className="grid gap-1 text-sm">
                  Строка заголовков
                  <Input
                    aria-label="Строка заголовков"
                    type="number"
                    min={1}
                    max={sheet.rows.length}
                    value={header}
                    onChange={(event) =>
                      reset(sheets, sheetIndex, Number(event.target.value))
                    }
                  />
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <tbody>
                    {sheet.rows
                      .slice(Math.max(0, header - 1), header + 3)
                      .map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td
                              className="max-w-52 truncate border bg-white p-2"
                              key={j}
                              title={cell}
                            >
                              {cell || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ['name', 'Наименование'],
                    ['unit', 'Единица'],
                    ['quantity', 'Количество по М-15'],
                    ['position', 'Номер позиции'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="grid gap-1 text-sm">
                    <span>{label}</span>
                    <AppSelect
                      label={`Столбец: ${label}`}
                      value={String(columns[key])}
                      options={[
                        {
                          value: '-1',
                          label:
                            key === 'position'
                              ? 'Не указан'
                              : 'Выберите столбец',
                        },
                        ...(sheet.rows[header - 1] ?? []).map((name, i) => ({
                          value: String(i),
                          label: `${i + 1}. ${name || 'Без заголовка'}`,
                        })),
                      ]}
                      onChange={(next) => {
                        setColumns((current) => ({
                          ...current,
                          [key]: Number(next),
                        }))
                        setRows(null)
                        setConfirm(false)
                      }}
                    />
                  </div>
                ))}
              </div>
              <Button
                className="justify-self-start"
                variant="outline"
                onClick={() => {
                  try {
                    setRows(m15ImportRows(sheet, header, columns))
                    setPage(0)
                    setError('')
                    setConfirm(false)
                    setSettingsOpen(false)
                  } catch (cause) {
                    setError((cause as Error).message)
                  }
                }}
              >
                Предпросмотр импорта
              </Button>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {rows && (
        <>
          <p className="text-sm">Файл прочитан · Позиций: {rows.length}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <colgroup>
                <col className="w-24" />
                <col className="w-24" />
                <col />
                <col className="w-24" />
                <col className="w-32" />
                <col className="w-20" />
              </colgroup>
              <thead>
                <tr>
                  {[
                    'Строка Excel',
                    'Позиция',
                    'Наименование',
                    'Единица',
                    'Количество',
                    '',
                  ].map((name, i) => (
                    <th className="p-2" key={i}>
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 25, (page + 1) * 25).map((row, i) => {
                  const index = page * 25 + i
                  return (
                    <tr key={row.sourceRow}>
                      <td className="p-2">{row.sourceRow}</td>
                      {(['position', 'name', 'unit', 'quantity'] as const).map(
                        (field) => (
                          <td key={field} className="p-1">
                            <Input
                              aria-label={`${field} строки Excel ${row.sourceRow}`}
                              value={row[field]}
                              onChange={(event) =>
                                edit(index, { [field]: event.target.value })
                              }
                            />
                          </td>
                        ),
                      )}
                      <td>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setRows((current) =>
                              current!.filter((_, n) => n !== index),
                            )
                            setConfirm(false)
                            setPage(0)
                          }}
                        >
                          Убрать
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 25 && (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Назад
              </Button>
              <span>
                {page + 1} / {Math.ceil(rows.length / 25)}
              </span>
              <Button
                variant="outline"
                disabled={(page + 1) * 25 >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                Далее
              </Button>
            </div>
          )}
          {!!problems.length && (
            <div role="alert" className="text-sm text-red-700">
              {problems.slice(0, 8).map((message) => (
                <p key={message}>{message}</p>
              ))}
              {problems.length > 8 && <p>Ещё ошибок: {problems.length - 8}</p>}
            </div>
          )}
          {merged && (
            <p className="text-sm">
              Без изменений: {merged.preserved} · Новых или изменённых:{' '}
              {merged.changed} · Удаляется: {merged.removed}
            </p>
          )}
          {merged && merged.changes.length > 0 && (
            <details className="rounded border bg-white p-3 text-sm">
              <summary className="cursor-pointer">
                Что изменится · {merged.changes.length}
              </summary>
              <div className="mt-3 grid max-h-64 gap-2 overflow-auto">
                {merged.changes
                  .slice(
                    Math.min(
                      changePage,
                      Math.ceil(merged.changes.length / 25) - 1,
                    ) * 25,
                    (Math.min(
                      changePage,
                      Math.ceil(merged.changes.length / 25) - 1,
                    ) +
                      1) *
                      25,
                  )
                  .map((change, i) => (
                    <div
                      className="grid gap-1 border-t pt-2 sm:grid-cols-2"
                      key={i}
                    >
                      <p>
                        <span className="text-slate-500">Было: </span>
                        {change.before
                          ? `${change.before.position}. ${change.before.name} · ${change.before.quantity} ${change.before.unit}`
                          : 'Новая позиция'}
                      </p>
                      <p>
                        <span className="text-slate-500">Будет: </span>
                        {change.after
                          ? `${change.after.position}. ${change.after.name} · ${change.after.quantity} ${change.after.unit}`
                          : 'Строка удаляется'}
                      </p>
                    </div>
                  ))}
              </div>
              {merged.changes.length > 25 && (
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    disabled={changePage === 0}
                    onClick={() => setChangePage(changePage - 1)}
                  >
                    Предыдущие изменения
                  </Button>
                  <Button
                    variant="outline"
                    disabled={(changePage + 1) * 25 >= merged.changes.length}
                    onClick={() => setChangePage(changePage + 1)}
                  >
                    Следующие изменения
                  </Button>
                </div>
              )}
            </details>
          )}
          {!templateMode &&
            merged &&
            (merged.replacesQuantities || merged.droppedAllocations > 0) && (
              <label className="flex items-start gap-2 text-sm text-amber-800">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(event) => setConfirm(event.target.checked)}
                />
                Подтверждаю замену ранее введённых количеств составом из Excel.
              </label>
            )}
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            generation.current++
            onCancel()
          }}
        >
          Отменить импорт
        </Button>
        <Button
          disabled={
            !rows?.length ||
            !merged ||
            busy ||
            (!templateMode &&
              (merged.replacesQuantities || merged.droppedAllocations > 0) &&
              !confirm)
          }
          onClick={() => {
            if (merged) onApply(merged.value)
          }}
        >
          {templateMode ? 'Показать сверку' : 'Применить количества'}
        </Button>
      </div>
    </div>
  )
}
