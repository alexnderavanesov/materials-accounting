import { m15Precise, m15Unit, equalAmount } from './m15-quantity'
import type {
  M15Line,
  M15Reconciliation,
  M15Workspace,
} from './m15-reconciliation'
import type { ReceiptDocument } from './receipt-documents'

export function independentM15(
  id: string,
  saved?: M15Reconciliation,
): M15Reconciliation {
  return {
    id,
    mode: 'independent',
    cipher: saved?.cipher,
    lines: structuredClone(saved?.lines ?? []),
    allocations: [],
  }
}

/** One unit of the invoice expressed in the project's primary unit. */
export function m15ProjectFactor(
  line: M15Line,
  projectUnit: string,
): number | null {
  if (m15Unit(line.unit) === m15Unit(projectUnit)) return 1
  const conversion = line.projectConversion
  return conversion &&
    m15Unit(conversion.fromUnit) === m15Unit(line.unit) &&
    m15Unit(conversion.toUnit) === m15Unit(projectUnit) &&
    Number.isFinite(conversion.factor) &&
    conversion.factor > 0
    ? conversion.factor
    : null
}

export function validateIndependentM15(
  value: M15Reconciliation,
  workspace: M15Workspace,
  projectIndex?: ReadonlyMap<
    string,
    NonNullable<M15Workspace['lines']>[number]
  >,
) {
  if (!value.cipher?.trim()) throw new Error('Выберите один шифр М-15.')
  if (!value.lines.length)
    throw new Error('Добавьте хотя бы один материал в М-15.')
  if (value.allocations.length)
    throw new Error('М-15 больше не связывается с получениями.')
  const projects =
    projectIndex ??
    new Map(workspace.lines?.map((line) => [String(line.id), line]))
  for (const line of value.lines) {
    const project = projects.get(line.projectLineId ?? '')
    if (!project || project.cipher !== value.cipher)
      throw new Error(`Выберите материал шифра М-15 для «${line.name}».`)
    if (!Number.isFinite(line.quantity) || line.quantity <= 0)
      throw new Error('Количество по М-15 должно быть положительным.')
    if (m15ProjectFactor(line, String(project.unit)) === null)
      throw new Error(
        `Укажите пересчёт единицы М-15 в единицу проекта для «${line.name}».`,
      )
  }
}

export type M15AccountingRow = {
  projectLineId: string
  id: string
  cipher: string
  name: string
  materialType: string
  unit: string
  appUnits: Array<{ unit: string; quantity: number }>
  received: number
  returned: number
  app: number
  documented: number
  shortage: number
  excess: number
  needsConversion: boolean
  documents: Array<{ document: ReceiptDocument; quantity: number }>
}

/** Linear aggregation. Returns follow the original APP, never the current stock owner. */
export function buildM15Accounting(
  workspace: M15Workspace,
): M15AccountingRow[] {
  const projects = new Map(
    workspace.lines?.map((line) => [String(line.id), line]),
  )
  const requests = new Map(
    workspace.materialRequests.map((row) => [String(row.id), row]),
  )
  const documents = new Map(
    workspace.qualityWorkflow?.receiptDocuments?.map((doc) => [doc.id, doc]),
  )
  const returns = new Map<string, number>()
  for (const back of workspace.qualityWorkflow?.customerReturns ?? [])
    returns.set(
      back.receiptId,
      m15Precise((returns.get(back.receiptId) ?? 0) + back.quantity),
    )
  const rows = new Map<string, M15AccountingRow>()
  const documentTotals = new Map<string, Map<string, number>>()
  const rowFor = (
    id: string,
    fallback: { name: string; cipher: string; unit: string },
  ) => {
    const project = projects.get(id)
    const cipher = fallback.cipher || String(project?.cipher ?? '')
    const key = JSON.stringify([id, cipher])
    let row = rows.get(key)
    if (!row) {
      row = {
        id: key,
        projectLineId: id,
        cipher,
        name: String(project?.projectMaterialName ?? fallback.name),
        materialType: String(project?.materialType ?? project?.category ?? ''),
        unit: String(project?.unit ?? fallback.unit),
        appUnits: [],
        received: 0,
        returned: 0,
        app: 0,
        documented: 0,
        shortage: 0,
        excess: 0,
        needsConversion: false,
        documents: [],
      }
      rows.set(key, row)
      documentTotals.set(key, new Map())
    }
    return row
  }
  for (const receipt of workspace.materialReceipts) {
    if (documents.get(String(receipt.appDocumentId))?.kind !== 'app') continue
    const request = requests.get(String(receipt.requestId))
    const row = rowFor(String(receipt.projectLineId), {
      name: String(request?.projectMaterialName ?? receipt.actualName ?? ''),
      cipher: String(request?.cipher ?? ''),
      unit: String(receipt.projectUnit),
    })
    const receiptUnit = String(receipt.projectUnit)
    const net = m15Precise(
      Number(receipt.quantity) - (returns.get(String(receipt.id)) ?? 0),
    )
    const unitTotal = row.appUnits.find(
      (item) => m15Unit(item.unit) === m15Unit(receiptUnit),
    )
    if (unitTotal) unitTotal.quantity = m15Precise(unitTotal.quantity + net)
    else row.appUnits.push({ unit: receiptUnit, quantity: net })
    if (m15Unit(String(receipt.projectUnit)) !== m15Unit(row.unit)) {
      row.needsConversion = true
      continue
    }
    row.received = m15Precise(row.received + Number(receipt.quantity))
    row.returned = m15Precise(
      row.returned + (returns.get(String(receipt.id)) ?? 0),
    )
  }
  const seen = new Set<string>()
  for (const record of workspace.m15Reconciliations ?? []) {
    const document = documents.get(record.id)
    if (!document || document.kind !== 'm15' || seen.has(record.id)) continue
    seen.add(record.id)
    for (const line of record.lines) {
      if (!line.projectLineId) continue
      const row = rowFor(line.projectLineId, {
        name: line.name,
        cipher: record.cipher ?? '',
        unit: line.unit,
      })
      const factor = m15ProjectFactor(line, row.unit)
      const totals = documentTotals.get(row.id)!
      if (factor === null) {
        row.needsConversion = true
        totals.set(document.id, totals.get(document.id) ?? 0)
        continue
      }
      const quantity = m15Precise(line.quantity * factor)
      row.documented = m15Precise(row.documented + quantity)
      totals.set(
        document.id,
        m15Precise((totals.get(document.id) ?? 0) + quantity),
      )
    }
  }
  for (const row of rows.values()) {
    row.app = m15Precise(row.received - row.returned)
    const delta = equalAmount(row.app, row.documented)
      ? 0
      : m15Precise(row.app - row.documented)
    row.shortage = Math.max(0, delta)
    row.excess = Math.max(0, -delta)
    row.documents = [...documentTotals.get(row.id)!]
      .map(([id, quantity]) => ({ document: documents.get(id)!, quantity }))
      .sort(
        (a, b) =>
          b.document.date.localeCompare(a.document.date) ||
          a.document.number.localeCompare(b.document.number, 'ru'),
      )
  }
  return [...rows.values()]
}
