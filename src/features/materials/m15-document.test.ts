import { expect, it } from 'vitest'
import { withM15Document, withM15Receipts } from './m15-document'
import { emptyWorkspace } from './workspace-protocol'
import { m15Fixture } from './m15-reconciliation.fixtures'
import { validateM15Reconciliation } from './m15-reconciliation'
import type { ReceiptDocument } from './receipt-documents'
import {
  bindReceiptDocuments,
  emptyReceiptDocumentFields,
} from './receipt-documents'

const document: ReceiptDocument = {
  id: 'new',
  kind: 'm15',
  number: ' 15-20 ',
  date: '2026-11-18',
}
it('links existing receipts without double counting and refuses to move another M-15 receipt', () => {
  const { workspace } = m15Fixture()
  const next = withM15Document(workspace, document)
  expect(() => withM15Receipts(next, document.id, ['receipt'])).toThrow(
    'другой М-15',
  )
  delete next.materialReceipts[0]!.m15DocumentId
  const before = structuredClone(next)
  const linked = withM15Receipts(next, document.id, ['receipt', 'receipt'])
  expect(linked.materialReceipts).toEqual([
    { ...next.materialReceipts[0]!, m15DocumentId: document.id },
  ])
  expect(withM15Receipts(linked, document.id, ['receipt'])).toEqual(linked)
  expect(next).toEqual(before)
  expect(() => withM15Receipts(next, document.id, ['deleted'])).toThrow(
    'удалено',
  )
})
it('creates a source document without receipts, requests or mutations of existing data', () => {
  const workspace = m15Fixture().workspace,
    before = structuredClone(workspace)
  const result = withM15Document(workspace, document)
  const reconciliation = {
    id: 'new',
    mode: 'automatic' as const,
    allocations: [],
    lines: [
      { id: 'line', position: '', name: 'Труба', unit: 'м', quantity: 100 },
    ],
  }
  expect(() => validateM15Reconciliation(reconciliation, result)).not.toThrow()
  expect(result.qualityWorkflow.receiptDocuments!.at(-1)).toEqual({
    ...document,
    number: '15-20',
  })
  expect(result.materialReceipts).toBe(workspace.materialReceipts)
  expect(result.materialRequests).toBe(workspace.materialRequests)
  expect(result.qualityWorkflow.cases).toBe(workspace.qualityWorkflow.cases)
  expect(workspace).toEqual(before)
})
it('validates required metadata and rejects another document with the same number and date', () => {
  const initial = emptyWorkspace(),
    saved = withM15Document(initial, document)
  for (const source of [
    { ...document, number: ' ' },
    { ...document, date: '2026-02-30' },
    { ...document, kind: 'app' as const },
  ])
    expect(() => withM15Document(initial, source)).toThrow(
      'Укажите номер и корректную дату',
    )
  expect(() =>
    withM15Document(saved, { ...document, id: 'duplicate', number: '15-20' }),
  ).toThrow('уже существует')
  expect(withM15Document(saved, document)).toBe(saved)
  expect(
    withM15Document(saved, { ...document, id: 'other-day', date: '2026-11-19' })
      .qualityWorkflow!.receiptDocuments,
  ).toHaveLength(2)
})
it('allows correction of an unconfirmed new document but protects linked metadata', () => {
  const saved = withM15Document(emptyWorkspace(), document),
    corrected = { ...document, number: 'corrected' }
  expect(() => withM15Document(saved, corrected)).toThrow('изменились')
  expect(
    withM15Document(saved, corrected, true).qualityWorkflow!
      .receiptDocuments![0]!.number,
  ).toBe('corrected')
  saved.materialReceipts.push({ id: 'r', m15DocumentId: document.id })
  expect(() => withM15Document(saved, corrected, true)).toThrow('защищены')
})
it('ignores legacy M15 fields when binding an APP receipt', () => {
  const catalog = [document]
  const links = bindReceiptDocuments(
    {
      ...emptyReceiptDocumentFields,
      appNumber: 'APP-1',
      appDate: document.date,
      m15Number: '15-20',
      m15Date: document.date,
    },
    catalog,
  )
  expect(links.m15DocumentId).toBeUndefined()
  expect(links.appDocumentId).toBeTruthy()
  expect(catalog).toHaveLength(2)
  expect(catalog[0]).toEqual(document)
})
