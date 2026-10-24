import { describe, expect, it } from 'vitest'
import { acceptFixture, inspectionFixture } from './quality-workflow.fixtures'
import {
  bindReceiptDocuments,
  documentsForReceipt,
  receiptDocumentError,
  receiptDocumentFields,
  receiptDocuments,
} from './receipt-documents'
import {
  createAcceptedInspectionAct,
  currentInspection,
  inspectionApprovals,
  inspectionAvailableQuantities,
  newInspection,
  pendingCustomerReturns,
  recordCustomerReturn,
  reopenInspection,
  signInspection,
  validateQualityWorkspace,
} from './quality-workflow'
import {
  receivedByRequest,
  receiptBalances,
  customerReturnAlternative,
} from './receipt-balances'
import { buildQualityPrintData } from './quality-print-data'

function fixture() {
  const workspace = inspectionFixture()
  workspace.qualityWorkflow.receiptDocuments = []
  workspace.qualityWorkflow.cases = []
  const catalog = receiptDocuments(workspace.qualityWorkflow)
  const refs = bindReceiptDocuments(
    { appNumber: 'АПП-1', appDate: '2026-10-22', m15Number: '', m15Date: '' },
    catalog,
  )
  workspace.qualityWorkflow.receiptDocuments = catalog
  Object.assign(workspace.materialReceipts[0]!, refs, {
    quantity: 4,
    altQuantity: 10,
  })
  workspace.materialRequests = [{ id: 'request', quantity: 4, number: 'ЗП-1' }]
  return workspace
}
const receiptsOf = (workspace: ReturnType<typeof fixture>) =>
  workspace.materialReceipts as unknown as Parameters<typeof newInspection>[2]
const linesOf = (workspace: ReturnType<typeof fixture>) =>
  workspace.lines as unknown as Parameters<typeof newInspection>[3]
function inspect(
  workspace: ReturnType<typeof fixture>,
  accepted = 3,
  quantity = 4,
) {
  const entry = newInspection(
    workspace.qualityWorkflow,
    [{ receiptId: 'receipt', quantity }],
    receiptsOf(workspace),
    linesOf(workspace),
    workspace.qualityWorkflow.receiptDocuments![0]!.id,
    [{ id: 'request', number: 'ЗП-1' }],
  )
  const revision = currentInspection(entry)
  revision.zni.date = '2026-10-22'
  Object.assign(revision.zni.rows[0]!, {
    accepted,
    result:
      accepted === quantity
        ? 'accepted'
        : accepted === 0
          ? 'rejected'
          : 'remarks',
    remarks: 'Проверено',
  })
  entry.revisions[0] = signInspection(revision, 'zni', '2026-10-22')
  workspace.qualityWorkflow.cases.push(entry)
  return entry
}
describe('document-based receipt and acceptance workflow', () => {
  it('deduplicates document identities, preserves legacy invoices and allows M-15-only receipts', () => {
    const workspace = fixture(),
      receipt = receiptsOf(workspace)[0]!
    const catalog = workspace.qualityWorkflow.receiptDocuments!
    const refs = bindReceiptDocuments(
      {
        ...receiptDocumentFields(receipt, workspace.qualityWorkflow),
        appNumber: ' апп-1 ',
        m15Number: '15',
        m15Date: '2026-10-22',
      },
      catalog,
    )
    expect(refs.appDocumentId).toBe(receipt.appDocumentId)
    expect(catalog).toHaveLength(2)
    const next = structuredClone(workspace)
    Object.assign(next.materialReceipts[0]!, refs)
    validateQualityWorkspace(next, workspace)
    expect(next.materialReceipts[0]!.quantity).toBe(4)
    expect(documentsForReceipt({ id: 'old' }, {})).toEqual([])
    expect(
      receiptDocumentError({
        appNumber: '',
        appDate: '',
        m15Number: '15',
        m15Date: '2026-10-22',
      }),
    ).toBe('')
    expect(
      receiptDocumentError({
        appNumber: '1',
        appDate: '',
        m15Number: '',
        m15Date: '',
      }),
    ).toContain('дату')
  })
  it('reserves partial ZNIs by receipt across APP and M-15 and snapshots the original request', () => {
    const workspace = fixture(),
      first = inspect(workspace, 1, 2)
    const refs = bindReceiptDocuments(
      {
        ...receiptDocumentFields(
          receiptsOf(workspace)[0]!,
          workspace.qualityWorkflow,
        ),
        m15Number: '15',
        m15Date: '2026-10-22',
      },
      workspace.qualityWorkflow.receiptDocuments!,
    )
    Object.assign(workspace.materialReceipts[0]!, refs)
    const create = (quantity: number) =>
      newInspection(
        workspace.qualityWorkflow,
        [{ receiptId: 'receipt', quantity }],
        receiptsOf(workspace),
        linesOf(workspace),
        refs.m15DocumentId!,
      )
    expect(() => create(3)).toThrow(/остаток/)
    workspace.qualityWorkflow.cases.push(create(2))
    expect(
      inspectionAvailableQuantities(
        workspace.qualityWorkflow,
        receiptsOf(workspace),
      ).get('receipt'),
    ).toBe(0)
    validateQualityWorkspace(workspace)
    expect(first.revisions[0]!.zni.rows[0]!.requestNumber).toBe('ЗП-1')
  })
  it('uses one APP across requests and adds M-15 after a signed ZNI without changing its basis', () => {
    const workspace = fixture()
    workspace.materialReceipts.push({
      ...workspace.materialReceipts[0]!,
      id: 'second-receipt',
      requestId: 'second-request',
      quantity: 2,
      altQuantity: 5,
    })
    workspace.materialRequests.push({
      id: 'second-request',
      number: 'ЗП-2',
      quantity: 2,
    })
    const entry = newInspection(
      workspace.qualityWorkflow,
      [
        { receiptId: 'receipt', quantity: 4 },
        { receiptId: 'second-receipt', quantity: 2 },
      ],
      receiptsOf(workspace),
      linesOf(workspace),
      workspace.qualityWorkflow.receiptDocuments![0]!.id,
      [
        { id: 'request', number: 'ЗП-1' },
        { id: 'second-request', number: 'ЗП-2' },
      ],
    )
    for (const row of currentInspection(entry).zni.rows)
      Object.assign(row, { accepted: row.presented, result: 'accepted' })
    currentInspection(entry).zni.date = '2026-10-22'
    entry.revisions[0] = signInspection(
      currentInspection(entry),
      'zni',
      '2026-10-22',
    )
    workspace.qualityWorkflow.cases.push(entry)
    const previous = structuredClone(workspace)
    const fields = {
      ...receiptDocumentFields(
        receiptsOf(workspace)[0]!,
        workspace.qualityWorkflow,
      ),
      m15Number: 'М-15-1',
      m15Date: '2026-10-23',
    }
    Object.assign(
      workspace.materialReceipts[0]!,
      bindReceiptDocuments(fields, workspace.qualityWorkflow.receiptDocuments!),
    )
    validateQualityWorkspace(workspace, previous)
    expect(entry).toEqual(previous.qualityWorkflow.cases[0])
    expect(entry.revisions[0].zni.rows.map((row) => row.requestNumber)).toEqual(
      ['ЗП-1', 'ЗП-2'],
    )
    expect(() =>
      newInspection(
        workspace.qualityWorkflow,
        [{ receiptId: 'receipt', quantity: 1 }],
        receiptsOf(workspace),
        linesOf(workspace),
        String(workspace.materialReceipts[0]!.m15DocumentId),
      ),
    ).toThrow(/остаток/)
    const removed = structuredClone(workspace)
    removed.materialReceipts = removed.materialReceipts.filter(
      (receipt) => receipt.id !== 'receipt',
    )
    expect(() => validateQualityWorkspace(removed, workspace)).toThrow()
  })
  it('handles 4 presented → 3 accepted → 1 actually returned → new receipt, without double subtraction', () => {
    const workspace = fixture(),
      entry = inspect(workspace)
    const beforeReturn = structuredClone(workspace)
    expect(
      receivedByRequest(receiptsOf(workspace), workspace.qualityWorkflow).get(
        'request',
      ),
    ).toBe(4)
    expect(
      pendingCustomerReturns(workspace.qualityWorkflow, entry)[0]!.quantity,
    ).toBe(1)
    currentInspection(entry).avk = createAcceptedInspectionAct(entry)
    expect(
      receiptBalances(
        receiptsOf(workspace),
        workspace.qualityWorkflow,
        inspectionApprovals(workspace.qualityWorkflow),
        [],
      ).get('receipt')!.availableToIssue,
    ).toBe(0)
    const avk = currentInspection(entry).avk!
    avk.number = 'АВК-1'
    avk.date = '2026-10-22'
    avk.checks.fill('Проверено')
    avk.conclusion = 'Принято 3'
    entry.revisions[0] = signInspection(
      currentInspection(entry),
      'avk',
      '2026-10-22',
    )
    expect(
      buildQualityPrintData(workspace, entry.id, 1, 'zni').materials[0]!
        .quantity,
    ).toBe(4)
    expect(
      buildQualityPrintData(workspace, entry.id, 1, 'avk').materials[0],
    ).toMatchObject({ quantity: 3, altQuantity: 7.5 })
    workspace.qualityWorkflow = recordCustomerReturn(
      workspace.qualityWorkflow,
      entry.id,
      [{ receiptId: 'receipt', quantity: 0.4 }],
      '2026-10-22',
    )
    workspace.qualityWorkflow = recordCustomerReturn(
      workspace.qualityWorkflow,
      entry.id,
      [{ receiptId: 'receipt', quantity: 0.6 }],
      '2026-10-22',
    )
    validateQualityWorkspace(workspace, beforeReturn)
    expect(
      receivedByRequest(receiptsOf(workspace), workspace.qualityWorkflow).get(
        'request',
      ),
    ).toBe(3)
    expect(
      receiptBalances(
        receiptsOf(workspace),
        workspace.qualityWorkflow,
        inspectionApprovals(workspace.qualityWorkflow),
        [{ receiptId: 'receipt', quantity: 1 }],
      ).get('receipt'),
    ).toMatchObject({
      received: 4,
      returned: 1,
      retained: 3,
      stock: 2,
      availableToIssue: 2,
      toReturn: 0,
    })
    expect(() =>
      recordCustomerReturn(
        workspace.qualityWorkflow,
        entry.id,
        [{ receiptId: 'receipt', quantity: 0.1 }],
        '2026-10-22',
      ),
    ).toThrow()
    const reopened = structuredClone(workspace)
    reopened.qualityWorkflow.cases[0] = reopenInspection(entry)
    expect(() => validateQualityWorkspace(reopened, workspace)).toThrow(
      /возврат/,
    )
    const repeated = structuredClone(workspace)
    repeated.materialReceipts.push({
      ...repeated.materialReceipts[0]!,
      id: 'new-receipt',
      quantity: 1,
      altQuantity: 2.5,
    })
    validateQualityWorkspace(repeated, workspace)
    expect(
      receivedByRequest(receiptsOf(repeated), repeated.qualityWorkflow).get(
        'request',
      ),
    ).toBe(4)
    expect(workspace.materialReceipts[0]!.quantity).toBe(4)
  })
  it('keeps the last signed inspection in balances while a revision is in progress', () => {
    const workspace = acceptFixture(8)
    const initial = receiptBalances(
      receiptsOf(workspace),
      workspace.qualityWorkflow,
      inspectionApprovals(workspace.qualityWorkflow),
      [],
    )
    workspace.qualityWorkflow.cases[0] = reopenInspection(
      workspace.qualityWorkflow.cases[0]!,
    )
    expect(
      receiptBalances(
        receiptsOf(workspace),
        workspace.qualityWorkflow,
        inspectionApprovals(workspace.qualityWorkflow),
        [],
      ),
    ).toEqual(initial)
  })
  it('calculates return alternatives with current conversion and historical fallback; rejects quantity reduction below net receipts', () => {
    const workspace = fixture(),
      entry = inspect(workspace),
      row = currentInspection(entry).zni.rows[0]!
    const receipt = {
      quantity: 4,
      projectUnit: 'шт',
      altQuantity: 10,
      altUnit: 'кг',
      altUnitFactor: 2.5,
    }
    expect(
      customerReturnAlternative(0.4, row, receipt, undefined).altQuantity,
    ).toBe(1)
    expect(
      customerReturnAlternative(0.4, row, receipt, {
        id: 'line',
        unit: 'шт',
        alternativeUnit: 'кг',
        alternativeUnitFactor: 3,
      }).altQuantity,
    ).toBe(1.2)
    const reduced = structuredClone(workspace)
    reduced.materialRequests[0]!.quantity = 3
    expect(() => validateQualityWorkspace(reduced, workspace)).toThrow(
      /превышают/,
    )
  })
  it('does not create an AVK on complete rejection or before signing; protects returns and source documents', () => {
    const workspace = fixture(),
      entry = inspect(workspace, 0)
    expect(() => createAcceptedInspectionAct(entry)).toThrow()
    const next = structuredClone(workspace)
    next.qualityWorkflow.receiptDocuments![0]!.number = 'Изменено'
    expect(() => validateQualityWorkspace(next, workspace)).toThrow()
    workspace.qualityWorkflow = recordCustomerReturn(
      workspace.qualityWorkflow,
      entry.id,
      [{ receiptId: 'receipt', quantity: 4 }],
      '2026-10-22',
    )
    const deleted = structuredClone(workspace)
    deleted.qualityWorkflow.customerReturns = []
    expect(() => validateQualityWorkspace(deleted, workspace)).toThrow(
      /возврат/,
    )
    expect(() =>
      recordCustomerReturn(
        workspace.qualityWorkflow,
        entry.id,
        [{ receiptId: 'receipt', quantity: 1 }],
        '2026-10-21',
      ),
    ).toThrow()
  })
})
