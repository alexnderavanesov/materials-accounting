import { describe, expect, it } from 'vitest'
import {
  inspectionFixture,
  documentInspectionFixture,
  acceptFixture,
} from './quality-workflow.fixtures'
import { validateProjectAccounting } from './project-changes'
import { validateM15Workspace } from './m15-reconciliation'
import { buildM15Accounting } from './m15-independent'
import {
  receiptBalances,
  receivedByRequest,
  requestReceiptProgress,
} from './receipt-balances'
import { issueAvailability } from './issue-allocation'
import {
  qualityWithM15,
  currentInspection,
  newInspection,
  signInspection,
  createAcceptedInspectionAct,
  rejectInspectionAct,
  recordCustomerReturn,
  inspectionApprovals,
  validateQualityWorkspace,
  localToday,
} from './quality-workflow'

const receiptsOf = (w: ReturnType<typeof inspectionFixture>) =>
  w.materialReceipts as unknown as Parameters<typeof newInspection>[2]
const linesOf = (w: ReturnType<typeof inspectionFixture>) =>
  w.lines as unknown as Parameters<typeof newInspection>[3]
const issuesOf = (w: ReturnType<typeof inspectionFixture>) =>
  w.materialIssues as unknown as Parameters<typeof receiptBalances>[3]
const validate = (
  next: ReturnType<typeof inspectionFixture>,
  previous?: ReturnType<typeof inspectionFixture>,
) => {
  validateQualityWorkspace(next, previous)
  validateM15Workspace(next, previous)
  validateProjectAccounting(next, previous)
}

describe('independent user audit: quantities across the whole material lifecycle', () => {
  it('preserves physical stock, request remainder and document coverage through partial receipt, ZNI/AVK rejection, issue, both returns and replacement delivery', () => {
    const w = inspectionFixture()
    w.qualityWorkflow.cases = []
    Object.assign(w.lines[0]!, { plannedQuantity: 20 })
    w.materialRequests = [
      {
        id: 'request',
        projectLineId: 'line',
        cipher: 'ТКМ5',
        quantity: 20,
        date: localToday(),
        number: 'АУДИТ-20',
      },
    ]
    Object.assign(w.materialReceipts[0]!, { quantity: 12, altQuantity: 30 })
    validate(w)
    const balance = () =>
      receiptBalances(
        receiptsOf(w),
        w.qualityWorkflow,
        inspectionApprovals(w.qualityWorkflow),
        issuesOf(w),
      ).get('receipt')!
    const remaining = () =>
      requestReceiptProgress(
        20,
        receivedByRequest(receiptsOf(w), w.qualityWorkflow).get('request')!,
      ).remaining
    expect(remaining()).toBe(8)
    expect(balance()).toMatchObject({
      received: 12,
      stock: 12,
      awaitingInspection: 12,
      availableToIssue: 0,
    })
    let previous = structuredClone(w)
    w.qualityWorkflow.receiptDocuments!.push({
      id: 'm15',
      kind: 'm15',
      number: 'АУДИТ-М15',
      date: localToday(),
    })
    w.m15Reconciliations = [
      {
        id: 'm15',
        mode: 'independent',
        cipher: 'ТКМ5',
        lines: [
          {
            id: 'mline',
            projectLineId: 'line',
            position: '1',
            name: 'Клапан по накладной',
            unit: 'шт',
            quantity: 12,
          },
        ],
        allocations: [],
      },
    ]
    validate(w, previous)
    previous = structuredClone(w)
    const entry = newInspection(
      qualityWithM15(w.qualityWorkflow, w.m15Reconciliations)!,
      [{ receiptId: 'receipt', quantity: 12 }],
      receiptsOf(w),
      linesOf(w),
      String(w.materialReceipts[0]!.appDocumentId),
    )
    w.qualityWorkflow.cases.push(entry)
    Object.assign(currentInspection(entry).zni.rows[0]!, {
      accepted: 10,
      result: 'remarks',
      remarks: 'Не приняты 2 шт.',
    })
    entry.revisions[0] = signInspection(
      currentInspection(entry),
      'zni',
      localToday(),
    )
    validate(w, previous)
    expect(balance()).toMatchObject({
      awaitingInspection: 0,
      awaitingAct: 10,
      toReturn: 2,
      availableToIssue: 0,
    })
    expect(remaining()).toBe(8)
    expect(() =>
      newInspection(
        qualityWithM15(w.qualityWorkflow, w.m15Reconciliations)!,
        [{ receiptId: 'receipt', quantity: 1 }],
        receiptsOf(w),
        linesOf(w),
        'app',
      ),
    ).toThrow(/доступный остаток/)
    previous = structuredClone(w)
    const rev = currentInspection(entry)
    rev.avk = createAcceptedInspectionAct(entry)
    rev.avk.number = 'АУДИТ-АВК'
    rev.avk.checks.fill('Проверено')
    rev.avk.conclusion = 'Принято 7 шт.'
    w.qualityWorkflow.cases[0] = rejectInspectionAct(
      entry,
      'materials',
      localToday(),
      'Не приняты ещё 3 шт.',
      [{ receiptId: 'receipt', quantity: 3 }],
    )
    w.qualityWorkflow.cases[0].revisions[0] = signInspection(
      currentInspection(w.qualityWorkflow.cases[0]),
      'avk',
      localToday(),
    )
    validate(w, previous)
    expect(balance()).toMatchObject({
      awaitingAct: 0,
      toReturn: 5,
      availableToIssue: 7,
      stock: 12,
    })
    previous = structuredClone(w)
    w.materialIssues.push({
      id: 'issue',
      receiptId: 'receipt',
      requestId: 'request',
      projectLineId: 'line',
      quantity: 5,
      projectUnit: 'шт',
      date: localToday(),
      receiver: 'Монтаж',
      document: 'АУДИТ-ВЫД',
    })
    validate(w, previous)
    expect(balance()).toMatchObject({
      stock: 7,
      availableToIssue: 2,
      toReturn: 5,
    })
    previous = structuredClone(w)
    w.qualityWorkflow = recordCustomerReturn(
      w.qualityWorkflow,
      entry.id,
      [{ receiptId: 'receipt', quantity: 5 }],
      localToday(),
      'АУДИТ-ВОЗ',
    )
    validate(w, previous)
    expect(
      w.qualityWorkflow.customerReturns?.map((r) => [r.rejectedAt, r.quantity]),
    ).toEqual([
      ['zni', 2],
      ['avk', 3],
    ])
    expect(balance()).toMatchObject({
      stock: 2,
      returned: 5,
      toReturn: 0,
      availableToIssue: 2,
    })
    expect(remaining()).toBe(13)
    expect(buildM15Accounting(w)[0]!.documented).toBe(12)
    expect(() =>
      recordCustomerReturn(
        w.qualityWorkflow,
        entry.id,
        [{ receiptId: 'receipt', quantity: 1 }],
        localToday(),
      ),
    ).toThrow(/превышает/)
    previous = structuredClone(w)
    w.materialIssues[0]!.siteReturns = [
      {
        id: 'site-good',
        date: localToday(),
        quantity: 2,
        condition: 'good',
        document: 'С площадки',
        note: '',
      },
    ]
    validate(w, previous)
    expect(balance()).toMatchObject({
      stock: 4,
      returnedFromSite: 2,
      availableToIssue: 4,
    })
    expect(remaining()).toBe(13)
    previous = structuredClone(w)
    ;(w.materialIssues[0]!.siteReturns as Array<unknown>).push({
      id: 'site-quarantine',
      date: localToday(),
      quantity: 1,
      condition: 'quarantine',
      document: 'Повреждение',
      note: '',
    })
    validate(w, previous)
    expect(balance()).toMatchObject({
      stock: 5,
      quarantined: 1,
      availableToIssue: 4,
    })
    expect(issueAvailability(w, localToday()).get('receipt')).toEqual({
      available: 4,
      approved: 4,
    })
    previous = structuredClone(w)
    w.materialReceipts.push({
      ...w.materialReceipts[0]!,
      id: 'replacement',
      quantity: 13,
      altQuantity: 32.5,
    })
    validate(w, previous)
    expect(remaining()).toBe(0)
    expect(
      w.materialReceipts.reduce((sum, r) => sum + Number(r.quantity), 0),
    ).toBe(25)
    expect(buildM15Accounting(w)[0]!.documented).toBe(12)
    const excessive = structuredClone(w)
    excessive.materialReceipts.push({
      ...w.materialReceipts[0]!,
      id: 'extra',
      quantity: 1,
      altQuantity: 2.5,
    })
    expect(() => validate(excessive, w)).toThrow(
      /превышают количество по заявке/,
    )
  })

  it('allows creating AVK from an unchanged signed historical M15 ZNI after erroneous legacy links were cleared', () => {
    const w = documentInspectionFixture('m15')
    w.m15Reconciliations = []
    const entry = w.qualityWorkflow.cases[0]!
    currentInspection(entry).avk = null
    w.materialReceipts[0]!.appDocumentId = 'app'
    delete w.materialReceipts[0]!.m15DocumentId
    w.qualityWorkflow.receiptDocuments!.push({
      id: 'app',
      kind: 'app',
      number: 'АПП-история',
      date: localToday(),
    })
    const previous = structuredClone(w)
    currentInspection(entry).avk = createAcceptedInspectionAct(entry)
    currentInspection(entry).avk!.number = 'Продолжение истории'
    expect(() => validateQualityWorkspace(w, previous)).not.toThrow()
    expect(currentInspection(entry).zni).toEqual(
      currentInspection(previous.qualityWorkflow.cases[0]!).zni,
    )
  })

  it.each(['projectLineId', 'projectUnit'])(
    'rejects a regular issue with a foreign %s before a site return exists',
    (field) => {
      const w = acceptFixture(10)
      const previous = structuredClone(w)
      w.materialIssues.push({
        id: 'wrong',
        receiptId: 'receipt',
        projectLineId: 'line',
        projectUnit: 'шт',
        quantity: 1,
        date: localToday(),
        [field]: 'чужой',
      })
      expect(() => validateQualityWorkspace(w, previous)).toThrow(
        /соответствовать поступлению/,
      )
    },
  )
})
