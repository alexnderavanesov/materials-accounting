import { requestReceiptProgress } from './receipt-balances'
import type { receiptBalances } from './receipt-balances'

export const receiptIndicatorLabels = {
  received: 'Получено',
  returned: 'Возвращено',
  awaitingInspection: 'Ожидает инспекции',
  awaitingAct: 'Ожидает АВК',
  toReturn: 'К возврату',
  availableToIssue: 'Доступно к выдаче',
} as const

export const overviewIndicatorLabels = {
  received: receiptIndicatorLabels.received,
  remaining: 'Осталось получить',
  awaitingInspection: receiptIndicatorLabels.awaitingInspection,
  awaitingAct: receiptIndicatorLabels.awaitingAct,
  availableToIssue: receiptIndicatorLabels.availableToIssue,
  toReturn: receiptIndicatorLabels.toReturn,
  returned: receiptIndicatorLabels.returned,
} as const

export type OverviewIndicator = keyof typeof overviewIndicatorLabels
export type OverviewSort = OverviewIndicator | ''
export type OverviewIndicators = Record<OverviewIndicator, number>
export const receiptIndicatorKeys = Object.keys(
  receiptIndicatorLabels,
) as Array<keyof typeof receiptIndicatorLabels>
export const overviewIndicatorKeys = Object.keys(
  overviewIndicatorLabels,
) as Array<OverviewIndicator>

export function isOverviewSort(value: unknown): value is OverviewSort {
  return (
    typeof value === 'string' &&
    (value === '' || Object.hasOwn(overviewIndicatorLabels, value))
  )
}

export function emptyOverviewIndicators(): OverviewIndicators {
  return {
    remaining: 0,
    received: 0,
    returned: 0,
    awaitingInspection: 0,
    awaitingAct: 0,
    toReturn: 0,
    availableToIssue: 0,
  }
}

/** Compute each request position separately: surplus cannot cover another request. */
export function requestRemainingQuantities(
  requests: ReadonlyArray<{ id: string; quantity: number }>,
  received: ReadonlyMap<string, number>,
) {
  return new Map(
    requests.map((request) => [
      request.id,
      requestReceiptProgress(request.quantity, received.get(request.id) ?? 0)
        .remaining,
    ]),
  )
}

/** Count grouped materials; use saved operation units for quantity breakdowns. */
export function summarizeOverviewIndicators({
  rows,
  requests,
  receipts,
  balances,
  remainingByRequest,
}: {
  rows: ReadonlyArray<{ indicators: OverviewIndicators }>
  requests: ReadonlyArray<{ id: string; projectUnit: string }>
  receipts: ReadonlyArray<{ id: string; projectUnit: string }>
  balances: ReturnType<typeof receiptBalances>
  remainingByRequest: ReadonlyMap<string, number>
}) {
  return Object.fromEntries(
    overviewIndicatorKeys.map((key) => {
      const count = rows.reduce(
        (total, row) => total + Number(row.indicators[key] > 0),
        0,
      )
      const totals = new Map<string, number>()
      for (const entry of key === 'remaining' ? requests : receipts) {
        const quantity =
          key === 'remaining'
            ? (remainingByRequest.get(entry.id) ?? 0)
            : (balances.get(entry.id)?.[key] ?? 0)
        if (quantity <= 0) continue
        totals.set(
          entry.projectUnit,
          (totals.get(entry.projectUnit) ?? 0) + quantity,
        )
      }
      return [
        key,
        {
          count,
          quantities: [...totals].map(([unit, quantity]) => ({
            unit,
            quantity,
          })),
        },
      ]
    }),
  ) as Record<
    OverviewIndicator,
    { count: number; quantities: Array<{ unit: string; quantity: number }> }
  >
}

export function receiptIndicatorsByLine(
  receipts: Array<{ id: string; projectLineId: string }>,
  balances: ReturnType<typeof receiptBalances>,
) {
  const result = new Map<string, OverviewIndicators>()
  for (const receipt of receipts) {
    const totals =
      result.get(receipt.projectLineId) ?? emptyOverviewIndicators()
    const balance = balances.get(receipt.id)
    for (const key of receiptIndicatorKeys) totals[key] += balance?.[key] ?? 0
    result.set(receipt.projectLineId, totals)
  }
  return result
}

/** Stable priority ordering: never compare metres with pieces or hide other rows. */
export function prioritizeOverviewRows<
  T extends { indicators: OverviewIndicators },
>(rows: Array<T>, sort: OverviewSort): Array<T> {
  if (!sort) return rows
  const priority: Array<T> = []
  const rest: Array<T> = []
  for (const row of rows) {
    ;(row.indicators[sort] > 0 ? priority : rest).push(row)
  }
  return priority.concat(rest)
}
