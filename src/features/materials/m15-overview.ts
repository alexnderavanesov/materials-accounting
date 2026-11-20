import { automaticM15, calculateAutomaticM15 } from './m15-automatic'
import { m15Precise, m15ReceiptIndex, m15Unit } from './m15-reconciliation'
import { receiptDocumentLabel } from './receipt-documents'
import { normalizeOperationSearch } from './operation-list-view'
import type { M15Receipt, M15Workspace } from './m15-reconciliation'

export type M15UnitTotal = {
  unit: string
  documented: number
  received: number
  shortage: number
  excess: number
  positions: number
}
export type M15DocumentSummary = {
  id: string
  label: string
  date: string
  materials: number
  search: string
  documented: Array<{ unit: string; quantity: number }>
  received: Array<{ unit: string; quantity: number }>
  complete: boolean
  incomplete: boolean
  missing: number
  conversion: number
  differences: number
  totals: M15UnitTotal[]
}
function addTotal(totals: Map<string, M15UnitTotal>, incoming: M15UnitTotal) {
  const key = m15Unit(incoming.unit)
  const current = totals.get(key)
  if (!current) {
    totals.set(key, { ...incoming })
    return
  }
  for (const field of [
    'documented',
    'received',
    'shortage',
    'excess',
    'positions',
  ] as const)
    current[field] = m15Precise(current[field] + incoming[field])
}
const ordered = (totals: Map<string, M15UnitTotal>) =>
  [...totals.values()].sort((a, b) => a.unit.localeCompare(b.unit, 'ru'))

/** Aggregate unique accounting documents, never the registry's material/document pairs.
 * Partition receipts once to avoid scanning all receipts for each M-15. */
export function buildM15Overview(workspace: M15Workspace) {
  const documents = new Map(
    workspace.qualityWorkflow?.receiptDocuments
      ?.filter((doc) => doc.kind === 'm15')
      .map((doc) => [doc.id, doc]),
  )
  const saved = new Map(
    workspace.m15Reconciliations?.map((value) => [value.id, value]),
  )
  const receipts = new Map<string, Map<string, M15Receipt>>()
  let unlinkedReceipts = 0
  for (const receipt of m15ReceiptIndex(workspace).values()) {
    if (!documents.has(receipt.m15DocumentId)) {
      unlinkedReceipts++
      continue
    }
    const group =
      receipts.get(receipt.m15DocumentId) ?? new Map<string, M15Receipt>()
    group.set(receipt.id, receipt)
    receipts.set(receipt.m15DocumentId, group)
  }
  const summaries = new Map<string, M15DocumentSummary>()
  const totals = new Map<string, M15UnitTotal>()
  let matched = 0,
    differences = 0,
    incomplete = 0,
    conversion = 0
  for (const id of documents.keys()) {
    const document = documents.get(id)!
    const result = calculateAutomaticM15(
      automaticM15(id, saved.get(id)),
      receipts.get(id) ?? new Map(),
    )
    const perUnit = new Map<string, M15UnitTotal>()
    const summary: M15DocumentSummary = {
      id,
      complete: result.complete,
      incomplete: !result.rows.length,
      missing: 0,
      conversion: 0,
      differences: 0,
      totals: [],
      label: receiptDocumentLabel(document),
      date: document.date,
      materials: result.rows.length,
      search: normalizeOperationSearch(
        `${receiptDocumentLabel(document)} ${result.rows.map((row) => row.search).join(' ')}`,
      ),
      documented: [],
      received: [],
    }
    const quantities = (items: Array<{ unit: string; quantity: number }>) => {
      const grouped = new Map<string, { unit: string; quantity: number }>()
      for (const item of items) {
        const key = m15Unit(item.unit),
          current = grouped.get(key)
        grouped.set(key, {
          unit: current?.unit ?? item.unit,
          quantity: m15Precise((current?.quantity ?? 0) + item.quantity),
        })
      }
      return [...grouped.values()].sort((a, b) =>
        a.unit.localeCompare(b.unit, 'ru'),
      )
    }
    summary.documented = quantities(
      result.rows.flatMap((row) =>
        row.line ? [{ unit: row.unit, quantity: row.line.quantity }] : [],
      ),
    )
    summary.received = quantities(
      result.rows.flatMap((row) =>
        row.received !== null && row.receipts.length
          ? [{ unit: row.unit, quantity: row.received }]
          : row.receipts.map((receipt) => ({
              unit: receipt.unit,
              quantity: receipt.quantity,
            })),
      ),
    )
    for (const row of result.rows) {
      if (!row.line) {
        summary.missing++
        summary.incomplete = true
      }
      if (row.status === 'conversion') summary.conversion++
      if (row.status === 'difference') summary.differences++
      if (!row.line || row.received === null || row.delta === null) continue
      addTotal(perUnit, {
        unit: row.unit,
        documented: row.line.quantity,
        received: row.received,
        shortage: row.delta < 0 ? -row.delta : 0,
        excess: row.delta > 0 ? row.delta : 0,
        positions: 1,
      })
    }
    summary.totals = ordered(perUnit)
    summaries.set(id, summary)
    for (const total of summary.totals) addTotal(totals, total)
    if (summary.complete) matched++
    if (summary.differences) differences++
    if (summary.incomplete) incomplete++
    if (summary.conversion) conversion++
  }
  return {
    documents: summaries,
    totals: ordered(totals),
    matched,
    differences,
    incomplete,
    conversion,
    unlinkedReceipts,
  }
}
export type M15Overview = ReturnType<typeof buildM15Overview>
export const formatM15Total = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 9 }).format(value)
export function m15SummaryText(summary: M15DocumentSummary) {
  if (summary.complete) return 'Совпадает'
  const parts = summary.totals.flatMap((total) => [
    ...(total.shortage > 0
      ? [`Недостаёт ${formatM15Total(total.shortage)} ${total.unit}`]
      : []),
    ...(total.excess > 0
      ? [`Больше на ${formatM15Total(total.excess)} ${total.unit}`]
      : []),
  ])
  if (summary.incomplete)
    parts.push(
      summary.missing
        ? `Не заполнено: ${summary.missing} поз.`
        : 'Количества по М-15 не введены',
    )
  if (summary.conversion)
    parts.push(`Нужен пересчёт единиц: ${summary.conversion} поз.`)
  return parts.join(' · ')
}
