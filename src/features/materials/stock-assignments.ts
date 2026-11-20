import {
  preciseProjectQuantity as precise,
  stockAssignmentKey,
} from './project-change-types'
import type { StockTransfer } from './project-change-types'
import type { IssueMovement } from './material-issues'
import type { QualityWorkflow } from './quality-workflow'
import { acceptedAfterInspection } from './quality-workflow'

export type AssignmentWorkspace = {
  materialReceipts: Array<{
    id: string
    projectLineId: string
    quantity: number
    date?: string
  }>
  materialIssues: Array<
    IssueMovement & { id?: string; projectLineId?: string; date?: string }
  >
  qualityWorkflow?: QualityWorkflow
  stockTransfers?: StockTransfer[]
}
export type StockAssignment = {
  receiptId: string
  projectLineId: string
  retained: number
  stock: number
  approved: number
  issued: number
  quarantined: number
  transferredIn: number
  transferredOut: number
}
/** One physical receipt; ownership changes never create another receipt or inspection. */
export function stockAssignments(
  workspace: AssignmentWorkspace,
  throughDate = '9999-12-31',
  validate = false,
) {
  const result = new Map<string, StockAssignment>()
  const receipts = new Map(
    workspace.materialReceipts.map((item) => [item.id, item]),
  )
  const get = (receiptId: string, projectLineId: string) => {
    const key = stockAssignmentKey(receiptId, projectLineId)
    let value = result.get(key)
    if (!value) {
      value = {
        receiptId,
        projectLineId,
        retained: 0,
        stock: 0,
        approved: 0,
        issued: 0,
        quarantined: 0,
        transferredIn: 0,
        transferredOut: 0,
      }
      result.set(key, value)
    }
    return value
  }
  type Event = { date: string; rank: number; order: number; run: () => void }
  const events: Event[] = []
  const add = (date: string, rank: number, run: () => void, order = 0) =>
    events.push({ date, rank, order, run })
  const requireAmount = (available: number, amount: number, label: string) => {
    if (validate && precise(available) < precise(amount))
      throw new Error(
        `${label}: недостаточно остатка партии на этом шифре и на выбранную дату.`,
      )
  }
  for (const receipt of receipts.values())
    add(receipt.date ?? '', 0, () => {
      const owner = get(receipt.id, receipt.projectLineId)
      owner.stock = precise(owner.stock + receipt.quantity)
      owner.retained = precise(owner.retained + receipt.quantity)
    })
  const approvals = new Map<string, number>()
  const acceptedReturns = new Map<string, number>()
  for (const entry of workspace.qualityWorkflow?.cases ?? [])
    for (const rev of entry.revisions) {
      if (!rev.avk?.signedOn) continue
      for (const row of rev.zni.rows) {
        const receipt = receipts.get(row.receiptId)
        if (!receipt) continue
        add(
          [
            rev.avk.signedOn,
            rev.avk.date,
            rev.zni.signedOn ?? '',
            rev.zni.date,
            rev.zni.inspectionDate,
            entry.basis.date,
            receipt.date ?? '',
          ]
            .sort()
            .at(-1)!,
          1,
          () => {
            const key = JSON.stringify([entry.id, row.receiptId])
            const amount = precise(
              acceptedAfterInspection(rev, row) -
                (acceptedReturns.get(key) ?? 0),
            )
            const owner = get(row.receiptId, receipt.projectLineId)
            owner.approved = precise(
              owner.approved + amount - (approvals.get(key) ?? 0),
            )
            approvals.set(key, amount)
          },
          rev.revision,
        )
      }
    }
  for (const issue of workspace.materialIssues) {
    const receipt = receipts.get(issue.receiptId)
    if (!receipt) continue
    const lineId = issue.projectLineId ?? receipt.projectLineId
    add(issue.date ?? '', 4, () => {
      const owner = get(issue.receiptId, lineId)
      requireAmount(owner.stock - owner.quarantined, issue.quantity, 'Выдача')
      // The root receipt validator handles approvals for historical issues. Transferred stock is always approved.
      if (lineId !== receipt.projectLineId)
        requireAmount(
          owner.approved,
          issue.quantity,
          'Выдача перенесённого материала',
        )
      owner.stock = precise(owner.stock - issue.quantity)
      owner.issued = precise(owner.issued + issue.quantity)
      owner.approved = precise(owner.approved - issue.quantity)
    })
    for (const back of issue.siteReturns ?? [])
      add(back.date, 2, () => {
        const owner = get(issue.receiptId, lineId)
        owner.stock = precise(owner.stock + back.quantity)
        owner.issued = precise(owner.issued - back.quantity)
        if (back.condition === 'good')
          owner.approved = precise(owner.approved + back.quantity)
        else owner.quarantined = precise(owner.quarantined + back.quantity)
      })
  }
  for (const transfer of workspace.stockTransfers ?? [])
    add(
      transfer.date,
      3,
      () => {
        const from = get(transfer.receiptId, transfer.fromProjectLineId)
        const to = get(transfer.receiptId, transfer.toProjectLineId)
        requireAmount(
          Math.min(from.stock - from.quarantined, from.approved),
          transfer.quantity,
          'Перенос',
        )
        from.stock = precise(from.stock - transfer.quantity)
        from.retained = precise(from.retained - transfer.quantity)
        from.approved = precise(from.approved - transfer.quantity)
        from.transferredOut = precise(from.transferredOut + transfer.quantity)
        to.stock = precise(to.stock + transfer.quantity)
        to.retained = precise(to.retained + transfer.quantity)
        to.approved = precise(to.approved + transfer.quantity)
        to.transferredIn = precise(to.transferredIn + transfer.quantity)
      },
      transfer.sequence,
    )
  for (const back of workspace.qualityWorkflow?.customerReturns ?? []) {
    const receipt = receipts.get(back.receiptId)
    if (!receipt) continue
    add(back.date, 5, () => {
      const lineId = back.projectLineId ?? receipt.projectLineId
      const owner = get(back.receiptId, lineId)
      requireAmount(owner.stock, back.quantity, 'Возврат заказчику')
      if (
        lineId !== receipt.projectLineId &&
        (back.kind !== 'surplus' || back.source !== 'accepted')
      )
        throw new Error(
          'Перенесённый материал возвращается как излишек из принятого количества.',
        )
      owner.stock = precise(owner.stock - back.quantity)
      owner.retained = precise(owner.retained - back.quantity)
      if (back.kind === 'surplus' && back.source === 'accepted') {
        const key = JSON.stringify([back.caseId, back.receiptId])
        acceptedReturns.set(
          key,
          precise((acceptedReturns.get(key) ?? 0) + back.quantity),
        )
        if (approvals.has(key)) {
          requireAmount(
            owner.approved,
            back.quantity,
            'Возврат принятого материала',
          )
          owner.approved = precise(owner.approved - back.quantity)
          approvals.set(key, precise(approvals.get(key)! - back.quantity))
        }
      }
    })
  }
  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.rank - b.rank || a.order - b.order,
  )
  for (const event of events) if (event.date <= throughDate) event.run()
  return result
}

/** A backdated movement also reserves movements already recorded after its date. */
export function availableAssignedStock(
  workspace: AssignmentWorkspace,
  date: string,
) {
  const current = stockAssignments(workspace)
  const dated = stockAssignments(workspace, date)
  return new Map(
    [...current].map(([key, value]) => {
      const then = dated.get(key)
      return [
        key,
        {
          ...value,
          available: Math.max(
            0,
            Math.min(
              value.stock - value.quarantined,
              (then?.stock ?? 0) - (then?.quarantined ?? 0),
            ),
          ),
          availableApproved: Math.max(
            0,
            Math.min(
              value.stock - value.quarantined,
              value.approved,
              (then?.stock ?? 0) - (then?.quarantined ?? 0),
              then?.approved ?? 0,
            ),
          ),
        },
      ]
    }),
  )
}
