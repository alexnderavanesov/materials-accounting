import { formatCalendarDate } from './calendar-date'
import { useMemo, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { receiptDocumentLabel } from './receipt-documents'
import { normalizeOperationSearch } from './operation-list-view'
import { m15ReceiptIndex } from './m15-reconciliation'
import type { M15Workspace } from './m15-reconciliation'
import {
  OperationPagination,
  useOperationPagination,
} from './operation-pagination'

type ReceiptGroup = {
  id: string
  label: string
  search: string
  rows: Array<{
    id: string
    name: string
    quantity: number
    unit: string
    request: string
    cipher: string
    linked: boolean
  }>
}
function ReceiptGroupCard({
  group,
  selected,
  onChange,
}: {
  group: ReceiptGroup
  selected: ReadonlySet<string>
  onChange: (ids: Set<string>) => void
}) {
  const [expanded, setExpanded] = useState(group.rows.length <= 10),
    [page, setPage] = useState(0)
  const available = group.rows.filter((row) => !row.linked)
  const count = group.rows.filter(
    (row) => row.linked || selected.has(row.id),
  ).length
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(group.rows.length / 50) - 1),
  )
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            ref={(node) => {
              if (node)
                node.indeterminate = count > 0 && count < group.rows.length
            }}
            checked={count === group.rows.length}
            disabled={!available.length}
            onChange={(event) => {
              const next = new Set(selected)
              for (const row of available) {
                if (event.target.checked) next.add(row.id)
                else next.delete(row.id)
              }
              onChange(next)
            }}
          />
          {group.label} · {group.rows.length} поз.
        </label>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Позиции: ${group.label}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Свернуть' : 'Позиции'}
        </Button>
      </div>
      {expanded && (
        <>
          {group.rows
            .slice(currentPage * 50, (currentPage + 1) * 50)
            .map((row) => (
              <label
                key={row.id}
                className="flex items-start gap-2 border-t px-3 py-2 text-sm"
              >
                <input
                  className="mt-1"
                  type="checkbox"
                  aria-label={`Включить получение: ${row.name}, ${row.request}, ${row.id}`}
                  checked={row.linked || selected.has(row.id)}
                  disabled={row.linked}
                  onChange={(event) => {
                    const next = new Set(selected)
                    if (event.target.checked) next.add(row.id)
                    else next.delete(row.id)
                    onChange(next)
                  }}
                />
                <span className="min-w-0 flex-1 break-words">
                  {row.name}
                  <span className="block text-xs text-slate-500">
                    {row.request} · {row.cipher}
                    {row.linked ? ' · Уже в этой М-15' : ''}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {row.quantity.toLocaleString('ru-RU')} {row.unit}
                </span>
              </label>
            ))}
          {group.rows.length > 50 && (
            <div className="flex items-center justify-end gap-2 p-2 text-xs">
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Предыдущие позиции
              </Button>
              <span>
                {currentPage + 1} / {Math.ceil(group.rows.length / 50)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={(currentPage + 1) * 50 >= group.rows.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Следующие позиции
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
export function M15ReceiptsPicker({
  workspace,
  documentId,
  selected,
  onChange,
}: {
  workspace: M15Workspace
  documentId: string
  selected: ReadonlySet<string>
  onChange: (ids: Set<string>) => void
}) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const docs = new Map(
      workspace.qualityWorkflow?.receiptDocuments?.map((doc) => [doc.id, doc]),
    )
    const rows = m15ReceiptIndex(workspace)
    const grouped = new Map<string, ReceiptGroup>()
    for (const source of workspace.materialReceipts) {
      if (source.m15DocumentId && source.m15DocumentId !== documentId) continue
      const receipt = rows.get(String(source.id))!
      const app = docs.get(String(source.appDocumentId))
      const id = app?.id ?? `date:${receipt.date}`
      const group = grouped.get(id) ?? {
        id,
        label: app
          ? receiptDocumentLabel(app)
          : `Без АПП · ${formatCalendarDate(receipt.date)}`,
        search: '',
        rows: [],
      }
      group.rows.push({
        id: receipt.id,
        name: receipt.actualName || receipt.projectName,
        quantity: receipt.quantity,
        unit: receipt.unit,
        request: receipt.requestNumber,
        cipher: receipt.cipher,
        linked: source.m15DocumentId === documentId,
      })
      grouped.set(id, group)
    }
    return [...grouped.values()].map((group) => ({
      ...group,
      search: normalizeOperationSearch(
        `${group.label} ${group.rows.map((row) => `${row.name} ${row.request} ${row.cipher}`).join(' ')}`,
      ),
    }))
  }, [workspace, documentId])
  const visible = useMemo(
    () =>
      groups.filter((group) =>
        group.search.includes(normalizeOperationSearch(query)),
      ),
    [groups, query],
  )
  const pagination = useOperationPagination(
    'm15-receipts-picker',
    visible,
    `${documentId}:${query}`,
  )
  return (
    <section
      className="grid gap-3 rounded-xl border border-slate-200 p-3"
      aria-label="Получения для М-15"
    >
      <Input
        aria-label="Поиск получений для М-15"
        placeholder="АПП, материал, заявка или шифр"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {selected.size > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange(new Set())}>
          Снять выбор получений · {selected.size}
        </Button>
      )}
      <div
        ref={pagination.containerRef}
        className="grid max-h-80 gap-3 overflow-auto"
      >
        {pagination.items.map((group) => (
          <ReceiptGroupCard
            key={group.id}
            group={group}
            selected={selected}
            onChange={onChange}
          />
        ))}
        {!visible.length && (
          <p className="p-3 text-sm text-slate-500">
            Подходящих получений нет. Состав М-15 можно сохранить и добавить
            получения позже.
          </p>
        )}
      </div>
      <OperationPagination pagination={pagination} label="АПП для М-15" />
    </section>
  )
}
