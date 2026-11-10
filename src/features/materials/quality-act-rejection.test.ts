import { expect, it } from 'vitest'
import {
  acceptFixture,
  historicalReinspection,
} from './quality-workflow.fixtures'
import {
  correctInspectionAct,
  currentInspection,
  deleteInspectionDocument,
  inspectionApprovals,
  localToday,
  pendingCustomerReturns,
  recordCustomerReturn,
  recordSurplusReturn,
  rejectInspectionAct,
  signInspection,
  validateQualityWorkspace,
} from './quality-workflow'
import { receiptBalances } from './receipt-balances'
import { workspaceSnapshotSchema } from './workspace-snapshot'
import { buildQualityPrintData } from './quality-print-data'
import { summarizeInspectionDocuments } from './quality-workflow-indicators'

function draftFixture() {
  const workspace = acceptFixture()
  currentInspection(workspace.qualityWorkflow.cases[0]!).avk!.signedOn = null
  return workspace
}
const rejection = (kind: 'document' | 'materials') => {
  const before = draftFixture()
  const next = structuredClone(before)
  next.qualityWorkflow.cases[0] = rejectInspectionAct(
    next.qualityWorkflow.cases[0]!,
    kind,
    localToday(),
    'Причина отклонения',
  )
  validateQualityWorkspace(next, before)
  return { before, next }
}

it('retains the rejected document and signed ZNI when correcting and signing a new AVK edition', () => {
  const { next: rejected } = rejection('document')
  const corrected = structuredClone(rejected)
  corrected.qualityWorkflow.cases[0] = correctInspectionAct(
    corrected.qualityWorkflow.cases[0]!,
  )
  const entry = corrected.qualityWorkflow.cases[0]
  expect(entry.revisions[0]).toEqual(
    rejected.qualityWorkflow.cases[0]!.revisions[0],
  )
  expect(currentInspection(entry).zni).toEqual(entry.revisions[0]!.zni)
  expect(currentInspection(entry).avk!.number).toBe('АВК-1')
  expect(currentInspection(entry).avk!.rejection).toBeUndefined()
  validateQualityWorkspace(corrected, rejected)
  expect(buildQualityPrintData(corrected, entry.id, 2, 'zni')).toEqual(
    buildQualityPrintData(corrected, entry.id, 1, 'zni'),
  )
  currentInspection(entry).avk!.conclusion = 'Документ исправлен'
  entry.revisions[1] = signInspection(
    currentInspection(entry),
    'avk',
    localToday(),
  )
  validateQualityWorkspace(corrected, rejected)
  expect(inspectionApprovals(corrected.qualityWorkflow)).toHaveLength(1)
  expect(inspectionApprovals(corrected.qualityWorkflow)[0]!.quantity).toBe(8)
  expect(workspaceSnapshotSchema.parse(corrected).qualityWorkflow).toEqual(
    corrected.qualityWorkflow,
  )
})

it('rejects material without changing the signed ZNI or writing an actual return; balances await return, not AVK', () => {
  const { before, next } = rejection('materials')
  const entry = next.qualityWorkflow.cases[0]!
  expect(currentInspection(entry).zni).toEqual(
    currentInspection(before.qualityWorkflow.cases[0]!).zni,
  )
  expect(pendingCustomerReturns(next.qualityWorkflow, entry)[0]!.quantity).toBe(
    10,
  )
  const balances = receiptBalances(
    [{ id: 'receipt', requestId: 'request', quantity: 10 }],
    next.qualityWorkflow,
    inspectionApprovals(next.qualityWorkflow),
    [],
  )
  expect(balances.get('receipt')).toMatchObject({
    received: 10,
    retained: 10,
    toReturn: 10,
    awaitingAct: 0,
    availableToIssue: 0,
    returned: 0,
  })
  expect(
    summarizeInspectionDocuments(next.qualityWorkflow.cases),
  ).toMatchObject({ avkRejected: 1, avkPending: 0, avkSigned: 0 })
  const returned = {
    ...next,
    qualityWorkflow: recordCustomerReturn(
      next.qualityWorkflow,
      entry.id,
      [{ receiptId: 'receipt', quantity: 10 }],
      localToday(),
      'Возврат-1',
    ),
  }
  validateQualityWorkspace(returned, next)
  expect(pendingCustomerReturns(returned.qualityWorkflow, entry)).toEqual([])
  const issued = {
    ...next,
    materialIssues: [
      { id: 'issue', receiptId: 'receipt', quantity: 1, date: localToday() },
    ],
  }
  expect(() => validateQualityWorkspace(issued, next)).toThrow(
    /выданного|подписанному/,
  )
  expect(() => correctInspectionAct(entry)).toThrow('Исправление доступно')
})

it('requires reason and valid rejection chronology and prohibits rejecting signed acts', () => {
  const entry = draftFixture().qualityWorkflow.cases[0]!
  expect(() =>
    rejectInspectionAct(entry, 'document', localToday(), ' '),
  ).toThrow('причину')
  expect(() =>
    rejectInspectionAct(entry, 'document', '2000-01-01', 'Причина'),
  ).toThrow('Дата отклонения')
  expect(() =>
    rejectInspectionAct(
      acceptFixture().qualityWorkflow.cases[0]!,
      'materials',
      localToday(),
      'Причина',
    ),
  ).toThrow('Подписанный АВК')
  const legacy = historicalReinspection(
    acceptFixture().qualityWorkflow.cases[0]!,
  )
  const rev = currentInspection(legacy)
  rev.zni.signedOn = localToday()
  rev.avk = structuredClone(entry.revisions[0]!.avk)
  expect(() =>
    rejectInspectionAct(legacy, 'materials', localToday(), 'Причина'),
  ).toThrow('подписанный АВК')
})

it('accepts an outbox batch containing rejection and correction without allowing changes to the rejected content', () => {
  const before = draftFixture()
  const next = structuredClone(before)
  next.qualityWorkflow.cases[0] = correctInspectionAct(
    rejectInspectionAct(
      next.qualityWorkflow.cases[0]!,
      'document',
      localToday(),
      'Исправить реквизиты',
    ),
  )
  validateQualityWorkspace(next, before)
  const withoutAct = structuredClone(before)
  currentInspection(withoutAct.qualityWorkflow.cases[0]!).avk = null
  validateQualityWorkspace(next, withoutAct)
  next.qualityWorkflow.cases[0].revisions[0]!.avk!.conclusion =
    'Подмена отклонённого документа'
  expect(() => validateQualityWorkspace(next, before)).toThrow(
    'не должно изменять содержание',
  )
})

it('protects rejected contents and history against mutation, deletion and direct signing', () => {
  const { next } = rejection('document')
  const entry = next.qualityWorkflow.cases[0]!
  expect(() =>
    signInspection(currentInspection(entry), 'avk', localToday()),
  ).toThrow('Отклонённый АВК')
  expect(() =>
    deleteInspectionDocument(next.qualityWorkflow, entry.id, 'avk'),
  ).toThrow('истории')
  for (const edit of ['reason', 'content', 'rejection'] as const) {
    const changed = structuredClone(next)
    const act = currentInspection(changed.qualityWorkflow.cases[0]!).avk!
    if (edit === 'reason') act.rejection!.reason = 'Другая причина'
    if (edit === 'content') act.conclusion = 'Подменено'
    if (edit === 'rejection') delete act.rejection
    expect(() => validateQualityWorkspace(changed, next)).toThrow(
      'изменять нельзя',
    )
  }
  const invalid = structuredClone(next)
  invalid.qualityWorkflow.cases[0] = correctInspectionAct(entry)
  currentInspection(invalid.qualityWorkflow.cases[0]).zni.rows[0]!.accepted = 7
  expect(() => validateQualityWorkspace(invalid, next)).toThrow(
    'сохраняет подписанную ЗНИ',
  )
})

it('keeps actual rejected returns valid across document-only correction', () => {
  const before = draftFixture()
  before.qualityWorkflow = recordCustomerReturn(
    before.qualityWorkflow,
    before.qualityWorkflow.cases[0]!.id,
    [{ receiptId: 'receipt', quantity: 2 }],
    localToday(),
  )
  const rejected = structuredClone(before)
  rejected.qualityWorkflow.cases[0] = rejectInspectionAct(
    rejected.qualityWorkflow.cases[0]!,
    'document',
    localToday(),
    'Исправить акт',
  )
  validateQualityWorkspace(rejected, before)
  const next = structuredClone(rejected)
  next.qualityWorkflow.cases[0] = correctInspectionAct(
    next.qualityWorkflow.cases[0]!,
  )
  validateQualityWorkspace(next, rejected)
  expect(next.qualityWorkflow.customerReturns).toEqual(
    before.qualityWorkflow.customerReturns,
  )
  expect(
    pendingCustomerReturns(next.qualityWorkflow, next.qualityWorkflow.cases[0]),
  ).toEqual([])
})

it('does not permit a material return dated before the act was rejected', () => {
  const { next } = rejection('materials')
  const entry = next.qualityWorkflow.cases[0]!
  const tomorrow = new Date(`${localToday()}T12:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  currentInspection(entry).avk!.rejection!.date = tomorrow
    .toISOString()
    .slice(0, 10)
  expect(() =>
    recordCustomerReturn(
      next.qualityWorkflow,
      entry.id,
      [{ receiptId: 'receipt', quantity: 10 }],
      localToday(),
    ),
  ).toThrow('раньше отклонения')
  const forged = structuredClone(next)
  forged.qualityWorkflow.customerReturns = [
    {
      id: 'return',
      kind: 'rejected',
      caseId: entry.id,
      revision: 1,
      receiptId: 'receipt',
      date: localToday(),
      quantity: 10,
      documentNumber: '',
      note: '',
    },
  ]
  expect(() => validateQualityWorkspace(forged, next)).toThrow(
    'не может предшествовать отклонению',
  )
})

it('marks rejected acts in printable output', () => {
  const { next } = rejection('materials')
  const entry = next.qualityWorkflow.cases[0]!
  const data = buildQualityPrintData(next, entry.id, 1, 'avk')
  expect(JSON.stringify(data)).toContain('АВК ОТКЛОНЁН')
  expect(JSON.stringify(data)).toContain('Причина отклонения')
})

it('keeps surplus return allocations through AVK corrections and prevents their reuse as rejected stock', () => {
  const before = draftFixture()
  const receipts = [{ id: 'receipt', quantity: 10, date: localToday() }]
  before.qualityWorkflow = recordSurplusReturn(
    before.qualityWorkflow,
    receipts,
    [],
    [{ receiptId: 'receipt', quantity: 2 }],
    localToday(),
  )
  const rejected = structuredClone(before)
  rejected.qualityWorkflow.cases[0] = rejectInspectionAct(
    rejected.qualityWorkflow.cases[0]!,
    'document',
    localToday(),
    'Исправить акт',
  )
  validateQualityWorkspace(rejected, before)
  const next = structuredClone(rejected)
  next.qualityWorkflow.cases[0] = correctInspectionAct(
    next.qualityWorkflow.cases[0]!,
  )
  validateQualityWorkspace(next, rejected)
  const entry = next.qualityWorkflow.cases[0]
  entry.revisions[1] = signInspection(
    currentInspection(entry),
    'avk',
    localToday(),
  )
  validateQualityWorkspace(next, rejected)
  expect(
    receiptBalances(
      receipts.map((item) => ({ ...item, requestId: 'request' })),
      next.qualityWorkflow,
      inspectionApprovals(next.qualityWorkflow),
      [],
    ).get('receipt')?.availableToIssue,
  ).toBe(6)
  const materialRejection = structuredClone(before)
  materialRejection.qualityWorkflow.cases[0] = rejectInspectionAct(
    materialRejection.qualityWorkflow.cases[0]!,
    'materials',
    localToday(),
    'Брак',
  )
  expect(() => validateQualityWorkspace(materialRejection, before)).toThrow(
    /возврат/,
  )
})
