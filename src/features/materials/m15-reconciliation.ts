import { m15Precise, m15Remaining, m15Unit, equalAmount } from './m15-quantity'
import { z } from 'zod'
import { validateLinkedM15Workspace } from './m15-linked'
import { validateIndependentM15 } from './m15-independent'
import { requestRemainingQuantities } from './operation-overview-indicators'
import {
  cancelledRequestQuantity,
  requestCancellationSchema,
} from './project-change-types'
import { normalizeOperationSearch } from './operation-list-view'
import { customerReturnTotals, receivedByRequest } from './quality-workflow'
import type { WorkspaceSnapshot } from './workspace-snapshot'

export { m15Precise, m15Remaining, m15Unit } from './m15-quantity'

const id = z.string().min(1).max(500)
const amount = z.number().finite().positive()
export const m15LineSchema = z
  .object({
    id,
    projectLineId: id.optional(),
    position: z.string().max(100),
    name: z.string().trim().min(1).max(5000),
    unit: z.string().trim().min(1).max(100),
    quantity: z.number().finite().nonnegative(),
    projectConversion: z
      .object({
        fromUnit: z.string().min(1),
        toUnit: z.string().min(1),
        factor: amount,
      })
      .strict()
      .optional(),
  })
  .strict()
export const m15AllocationSchema = z
  .object({
    lineId: id,
    receiptId: id,
    quantity: amount,
    receiptQuantity: amount,
    receiptUnit: z.string().min(1),
    receiptName: z.string().optional(),
    documentQuantity: amount.optional(),
    receiptRequestId: z.string().optional(),
    conversion: z
      .object({
        fromUnit: z.string().min(1),
        toUnit: z.string().min(1),
        factor: amount,
      })
      .strict()
      .optional(),
  })
  .strict()
export const m15ReconciliationSchema = z
  .object({
    // The document ID is also the record ID: only one reconciliation per M-15.
    id,
    mode: z.enum(['automatic', 'linked', 'independent']).optional(),
    cipher: z.string().trim().min(1).max(500).optional(),
    lines: z.array(m15LineSchema).max(50000),
    allocations: z.array(m15AllocationSchema).max(100000),
  })
  .strict()
export type M15Line = z.infer<typeof m15LineSchema>
export type M15Allocation = z.infer<typeof m15AllocationSchema>
export type M15Reconciliation = z.infer<typeof m15ReconciliationSchema>
export type M15Workspace = Pick<
  WorkspaceSnapshot,
  'materialReceipts' | 'materialRequests' | 'qualityWorkflow'
> &
  Partial<WorkspaceSnapshot>
const text = (row: Record<string, unknown> | undefined, field: string) =>
  typeof row?.[field] === 'string' ? row[field] : ''
const number = (row: Record<string, unknown> | undefined, field: string) =>
  typeof row?.[field] === 'number' ? row[field] : 0
export type M15Receipt = {
  id: string
  projectLineId: string
  m15DocumentId: string
  requestId: string
  requestNumber: string
  cipher: string
  projectName: string
  actualName: string
  replacement: boolean
  unit: string
  quantity: number
  altUnit: string
  altQuantity: number
  altUnitFactor: number
  date: string
  requested: number
  requestCancelled: number
  requestReceived: number
  requestReturned: number
  requestRemaining: number
  returned: number
}
export function m15ReceiptIndex(workspace: M15Workspace) {
  const requests = new Map(
    workspace.materialRequests.map((row) => [text(row, 'id'), row]),
  )
  const receipts = workspace.materialReceipts.map((row) => ({
    id: text(row, 'id'),
    requestId: text(row, 'requestId'),
    quantity: number(row, 'quantity'),
  }))
  const credited = receivedByRequest(receipts, workspace.qualityWorkflow)
  const returned = customerReturnTotals(workspace.qualityWorkflow)
  // Share the request grid's balance rules, including approved cancellations.
  const requestRows = workspace.materialRequests.map((row) => ({
    id: text(row, 'id'),
    quantity: number(row, 'quantity'),
    projectCancellations:
      row.projectCancellations == null
        ? undefined
        : requestCancellationSchema.array().parse(row.projectCancellations),
  }))
  const remaining = requestRemainingQuantities(requestRows, credited)
  const cancelled = new Map(
    requestRows.map((row) => [row.id, cancelledRequestQuantity(row)]),
  )
  const gross = new Map<string, number>(),
    returns = new Map<string, number>()
  for (const row of receipts) {
    gross.set(
      row.requestId,
      m15Precise((gross.get(row.requestId) ?? 0) + row.quantity),
    )
    returns.set(
      row.requestId,
      m15Precise(
        (returns.get(row.requestId) ?? 0) + (returned.get(row.id) ?? 0),
      ),
    )
  }
  return new Map(
    workspace.materialReceipts.map((row): [string, M15Receipt] => {
      const requestId = text(row, 'requestId'),
        request = requests.get(requestId),
        receiptId = text(row, 'id')
      const actualName = text(row, 'actualName'),
        projectName = text(request, 'projectMaterialName')
      return [
        receiptId,
        {
          id: receiptId,
          projectLineId: text(row, 'projectLineId'),
          m15DocumentId: text(row, 'm15DocumentId'),
          requestId,
          requestNumber: text(request, 'number'),
          cipher: text(request, 'cipher'),
          projectName,
          actualName,
          replacement:
            !!actualName &&
            !!projectName &&
            normalizeOperationSearch(actualName) !==
              normalizeOperationSearch(projectName),
          unit: text(row, 'projectUnit'),
          quantity: number(row, 'quantity'),
          altUnit: text(row, 'altUnit'),
          altQuantity: number(row, 'altQuantity'),
          altUnitFactor: number(row, 'altUnitFactor'),
          date: text(row, 'date'),
          requested: number(request, 'quantity'),
          requestCancelled: cancelled.get(requestId) ?? 0,
          requestReceived: gross.get(requestId) ?? 0,
          requestReturned: returns.get(requestId) ?? 0,
          requestRemaining: remaining.get(requestId) ?? 0,
          returned: returned.get(receiptId) ?? 0,
        },
      ]
    }),
  )
}
export function m15Conversion(
  receipt: M15Receipt,
  line: M15Line,
  allocation?: M15Allocation,
): number | null {
  if (m15Unit(receipt.unit) === m15Unit(line.unit)) return 1
  if (allocation?.conversion) {
    const value = allocation.conversion
    return m15Unit(value.fromUnit) === m15Unit(receipt.unit) &&
      m15Unit(value.toUnit) === m15Unit(line.unit) &&
      value.factor > 0
      ? value.factor
      : null
  }
  // Legacy alternative quantities may be informational: never infer a factor
  // from them. Use the explicit saved factor, as in receipt accounting.
  if (
    m15Unit(receipt.altUnit) === m15Unit(line.unit) &&
    receipt.altUnitFactor > 0 &&
    Number.isFinite(receipt.altUnitFactor)
  )
    return receipt.altUnitFactor
  return null
}
export function m15Allocation(
  receipt: M15Receipt,
  lineId: string,
  quantity: number,
): M15Allocation {
  return {
    lineId,
    receiptId: receipt.id,
    quantity,
    receiptQuantity: receipt.quantity,
    receiptUnit: receipt.unit,
    receiptName: receipt.actualName,
    receiptRequestId: receipt.requestId,
  }
}
export function m15AllocationStale(
  allocation: M15Allocation,
  receipt: M15Receipt | undefined,
  documentId: string,
) {
  return (
    !receipt ||
    receipt.m15DocumentId !== documentId ||
    !equalAmount(allocation.receiptQuantity, receipt.quantity) ||
    m15Unit(allocation.receiptUnit) !== m15Unit(receipt.unit) ||
    (allocation.receiptName !== undefined &&
      normalizeOperationSearch(allocation.receiptName) !==
        normalizeOperationSearch(receipt.actualName)) ||
    (allocation.receiptRequestId !== undefined &&
      allocation.receiptRequestId !== receipt.requestId)
  )
}
export const m15StatusLabels = {
  matched: 'Совпадает',
  difference: 'Расхождение',
  unmatched: 'Не сопоставлено',
  conversion: 'Нужен пересчёт единиц',
  stale: 'Требует пересопоставления',
} as const
export function calculateM15(
  value: M15Reconciliation,
  index: ReadonlyMap<string, M15Receipt>,
) {
  const totals = new Map<string, number>(),
    byLine = new Map<string, M15Allocation[]>()
  for (const allocation of value.allocations) {
    totals.set(
      allocation.receiptId,
      m15Precise((totals.get(allocation.receiptId) ?? 0) + allocation.quantity),
    )
    const group = byLine.get(allocation.lineId) ?? []
    group.push(allocation)
    byLine.set(allocation.lineId, group)
  }
  const rows = value.lines.map((line) => {
    const allocations = byLine.get(line.id) ?? []
    let received = 0,
      stale = false,
      conversion = false
    for (const allocation of allocations) {
      const receipt = index.get(allocation.receiptId)
      if (
        m15AllocationStale(allocation, receipt, value.id) ||
        (receipt &&
          (totals.get(receipt.id) ?? 0) > receipt.quantity &&
          !equalAmount(totals.get(receipt.id)!, receipt.quantity))
      )
        stale = true
      if (!receipt) continue
      const factor = m15Conversion(receipt, line, allocation)
      if (factor === null) conversion = true
      else {
        received = m15Precise(received + allocation.quantity * factor)
        if (!Number.isFinite(received)) conversion = true
      }
    }
    const comparable = allocations.length > 0 && !stale && !conversion
    const delta = comparable ? m15Precise(received - line.quantity) : null
    const status: keyof typeof m15StatusLabels = stale
      ? 'stale'
      : conversion
        ? 'conversion'
        : !allocations.length
          ? 'unmatched'
          : equalAmount(received, line.quantity)
            ? 'matched'
            : 'difference'
    return {
      line,
      allocations,
      received: comparable ? received : null,
      delta,
      status,
    }
  })
  const unallocated = [...index.values()]
    .filter((receipt) => receipt.m15DocumentId === value.id)
    .map((receipt) => ({
      receipt,
      allocated: totals.get(receipt.id) ?? 0,
      remaining: m15Remaining(receipt.quantity, totals.get(receipt.id) ?? 0),
    }))
    .filter((item) => item.remaining !== 0)
  return {
    rows,
    unallocated,
    totals,
    complete:
      rows.length > 0 &&
      rows.every((row) => row.status === 'matched') &&
      !unallocated.length,
  }
}
export function validateM15Reconciliation(
  value: M15Reconciliation,
  workspace: M15Workspace,
  context?: {
    receipts: ReadonlyMap<string, M15Receipt>
    documentIds: ReadonlySet<string>
    projects?: ReadonlyMap<string, NonNullable<M15Workspace['lines']>[number]>
  },
) {
  const parsed = m15ReconciliationSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    const row =
      typeof issue.path[1] === 'number' ? ` №${issue.path[1] + 1}` : ''
    throw new Error(
      issue.path[0] === 'lines'
        ? `Проверьте строку М-15${row}: наименование и единица обязательны, количество должно быть положительным числом.`
        : `Проверьте распределение${row}: количество и коэффициент должны быть положительными числами.`,
    )
  }
  const documentIds =
    context?.documentIds ??
    new Set(
      workspace.qualityWorkflow?.receiptDocuments
        ?.filter((doc) => doc.kind === 'm15')
        .map((doc) => doc.id),
    )
  if (!documentIds.has(value.id)) throw new Error('Учётная М-15 не найдена.')
  const lines = new Set(value.lines.map((row) => row.id))
  if (lines.size !== value.lines.length)
    throw new Error('Повторяются ID строк М-15.')
  if (value.mode === 'independent') {
    validateIndependentM15(value, workspace, context?.projects)
    return
  }
  if (value.mode === 'linked') {
    validateLinkedM15Workspace(
      {
        ...workspace,
        m15Reconciliations: [
          ...(workspace.m15Reconciliations ?? []).filter(
            (record) => record.id !== value.id,
          ),
          value,
        ],
      },
      workspace,
    )
    return
  }
  if (value.mode === 'automatic') {
    if (value.allocations.length)
      throw new Error(
        'Автоматическая сверка не использует ручные распределения.',
      )
    const materials = new Set(
      value.lines.map((line) =>
        JSON.stringify([
          normalizeOperationSearch(line.name),
          m15Unit(line.unit),
        ]),
      ),
    )
    if (materials.size !== value.lines.length)
      throw new Error('Повторяется материал с одной единицей измерения.')
    return
  }
  if (value.lines.some((line) => line.quantity <= 0))
    throw new Error(
      'Количество в строке М-15 должно быть положительным числом.',
    )
  const index = context?.receipts ?? m15ReceiptIndex(workspace),
    pairs = new Set<string>(),
    totals = new Map<string, number>()
  for (const allocation of value.allocations) {
    if (!lines.has(allocation.lineId))
      throw new Error('Строка М-15 для распределения не найдена.')
    const key = JSON.stringify([allocation.lineId, allocation.receiptId])
    if (pairs.has(key))
      throw new Error('Получение повторно распределено на ту же строку М-15.')
    pairs.add(key)
    if (
      m15AllocationStale(allocation, index.get(allocation.receiptId), value.id)
    )
      throw new Error(
        'Получение изменилось или относится к другой М-15. Обновите сопоставление.',
      )
    totals.set(
      allocation.receiptId,
      m15Precise((totals.get(allocation.receiptId) ?? 0) + allocation.quantity),
    )
  }
  for (const [receiptId, total] of totals) {
    const available = index.get(receiptId)!.quantity
    if (total > available && !equalAmount(total, available))
      throw new Error(
        'Распределённое количество превышает фактическое получение.',
      )
  }
}
/** Receipt corrections may make an old reconciliation stale, but must not block the receipt. */
export function validateM15Workspace(
  next: M15Workspace,
  previous?: M15Workspace | null,
) {
  if (
    next.m15Reconciliations?.some((record) => record.mode === 'linked') ||
    previous?.m15Reconciliations?.some((record) => record.mode === 'linked')
  )
    validateLinkedM15Workspace(next, previous)
  const before = new Map(
    previous?.m15Reconciliations?.map((row) => [row.id, row]),
  )
  const ids = new Set<string>()
  let context:
    | {
        receipts: ReadonlyMap<string, M15Receipt>
        documentIds: ReadonlySet<string>
        projects?: ReadonlyMap<
          string,
          NonNullable<M15Workspace['lines']>[number]
        >
      }
    | undefined
  for (const record of next.m15Reconciliations ?? []) {
    m15ReconciliationSchema.parse(record)
    if (ids.has(record.id)) throw new Error('Повторяется сверка одной М-15.')
    ids.add(record.id)
    if (record.mode === 'independent') {
      context ??= {
        receipts: m15ReceiptIndex(next),
        projects: new Map(next.lines?.map((line) => [String(line.id), line])),
        documentIds: new Set(
          next.qualityWorkflow?.receiptDocuments
            ?.filter((doc) => doc.kind === 'm15')
            .map((doc) => doc.id),
        ),
      }
      validateM15Reconciliation(record, next, context)
      continue
    }
    // Linked composition was validated once above across the whole workspace.
    if (record.mode === 'linked') continue
    if (JSON.stringify(record) !== JSON.stringify(before.get(record.id))) {
      context ??= {
        receipts: m15ReceiptIndex(next),
        documentIds: new Set(
          next.qualityWorkflow?.receiptDocuments
            ?.filter((doc) => doc.kind === 'm15')
            .map((doc) => doc.id),
        ),
      }
      validateM15Reconciliation(record, next, context)
    }
  }
}
