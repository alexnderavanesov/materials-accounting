import { netIssued, quarantinedReturn, siteReturned } from './material-issues'
import type { IssueMovement } from './material-issues'
import {
  approvedCustomerReturnTotals,
  acceptedAfterInspection,
  customerReturnTotals,
  currentInspection,
  pendingCustomerReturns,
  rejectedReturnsByCase,
  rejectedStockTotals,
} from './quality-workflow'
import type { QualityWorkflow, InspectionRow } from './quality-workflow'
import { getOperationAlternative, getOperationConversion } from './domain'

type Receipt = { id: string; requestId: string; quantity: number }
const precise = (value: number) => Number(value.toPrecision(15))
export { receivedByRequest } from './quality-workflow'

/** Quantities credited to a request already exclude actual rejected returns. */
export function requestReceiptProgress(quantity: number, received: number) {
  const credited = precise(received)
  const remaining = Math.max(0, precise(precise(quantity) - credited))
  return { received: credited, remaining, complete: remaining === 0 }
}

export function receiptBalances(
  receipts: Array<Receipt>,
  workflow: QualityWorkflow | undefined,
  controls: Array<{ receiptId: string; quantity: number; status: string }>,
  issues: Array<IssueMovement>,
) {
  const rejectedStock = rejectedStockTotals(workflow)
  const returned = customerReturnTotals(workflow)
  const rejectedReturned = workflow
    ? rejectedReturnsByCase(workflow)
    : undefined
  const approvedReturned = approvedCustomerReturnTotals(workflow)
  const uninspectedReturned = new Map<string, number>()
  const acceptedReturned = new Map<string, number>()
  for (const item of workflow?.customerReturns ?? []) {
    if (item.kind !== 'surplus') continue
    const target =
      item.source === 'uninspected' ? uninspectedReturned : acceptedReturned
    target.set(
      item.receiptId,
      precise((target.get(item.receiptId) ?? 0) + item.quantity),
    )
  }
  const result = new Map(
    receipts.map((receipt) => [
      receipt.id,
      {
        received: receipt.quantity,
        returned: returned.get(receipt.id) ?? 0,
        retained: precise(receipt.quantity - (returned.get(receipt.id) ?? 0)),
        toReturn: 0,
        awaitingInspection: 0,
        awaitingAct: 0,
        availableToIssue: 0,
        stock: 0,
        returnedFromSite: 0,
        quarantined: 0,
        issuedBeforeInspection: 0,
        availableBeforeInspection: 0,
      },
    ]),
  )
  const decided = new Map<string, number>(),
    accepted = new Map<string, number>(),
    toReturn = new Map<string, number>()
  for (const entry of workflow?.cases ?? []) {
    // Match the return list: a new unsigned revision pauses returns for this case.
    for (const item of pendingCustomerReturns(
      workflow!,
      entry,
      rejectedReturned,
    )) {
      toReturn.set(
        item.row.receiptId,
        precise((toReturn.get(item.row.receiptId) ?? 0) + item.quantity),
      )
    }
    const latest = currentInspection(entry)
    const revision = latest.zni.signedOn
      ? latest
      : [...entry.revisions].reverse().find((item) => item.zni.signedOn)
    if (!revision) continue
    for (const row of revision.zni.rows) {
      decided.set(
        row.receiptId,
        precise((decided.get(row.receiptId) ?? 0) + row.presented),
      )
      accepted.set(
        row.receiptId,
        precise(
          (accepted.get(row.receiptId) ?? 0) +
            acceptedAfterInspection(revision, row),
        ),
      )
    }
  }
  const approved = new Map<string, number>(),
    issued = new Map<string, number>()
  for (const control of controls)
    if (control.status === 'signed') {
      approved.set(
        control.receiptId,
        precise((approved.get(control.receiptId) ?? 0) + control.quantity),
      )
    }
  for (const issue of issues) {
    const balance = result.get(issue.receiptId)
    if (balance) {
      balance.returnedFromSite = precise(
        balance.returnedFromSite + siteReturned(issue),
      )
      balance.quarantined = precise(
        balance.quarantined + quarantinedReturn(issue),
      )
    }
    issued.set(
      issue.receiptId,
      precise((issued.get(issue.receiptId) ?? 0) + netIssued(issue)),
    )
  }
  for (const [id, balance] of result) {
    balance.toReturn = toReturn.get(id) ?? 0
    balance.awaitingInspection = Math.max(
      0,
      precise(
        balance.received -
          (decided.get(id) ?? 0) -
          (uninspectedReturned.get(id) ?? 0),
      ),
    )
    balance.awaitingAct = Math.max(
      0,
      precise(
        (accepted.get(id) ?? 0) -
          (approved.get(id) ?? 0) -
          (acceptedReturned.get(id) ?? 0) +
          (approvedReturned.get(id) ?? 0),
      ),
    )
    balance.availableToIssue = Math.max(
      0,
      precise(
        Math.min(
          balance.retained,
          (approved.get(id) ?? 0) - (approvedReturned.get(id) ?? 0),
        ) -
          (issued.get(id) ?? 0) -
          balance.quarantined,
      ),
    )
    balance.stock = precise(balance.retained - (issued.get(id) ?? 0))
    balance.availableBeforeInspection = Math.max(
      0,
      precise(
        balance.stock -
          (rejectedStock.get(id) ?? 0) -
          balance.quarantined -
          balance.availableToIssue,
      ),
    )
    balance.issuedBeforeInspection = Math.max(
      0,
      precise(
        (issued.get(id) ?? 0) -
          ((approved.get(id) ?? 0) - (approvedReturned.get(id) ?? 0)),
      ),
    )
  }
  return result
}

export function customerReturnAlternative(
  quantity: number,
  row: InspectionRow,
  receipt: Parameters<typeof getOperationConversion>[2],
  line: Parameters<typeof getOperationConversion>[0],
) {
  return getOperationAlternative(
    quantity,
    getOperationConversion(line, row.unit, receipt, {
      quantity: row.presented,
      projectUnit: row.unit,
      altUnit: row.altUnit,
      altUnitFactor: row.altUnitFactor,
      altQuantity: null,
    }),
    receipt,
  )
}
