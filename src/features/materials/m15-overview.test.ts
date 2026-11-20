import { expect, it } from 'vitest'
import { m15Fixture } from './m15-reconciliation.fixtures'
import { automaticM15 } from './m15-automatic'
import { buildM15Overview, m15SummaryText } from './m15-overview'
import type { M15Workspace } from './m15-reconciliation'

function overviewFixture() {
  const { workspace, value } = m15Fixture()
  const source = workspace.materialReceipts[0]!
  const doc = workspace.qualityWorkflow.receiptDocuments!.find(
    (item) => item.id === 'm15',
  )!
  workspace.qualityWorkflow.receiptDocuments!.push(
    ...['extra', 'meters', 'missing', 'units'].map((id, i) => ({
      ...doc,
      id,
      number: `15-${i + 2}`,
    })),
  )
  workspace.materialReceipts.push(
    { ...source, id: 'extra-receipt', m15DocumentId: 'extra', quantity: 13 },
    {
      ...source,
      id: 'meters-receipt',
      m15DocumentId: 'meters',
      projectUnit: 'м',
      actualName: 'Труба',
      quantity: 90,
    },
    { ...source, id: 'missing-receipt', m15DocumentId: 'missing', quantity: 5 },
    {
      ...source,
      id: 'units-receipt',
      m15DocumentId: 'units',
      altUnitFactor: null,
    },
    { ...source, id: 'no-m15', m15DocumentId: '', quantity: 999 },
  )
  const make = (id: string, quantity: number, unit = 'шт', name = 'Клапан') =>
    automaticM15(id, {
      id,
      allocations: [],
      lines: [{ ...value.lines[0]!, quantity, unit, name }],
    })
  return {
    ...workspace,
    m15Reconciliations: [
      make('m15', 12),
      make('extra', 10),
      make('meters', 100, 'м', 'Труба'),
      make('units', 25, 'кг'),
    ],
  } satisfies M15Workspace
}
it('keeps shortage and excess separate by unit and excludes incomplete comparisons and unlinked receipts', () => {
  const workspace = overviewFixture(),
    before = structuredClone(workspace)
  const result = buildM15Overview(workspace)
  expect(result.documents.size).toBe(5)
  expect(result).toMatchObject({
    matched: 0,
    differences: 3,
    incomplete: 2,
    conversion: 1,
    unlinkedReceipts: 1,
  })
  expect(result.totals).toEqual([
    {
      unit: 'м',
      documented: 100,
      received: 90,
      shortage: 10,
      excess: 0,
      positions: 1,
    },
    {
      unit: 'шт',
      documented: 22,
      received: 23,
      shortage: 2,
      excess: 3,
      positions: 2,
    },
  ])
  expect(m15SummaryText(result.documents.get('m15')!)).toBe('Недостаёт 2 шт')
  expect(m15SummaryText(result.documents.get('missing')!)).toContain(
    'Не заполнено',
  )
  expect(result.documents.get('units')!.documented).toEqual([
    { unit: 'кг', quantity: 25 },
  ])
  expect(result.documents.get('units')!.received).toEqual([
    { unit: 'шт', quantity: 10 },
  ])
  expect(workspace).toEqual(before)
})
it('shows converted receipt totals in the documentary unit when a saved factor is available', () => {
  const { workspace, value } = m15Fixture()
  value.lines[0]!.unit = 'кг'
  value.lines[0]!.quantity = 25
  const result = buildM15Overview({ ...workspace, m15Reconciliations: [value] })
  expect(result.matched).toBe(1)
  expect(result.documents.get('m15')!.received).toEqual([
    { unit: 'кг', quantity: 25 },
  ])
  expect(result.totals).toEqual([
    {
      unit: 'кг',
      documented: 25,
      received: 25,
      shortage: 0,
      excess: 0,
      positions: 1,
    },
  ])
  workspace.materialReceipts.push({
    ...workspace.materialReceipts[0]!,
    id: 'unknown-factor',
    altUnitFactor: null,
  })
  const uncertain = buildM15Overview({
    ...workspace,
    m15Reconciliations: [value],
  })
  expect(uncertain.matched).toBe(0)
  expect(uncertain.conversion).toBe(1)
  expect(uncertain.totals).toEqual([])
  expect(uncertain.documents.get('m15')!.received).toEqual([
    { unit: 'шт', quantity: 20 },
  ])
})
it('counts one M-15 across multiple materials/requests and does not hide opposite discrepancies within it', () => {
  const { workspace, value } = m15Fixture()
  workspace.materialReceipts[0]!.quantity = 5
  workspace.materialReceipts.push({
    ...workspace.materialReceipts[0]!,
    id: 'r2',
    actualName: 'Другая позиция',
    quantity: 15,
  })
  value.lines.push({ ...value.lines[0]!, id: 'row2', name: 'Другая позиция' })
  const result = buildM15Overview({ ...workspace, m15Reconciliations: [value] })
  expect(result.documents.size).toBe(1)
  expect(result.differences).toBe(1)
  expect(result.matched).toBe(0)
  expect(result.totals[0]).toMatchObject({
    documented: 20,
    received: 20,
    shortage: 5,
    excess: 5,
  })
})
it('recalculates changed/deleted receipts, keeps returns gross, and identifies empty M-15', () => {
  const { workspace, value } = m15Fixture()
  workspace.qualityWorkflow.customerReturns = [
    {
      id: 'return',
      kind: 'rejected',
      receiptId: 'receipt',
      quantity: 2,
      date: '2026-11-18',
      documentNumber: '1',
      note: '',
    },
  ]
  const saved = { ...workspace, m15Reconciliations: [value] }
  expect(buildM15Overview(saved).matched).toBe(1)
  saved.materialReceipts[0]!.quantity = 8
  expect(buildM15Overview(saved).totals[0]!.shortage).toBe(2)
  saved.materialReceipts = []
  expect(buildM15Overview(saved).totals[0]!.shortage).toBe(10)
  saved.m15Reconciliations = []
  expect(buildM15Overview(saved)).toMatchObject({
    incomplete: 1,
    matched: 0,
    totals: [],
  })
})
it('handles 50,000 receipts across 5,000 M-15 documents without rescanning all receipts per document', () => {
  const { workspace, value } = m15Fixture()
  const receipt = workspace.materialReceipts[0]!,
    doc = workspace.qualityWorkflow.receiptDocuments!.find(
      (item) => item.id === 'm15',
    )!
  workspace.qualityWorkflow.cases = []
  workspace.qualityWorkflow.receiptDocuments = Array.from(
    { length: 5000 },
    (_, i) => ({ ...doc, id: `m15-${i}` }),
  )
  workspace.materialReceipts = Array.from({ length: 50000 }, (_, i) => ({
    ...receipt,
    id: `r${i}`,
    m15DocumentId: `m15-${Math.floor(i / 10)}`,
    quantity: 1,
  }))
  const reconciliations = workspace.qualityWorkflow.receiptDocuments.map(
    (item) => automaticM15(item.id, { ...value, id: item.id }),
  )
  const start = performance.now()
  const result = buildM15Overview({
    ...workspace,
    m15Reconciliations: reconciliations,
  })
  expect(result.matched).toBe(5000)
  expect(result.totals[0]).toMatchObject({
    documented: 50000,
    received: 50000,
    shortage: 0,
    excess: 0,
  })
  expect(performance.now() - start).toBeLessThan(5000)
})
