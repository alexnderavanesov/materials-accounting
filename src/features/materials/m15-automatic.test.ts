import { expect, it } from 'vitest'
import {
  automaticM15,
  calculateAutomaticM15,
  setAutomaticM15Quantity,
} from './m15-automatic'
import { m15Fixture } from './m15-reconciliation.fixtures'
import {
  m15ReceiptIndex,
  validateM15Reconciliation,
  validateM15Workspace,
} from './m15-reconciliation'
import { mergeM15Import } from './m15-import'

it('derives materials and all quantities across requests, ciphers and replacement names within one M-15', () => {
  const { workspace } = m15Fixture()
  workspace.materialRequests.push({
    ...workspace.materialRequests[0]!,
    id: 'request2',
    number: 'ЗП-2',
    cipher: 'ТК2',
    projectMaterialName: 'Другой проектный клапан',
  })
  workspace.materialReceipts.push({
    ...workspace.materialReceipts[0]!,
    id: 'receipt2',
    requestId: 'request2',
    quantity: 5,
  })
  workspace.materialReceipts.push({
    ...workspace.materialReceipts[0]!,
    id: 'other-m15',
    m15DocumentId: 'other',
    quantity: 100,
  })
  const before = structuredClone(workspace)
  const index = m15ReceiptIndex(workspace)
  const empty = automaticM15('m15')
  const row = calculateAutomaticM15(empty, index).rows[0]!
  expect(row).toMatchObject({
    name: 'Клапан',
    unit: 'шт',
    received: 15,
    status: 'missing',
  })
  expect(row.receipts.map((r) => r.id)).toEqual(['receipt', 'receipt2'])
  expect(row.receipts.every((r) => r.replacement)).toBe(true)
  for (const [quantity, delta, status] of [
    [15, 0, 'matched'],
    [20, -5, 'difference'],
    [12, 3, 'difference'],
    [0, 15, 'difference'],
  ] as const) {
    const record = setAutomaticM15Quantity(empty, row, quantity)
    expect(record.allocations).toEqual([])
    validateM15Reconciliation(record, workspace)
    expect(calculateAutomaticM15(record, index).rows[0]).toMatchObject({
      received: 15,
      delta,
      status,
    })
  }
  expect(workspace).toEqual(before)
})

it('preserves legacy documentary quantities, adds duplicate positions, and ignores old partial/manual links', () => {
  const { workspace, value } = m15Fixture()
  value.lines[0]!.quantity = 7
  value.lines.push({
    ...value.lines[0]!,
    id: 'row2',
    position: '2',
    quantity: 3,
  })
  value.allocations[0]!.quantity = 2
  const old = structuredClone(value)
  const current = automaticM15('m15', value)
  expect(current.lines).toEqual([
    expect.objectContaining({ id: 'row1', quantity: 10 }),
  ])
  expect(current.allocations).toEqual([])
  expect(
    calculateAutomaticM15(current, m15ReceiptIndex(workspace)).complete,
  ).toBe(true)
  expect(value).toEqual(old)
})

it('recalculates receipt corrections, new deliveries, deletion and moves without changing saved documentary quantities', () => {
  const { workspace, value } = m15Fixture()
  const saved = automaticM15('m15', value)
  const calculate = () =>
    calculateAutomaticM15(saved, m15ReceiptIndex(workspace))
  workspace.materialReceipts[0]!.quantity = 8
  expect(calculate().rows[0]).toMatchObject({ received: 8, delta: -2 })
  workspace.materialReceipts.push({
    ...workspace.materialReceipts[0]!,
    id: 'second',
    quantity: 2,
  })
  expect(calculate().complete).toBe(true)
  workspace.materialReceipts[0]!.m15DocumentId = 'other'
  expect(calculate().rows[0]).toMatchObject({ received: 2, delta: -8 })
  workspace.materialReceipts = []
  expect(calculate().rows[0]).toMatchObject({ received: 0, delta: -10 })
  expect(saved.lines[0]!.quantity).toBe(10)
  validateM15Workspace({ ...workspace, m15Reconciliations: [saved] })
})

it('does not subtract returns and never modifies signed ZNI/AVK', () => {
  const { workspace, value } = m15Fixture()
  workspace.qualityWorkflow.customerReturns = [
    {
      id: 'return',
      receiptId: 'receipt',
      caseId: 'case',
      documentNumber: 'Воз-1',
      kind: 'rejected',
      date: '2026-03-15',
      quantity: 2,
      note: 'Не принято',
    },
  ]
  const before = structuredClone(workspace)
  const result = calculateAutomaticM15(
    automaticM15('m15', value),
    m15ReceiptIndex(workspace),
  )
  expect(result.rows[0]).toMatchObject({ received: 10, delta: 0 })
  expect(result.rows[0]!.receipts[0]!.returned).toBe(2)
  expect(workspace).toEqual(before)
})

it('uses only explicitly saved receipt factors for different documentary units and never counts a receipt twice', () => {
  const { workspace, value } = m15Fixture()
  value.lines[0]!.unit = 'кг'
  value.lines[0]!.quantity = 25
  const saved = automaticM15('m15', value)
  let result = calculateAutomaticM15(saved, m15ReceiptIndex(workspace))
  expect(result.rows).toHaveLength(1)
  expect(result.rows[0]).toMatchObject({
    received: 25,
    delta: 0,
    status: 'matched',
  })
  delete workspace.materialReceipts[0]!.altUnitFactor
  result = calculateAutomaticM15(saved, m15ReceiptIndex(workspace))
  expect(result.rows.find((row) => row.unit === 'кг')).toMatchObject({
    received: null,
    status: 'conversion',
  })
  expect(result.rows.find((row) => row.unit === 'шт')).toMatchObject({
    received: 10,
    status: 'missing',
  })
  expect(result.rows.flatMap((row) => row.receipts)).toHaveLength(1)
  expect(result.complete).toBe(false)
})

it('never guesses a different name or incompatible unit, and keeps old documentary amounts visible', () => {
  const { workspace, value } = m15Fixture()
  workspace.materialReceipts[0]!.actualName = 'Новая замена'
  const result = calculateAutomaticM15(
    automaticM15('m15', value),
    m15ReceiptIndex(workspace),
  )
  expect(result.rows).toHaveLength(2)
  expect(result.rows.find((row) => row.name === 'Клапан')).toMatchObject({
    received: 0,
    delta: -10,
  })
  expect(result.rows.find((row) => row.name === 'Новая замена')).toMatchObject({
    received: 10,
    status: 'missing',
  })
})

it('imports repeated positions as one material quantity, preserves automatic mode and needs no allocations', () => {
  const { workspace } = m15Fixture()
  const rows = [6, 4].map((quantity, i) => ({
    sourceRow: i + 2,
    position: String(i + 1),
    name: 'Клапан',
    unit: 'шт',
    quantity: String(quantity),
  }))
  const imported = mergeM15Import(automaticM15('m15'), rows).value
  expect(imported).toMatchObject({
    mode: 'automatic',
    allocations: [],
    lines: [expect.objectContaining({ quantity: 10 })],
  })
  expect(
    calculateAutomaticM15(imported, m15ReceiptIndex(workspace)).complete,
  ).toBe(true)
  const repeated = mergeM15Import(imported, rows)
  expect(repeated.value).toEqual(imported)
  expect(repeated.changes).toEqual([])
  expect(repeated.replacesQuantities).toBe(false)
})

it('rejects manual allocations and duplicate automatic material groups on save', () => {
  const { workspace, value } = m15Fixture()
  const record = automaticM15('m15', value)
  expect(() =>
    validateM15Reconciliation(
      { ...record, allocations: value.allocations },
      workspace,
    ),
  ).toThrow('не использует ручные')
  expect(() =>
    validateM15Reconciliation(
      {
        ...record,
        lines: [...record.lines, { ...record.lines[0]!, id: 'different' }],
      },
      workspace,
    ),
  ).toThrow('Повторяется материал')
})

it('handles 50,000 receipts without allocation links or double counting', () => {
  const { workspace, value } = m15Fixture()
  workspace.materialReceipts = Array.from({ length: 50000 }, (_, i) => ({
    ...workspace.materialReceipts[0]!,
    id: `receipt-${i}`,
    quantity: 0.1,
  }))
  value.lines[0]!.quantity = 5000
  const start = performance.now()
  const result = calculateAutomaticM15(
    automaticM15('m15', value),
    m15ReceiptIndex(workspace),
  )
  expect(result.complete).toBe(true)
  expect(result.rows[0]!.receipts).toHaveLength(50000)
  expect(performance.now() - start).toBeLessThan(5000)
})
