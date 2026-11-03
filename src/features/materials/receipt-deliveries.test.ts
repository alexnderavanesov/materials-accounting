import { describe, expect, it } from 'vitest'
import {
  groupReceiptDeliveries,
  updateReceiptDeliveryDocuments,
} from './receipt-deliveries'
import { receiptDocumentFields } from './receipt-documents'
import { acceptFixture } from './quality-workflow.fixtures'
import { validateQualityWorkspace } from './quality-workflow'

function deliveryFixture() {
  const workspace = acceptFixture()
  return {
    ...workspace,
    materialReceipts: workspace.materialReceipts.map((entry) => ({
      ...entry,
      id: String(entry.id),
      date: String(entry.date),
      appDocumentId: String(entry.appDocumentId),
      requestId: String(entry.requestId),
      quantity: Number(entry.quantity),
      altQuantity: Number(entry.altQuantity),
    })),
  }
}

describe('receipt delivery cards', () => {
  it('counts receipts once with both documents, separates repeat dates and different document pairs', () => {
    const first = {
      id: 'one',
      date: '2026-10-14',
      appDocumentId: 'app',
      m15DocumentId: 'm15',
    }
    const receipts = [
      first,
      { ...first, id: 'two' },
      { ...first, id: 'repeat', date: '2026-10-15' },
      { ...first, id: 'other-m15', m15DocumentId: 'other' },
      { id: 'only-m15', date: first.date, m15DocumentId: 'm15' },
      { id: 'no-doc-one', date: first.date },
      { id: 'no-doc-two', date: first.date },
    ]
    const groups = groupReceiptDeliveries(receipts)
    expect(groups).toHaveLength(6)
    expect(groups[0]!.entries[0]!.id).toBe('repeat')
    expect(
      groups
        .find((group) => group.entries.some((entry) => entry.id === 'one'))!
        .entries.map((entry) => entry.id),
    ).toEqual(['one', 'two'])
    expect(
      groups.flatMap((group) => group.entries.map((entry) => entry.id)).sort(),
    ).toEqual(receipts.map((entry) => entry.id).sort())
  })

  it('adds one shared M-15 to a delivery without changing quantities, other receipts or signed history', () => {
    const workspace = deliveryFixture()
    const receipt = workspace.materialReceipts[0]!
    workspace.materialReceipts.push({
      ...receipt,
      id: 'second',
      quantity: 2,
      altQuantity: 5,
    })
    workspace.materialReceipts.push({
      ...receipt,
      id: 'other-request',
      requestId: 'elsewhere',
    })
    const previous = structuredClone(workspace)
    const update = updateReceiptDeliveryDocuments(
      workspace.materialReceipts.slice(0, 2),
      {
        ...receiptDocumentFields(receipt, workspace.qualityWorkflow),
        date: receipt.date,
        m15Number: '15',
        m15Date: receipt.date,
      },
      workspace.qualityWorkflow.receiptDocuments!,
    )
    expect(workspace).toEqual(previous)
    expect(update.documents).toHaveLength(2)
    expect(
      new Set(update.entries.map((entry) => entry.m15DocumentId)).size,
    ).toBe(1)
    const next = {
      ...structuredClone(workspace),
      materialReceipts: [...update.entries, workspace.materialReceipts[2]!],
      qualityWorkflow: {
        ...workspace.qualityWorkflow,
        receiptDocuments: update.documents,
      },
    }
    validateQualityWorkspace(next, previous)
    expect(next.qualityWorkflow.cases).toEqual(previous.qualityWorkflow.cases)
    expect(next.materialReceipts[2]).toEqual(previous.materialReceipts[2])
    for (const [index, updated] of update.entries.entries()) {
      const { m15DocumentId, ...rest } = updated
      expect(m15DocumentId).toBeTruthy()
      expect(rest).toEqual(previous.materialReceipts[index])
    }
  })

  it('rejects incomplete documents and mixed deliveries without mutating the catalog', () => {
    const workspace = deliveryFixture()
    const receipts = workspace.materialReceipts
    const fields = {
      ...receiptDocumentFields(receipts[0]!, workspace.qualityWorkflow),
      date: receipts[0]!.date,
    }
    const catalog = workspace.qualityWorkflow.receiptDocuments!
    const previous = structuredClone(workspace)
    expect(() =>
      updateReceiptDeliveryDocuments(
        receipts,
        { ...fields, m15Number: '15', m15Date: '' },
        catalog,
      ),
    ).toThrow(/дату/)
    expect(() =>
      updateReceiptDeliveryDocuments(
        receipts,
        { ...fields, date: '2026-02-30' },
        catalog,
      ),
    ).toThrow(/дату получения/)
    expect(() =>
      updateReceiptDeliveryDocuments(
        [...receipts, { ...receipts[0]!, id: 'another', date: '2026-01-01' }],
        fields,
        catalog,
      ),
    ).toThrow(/одну поставку/)
    expect(workspace).toEqual(previous)
  })

  it('reuses existing documents and clears removed links while protecting a ZNI basis', () => {
    const workspace = deliveryFixture()
    const receipt = workspace.materialReceipts[0]!
    workspace.qualityWorkflow.receiptDocuments!.push({
      id: 'm15',
      kind: 'm15',
      number: '15',
      date: receipt.date,
    })
    const fields = {
      date: receipt.date,
      appNumber: '',
      appDate: '',
      m15Number: '15',
      m15Date: receipt.date,
    }
    const update = updateReceiptDeliveryDocuments(
      [receipt],
      fields,
      workspace.qualityWorkflow.receiptDocuments!,
    )
    expect(update.documents).toHaveLength(2)
    expect(update.entries[0]!.m15DocumentId).toBe('m15')
    expect(update.entries[0]!.appDocumentId).toBeUndefined()
    expect(() =>
      validateQualityWorkspace(
        { ...workspace, materialReceipts: update.entries },
        workspace,
      ),
    ).toThrow(/основанию ЗНИ/)
  })
})
