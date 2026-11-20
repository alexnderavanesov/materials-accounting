import { normalizeOperationSearch } from './operation-list-view'
import {
  m15Conversion,
  m15Precise,
  m15Remaining,
  m15Unit,
} from './m15-reconciliation'
import type {
  M15Line,
  M15Receipt,
  M15Reconciliation,
} from './m15-reconciliation'

export const m15MaterialKey = (name: string, unit: string) =>
  JSON.stringify([normalizeOperationSearch(name), m15Unit(unit)])

/** Read compatibility only: opening a legacy record never writes to the workspace.
 * Retain all documentary quantities, including duplicate positions. Allocations
 * are deliberately ignored: the source M-15 of each current receipt is authoritative. */
export function automaticM15(
  documentId: string,
  saved?: M15Reconciliation,
): M15Reconciliation {
  const lines = new Map<string, M15Line>()
  for (const line of saved?.lines ?? []) {
    const key = m15MaterialKey(line.name, line.unit)
    const previous = lines.get(key)
    lines.set(
      key,
      previous
        ? {
            ...previous,
            position: '',
            quantity: m15Precise(previous.quantity + line.quantity),
          }
        : { ...line },
    )
  }
  return {
    id: documentId,
    mode: 'automatic',
    lines: [...lines.values()],
    allocations: [],
  }
}

export type AutomaticM15Row = {
  key: string
  name: string
  unit: string
  line?: M15Line
  receipts: M15Receipt[]
  received: number | null
  delta: number | null
  status: 'missing' | 'matched' | 'difference' | 'conversion'
  search: string
}

/** Every receipt is counted once, in its own M-15, at its current gross quantity.
 * No quantities, links, receipt snapshots or calculated totals are persisted. */
export function calculateAutomaticM15(
  value: M15Reconciliation,
  index: ReadonlyMap<string, M15Receipt>,
  knownMaterials: ReadonlyArray<Pick<M15Line, 'name' | 'unit'>> = [],
) {
  const rows = new Map<string, AutomaticM15Row>()
  const documentedByName = new Map<string, AutomaticM15Row[]>()
  const uncertain = new Set<string>()
  const makeRow = (
    name: string,
    unit: string,
    line?: M15Line,
  ): AutomaticM15Row => ({
    key: m15MaterialKey(name, unit),
    name,
    unit,
    line,
    receipts: [],
    received: 0,
    delta: null,
    status: 'missing',
    search: '',
  })
  for (const line of automaticM15(value.id, value).lines) {
    const row = makeRow(line.name, line.unit, line)
    rows.set(row.key, row)
    const name = normalizeOperationSearch(line.name)
    const group = documentedByName.get(name) ?? []
    group.push(row)
    documentedByName.set(name, group)
  }
  for (const material of knownMaterials) {
    const key = m15MaterialKey(material.name, material.unit)
    if (!rows.has(key)) rows.set(key, makeRow(material.name, material.unit))
  }
  for (const receipt of index.values()) {
    if (receipt.m15DocumentId !== value.id) continue
    const name =
      receipt.actualName.trim() ||
      receipt.projectName.trim() ||
      'Материал без наименования'
    const unit = receipt.unit
    const key = m15MaterialKey(name, unit)
    const candidates =
      documentedByName.get(normalizeOperationSearch(name)) ?? []
    let row = rows.get(key)
    let factor = 1
    if (!row) {
      const converted = candidates.filter(
        (candidate) => m15Conversion(receipt, candidate.line!) !== null,
      )
      if (converted.length === 1) {
        row = converted[0]!
        factor = m15Conversion(receipt, row.line!)!
      } else {
        // Do not choose an arbitrary unit or infer a factor from old altQuantity.
        for (const candidate of candidates) uncertain.add(candidate.key)
        row = makeRow(name, unit)
        rows.set(key, row)
      }
    }
    row.receipts.push(receipt)
    row.received = m15Precise((row.received ?? 0) + receipt.quantity * factor)
  }
  for (const row of rows.values()) {
    if (uncertain.has(row.key) || !Number.isFinite(row.received))
      row.received = null
    row.delta =
      row.line && row.received !== null
        ? m15Remaining(row.received, row.line.quantity)
        : null
    row.status =
      row.received === null
        ? 'conversion'
        : !row.line
          ? 'missing'
          : row.delta === 0
            ? 'matched'
            : 'difference'
    row.search = normalizeOperationSearch(
      [
        row.name,
        row.unit,
        ...row.receipts.map(
          (receipt) =>
            `${receipt.projectName} ${receipt.requestNumber} ${receipt.cipher}`,
        ),
      ].join(' '),
    )
  }
  const result = [...rows.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'ru', { numeric: true }) ||
      a.unit.localeCompare(b.unit, 'ru'),
  )
  return {
    rows: result,
    complete:
      result.length > 0 && result.every((row) => row.status === 'matched'),
  }
}

export function setAutomaticM15Quantity(
  value: M15Reconciliation,
  row: AutomaticM15Row,
  quantity: number | undefined,
): M15Reconciliation {
  const next = automaticM15(value.id, value)
  const existing = next.lines.find(
    (line) => m15MaterialKey(line.name, line.unit) === row.key,
  )
  if (quantity === undefined)
    next.lines = next.lines.filter(
      (line) => m15MaterialKey(line.name, line.unit) !== row.key,
    )
  else if (existing)
    next.lines = next.lines.map((line) =>
      line.id === existing.id ? { ...line, quantity } : line,
    )
  else
    next.lines.push({
      id: crypto.randomUUID(),
      position: '',
      name: row.name,
      unit: row.unit,
      quantity,
    })
  return next
}
