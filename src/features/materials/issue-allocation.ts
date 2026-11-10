import { issueStockOnDate } from './operation-chronology'
import type { ChronologyWorkspace } from './operation-chronology'
import { receiptBalances } from './receipt-balances'
import { inspectionApprovals } from './quality-workflow'
import type { IssueMovement } from './material-issues'

const precise = (value: number) => Number(value.toPrecision(15))

/** Current free stock also reserves later recorded movements when issuing retrospectively. */
export function issueAvailability(
  workspace: ChronologyWorkspace,
  date: string,
) {
  const current = receiptBalances(
    workspace.materialReceipts.map((receipt) => ({
      id: String(receipt.id),
      requestId: String(receipt.requestId),
      quantity: Number(receipt.quantity),
    })),
    workspace.qualityWorkflow,
    workspace.qualityWorkflow
      ? inspectionApprovals(workspace.qualityWorkflow)
      : [],
    workspace.materialIssues as unknown as IssueMovement[],
  )
  const dated = issueStockOnDate(workspace, date)
  return new Map(
    [...current].map(([id, balance]) => {
      const available = precise(
        Math.min(
          dated.get(id)?.physical ?? 0,
          balance.availableToIssue + balance.availableBeforeInspection,
        ),
      )
      const approved = precise(
        Math.min(
          available,
          balance.availableToIssue,
          dated.get(id)?.approved ?? 0,
        ),
      )
      return [id, { available, approved }]
    }),
  )
}

export function allocateIssue(quantity: number, approvedAvailable: number) {
  const approved = Math.max(0, Math.min(quantity, approvedAvailable))
  return {
    approved,
    beforeInspection: Math.max(0, precise(quantity - approved)),
  }
}

/** Check new/changed allocations only: a later AVK does not rewrite an earlier actual issue. */
export function validateIssueAllocation(
  next: ChronologyWorkspace,
  previous?: ChronologyWorkspace | null,
) {
  if (!previous) return
  const oldById = new Map(
    previous.materialIssues.map((item) => [item.id, item]),
  )
  const changed = next.materialIssues.filter((item) => {
    const old = oldById.get(item.id)
    return (
      !old ||
      ['receiptId', 'quantity', 'date'].some((key) => item[key] !== old[key])
    )
  })
  if (!changed.some((item) => item.beforeInspection)) return
  const changedIds = new Set(changed.map((item) => item.id))
  const baseline = {
    ...next,
    materialIssues: next.materialIssues.filter(
      (item) => !changedIds.has(item.id),
    ),
  }
  const byDate = new Map<string, typeof changed>()
  for (const item of changed) {
    const date = String(item.date)
    const entries = byDate.get(date) ?? []
    entries.push(item)
    byDate.set(date, entries)
  }
  for (const [date, entries] of [...byDate].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const availability = issueAvailability(baseline, date)
    const totals = new Map<string, { quantity: number; early: number }>()
    for (const item of entries) {
      const id = String(item.receiptId)
      const total = totals.get(id) ?? { quantity: 0, early: 0 }
      total.quantity = precise(total.quantity + Number(item.quantity))
      if (item.beforeInspection)
        total.early = precise(total.early + Number(item.quantity))
      totals.set(id, total)
    }
    for (const [id, total] of totals) {
      if (!total.early) continue
      const available = availability.get(id) ?? { available: 0, approved: 0 }
      if (total.quantity > available.available)
        throw new Error(
          'Выдача превышает доступный остаток на выбранную дату без непринятого материала. Обновите список материалов.',
        )
      if (
        total.early !==
        allocateIssue(total.quantity, available.approved).beforeInspection
      )
        throw new Error(
          'Статус входного контроля изменился. Обновите список: количество по подписанному АВК должно выдаваться с ВК, остальное — до ВК.',
        )
    }
    baseline.materialIssues.push(...entries)
  }
}
