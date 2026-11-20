import { formatCalendarDate, normalizeCalendarDate } from './calendar-date'
import type { StockTransfer } from './project-change-types'
import { z } from 'zod'

const calendarDate = z
  .string()
  .refine(
    (value) =>
      normalizeCalendarDate(value) === value &&
      /^\d{4}-\d{2}-\d{2}$/.test(value),
    'Укажите корректную дату возврата с площадки.',
  )
export const siteReturnSchema = z
  .object({
    id: z.string().min(1).max(500),
    date: calendarDate,
    quantity: z.number().finite().positive(),
    condition: z.enum(['good', 'quarantine']),
    document: z.string().max(20000),
    note: z.string().max(20000),
  })
  .strict()
export type SiteReturn = z.infer<typeof siteReturnSchema>
export const beforeInspectionSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, 'Укажите причину выдачи до ВК.')
      .max(20000),
  })
  .strict()
export type IssueMovement = {
  receiptId: string
  quantity: number
  beforeInspection?: z.infer<typeof beforeInspectionSchema>
  siteReturns?: SiteReturn[]
}
const precise = (value: number) => Number(value.toPrecision(15))
export function siteReturned(issue: Pick<IssueMovement, 'siteReturns'>) {
  return precise(
    (issue.siteReturns ?? []).reduce((sum, item) => sum + item.quantity, 0),
  )
}
export function quarantinedReturn(issue: Pick<IssueMovement, 'siteReturns'>) {
  return precise(
    (issue.siteReturns ?? []).reduce(
      (sum, item) =>
        sum + (item.condition === 'quarantine' ? item.quantity : 0),
      0,
    ),
  )
}
export function netIssued(issue: IssueMovement) {
  return precise(issue.quantity - siteReturned(issue))
}
/** Quarantined returns restore physical stock, but never release approval capacity. */
export function issueApprovalConsumption(issue: IssueMovement) {
  return precise(netIssued(issue) + quarantinedReturn(issue))
}

type RecordValue = Record<string, unknown>
type MovementWorkspace = {
  stockTransfers?: StockTransfer[]
  materialIssues: RecordValue[]
  materialReceipts: RecordValue[]
  qualityWorkflow?: {
    customerReturns?: Array<{
      receiptId: string
      date: string
      quantity: number
    }>
  }
}

/** Runs both before local changes and in the server transaction. No data repair. */
export function validateIssueMovements(
  next: MovementWorkspace,
  previous?: MovementWorkspace | null,
) {
  const receipts = new Map(
    next.materialReceipts.map((item) => [String(item.id), item]),
  )
  const issues = new Map(
    next.materialIssues.map((item) => [String(item.id), item]),
  )
  const previousIssues = new Map(
    previous?.materialIssues.map((item) => [String(item.id), item]),
  )
  const returnIds = new Set<string>()
  const fail = (message: string): never => {
    throw new Error(message)
  }
  for (const issue of next.materialIssues) {
    const receipt = receipts.get(String(issue.receiptId))
    if (!receipt) fail('Получение для выдачи не найдено.')
    if (
      ((issue.projectLineId !== undefined ||
        issue.beforeInspection !== undefined ||
        issue.siteReturns !== undefined) &&
        issue.projectLineId !== receipt!.projectLineId &&
        !next.stockTransfers?.some(
          (item) =>
            item.receiptId === issue.receiptId &&
            item.toProjectLineId === issue.projectLineId,
        )) ||
      (issue.projectUnit !== undefined &&
        issue.projectUnit !== receipt!.projectUnit)
    )
      fail('Материал и единица выдачи должны соответствовать поступлению.')
    if (
      issue.beforeInspection !== undefined ||
      issue.siteReturns !== undefined
    ) {
      if (!calendarDate.safeParse(issue.date).success)
        fail('Укажите корректную дату выдачи.')
      if (Number(issue.quantity) > Number(receipt!.quantity))
        fail('Выдача превышает количество поступления.')
    }
    if (issue.beforeInspection !== undefined) {
      const result = beforeInspectionSchema.safeParse(issue.beforeInspection)
      if (!result.success) fail('Укажите причину выдачи до ВК.')
      if (!String(issue.receiver ?? '').trim())
        fail('Укажите получателя выдачи до ВК.')
    }
    const parsed = z.array(siteReturnSchema).safeParse(issue.siteReturns ?? [])
    if (!parsed.success)
      fail('Проверьте дату, количество и состояние возврата с площадки.')
    const returns = parsed.data!
    if (previous && returns.length && !previousIssues.has(String(issue.id)))
      fail(
        'Сначала сохраните исходную выдачу, затем оформите возврат с площадки.',
      )
    let total = 0
    for (const item of returns) {
      if (returnIds.has(item.id)) fail('Повторный ID возврата с площадки.')
      returnIds.add(item.id)
      if (
        item.date < String(issue.date ?? '') ||
        item.date < String(receipt!.date ?? '')
      )
        fail('Возврат с площадки не может быть раньше выдачи и получения.')
      total = precise(total + item.quantity)
    }
    if (total > Number(issue.quantity))
      fail(
        'Возврат с площадки превышает количество, оставшееся по этой выдаче.',
      )
  }
  for (const old of previous?.materialIssues ?? []) {
    const current = issues.get(String(old.id))
    const oldReturns = (old.siteReturns ?? []) as SiteReturn[]
    if (oldReturns.length) {
      if (!current)
        fail('Нельзя удалить выдачу: по ней есть возврат с площадки.')
      const updated = new Map(
        ((current!.siteReturns ?? []) as SiteReturn[]).map((item) => [
          item.id,
          item,
        ]),
      )
      for (const item of oldReturns) {
        const match = updated.get(item.id)
        if (
          !match ||
          Object.keys(item).some(
            (key) =>
              item[key as keyof SiteReturn] !== match[key as keyof SiteReturn],
          )
        )
          fail('Сохранённый возврат с площадки нельзя удалить или переписать.')
      }
      for (const key of [
        'quantity',
        'date',
        'receiptId',
        'projectLineId',
        'projectUnit',
        'receiver',
        'document',
      ])
        if (old[key] !== current![key])
          fail('Выдача с возвратом с площадки защищена от изменения.')
    }
    if (
      current &&
      JSON.stringify(old.beforeInspection) !==
        JSON.stringify(current.beforeInspection)
    )
      fail('Нельзя менять режим или причину сохранённой выдачи.')
  }

  // A later site return must not finance an earlier issue/customer return.
  const tracked = new Set(
    next.materialIssues
      .filter(
        (item) =>
          item.beforeInspection ||
          (item.siteReturns as SiteReturn[] | undefined)?.length,
      )
      .map((item) => String(item.receiptId)),
  )
  const movements: Array<{ receiptId: string; date: string; delta: number }> =
    []
  for (const issue of next.materialIssues) {
    if (!tracked.has(String(issue.receiptId))) continue
    movements.push({
      receiptId: String(issue.receiptId),
      date: String(issue.date),
      delta: -Number(issue.quantity),
    })
    for (const item of (issue.siteReturns ?? []) as SiteReturn[])
      movements.push({
        receiptId: String(issue.receiptId),
        date: item.date,
        delta: item.quantity,
      })
  }
  for (const item of next.qualityWorkflow?.customerReturns ?? [])
    if (tracked.has(item.receiptId))
      movements.push({ ...item, delta: -item.quantity })
  movements.sort((a, b) => a.date.localeCompare(b.date) || b.delta - a.delta)
  const stock = new Map(
    [...tracked].map((key) => [key, Number(receipts.get(key)?.quantity ?? 0)]),
  )
  for (const movement of movements) {
    if (movement.date < String(receipts.get(movement.receiptId)?.date ?? ''))
      fail('Движение материала не может быть раньше получения.')
    const remaining = precise(
      (stock.get(movement.receiptId) ?? 0) + movement.delta,
    )
    if (remaining < 0)
      fail(
        `На ${formatCalendarDate(movement.date)} недостаточно материала на складе с учётом выдач и возвратов.`,
      )
    stock.set(movement.receiptId, remaining)
  }
}
