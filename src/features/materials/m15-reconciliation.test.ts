import { describe, expect, it } from 'vitest'
import {
  calculateM15,
  m15Allocation,
  m15ReceiptIndex,
  validateM15Reconciliation,
  validateM15Workspace,
} from './m15-reconciliation'
import { m15Fixture } from './m15-reconciliation.fixtures'
import {
  recordCustomerReturn,
  localToday,
  validateQualityWorkspace,
} from './quality-workflow'
import { workspaceSnapshotSchema } from './workspace-snapshot'
import {
  applyWorkspaceEntities,
  entitiesWorkspace,
  workspaceEntities,
} from './workspace-protocol'

describe('M-15 quantity reconciliation', () => {
  it.each([
    [10, 'matched', 0],
    [12, 'difference', -2],
    [8, 'difference', 2],
  ] as const)(
    'compares gross receipt 10 against documentary quantity %s',
    (quantity, status, delta) => {
      const { workspace, value } = m15Fixture()
      value.lines[0]!.quantity = quantity
      const before = structuredClone(workspace)
      expect(
        calculateM15(value, m15ReceiptIndex(workspace)).rows[0],
      ).toMatchObject({ status, received: 10, delta })
      expect(() => validateM15Reconciliation(value, workspace)).not.toThrow()
      expect(workspace).toEqual(before)
    },
  )
  it('keeps old documents empty and has no implicit allocations', () => {
    const { workspace, value } = m15Fixture()
    const index = m15ReceiptIndex(workspace)
    expect(
      workspaceSnapshotSchema.parse(workspace).m15Reconciliations,
    ).toBeUndefined()
    expect(
      calculateM15({ ...value, lines: [], allocations: [] }, index),
    ).toMatchObject({
      complete: false,
      rows: [],
      unallocated: [{ remaining: 10 }],
    })
    expect(
      calculateM15({ ...value, allocations: [] }, index).rows[0],
    ).toMatchObject({ status: 'unmatched', received: null })
  })
  it('covers multiple requests and ciphers, with an explicit material replacement', () => {
    const { workspace, value } = m15Fixture()
    workspace.materialRequests.push({
      ...workspace.materialRequests[0]!,
      id: 'request2',
      number: 'ЗП-2',
      cipher: 'ТК2',
      quantity: 5,
    })
    workspace.materialReceipts.push({
      ...workspace.materialReceipts[0]!,
      id: 'receipt2',
      requestId: 'request2',
      quantity: 5,
    })
    const index = m15ReceiptIndex(workspace)
    value.lines[0]!.quantity = 15
    value.allocations.push(m15Allocation(index.get('receipt2')!, 'row1', 5))
    expect(calculateM15(value, index)).toMatchObject({ complete: true })
    expect(index.get('receipt2')).toMatchObject({
      replacement: true,
      actualName: 'Клапан',
      projectName: 'Клапан по проекту',
      cipher: 'ТК2',
      requestNumber: 'ЗП-2',
    })
    expect(() => validateM15Reconciliation(value, workspace)).not.toThrow()
  })
  it('splits one receipt across duplicate document positions without double counting', () => {
    const { workspace, value } = m15Fixture()
    value.lines = [
      { ...value.lines[0]!, quantity: 6 },
      { ...value.lines[0]!, id: 'row2', position: '2', quantity: 4 },
    ]
    value.allocations = [
      { ...value.allocations[0]!, quantity: 6 },
      { ...value.allocations[0]!, lineId: 'row2', quantity: 4 },
    ]
    expect(() => validateM15Reconciliation(value, workspace)).not.toThrow()
    expect(calculateM15(value, m15ReceiptIndex(workspace)).complete).toBe(true)
    value.allocations[1]!.quantity = 5
    expect(() => validateM15Reconciliation(value, workspace)).toThrow(
      'превышает',
    )
    expect(
      calculateM15(value, m15ReceiptIndex(workspace)).rows.every(
        (row) => row.status === 'stale',
      ),
    ).toBe(true)
    value.allocations[1] = { ...value.allocations[0]! }
    expect(() => validateM15Reconciliation(value, workspace)).toThrow(
      'повторно',
    )
  })
  it('shows unallocated receipt remainder separately even when a line matches', () => {
    const { workspace, value } = m15Fixture()
    value.lines[0]!.quantity = 6
    value.allocations[0]!.quantity = 6
    expect(calculateM15(value, m15ReceiptIndex(workspace))).toMatchObject({
      complete: false,
      rows: [{ status: 'matched' }],
      unallocated: [{ remaining: 4 }],
    })
  })
  it('uses saved conversion information and never guesses a missing conversion', () => {
    const { workspace, value } = m15Fixture()
    value.lines[0]!.unit = 'кг'
    value.lines[0]!.quantity = 25
    expect(calculateM15(value, m15ReceiptIndex(workspace)).complete).toBe(true)
    workspace.materialReceipts[0]!.altQuantity = null
    expect(calculateM15(value, m15ReceiptIndex(workspace)).complete).toBe(true)
    workspace.materialReceipts[0]!.altUnitFactor = null
    expect(
      calculateM15(value, m15ReceiptIndex(workspace)).rows[0],
    ).toMatchObject({ status: 'conversion', received: null })
    value.allocations[0]!.conversion = {
      fromUnit: 'шт',
      toUnit: 'кг',
      factor: 2.5,
    }
    expect(calculateM15(value, m15ReceiptIndex(workspace)).complete).toBe(true)
    value.lines[0]!.unit = 'м'
    expect(
      calculateM15(value, m15ReceiptIndex(workspace)).rows[0]!.status,
    ).toBe('conversion')
  })
  it('returns reopen request balance but do not subtract gross M-15 receipt or alter signed documents', () => {
    const { workspace, value } = m15Fixture()
    const signed = structuredClone(workspace.qualityWorkflow.cases)
    workspace.qualityWorkflow = recordCustomerReturn(
      workspace.qualityWorkflow,
      workspace.qualityWorkflow.cases[0]!.id,
      [{ receiptId: 'receipt', quantity: 2 }],
      localToday(),
      'ВОЗ-1',
    )
    const before = structuredClone(workspace)
    expect(m15ReceiptIndex(workspace).get('receipt')).toMatchObject({
      quantity: 10,
      requestReceived: 10,
      requestReturned: 2,
      requestRemaining: 2,
    })
    const after = { ...workspace, m15Reconciliations: [value] }
    validateM15Workspace(after, workspace)
    validateQualityWorkspace(after, workspace)
    expect(calculateM15(value, m15ReceiptIndex(after)).complete).toBe(true)
    expect(workspace).toEqual(before)
    expect(after.qualityWorkflow.cases).toEqual(signed)
  })
  it('marks edited, moved or deleted receipts stale, allowing receipt corrections', () => {
    for (const change of [
      { quantity: 9 },
      { projectUnit: 'м' },
      { m15DocumentId: 'other' },
      { actualName: 'Другой материал' },
      { requestId: 'other-request' },
    ]) {
      const { workspace, value } = m15Fixture()
      const before = {
        ...structuredClone(workspace),
        m15Reconciliations: [value],
      }
      Object.assign(workspace.materialReceipts[0]!, change)
      expect(() =>
        validateM15Workspace(
          { ...workspace, m15Reconciliations: [value] },
          before,
        ),
      ).not.toThrow()
      expect(
        calculateM15(value, m15ReceiptIndex(workspace)).rows[0]!.status,
      ).toBe('stale')
      expect(() => validateM15Reconciliation(value, workspace)).toThrow(
        'Получение изменилось',
      )
    }
    const { workspace, value } = m15Fixture()
    workspace.materialReceipts = []
    expect(
      calculateM15(value, m15ReceiptIndex(workspace)).rows[0]!.status,
    ).toBe('stale')
  })
  it('rejects links to another document, missing lines, duplicate documents, and invalid amounts', () => {
    const { workspace, value } = m15Fixture()
    expect(() =>
      validateM15Reconciliation({ ...value, id: 'unknown' }, workspace),
    ).toThrow('М-15 не найдена')
    expect(() =>
      validateM15Reconciliation({ ...value, lines: [] }, workspace),
    ).toThrow('Строка М-15')
    expect(() =>
      validateM15Workspace({
        ...workspace,
        m15Reconciliations: [value, value],
      }),
    ).toThrow('Повторяется')
    value.allocations[0]!.quantity = -1
    expect(() => validateM15Reconciliation(value, workspace)).toThrow(
      'положительными',
    )
  })
  it('handles fractional quantities without hiding real large-value shortages', () => {
    const { workspace, value } = m15Fixture()
    workspace.materialReceipts[0]!.quantity = 0.1 + 0.2
    value.lines[0]!.quantity = 0.3
    value.allocations = [
      m15Allocation(m15ReceiptIndex(workspace).get('receipt')!, 'row1', 0.3),
    ]
    expect(calculateM15(value, m15ReceiptIndex(workspace)).complete).toBe(true)
    value.lines[0]!.quantity = 1e10 + 1
    workspace.materialReceipts[0]!.quantity = 1e10
    value.allocations = [
      m15Allocation(m15ReceiptIndex(workspace).get('receipt')!, 'row1', 1e10),
    ]
    expect(
      calculateM15(value, m15ReceiptIndex(workspace)).rows[0]!.status,
    ).toBe('difference')
  })
  it('round trips the optional collection, preserving unrelated references on sync', () => {
    const { workspace, value } = m15Fixture()
    const next = applyWorkspaceEntities(workspace, [
      {
        collection: 'm15Reconciliations',
        id: value.id,
        value,
        version: 1,
        position: 0,
      },
    ])
    expect(next.materialReceipts).toBe(workspace.materialReceipts)
    expect(next.qualityWorkflow).toBe(workspace.qualityWorkflow)
    const restored = entitiesWorkspace([...workspaceEntities(next).values()])
    expect(restored.m15Reconciliations).toEqual([value])
    expect(workspaceSnapshotSchema.parse(restored).m15Reconciliations).toEqual([
      value,
    ])
  })
})

it('rejects tiny over-allocation and does not treat overflowing totals as equal', () => {
  const { workspace, value } = m15Fixture()
  workspace.materialReceipts[0]!.quantity = 1e-10
  value.allocations = [
    m15Allocation(m15ReceiptIndex(workspace).get('receipt')!, 'row1', 2e-10),
  ]
  expect(() => validateM15Reconciliation(value, workspace)).toThrow('превышает')
  workspace.materialReceipts[0]!.quantity = 1e308
  value.lines.push({ ...value.lines[0]!, id: 'row2' })
  value.allocations = ['row1', 'row2'].map((id) =>
    m15Allocation(m15ReceiptIndex(workspace).get('receipt')!, id, 1e308),
  )
  expect(() => validateM15Reconciliation(value, workspace)).toThrow('превышает')
})

it('validates and calculates 50,000 independent positions without scanning all receipts per line', () => {
  const { workspace, value } = m15Fixture()
  workspace.qualityWorkflow.cases = []
  workspace.materialReceipts = Array.from({ length: 50000 }, (_, i) => ({
    ...workspace.materialReceipts[0]!,
    id: `receipt-${i}`,
    requestId: `request-${i}`,
    quantity: 1,
  }))
  workspace.materialRequests = Array.from({ length: 50000 }, (_, i) => ({
    ...workspace.materialRequests[0]!,
    id: `request-${i}`,
    quantity: 1,
  }))
  value.lines = Array.from({ length: 50000 }, (_, i) => ({
    ...value.lines[0]!,
    id: `line-${i}`,
    quantity: 1,
  }))
  value.allocations = value.lines.map((line, i) => ({
    ...value.allocations[0]!,
    lineId: line.id,
    receiptId: `receipt-${i}`,
    quantity: 1,
    receiptQuantity: 1,
    receiptRequestId: `request-${i}`,
  }))
  const started = performance.now()
  validateM15Workspace({ ...workspace, m15Reconciliations: [value] })
  const result = calculateM15(value, m15ReceiptIndex(workspace))
  expect(result.complete).toBe(true)
  expect(result.rows).toHaveLength(50000)
  expect(performance.now() - started).toBeLessThan(5000)
})

it('uses the same outstanding request balance after approved project cancellations', () => {
  const { workspace, value } = m15Fixture()
  workspace.materialRequests[0]!.quantity = 20
  workspace.materialRequests[0]!.projectCancellations = [
    {
      id: 'cancel',
      quantity: 5,
      date: localToday(),
      basisId: 'revision',
      basisKind: 'project-change',
    },
  ]
  const receipt = m15ReceiptIndex(workspace).get('receipt')!
  expect(receipt).toMatchObject({
    requested: 20,
    requestCancelled: 5,
    requestReceived: 10,
    requestRemaining: 5,
  })
  expect(calculateM15(value, m15ReceiptIndex(workspace)).complete).toBe(true)
})

it('does not infer a conversion factor from legacy alternative quantities', () => {
  const { workspace, value } = m15Fixture()
  value.lines[0]!.unit = 'кг'
  value.lines[0]!.quantity = 25
  workspace.materialReceipts[0]!.altUnitFactor = null
  expect(calculateM15(value, m15ReceiptIndex(workspace)).rows[0]!.status).toBe(
    'conversion',
  )
  workspace.materialReceipts[0]!.altUnitFactor = 2.5
  workspace.materialReceipts[0]!.altQuantity = 30
  expect(calculateM15(value, m15ReceiptIndex(workspace)).rows[0]).toMatchObject(
    { status: 'matched', received: 25 },
  )
})
