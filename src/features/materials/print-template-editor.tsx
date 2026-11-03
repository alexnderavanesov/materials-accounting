import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Check, MousePointer2, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { cellPosition, cellRange, columnName } from './request-print'
import type { TemplateSheet } from './request-print'

export type TemplateField = {
  id: string
  label: string
  example: string
  addresses: Array<string>
}
export type TemplateFieldGroup = {
  id: string
  label: string
  description: string
  fields: Array<TemplateField>
  table?: {
    row: number
    enabled: boolean
    onRowChange: (row: number) => void
    onEnabledChange?: (enabled: boolean) => void
  }
}

export function PrintTemplateEditor({
  sheet,
  groups,
  onAssign,
  onRemove,
}: {
  sheet: TemplateSheet
  groups: Array<TemplateFieldGroup>
  onAssign: (fieldId: string, address: string) => string | void
  onRemove: (fieldId: string, address: string) => void
}) {
  const [groupId, setGroupId] = useState(groups[0]!.id)
  const [fieldId, setFieldId] = useState('')
  const [query, setQuery] = useState('')
  const [selectingRow, setSelectingRow] = useState(false)
  const [selected, setSelected] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const group = groups.find((item) => item.id === groupId) ?? groups[0]!
  const field = group.fields.find((item) => item.id === fieldId)
  const bindings = useMemo(() => {
    const result = new Map<string, Array<TemplateField>>()
    for (const item of groups.flatMap((entry) => entry.fields))
      for (const address of item.addresses)
        result.set(address, [...(result.get(address) ?? []), item])
    return result
  }, [groups])
  const activeAddresses = field?.addresses ?? emptyAddresses
  function selectCell(address: string) {
    setSelected(address)
    setNotice('')
    setError('')
    if (selectingRow && group.table) {
      group.table.onRowChange(cellPosition(address).row)
      setSelectingRow(false)
      setNotice(
        `Строка ${cellPosition(address).row} будет повторяться для каждой позиции.`,
      )
      return
    }
    if (!field) {
      setNotice(
        'Теперь выберите слева, что вставить в эту ячейку, и нажмите её ещё раз.',
      )
      return
    }
    if (group.table && cellPosition(address).row !== group.table.row) {
      setError(
        `Выберите ячейку в строке ${group.table.row}. Чтобы перенести всю таблицу, нажмите «Изменить строку».`,
      )
      return
    }
    const replaced = (bindings.get(address) ?? [])
      .filter((item) => item.id !== field.id)
      .map((item) => item.label)
    const problem = onAssign(field.id, address)
    if (problem) {
      setError(problem)
      return
    }
    setNotice(
      `${field.label} → ${address}${replaced.length ? ` · вместо «${replaced.join(', ')}»` : ''}`,
    )
  }
  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h4 className="font-semibold">2. Что и куда вставлять</h4>
        <p className="mt-1 text-sm text-slate-500">
          Выберите поле слева, затем нажмите нужную ячейку бланка. Синим
          отмечены места автоматического заполнения.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Разделы заполнения">
        {groups.map((item) => (
          <Button
            key={item.id}
            variant={group.id === item.id ? 'default' : 'outline'}
            size="sm"
            aria-pressed={group.id === item.id}
            onClick={() => {
              setGroupId(item.id)
              setFieldId('')
              setQuery('')
              setSelectingRow(false)
              setError('')
              setNotice('')
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <p className="mb-3 text-sm text-slate-600">{group.description}</p>
          {group.table && (
            <div className="mb-3 space-y-2 border-b border-slate-200 pb-3">
              {group.table.onEnabledChange && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={group.table.enabled}
                    onChange={(event) => {
                      group.table!.onEnabledChange!(event.target.checked)
                      setFieldId('')
                      setSelectingRow(false)
                    }}
                  />
                  Выводить отдельной таблицей
                </label>
              )}
              {group.table.enabled && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>Первая позиция: строка {group.table.row}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-pressed={selectingRow}
                      onClick={() => {
                        setSelectingRow(!selectingRow)
                        setFieldId('')
                        setError('')
                        setNotice('')
                      }}
                    >
                      {selectingRow ? 'Отмена' : 'Изменить строку'}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Одна позиция — одна строка. Остальные строки добавятся
                    автоматически, подписи сдвинутся вниз.
                  </p>
                </>
              )}
            </div>
          )}
          {(!group.table || group.table.enabled) && (
            <>
              {group.fields.length > 12 && (
                <Input
                  aria-label="Найти поле"
                  placeholder="Найти поле…"
                  className="mb-2"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              )}
              <div
                className="max-h-[360px] space-y-1 overflow-y-auto"
                aria-label="Поля для заполнения"
              >
                {group.fields
                  .filter((item) =>
                    item.label
                      .toLocaleLowerCase('ru')
                      .includes(query.trim().toLocaleLowerCase('ru')),
                  )
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Вставить: ${item.label}`}
                      aria-pressed={fieldId === item.id}
                      onClick={() => {
                        setFieldId(item.id)
                        setSelectingRow(false)
                        setError('')
                        setNotice('')
                      }}
                      className={`w-full rounded-md border p-2.5 text-left text-sm ${fieldId === item.id ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200' : 'border-transparent hover:bg-white'}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-medium">{item.label}</span>
                        {item.addresses.length > 0 && (
                          <Check
                            aria-label="Настроено"
                            size={16}
                            className="shrink-0 text-emerald-600"
                          />
                        )}
                      </span>
                      <span
                        className="mt-0.5 block truncate text-xs text-slate-500"
                        title={item.example}
                      >
                        Пример: {item.example}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {item.addresses.length
                          ? `В бланке: ${item.addresses.join(', ')}`
                          : 'Не выводится'}
                      </span>
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="min-h-20 rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-sm">
            <div className="flex items-start gap-2">
              <MousePointer2
                size={17}
                className="mt-0.5 shrink-0 text-blue-600"
              />
              <div className="min-w-0">
                <p className="font-medium">
                  {selectingRow
                    ? 'Нажмите первую строку с данными — не заголовок таблицы'
                    : field
                      ? `Куда вставить «${field.label}»?`
                      : 'Выберите поле слева'}
                </p>
                {field && (
                  <p className="mt-1 break-words text-slate-600">
                    Пример значения: {field.example}
                  </p>
                )}
                {field && activeAddresses.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {activeAddresses.map((address) => (
                      <button
                        key={address}
                        type="button"
                        aria-label={`Убрать ${field.label} из ${address}`}
                        className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs"
                        onClick={() => {
                          onRemove(field.id, address)
                          setNotice(
                            `${field.label}: ячейка ${address} освобождена.`,
                          )
                        }}
                      >
                        {address}
                        <X size={12} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div aria-live="polite" className="min-h-5 text-sm">
            {error ? (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            ) : (
              <p className="text-emerald-700">{notice || '\u00a0'}</p>
            )}
          </div>
          <SheetGrid
            sheet={sheet}
            bindings={bindings}
            activeAddresses={activeAddresses}
            selected={selected}
            repeatRow={group.table?.enabled ? group.table.row : undefined}
            onSelect={selectCell}
          />
        </div>
      </div>
    </div>
  )
}

const emptyAddresses: Array<string> = []

const SheetGrid = memo(function SheetGrid({
  sheet,
  bindings,
  selected,
  activeAddresses,
  repeatRow,
  onSelect,
}: {
  sheet: TemplateSheet
  bindings: Map<string, Array<TemplateField>>
  selected: string
  activeAddresses: Array<string>
  repeatRow?: number
  onSelect: (address: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const focusAddress = activeAddresses[0]
  useEffect(() => {
    const view = container.current
    const target =
      focusAddress &&
      view?.querySelector<HTMLButtonElement>(
        `button[aria-label="Ячейка ${focusAddress}"]`,
      )
    if (!view || !target) return
    const bounds = view.getBoundingClientRect(),
      cell = target.getBoundingClientRect()
    if (cell.top < bounds.top + 40 || cell.bottom > bounds.bottom)
      view.scrollTop += cell.top - bounds.top - 40
    if (cell.left < bounds.left || cell.right > bounds.right)
      view.scrollLeft += cell.left - bounds.left
  }, [focusAddress])
  const cells = new Map(sheet.cells.map((cell) => [cell.address, cell.text]))
  const merges = sheet.merges.map(cellRange)
  return (
    <div
      className="max-h-[480px] min-w-0 overflow-auto rounded-lg border border-slate-200"
      ref={container}
      aria-label="Лист шаблона"
    >
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-slate-100">
          <tr>
            <th className="p-2">№</th>
            {Array.from({ length: sheet.columns }, (_, col) => (
              <th key={col} className="border border-slate-200 px-3 py-2">
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
                <th
                  className={`border border-slate-200 p-2 ${row === repeatRow ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-50'}`}
                >
                  {row}
                </th>
                {Array.from({ length: sheet.columns }, (_cell, colIndex) => {
                  const col = colIndex + 1,
                    address = `${columnName(col)}${row}`
                  const merge = merges.find(
                    (range) =>
                      row >= range.top &&
                      row <= range.bottom &&
                      col >= range.left &&
                      col <= range.right,
                  )
                  if (merge && (merge.top !== row || merge.left !== col))
                    return null
                  const assigned = bindings.get(address)
                  const active =
                    activeAddresses.includes(address) || selected === address
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
                        aria-pressed={active}
                        onClick={() => onSelect(address)}
                        className={`block min-h-16 w-full min-w-24 px-2 py-1 text-left ${active ? 'bg-blue-100 ring-2 ring-inset ring-blue-500' : assigned ? 'bg-blue-50' : row === repeatRow ? 'bg-emerald-50/40' : 'bg-white hover:bg-slate-50'}`}
                      >
                        <span className="block text-[10px] text-slate-400">
                          {address}
                        </span>
                        {assigned ? (
                          assigned.map((item) => (
                            <span key={item.id} className="block max-w-xl">
                              <span className="block font-medium text-blue-800">
                                {item.label}
                              </span>
                              <span className="block whitespace-pre-wrap text-slate-600">
                                {item.example}
                              </span>
                            </span>
                          ))
                        ) : (
                          <span className="block max-w-xl whitespace-pre-wrap">
                            {cells.get(address) || '\u00a0'}
                          </span>
                        )}
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
})
