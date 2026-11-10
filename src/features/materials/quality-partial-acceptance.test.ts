import { expect, it } from 'vitest'
import { acceptFixture } from './quality-workflow.fixtures'
import {
  correctMaterialRejection,
  createAcceptedInspectionAct,
  currentInspection,
  customerReturnReason,
  inspectionApprovals,
  localToday,
  newInspection,
  recordCustomerReturn,
  recordSurplusReturn,
  receivedByRequest,
  rejectInspectionAct,
  rejectedReturnAllocations,
  signInspection,
  validateQualityWorkspace,
} from './quality-workflow'
import { receiptBalances, requestReceiptProgress } from './receipt-balances'
import { buildQualityPrintData } from './quality-print-data'
import { workspaceSnapshotSchema } from './workspace-snapshot'

function fixture(received = 20, zniAccepted = received, requested = received) {
  const workspace = acceptFixture(10)
  workspace.materialRequests = [
    {
      id: 'request',
      number: 'ЗП-1',
      date: localToday(),
      quantity: requested,
      projectLineId: 'line',
    },
  ]
  Object.assign(workspace.materialReceipts[0]!, {
    quantity: received,
    altQuantity: received * 2.5,
  })
  const revision = currentInspection(workspace.qualityWorkflow.cases[0]!)
  Object.assign(revision.zni.rows[0]!, {
    presented: received,
    accepted: zniAccepted,
    result:
      zniAccepted === received
        ? 'accepted'
        : zniAccepted === 0
          ? 'rejected'
          : 'remarks',
    remarks: zniAccepted === received ? '' : 'Замечания ЗНИ',
  })
  if (!zniAccepted) revision.avk = null
  else revision.avk!.signedOn = null
  return workspace
}
const receipts = (workspace: ReturnType<typeof fixture>) =>
  workspace.materialReceipts as unknown as Parameters<typeof receiptBalances>[0]
const balance = (workspace: ReturnType<typeof fixture>) =>
  receiptBalances(
    receipts(workspace),
    workspace.qualityWorkflow,
    inspectionApprovals(workspace.qualityWorkflow),
    [],
  )
    [Symbol.iterator]()
    .next().value![1]
const remaining = (workspace: ReturnType<typeof fixture>) =>
  requestReceiptProgress(
    Number(workspace.materialRequests[0]!.quantity),
    receivedByRequest(receipts(workspace), workspace.qualityWorkflow).get(
      'request',
    ) ?? 0,
  ).remaining
function reject(workspace: ReturnType<typeof fixture>, quantity: number) {
  workspace.qualityWorkflow.cases[0] = rejectInspectionAct(
    workspace.qualityWorkflow.cases[0]!,
    'materials',
    localToday(),
    'Ржавчина',
    [{ receiptId: 'receipt', quantity }],
  )
}
function sign(workspace: ReturnType<typeof fixture>) {
  const entry = workspace.qualityWorkflow.cases[0]!
  entry.revisions[entry.revisions.length - 1] = signInspection(
    currentInspection(entry),
    'avk',
    localToday(),
  )
}
function returnQuantity(
  workspace: ReturnType<typeof fixture>,
  quantity: number,
) {
  workspace.qualityWorkflow = recordCustomerReturn(
    workspace.qualityWorkflow,
    workspace.qualityWorkflow.cases[0]!.id,
    [{ receiptId: 'receipt', quantity }],
    localToday(),
    'ВОЗ-1',
  )
}

it('keeps the accepted 10 in AVK, restores 14 of a request for 24, and accepts a replacement without double counting', () => {
  const before = fixture(20, 20, 24)
  const next = structuredClone(before)
  reject(next, 10)
  validateQualityWorkspace(next, before)
  expect(balance(next)).toMatchObject({
    received: 20,
    stock: 20,
    toReturn: 10,
    awaitingAct: 10,
    availableToIssue: 0,
  })
  expect(remaining(next)).toBe(4)
  returnQuantity(next, 10)
  validateQualityWorkspace(next, before)
  expect(remaining(next)).toBe(14)
  expect(balance(next)).toMatchObject({
    stock: 10,
    returned: 10,
    toReturn: 0,
    awaitingAct: 10,
  })
  const returned = structuredClone(next)
  sign(next)
  validateQualityWorkspace(next, returned)
  // Also validate a single outbox patch combining rejection, return and signature.
  validateQualityWorkspace(next, before)
  expect(balance(next)).toMatchObject({
    availableToIssue: 10,
    awaitingAct: 0,
    toReturn: 0,
  })
  const entry = next.qualityWorkflow.cases[0]!
  expect(
    buildQualityPrintData(next, entry.id, 1, 'avk').materials[0],
  ).toMatchObject({ quantity: 10, accepted: 10, altQuantity: 25 })
  expect(
    buildQualityPrintData(next, entry.id, 1, 'zni').materials[0],
  ).toMatchObject({ quantity: 20, accepted: 20 })
  expect(
    customerReturnReason(next.qualityWorkflow.customerReturns![0]!, entry),
  ).toBe('Не принято по АВК')
  expect(() => returnQuantity(next, 1)).toThrow(/превышает/)
  const issued = structuredClone(next)
  issued.materialIssues = [
    {
      id: 'issue',
      receiptId: 'receipt',
      projectLineId: 'line',
      date: localToday(),
      quantity: 10,
    },
  ]
  validateQualityWorkspace(issued, next)
  issued.materialIssues[0]!.quantity = 11
  expect(() => validateQualityWorkspace(issued, next)).toThrow()

  const delivered = structuredClone(next)
  delivered.materialReceipts.push({
    ...delivered.materialReceipts[0]!,
    id: 'replacement',
    quantity: 14,
    altQuantity: 35,
  })
  validateQualityWorkspace(delivered, next)
  expect(remaining(delivered)).toBe(0)
  const replacement = newInspection(
    delivered.qualityWorkflow,
    [{ receiptId: 'replacement', quantity: 14 }],
    delivered.materialReceipts as unknown as Parameters<
      typeof newInspection
    >[2],
    delivered.lines as unknown as Parameters<typeof newInspection>[3],
    'app',
  )
  const rev = currentInspection(replacement)
  Object.assign(rev.zni.rows[0]!, { accepted: 14, result: 'accepted' })
  replacement.revisions[0] = signInspection(rev, 'zni', localToday())
  const accepted = currentInspection(replacement)
  accepted.avk = createAcceptedInspectionAct(replacement)
  Object.assign(accepted.avk, {
    number: 'АВК-2',
    checks: Array(10).fill('Проверено'),
    conclusion: 'Принято',
  })
  replacement.revisions[0] = signInspection(accepted, 'avk', localToday())
  delivered.qualityWorkflow.cases.push(replacement)
  validateQualityWorkspace(delivered, next)
  expect(
    inspectionApprovals(delivered.qualityWorkflow).reduce(
      (sum, row) => sum + row.quantity,
      0,
    ),
  ).toBe(24)
  expect(workspaceSnapshotSchema.parse(delivered)).toEqual(delivered)
})

it.each([
  [20, 20, 0, 20, 0],
  [20, 20, 10, 10, 10],
  [20, 20, 20, 0, 20],
  [20, 15, 5, 10, 10],
  [20, 0, 0, 0, 20],
  [2.5, 2, 0.75, 1.25, 1.25],
])(
  'balances receipt %s, ZNI %s, AVK rejection %s through actual returns',
  (received, zni, rejected, accepted, toReturn) => {
    const before = fixture(received, zni)
    const next = structuredClone(before)
    if (rejected) reject(next, rejected)
    validateQualityWorkspace(next, before)
    expect(balance(next)).toMatchObject({
      awaitingAct: accepted,
      toReturn,
      availableToIssue: 0,
    })
    if (toReturn) {
      returnQuantity(next, toReturn / 2)
      const partial = structuredClone(next)
      returnQuantity(next, toReturn / 2)
      validateQualityWorkspace(next, partial)
      expect(remaining(next)).toBe(toReturn)
      expect(balance(next)).toMatchObject({
        stock: accepted,
        toReturn: 0,
        returned: toReturn,
      })
    }
    if (accepted) {
      const unsigned = structuredClone(next)
      sign(next)
      validateQualityWorkspace(next, unsigned)
      expect(balance(next).availableToIssue).toBe(accepted)
    } else if (zni) expect(() => sign(next)).toThrow(/Отклонённый/)
  },
)

it('stores each return reason when ZNI and AVK both reject part of a batch', () => {
  const next = fixture(20, 15)
  reject(next, 5)
  returnQuantity(next, 10)
  expect(
    next.qualityWorkflow.customerReturns!.map((item) => [
      item.rejectedAt,
      item.quantity,
      customerReturnReason(item),
    ]),
  ).toEqual([
    ['zni', 5, 'Не принято по ЗНИ'],
    ['avk', 5, 'Не принято по АВК'],
  ])
  validateQualityWorkspace(next)
})

it('corrects a legacy whole-act rejection explicitly, retains its history and protects actual returned quantities', () => {
  const before = fixture()
  before.qualityWorkflow.cases[0] = rejectInspectionAct(
    before.qualityWorkflow.cases[0]!,
    'materials',
    localToday(),
    'Ржавчина',
  )
  returnQuantity(before, 10)
  const next = structuredClone(before)
  const entry = next.qualityWorkflow.cases[0]!
  next.qualityWorkflow.cases[0] = correctMaterialRejection(
    entry,
    [{ receiptId: 'receipt', quantity: 10 }],
    'Неприняты только 10 шт.',
  )
  validateQualityWorkspace(next, before)
  expect(next.qualityWorkflow.cases[0].revisions[0]).toEqual(
    before.qualityWorkflow.cases[0].revisions[0],
  )
  expect(balance(next)).toMatchObject({ awaitingAct: 10, toReturn: 0 })
  sign(next)
  validateQualityWorkspace(next, before)
  expect(balance(next).availableToIssue).toBe(10)
  const impossible = structuredClone(before)
  returnQuantity(impossible, 10)
  const updated = structuredClone(impossible)
  updated.qualityWorkflow.cases[0] = correctMaterialRejection(
    updated.qualityWorkflow.cases[0]!,
    [{ receiptId: 'receipt', quantity: 10 }],
    'Уточнение',
  )
  expect(() => validateQualityWorkspace(updated, impossible)).toThrow(
    /превышает/,
  )
})

it('protects signed partial results and rejects invalid quantities or foreign receipts', () => {
  for (const quantity of [-1, 0, 21, NaN])
    expect(() => reject(fixture(), quantity)).toThrow()
  const before = fixture()
  expect(() =>
    rejectInspectionAct(
      before.qualityWorkflow.cases[0]!,
      'materials',
      localToday(),
      'Причина',
      [{ receiptId: 'foreign', quantity: 1 }],
    ),
  ).toThrow()
  reject(before, 10)
  sign(before)
  const forged = structuredClone(before)
  currentInspection(
    forged.qualityWorkflow.cases[0]!,
  ).avk!.rejection!.quantities!.receipt = 5
  expect(() => validateQualityWorkspace(forged, before)).toThrow(/Историю/)
})

it('does not relabel an old ZNI return when a later AVK rejects more material', () => {
  const before = fixture(20, 15)
  returnQuantity(before, 5)
  const original = before.qualityWorkflow.customerReturns![0]!
  delete original.rejectedAt // Existing records before stage-specific return reasons.
  const next = structuredClone(before)
  reject(next, 5)
  expect(
    customerReturnReason(
      original,
      next.qualityWorkflow.cases[0],
      rejectedReturnAllocations(next.qualityWorkflow).get(original.id),
    ),
  ).toBe('Не принято по ЗНИ')
  expect(customerReturnReason(original, before.qualityWorkflow.cases[0])).toBe(
    'Не принято по ЗНИ',
  )
  expect(
    customerReturnReason(
      { ...original, rejectedAt: 'zni' },
      next.qualityWorkflow.cases[0],
    ),
  ).toBe('Не принято по ЗНИ')
})

it('allows an earlier ZNI return but does not backdate the AVK-rejected part', () => {
  const before = fixture(20, 15)
  const next = structuredClone(before)
  const later = new Date(`${localToday()}T12:00:00Z`)
  later.setUTCDate(later.getUTCDate() + 1)
  next.qualityWorkflow.cases[0] = rejectInspectionAct(
    next.qualityWorkflow.cases[0]!,
    'materials',
    later.toISOString().slice(0, 10),
    'Замечания АВК',
    [{ receiptId: 'receipt', quantity: 5 }],
  )
  expect(() => returnQuantity(next, 6)).toThrow(/раньше отклонения/)
  returnQuantity(next, 5)
  validateQualityWorkspace(next, before)
  expect(next.qualityWorkflow.customerReturns![0]!.rejectedAt).toBe('zni')
})

it('can reject one entire position and still approve and print the other position', () => {
  const before = fixture()
  before.materialReceipts[0]!.quantity = 10
  before.materialReceipts[0]!.altQuantity = 25
  before.materialReceipts.push({ ...before.materialReceipts[0]!, id: 'second' })
  const rows = currentInspection(before.qualityWorkflow.cases[0]!).zni.rows
  Object.assign(rows[0]!, { presented: 10, accepted: 10 })
  rows.push({ ...rows[0]!, receiptId: 'second' })
  const next = structuredClone(before)
  reject(next, 10)
  sign(next)
  validateQualityWorkspace(next, before)
  expect(
    inspectionApprovals(next.qualityWorkflow).map((row) => row.quantity),
  ).toEqual([0, 10])
  const entry = next.qualityWorkflow.cases[0]!
  expect(
    buildQualityPrintData(next, entry.id, 1, 'avk').materials.map(
      (row) => row.quantity,
    ),
  ).toEqual([10])
})

it('does not subtract an accepted surplus return twice or reopen the request for that surplus', () => {
  const before = fixture()
  const next = structuredClone(before)
  reject(next, 10)
  next.qualityWorkflow = recordSurplusReturn(
    next.qualityWorkflow,
    receipts(next),
    [],
    [{ receiptId: 'receipt', quantity: 2 }],
    localToday(),
    'Излишки',
  )
  returnQuantity(next, 10)
  sign(next)
  validateQualityWorkspace(next, before)
  expect(balance(next)).toMatchObject({
    stock: 8,
    returned: 12,
    toReturn: 0,
    awaitingAct: 0,
    availableToIssue: 8,
  })
  expect(remaining(next)).toBe(10)
})
