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
  remaining: 'Осталось получить',
  withoutRequests: 'Без заявок',
  ...receiptIndicatorLabels,
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
    withoutRequests: 0,
    received: 0,
    returned: 0,
    awaitingInspection: 0,
    awaitingAct: 0,
    toReturn: 0,
    availableToIssue: 0,
  }
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
