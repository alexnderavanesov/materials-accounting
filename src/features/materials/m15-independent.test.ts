import { describe, expect, it } from 'vitest'
import { buildM15Accounting, independentM15 } from './m15-independent'
import { validateM15Reconciliation } from './m15-reconciliation'
import { emptyQualityWorkflow } from './quality-workflow'
import type { M15Workspace } from './m15-reconciliation'

function fixture(): M15Workspace {
  return {
    lines: [
      { id: 'line', cipher: 'A', projectMaterialName: 'Труба', unit: 'м' },
    ],
    materialRequests: [{ id: 'request', projectLineId: 'line', cipher: 'A' }],
    materialReceipts: [
      {
        id: 'receipt',
        requestId: 'request',
        projectLineId: 'line',
        quantity: 100,
        projectUnit: 'м',
        appDocumentId: 'app',
      },
    ],
    qualityWorkflow: {
      ...emptyQualityWorkflow(),
      receiptDocuments: [
        { id: 'app', kind: 'app', number: '1', date: '2026-11-01' },
        { id: 'm15', kind: 'm15', number: '2', date: '2026-11-20' },
      ],
    },
    m15Reconciliations: [
      {
        ...independentM15('m15'),
        cipher: 'A',
        lines: [
          {
            id: 'row',
            projectLineId: 'line',
            name: 'Труба',
            position: '',
            unit: 'м',
            quantity: 70,
          },
        ],
      },
    ],
  }
}
describe('independent APP / M-15 accounting', () => {
  it('subtracts actual customer returns and ignores stock movements', () => {
    const w = fixture()
    w.qualityWorkflow!.customerReturns = [
      {
        id: 'return',
        kind: 'surplus',
        source: 'uninspected',
        receiptId: 'receipt',
        quantity: 20,
        date: '2026-11-20',
        documentNumber: '1',
        note: '',
      },
    ]
    w.materialIssues = [{ id: 'issue', receiptId: 'receipt', quantity: 30 }]
    expect(buildM15Accounting(w)[0]).toMatchObject({
      received: 100,
      returned: 20,
      app: 80,
      documented: 70,
      shortage: 10,
      excess: 0,
    })
  })
  it('sums repeated lines and invoices, listing each invoice once', () => {
    const w = fixture(),
      m = w.m15Reconciliations![0]!
    m.lines.push({ ...m.lines[0]!, id: 'row2', quantity: 5 })
    w.qualityWorkflow!.receiptDocuments!.push({
      id: 'second',
      kind: 'm15',
      number: '3',
      date: '2026-11-02',
    })
    w.m15Reconciliations!.push({
      ...independentM15('second'),
      cipher: 'A',
      lines: [{ ...m.lines[0]!, id: 'r3', quantity: 25 }],
    })
    const row = buildM15Accounting(w)[0]!
    expect(row).toMatchObject({
      app: 100,
      documented: 100,
      shortage: 0,
      excess: 0,
    })
    expect(row.documents.map((item) => item.quantity)).toEqual([75, 25])
  })
  it('includes APP-only materials and documents before receipts without cross-cipher coverage', () => {
    const w = fixture()
    w.lines!.push({
      id: 'other',
      cipher: 'B',
      projectMaterialName: 'Труба',
      unit: 'м',
    })
    w.m15Reconciliations![0]!.cipher = 'B'
    w.m15Reconciliations![0]!.lines[0]!.projectLineId = 'other'
    expect(
      buildM15Accounting(w).map((row) => [
        row.cipher,
        row.shortage,
        row.excess,
      ]),
    ).toEqual([
      ['A', 100, 0],
      ['B', 0, 70],
    ])
    expect(() =>
      validateM15Reconciliation(w.m15Reconciliations![0]!, w),
    ).not.toThrow()
  })
  it('requires explicit unit conversion and validates the project identity', () => {
    const w = fixture(),
      m = w.m15Reconciliations![0]!,
      line = m.lines[0]!
    line.unit = 'кг'
    line.quantity = 140
    expect(() => validateM15Reconciliation(m, w)).toThrow('пересчёт')
    expect(buildM15Accounting(w)[0]!.needsConversion).toBe(true)
    line.projectConversion = { fromUnit: 'кг', toUnit: 'м', factor: 0.5 }
    expect(() => validateM15Reconciliation(m, w)).not.toThrow()
    expect(buildM15Accounting(w)[0]!.documented).toBe(70)
    m.cipher = 'B'
    expect(() => validateM15Reconciliation(m, w)).toThrow('шифра')
  })
  it('does not report floating-point shortages and never infers APP from an M-15', () => {
    const w = fixture(),
      m = w.m15Reconciliations![0]!
    w.materialReceipts[0]!.quantity = 0.3
    m.lines[0]!.quantity = 0.1
    m.lines.push({ ...m.lines[0]!, id: 'second', quantity: 0.2 })
    expect(buildM15Accounting(w)[0]!.shortage).toBe(0)
    delete w.materialReceipts[0]!.appDocumentId
    expect(buildM15Accounting(w)[0]!.app).toBe(0)
  })
  it('aggregates 50,000 receipt and invoice lines', () => {
    const w = fixture(),
      line = w.m15Reconciliations![0]!.lines[0]!,
      receipt = w.materialReceipts[0]!
    w.materialReceipts = Array.from({ length: 50000 }, (_, i) => ({
      ...receipt,
      id: `r${i}`,
      quantity: 1,
    }))
    w.m15Reconciliations![0]!.lines = Array.from({ length: 50000 }, (_, i) => ({
      ...line,
      id: `l${i}`,
      quantity: 1,
    }))
    expect(buildM15Accounting(w)[0]).toMatchObject({
      app: 50000,
      documented: 50000,
      shortage: 0,
    })
  })
})
