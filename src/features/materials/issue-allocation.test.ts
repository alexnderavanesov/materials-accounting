import { describe, expect, it } from 'vitest'
import { acceptFixture, inspectionFixture } from './quality-workflow.fixtures'
import {
  currentInspection,
  localToday,
  validateQualityWorkspace,
} from './quality-workflow'
import { allocateIssue, issueAvailability } from './issue-allocation'

function partialApproval(quantity = 3) {
  const workspace = acceptFixture(quantity)
  // Only this part was presented; the rest is still awaiting inspection.
  Object.assign(
    currentInspection(workspace.qualityWorkflow.cases[0]!).zni.rows[0]!,
    {
      presented: quantity,
      accepted: quantity,
      result: 'accepted',
      remarks: '',
    },
  )
  return workspace
}
function movement(quantity: number, early = false) {
  return {
    id: early ? 'early' : 'approved',
    receiptId: 'receipt',
    projectLineId: 'line',
    projectUnit: 'шт',
    date: localToday(),
    document: 'ПМ-1',
    receiver: 'Бригада 1',
    quantity,
    note: '',
    altUnit: 'кг',
    altUnitFactor: 2.5,
    altQuantity: quantity * 2.5,
    ...(early
      ? { beforeInspection: { reason: 'Передано до оформления контроля' } }
      : {}),
  }
}
function tomorrow() {
  const date = new Date(`${localToday()}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

describe('automatic allocation of a single issue form', () => {
  it('classifies full approval and blocks mislabelling it as before VK on the server', () => {
    const before = acceptFixture(10)
    expect(issueAvailability(before, localToday()).get('receipt')).toEqual({
      available: 10,
      approved: 10,
    })
    expect(allocateIssue(4, 10)).toEqual({ approved: 4, beforeInspection: 0 })
    expect(() =>
      validateQualityWorkspace(
        { ...before, materialIssues: [movement(4, true)] },
        before,
      ),
    ).toThrow(/Статус входного контроля/)
    validateQualityWorkspace(
      { ...before, materialIssues: [movement(4)] },
      before,
    )
  })
  it('splits a partial approval in one document, independently of persisted row order', () => {
    const before = partialApproval()
    expect(issueAvailability(before, localToday()).get('receipt')).toEqual({
      available: 10,
      approved: 3,
    })
    expect(allocateIssue(4, 3)).toEqual({ approved: 3, beforeInspection: 1 })
    for (const materialIssues of [
      [movement(3), movement(1, true)],
      [movement(1, true), movement(3)],
    ]) {
      const next = { ...before, materialIssues }
      validateQualityWorkspace(next, before)
      expect(issueAvailability(next, localToday()).get('receipt')).toEqual({
        available: 6,
        approved: 0,
      })
    }
  })
  it('requires all approved capacity to be used before the exceptional part', () => {
    const before = partialApproval()
    expect(() =>
      validateQualityWorkspace(
        { ...before, materialIssues: [movement(2), movement(2, true)] },
        before,
      ),
    ).toThrow(/Статус входного контроля/)
  })
  it('includes received stock without AVK but excludes rejected and quarantined stock', () => {
    const fresh = inspectionFixture()
    expect(issueAvailability(fresh, localToday()).get('receipt')).toEqual({
      available: 10,
      approved: 0,
    })
    const rejected = acceptFixture(3)
    expect(issueAvailability(rejected, localToday()).get('receipt')).toEqual({
      available: 3,
      approved: 3,
    })
    const quarantine = acceptFixture(10)
    quarantine.materialIssues = [
      {
        ...movement(10),
        siteReturns: [
          {
            id: 'return',
            quantity: 2,
            condition: 'quarantine',
            date: localToday(),
            document: '',
            note: '',
          },
        ],
      },
    ]
    expect(issueAvailability(quarantine, localToday()).get('receipt')).toEqual({
      available: 0,
      approved: 0,
    })
  })
  it('uses approval dates and retains the earlier actual issue after signing an AVK', () => {
    const before = acceptFixture(10)
    const rev = currentInspection(before.qualityWorkflow.cases[0]!)
    rev.avk!.date = tomorrow()
    rev.avk!.signedOn = tomorrow()
    expect(issueAvailability(before, localToday()).get('receipt')).toEqual({
      available: 10,
      approved: 0,
    })
    expect(issueAvailability(before, tomorrow()).get('receipt')).toEqual({
      available: 10,
      approved: 10,
    })
    const next = { ...before, materialIssues: [movement(4, true)] }
    validateQualityWorkspace(next, before)
    expect(issueAvailability(next, tomorrow()).get('receipt')).toEqual({
      available: 6,
      approved: 6,
    })
  })
  it('does not rewrite an actual issue when AVK is signed later on the same calendar day', () => {
    const next = acceptFixture(10)
    next.materialIssues = [movement(4, true)]
    const before = structuredClone(next)
    const pending = currentInspection(before.qualityWorkflow.cases[0]!)
    pending.avk = null
    pending.zni.signedOn = null
    validateQualityWorkspace(next, before)
    expect(issueAvailability(next, localToday()).get('receipt')).toEqual({
      available: 6,
      approved: 6,
    })
  })
  it('never spends a future receipt or site return and reserves already recorded later issues', () => {
    const future = acceptFixture(10)
    future.materialReceipts[0]!.date = tomorrow()
    expect(
      issueAvailability(future, localToday()).get('receipt')!.available,
    ).toBe(0)
    const workspace = acceptFixture(10)
    workspace.materialIssues = [
      {
        ...movement(10),
        siteReturns: [
          {
            id: 'return',
            quantity: 2,
            condition: 'good',
            date: tomorrow(),
            document: '',
            note: '',
          },
        ],
      },
    ]
    expect(
      issueAvailability(workspace, localToday()).get('receipt')!.available,
    ).toBe(0)
    expect(issueAvailability(workspace, tomorrow()).get('receipt')).toEqual({
      available: 2,
      approved: 2,
    })
    workspace.materialIssues = [{ ...movement(8), date: tomorrow() }]
    expect(issueAvailability(workspace, localToday()).get('receipt')).toEqual({
      available: 2,
      approved: 2,
    })
  })
  it('keeps fractional allocations exact and rejects duplicate consumption', () => {
    const before = partialApproval(0.1)
    expect(allocateIssue(0.3, 0.1)).toEqual({
      approved: 0.1,
      beforeInspection: 0.2,
    })
    const next = {
      ...before,
      materialIssues: [movement(0.1), movement(0.2, true)],
    }
    validateQualityWorkspace(next, before)
    expect(issueAvailability(next, localToday()).get('receipt')).toEqual({
      available: 9.7,
      approved: 0,
    })
    expect(() =>
      validateQualityWorkspace(
        {
          ...next,
          materialIssues: [
            ...next.materialIssues,
            { ...movement(9.8, true), id: 'another' },
          ],
        },
        next,
      ),
    ).toThrow(/недостаточно|превышает/)
  })
})
