import { expect, it } from 'vitest'
import { linkedM15Fixture } from './m15-reconciliation.fixtures'
import { withoutM15Composition } from './m15-composition-removal'

it('removes one position and its links while preserving other positions and receipt history', () => {
  const { workspace, value } = linkedM15Fixture()
  value.lines.push({ ...value.lines[0]!, id: 'other', name: 'Другой материал' })
  const before = structuredClone(workspace)
  const next = withoutM15Composition(workspace, value, 'row1')
  expect(next.m15Reconciliations![0]!.lines).toEqual([value.lines[1]])
  expect(next.m15Reconciliations![0]!.allocations).toEqual([])
  expect(next.materialReceipts).toEqual(before.materialReceipts)
  expect(next.materialRequests).toEqual(before.materialRequests)
  expect(next.qualityWorkflow).toEqual(before.qualityWorkflow)
  expect(workspace).toEqual(before)
})

it.each([undefined, 'row1'])(
  'removes the entire composition or its last position (%s), retaining the document and other compositions',
  (lineId) => {
    const { workspace, value } = linkedM15Fixture()
    const other = { ...structuredClone(value), id: 'other', allocations: [] }
    workspace.qualityWorkflow.receiptDocuments!.push({
      id: 'other',
      kind: 'm15',
      number: '2',
      date: '2026-11-20',
    })
    workspace.m15Reconciliations!.push(other)
    const before = structuredClone(workspace)
    const next = withoutM15Composition(workspace, value, lineId)
    expect(next.m15Reconciliations).toEqual([other])
    expect(next.qualityWorkflow).toEqual(before.qualityWorkflow)
    expect(next.materialReceipts).toEqual(before.materialReceipts)
    expect(next.materialRequests).toEqual(before.materialRequests)
    expect(withoutM15Composition(next, value, lineId)).toBe(next)
    expect(workspace).toEqual(before)
  },
)

it('protects quantities already used as an inspection basis', () => {
  const { workspace, value } = linkedM15Fixture()
  workspace.qualityWorkflow.cases[0]!.basis = {
    ...workspace.qualityWorkflow.cases[0]!.basis,
    kind: 'm15',
    id: 'm15',
  }
  const before = structuredClone(workspace)
  expect(() => withoutM15Composition(workspace, value)).toThrow(
    'используется в ЗНИ',
  )
  expect(workspace).toEqual(before)
})

it('requires APP coverage before removing the only documentary basis of a receipt', () => {
  const { workspace, value } = linkedM15Fixture()
  delete workspace.materialReceipts[0]!.appDocumentId
  const before = structuredClone(workspace)
  expect(() => withoutM15Composition(workspace, value)).toThrow('Без АПП')
  expect(workspace).toEqual(before)
})

it('rejects stale composition snapshots and missing positions', () => {
  const { workspace, value } = linkedM15Fixture()
  const baseline = structuredClone(value)
  value.lines[0]!.quantity = 11
  expect(() => withoutM15Composition(workspace, baseline)).toThrow(
    'Состав М-15 изменился',
  )
  expect(() => withoutM15Composition(workspace, value, 'missing')).toThrow(
    'Позиция М-15 не найдена',
  )
})
