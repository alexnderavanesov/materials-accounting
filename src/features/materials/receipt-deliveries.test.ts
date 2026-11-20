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
  it('groups by APP and date regardless of retired M15 references', () => {
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
    expect(groups).toHaveLength(5)
    expect(groups[0]!.entries[0]!.id).toBe('repeat')
    expect(
      groups
        .find((group) => group.entries.some((entry) => entry.id === 'one'))!
        .entries.map((entry) => entry.id),
    ).toEqual(['one', 'two', 'other-m15'])
    expect(
      groups.flatMap((group) => group.entries.map((entry) => entry.id)).sort(),
    ).toEqual(receipts.map((entry) => entry.id).sort())
  })

  it('ignores retired M15 fields without changing quantities, other receipts or signed history', () => {
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
    expect(update.documents).toHaveLength(1)
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
      expect(m15DocumentId).toBeUndefined()
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
        { ...fields, appDate: '' },
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

  it('requires APP instead of switching a delivery to M15', () => {
    const workspace = deliveryFixture(),
      receipt = workspace.materialReceipts[0]!
    expect(() =>
      updateReceiptDeliveryDocuments(
        [receipt],
        {
          date: receipt.date,
          appNumber: '',
          appDate: '',
          m15Number: '15',
          m15Date: receipt.date,
        },
        workspace.qualityWorkflow.receiptDocuments!,
      ),
    ).toThrow(/АПП/)
  })
})
