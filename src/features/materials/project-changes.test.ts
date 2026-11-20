import { describe, expect, it } from 'vitest'
import { projectChangeFixture } from './project-changes.fixtures'
import {
  currentInspection,
  localToday,
  recordCustomerReturn,
  recordSurplusReturn,
  validateQualityWorkspace,
} from './quality-workflow'
import {
  prepareProjectChange,
  prepareStockTransfer,
  projectConsequences,
  projectPosition,
  reconcileProjectRequests,
  validateProjectChanges,
} from './project-changes'
import type { ProjectChangeWorkspace } from './project-changes'
import {
  effectiveRequestQuantity,
  stockAssignmentKey,
} from './project-change-types'
import { availableAssignedStock, stockAssignments } from './stock-assignments'
import { importProjectRevision } from './project-change-import'
import { entitiesWorkspace, workspaceEntities } from './workspace-protocol'
import { toWorkspaceSnapshot } from './workspace-snapshot'

const revise = (
  workspace: ProjectChangeWorkspace,
  quantity: number,
  number = '2',
) =>
  prepareProjectChange(workspace, {
    project: 'Объект',
    cipher: 'ТКМ5',
    kind: 'revision',
    number,
    date: localToday(),
    reason: 'Новая спецификация',
    author: 'Разработчик',
    positions: workspace.lines
      .filter((row) => row.cipher === 'ТКМ5')
      .map((row) => ({ ...projectPosition(row), plannedQuantity: quantity })),
  })
function withTarget() {
  const original = projectChangeFixture()
  original.lines.push({
    ...original.lines[0]!,
    id: 'target',
    cipher: 'ТКМ6',
    plannedQuantity: 4,
  })
  original.materialRequests.push({
    id: 'target-request',
    projectLineId: 'target',
    quantity: 4,
    date: localToday(),
    number: 'ЗП-2',
  })
  return revise(original, 8)
}
const transfer = (
  workspace: ProjectChangeWorkspace,
  amount = 2,
  target = 'target',
) =>
  prepareStockTransfer(workspace, {
    receiptId: 'receipt',
    fromProjectLineId: 'line',
    toProjectLineId: target,
    quantity: amount,
    date: localToday(),
    projectChangeId: workspace.projectChanges!.at(-1)!.id,
    author: 'Разработчик',
    note: 'На другой шифр',
  })

describe('project revisions and material ownership', () => {
  it('records the baseline and immutable before/after without rewriting receipts or requests', () => {
    const before = projectChangeFixture(),
      after = revise(before, 8)
    expect(after.projectChanges?.map((row) => row.kind)).toEqual([
      'baseline',
      'revision',
    ])
    expect(after.projectChanges?.[1]?.items[0]?.before?.plannedQuantity).toBe(
      10,
    )
    expect(after.materialReceipts).toEqual(before.materialReceipts)
    expect(after.materialRequests[0]?.quantity).toBe(10)
    expect(projectConsequences(after)[0]?.surplus).toBe(2)
    validateQualityWorkspace(after, before)
    expect(
      entitiesWorkspace([
        ...workspaceEntities(toWorkspaceSnapshot(after)).values(),
      ]),
    ).toMatchObject({
      projectChanges: JSON.parse(JSON.stringify(after.projectChanges)),
    })
  })
  it('automatically cancels only unreceived amounts, newest request first', () => {
    const before = projectChangeFixture()
    before.qualityWorkflow!.cases = []
    before.materialReceipts[0]!.quantity = 6
    before.materialRequests = [
      { id: 'first', projectLineId: 'line', quantity: 7, date: '2026-11-01' },
      { id: 'last', projectLineId: 'line', quantity: 3, date: '2026-11-02' },
    ]
    before.materialReceipts[0]!.requestId = 'first'
    const after = revise(before, 8)
    expect(after.materialRequests.map(effectiveRequestQuantity)).toEqual([7, 1])
    expect(after.materialRequests.map((row) => row.quantity)).toEqual([7, 3])
    expect(projectConsequences(after)[0]).toMatchObject({
      surplus: 0,
      need: 2,
      outstanding: 2,
    })
    validateQualityWorkspace(after, before)
  })
  it('allows explicitly approved receipt excess after a project cancellation', () => {
    const original = projectChangeFixture()
    original.qualityWorkflow!.cases = []
    original.materialReceipts[0]!.quantity = 6
    const before = revise(original, 8)
    expect(effectiveRequestQuantity(before.materialRequests[0]!)).toBe(8)
    const after = structuredClone(before)
    after.materialReceipts.push({
      ...after.materialReceipts[0]!,
      id: 'extra',
      quantity: 3,
    })
    expect(() => validateProjectChanges(after, before)).toThrow(/превышает/)
    Object.assign(after.materialReceipts[1]!, {
      overageApproval: {
        requestId: 'request',
        quantity: 3,
        excessQuantity: 1,
        approvedAt: new Date().toISOString(),
      },
    })
    expect(() => validateProjectChanges(after, before)).not.toThrow()
    expect(() => validateQualityWorkspace(after, before)).not.toThrow()
    expect(projectConsequences(after)[0]!.surplus).toBe(1)
  })

  it('does not double count sequential changes and does not restore cancelled orders', () => {
    const before = projectChangeFixture()
    before.qualityWorkflow!.cases = []
    before.materialReceipts[0]!.quantity = 6
    const eight = revise(before, 8),
      six = revise(eight, 6, '3'),
      ten = revise(six, 10, '4')
    expect(effectiveRequestQuantity(ten.materialRequests[0]!)).toBe(6)
    expect(projectConsequences(ten)[0]).toMatchObject({
      toRequest: 4,
      surplus: 0,
    })
    const full = revise(projectChangeFixture(), 8),
      lower = revise(full, 6, '3'),
      restored = revise(lower, 10, '4')
    expect(projectConsequences(lower)[0]?.surplus).toBe(4)
    expect(projectConsequences(restored)[0]?.surplus).toBe(0)
  })
  it('keeps replacements as separate identities and supports partial replacement', () => {
    const before = projectChangeFixture(),
      original = projectPosition(before.lines[0]!)
    const after = prepareProjectChange(before, {
      project: original.project,
      cipher: original.cipher,
      kind: 'revision',
      number: '2',
      date: localToday(),
      reason: 'Другой размер',
      author: 'Тест',
      positions: [
        { ...original, plannedQuantity: 3 },
        {
          ...original,
          id: 'new',
          projectMaterialName: 'Отвод 90×10',
          plannedQuantity: 7,
        },
      ],
      replacements: { new: 'line' },
    })
    expect(after.lines.find((row) => row.id === 'line')?.plannedQuantity).toBe(
      3,
    )
    expect(
      after.projectChanges!.at(-1)!.items.find((row) => row.after.id === 'new')
        ?.replacesLineId,
    ).toBe('line')
    expect(after.materialReceipts[0]?.projectLineId).toBe('line')
    expect(
      projectConsequences(after).find((row) => row.line.id === 'new')
        ?.toRequest,
    ).toBe(7)
  })
  it('protects saved history and every direct edit path', () => {
    const before = revise(projectChangeFixture(), 8)
    for (const mutate of [
      (state: ProjectChangeWorkspace) => {
        state.lines[0]!.plannedQuantity = 9
      },
      (state: ProjectChangeWorkspace) => {
        state.projectChanges = []
      },
      (state: ProjectChangeWorkspace) => {
        state.projectChanges![0]!.items[0]!.after.plannedQuantity = 11
      },
      (state: ProjectChangeWorkspace) => {
        state.lines.push({ ...state.lines[0]!, id: 'silent' })
      },
    ]) {
      const after = structuredClone(before)
      mutate(after)
      expect(() => validateProjectChanges(after, before)).toThrow()
    }
    expect(() => revise(before, 7, '2')).toThrow('Номер ИЗМ')
  })
  it('does not duplicate a quality rejection as surplus and cancels later reopened expectation', () => {
    const before = revise(projectChangeFixture(8), 8)
    expect(projectConsequences(before)[0]?.surplus).toBe(0)
    const workflow = recordCustomerReturn(
      before.qualityWorkflow!,
      before.qualityWorkflow!.cases[0]!.id,
      [{ receiptId: 'receipt', quantity: 2 }],
      localToday(),
    )
    const after = { ...before, qualityWorkflow: workflow }
    after.materialRequests = reconcileProjectRequests(after, localToday())
    expect(effectiveRequestQuantity(after.materialRequests[0]!)).toBe(8)
    expect(projectConsequences(after)[0]).toMatchObject({
      surplus: 0,
      outstanding: 0,
    })
    validateProjectChanges(after, before)
  })
  it('moves stock once, reduces target orders and keeps original inspection', () => {
    const before = withTarget(),
      after = transfer(before)
    expect(after.materialReceipts).toEqual(before.materialReceipts)
    expect(after.qualityWorkflow).toEqual(before.qualityWorkflow)
    expect(effectiveRequestQuantity(after.materialRequests[1]!)).toBe(2)
    const stock = stockAssignments(after)
    expect(stock.get(stockAssignmentKey('receipt', 'line'))?.stock).toBe(8)
    expect(stock.get(stockAssignmentKey('receipt', 'target'))?.stock).toBe(2)
    expect([...stock.values()].reduce((sum, row) => sum + row.stock, 0)).toBe(
      10,
    )
    expect(
      projectConsequences(after).find((row) => row.line.id === 'line')?.surplus,
    ).toBe(0)
  })
  it('supports issue, site return and customer return on the receiving cipher', () => {
    const before = transfer(withTarget())
    const issue = {
      id: 'issue',
      receiptId: 'receipt',
      projectLineId: 'target',
      quantity: 2,
      date: localToday(),
      document: 'ВЫД-1',
      projectUnit: 'шт',
      receiver: 'Иван',
    }
    const issued = { ...before, materialIssues: [issue] }
    validateQualityWorkspace(issued, before)
    validateProjectChanges(issued, before)
    expect(
      stockAssignments(issued).get(stockAssignmentKey('receipt', 'target'))
        ?.stock,
    ).toBe(0)
    const returned = {
      ...issued,
      materialIssues: [
        {
          ...issue,
          siteReturns: [
            {
              id: 'back',
              quantity: 1,
              date: localToday(),
              condition: 'good' as const,
              document: '',
              note: '',
            },
          ],
        },
      ],
    }
    validateQualityWorkspace(returned, issued)
    validateProjectChanges(returned, issued)
    const workflow = recordSurplusReturn(
      returned.qualityWorkflow!,
      returned.materialReceipts,
      returned.materialIssues,
      [{ receiptId: 'receipt', quantity: 1 }],
      localToday(),
    )
    workflow.customerReturns!.at(-1)!.projectLineId = 'target'
    const next = { ...returned, qualityWorkflow: workflow }
    validateQualityWorkspace(next, returned)
    validateProjectChanges(next, returned)
    expect(
      stockAssignments(next).get(stockAssignmentKey('receipt', 'target'))
        ?.stock,
    ).toBe(0)
  })
  it('rejects double spending, transfers before AVK, wrong material and site quantities', () => {
    const before = withTarget(),
      after = transfer(before)
    expect(() => transfer(after)).toThrow()
    const unsigned = withTarget()
    currentInspection(unsigned.qualityWorkflow!.cases[0]!).avk!.signedOn = null
    expect(() => transfer(unsigned)).toThrow()
    const other = withTarget()
    other.lines.find((row) => row.id === 'target')!.material = 'Другая сталь'
    expect(() => transfer(other)).toThrow()
    const issued = withTarget()
    issued.materialIssues = [
      {
        id: 'issued',
        receiptId: 'receipt',
        projectLineId: 'line',
        quantity: 10,
        date: localToday(),
      },
    ]
    expect(
      projectConsequences(issued).find((row) => row.line.id === 'line')
        ?.fromSite,
    ).toBe(2)
    expect(() => transfer(issued)).toThrow()
    const spending = {
      ...after,
      materialIssues: [
        {
          id: 'bad',
          receiptId: 'receipt',
          projectLineId: 'target',
          quantity: 3,
          date: localToday(),
        },
      ],
    }
    expect(() => validateProjectChanges(spending, after)).toThrow()
    expect(
      availableAssignedStock(after, '2020-01-01').get(
        stockAssignmentKey('receipt', 'target'),
      )?.availableApproved,
    ).toBe(0)
  })
  it('imports full and partial specifications without guessing replacement links', () => {
    const before = projectChangeFixture(),
      old = projectPosition(before.lines[0]!)
    const other = {
      ...old,
      id: 'other',
      projectMaterialName: 'Отвод',
      plannedQuantity: 5,
    }
    const rows = [
      {
        cipher: old.cipher,
        projectMaterialName: 'Новый отвод',
        unit: 'шт',
        quantity: 3,
      },
    ]
    expect(
      importProjectRevision(
        [old, other],
        rows,
        'changes',
        old.project,
        old.cipher,
      ).find((row) => row.id === old.id)?.plannedQuantity,
    ).toBe(10)
    expect(
      importProjectRevision(
        [old, other],
        rows,
        'full',
        old.project,
        old.cipher,
      ).find((row) => row.id === old.id)?.plannedQuantity,
    ).toBe(0)
    expect(() =>
      importProjectRevision(
        [old],
        rows.concat(rows),
        'full',
        old.project,
        old.cipher,
      ),
    ).toThrow('повторяется')
    expect(() =>
      importProjectRevision(
        [old],
        [{ ...rows[0], cipher: 'Чужой' }],
        'full',
        old.project,
        old.cipher,
      ),
    ).toThrow('шифр')
  })
})

it('revises 10,000 positions with immutable requests and deterministic cancellations', () => {
  const source = projectChangeFixture()
  const line = source.lines[0]!,
    request = source.materialRequests[0]!
  source.lines = Array.from({ length: 10000 }, (_, i) => ({
    ...line,
    id: `line-${i}`,
    projectMaterialName: `Материал ${i}`,
  }))
  source.materialRequests = source.lines.map((row) => ({
    ...request,
    id: `request-${row.id}`,
    projectLineId: row.id!,
  }))
  source.materialReceipts = []
  source.qualityWorkflow!.cases = []
  const next = revise(source, 8)
  expect(next.projectChanges![0]!.items).toHaveLength(10000)
  expect(next.projectChanges![1]!.items).toHaveLength(10000)
  expect(
    next.materialRequests.every(
      (row) => row.quantity === 10 && effectiveRequestQuantity(row) === 8,
    ),
  ).toBe(true)
  expect(
    source.materialRequests.every((row) => !row.projectCancellations),
  ).toBe(true)
}, 20000)

it('returns transferred stock from its approved source when the original receipt also has uninspected units', () => {
  const source = withTarget()
  const row = currentInspection(source.qualityWorkflow!.cases[0]!).zni.rows[0]!
  Object.assign(row, {
    presented: 5,
    accepted: 5,
    result: 'accepted',
    remarks: '',
  })
  const moved = transfer(source)
  const workflow = recordSurplusReturn(
    moved.qualityWorkflow!,
    moved.materialReceipts,
    moved.materialIssues,
    [{ receiptId: 'receipt', quantity: 1, approvedOnly: true }],
    localToday(),
  )
  const back = workflow.customerReturns!.at(-1)!
  back.projectLineId = 'target'
  expect(back.source).toBe('accepted')
  const next = { ...moved, qualityWorkflow: workflow }
  validateQualityWorkspace(next, moved)
  validateProjectChanges(next, moved)
  expect(
    stockAssignments(next).get(stockAssignmentKey('receipt', 'target')),
  ).toMatchObject({ stock: 1, approved: 1 })
  expect(() =>
    validateProjectChanges(
      {
        ...next,
        qualityWorkflow: {
          ...workflow,
          customerReturns: [{ ...back, source: 'uninspected' }],
        },
      },
      moved,
    ),
  ).toThrow('принятого')
})
