import { describe, expect, it } from 'vitest'
import { acceptFixture, inspectionFixture } from './quality-workflow.fixtures'
import {
  currentInspection,
  createAcceptedInspectionAct,
  inspectionApprovals,
  localToday,
  receivedByRequest,
  signInspection,
  surplusReturnSources,
  validateQualityWorkspace,
} from './quality-workflow'
import { receiptBalances } from './receipt-balances'
import { netIssued, siteReturned } from './material-issues'
import type { IssueMovement, SiteReturn } from './material-issues'
import type { WorkspaceSnapshot } from './workspace-snapshot'
import { workspaceSnapshotSchema } from './workspace-snapshot'
import {
  applyWorkspaceEntities,
  emptyWorkspace,
  workspaceEntities,
} from './workspace-protocol'
import { buildDocumentRegistry } from './document-registry'

const issue = (quantity = 6, early = false) => ({
  id: 'issue-1',
  receiptId: 'receipt',
  projectLineId: 'line',
  projectUnit: 'шт',
  quantity,
  date: localToday(),
  document: 'ПМ-1',
  receiver: 'Бригада 1',
  note: '',
  altQuantity: quantity * 2.5,
  altUnit: 'кг',
  altUnitFactor: 2.5,
  ...(early
    ? {
        beforeInspection: {
          reason: 'Фактическая передача до оформления контроля',
        },
      }
    : {}),
})
const returned = (
  quantity = 2,
  condition: SiteReturn['condition'] = 'good',
): SiteReturn => ({
  id: 'return-1',
  date: localToday(),
  quantity,
  condition,
  document: 'ВП-1',
  note: '',
})
function balance(workspace: WorkspaceSnapshot) {
  return receiptBalances(
    [{ id: 'receipt', requestId: 'request', quantity: 10 }],
    workspace.qualityWorkflow,
    inspectionApprovals(workspace.qualityWorkflow),
    workspace.materialIssues as unknown as IssueMovement[],
  ).get('receipt')!
}
const nextDay = () => {
  const date = new Date(`${localToday()}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

describe('returns from site are separate from receipts and customer returns', () => {
  it('restores stock, preserves gross issue and request fulfilment, permits another issue', () => {
    const before = acceptFixture(10)
    before.materialIssues = [issue()]
    const next = structuredClone(before)
    next.materialIssues[0]!.siteReturns = [returned()]
    validateQualityWorkspace(next, before)
    expect(balance(next)).toMatchObject({
      stock: 6,
      availableToIssue: 6,
      returned: 0,
      returnedFromSite: 2,
    })
    expect(next.materialIssues[0]!.quantity).toBe(6)
    expect(
      receivedByRequest(
        [{ id: 'receipt', requestId: 'request', quantity: 10 }],
        next.qualityWorkflow,
      ).get('request'),
    ).toBe(10)
    const again = {
      ...next,
      materialIssues: [
        ...next.materialIssues,
        { ...issue(5), id: 'issue-2', document: 'ПМ-2' },
      ],
    }
    validateQualityWorkspace(again, next)
    expect(balance(again).stock).toBe(1)
    expect(
      surplusReturnSources(
        next.qualityWorkflow,
        [{ id: 'receipt', quantity: 10, date: localToday() }],
        next.materialIssues as unknown as IssueMovement[],
      )[0]!.quantity,
    ).toBe(6)
  })
  it('keeps damaged returns on stock but blocks both ordinary and exceptional reissue', () => {
    const before = acceptFixture(10)
    before.materialIssues = [issue(10)]
    const next = structuredClone(before)
    next.materialIssues[0]!.siteReturns = [returned(2, 'quarantine')]
    validateQualityWorkspace(next, before)
    expect(balance(next)).toMatchObject({
      stock: 2,
      quarantined: 2,
      availableToIssue: 0,
      availableBeforeInspection: 0,
    })
    for (const early of [true, false])
      expect(() =>
        validateQualityWorkspace(
          {
            ...next,
            materialIssues: [
              ...next.materialIssues,
              { ...issue(1, early), id: 'issue-2' },
            ],
          },
          next,
        ),
      ).toThrow()
  })
  it('rejects over-return, duplicate IDs, bad dates and returns before their issue', () => {
    const before = acceptFixture(10)
    before.materialIssues = [issue()]
    for (const rows of [
      [returned(7)],
      [returned(), returned()],
      [{ ...returned(), date: '2026-02-30' }],
      [{ ...returned(), date: '2000-01-01' }],
    ]) {
      expect(() =>
        validateQualityWorkspace(
          { ...before, materialIssues: [{ ...issue(), siteReturns: rows }] },
          before,
        ),
      ).toThrow()
    }
  })
  it('supports fractional partial returns without rounding away an over-return', () => {
    const before = acceptFixture(10)
    before.materialIssues = [issue(0.3)]
    const next = {
      ...before,
      materialIssues: [
        {
          ...issue(0.3),
          siteReturns: [returned(0.1), { ...returned(0.2), id: 'return-2' }],
        },
      ],
    }
    validateQualityWorkspace(next, before)
    expect(netIssued(next.materialIssues[0]!)).toBe(0)
    expect(siteReturned(next.materialIssues[0]!)).toBe(0.3)
    expect(() =>
      validateQualityWorkspace(
        {
          ...next,
          materialIssues: [
            {
              ...issue(0.3),
              siteReturns: [
                ...next.materialIssues[0]!.siteReturns,
                { ...returned(0.001), id: 'return-3' },
              ],
            },
          ],
        },
        next,
      ),
    ).toThrow(/превышает/)
  })
  it('protects recorded returns and the original issue from deletion or rewriting', () => {
    const before = acceptFixture(10)
    before.materialIssues = [{ ...issue(), siteReturns: [returned()] }]
    for (const materialIssues of [
      [],
      [issue()],
      [{ ...issue(), quantity: 7, siteReturns: [returned()] }],
      [{ ...issue(), siteReturns: [{ ...returned(), quantity: 1 }] }],
    ])
      expect(() =>
        validateQualityWorkspace({ ...before, materialIssues }, before),
      ).toThrow(/удалить|защищена|переписать/)
  })
  it('does not spend a future return on an earlier issue or customer return', () => {
    const before = acceptFixture(10)
    before.materialIssues = [issue(10)]
    const next = {
      ...before,
      materialIssues: [
        { ...issue(10), siteReturns: [{ ...returned(2), date: nextDay() }] },
        { ...issue(1), id: 'issue-2' },
      ],
    }
    expect(() => validateQualityWorkspace(next, before)).toThrow(/недостаточно/)
  })
  it('persists through workspace entities and exposes the return in the document registry', () => {
    const before = acceptFixture(10)
    before.materialIssues = [{ ...issue(), siteReturns: [returned()] }]
    const parsed = workspaceSnapshotSchema.parse(before)
    const restored = applyWorkspaceEntities(
      emptyWorkspace(),
      [...workspaceEntities(parsed).values()].map((entity) => ({
        ...entity,
        version: 1,
      })),
    )
    expect(restored.materialIssues).toEqual(before.materialIssues)
    expect(
      buildDocumentRegistry(parsed).documents.some((doc) =>
        doc.label.includes('Возврат с площадки ВП-1'),
      ),
    ).toBe(true)
  })
})

describe('actual issues before incoming control', () => {
  it('does not turn a same-day site return into approval before the AVK date', () => {
    const before = acceptFixture(10)
    const revision = currentInspection(before.qualityWorkflow.cases[0]!)
    revision.avk!.date = nextDay()
    revision.avk!.signedOn = nextDay()
    before.materialIssues = [{ ...issue(4, true), siteReturns: [returned(4)] }]
    // New operations are prepended by the UI; equal dates must not affect the gate.
    const next = {
      ...before,
      materialIssues: [
        { ...issue(4), id: 'issue-2' },
        ...before.materialIssues,
      ],
    }
    expect(() => validateQualityWorkspace(next, before)).toThrow(/АВК/)
  })
  it('requires a reason and recipient and leaves the ordinary issue gate intact', () => {
    const before = inspectionFixture()
    expect(() =>
      validateQualityWorkspace(
        { ...before, materialIssues: [issue(4)] },
        before,
      ),
    ).toThrow(/АВК|выданного/)
    for (const entry of [
      { ...issue(4, true), receiver: '' },
      { ...issue(4, true), beforeInspection: { reason: ' ' } },
    ])
      expect(() =>
        validateQualityWorkspace(
          { ...before, materialIssues: [entry] },
          before,
        ),
      ).toThrow(/причину|получателя/)
    const next = { ...before, materialIssues: [issue(4, true)] }
    validateQualityWorkspace(next, before)
    expect(balance(next)).toMatchObject({
      stock: 6,
      availableToIssue: 0,
      awaitingInspection: 10,
      issuedBeforeInspection: 4,
    })
    expect(() =>
      validateQualityWorkspace(
        { ...next, materialIssues: [{ ...issue(11, true) }] },
        before,
      ),
    ).toThrow(/недостаточно|остаток|превышает/)
    expect(() =>
      validateQualityWorkspace(
        {
          ...next,
          materialIssues: [{ ...issue(4, true), date: '2000-01-01' }],
        },
        before,
      ),
    ).toThrow(/раньше/)
  })
  it('closes control after a later AVK without a second write-off', () => {
    const before = inspectionFixture()
    before.materialIssues = [issue(4, true)]
    const next = structuredClone(before)
    const entry = next.qualityWorkflow.cases[0]!
    const revision = currentInspection(entry)
    revision.zni.rows[0]!.accepted = 10
    revision.zni.rows[0]!.result = 'accepted'
    entry.revisions[0] = signInspection(revision, 'zni', localToday())
    validateQualityWorkspace(next, before)
    expect(balance(next)).toMatchObject({
      stock: 6,
      awaitingAct: 10,
      availableToIssue: 0,
      issuedBeforeInspection: 4,
    })
    const approved = structuredClone(next)
    const rev = currentInspection(approved.qualityWorkflow.cases[0]!)
    rev.avk = createAcceptedInspectionAct(
      approved.qualityWorkflow.cases[0]!,
      [],
    )
    rev.avk.number = 'АВК-1'
    rev.avk.date = nextDay()
    rev.avk.checks.fill('Проверено')
    rev.avk.conclusion = 'Принято'
    approved.qualityWorkflow.cases[0]!.revisions[0] = signInspection(
      rev,
      'avk',
      nextDay(),
    )
    validateQualityWorkspace(approved, next)
    expect(balance(approved)).toMatchObject({
      stock: 6,
      availableToIssue: 6,
      issuedBeforeInspection: 0,
      awaitingAct: 0,
    })
    expect(approved.materialIssues).toEqual(before.materialIssues)
  })
  it('allows a later partial rejection without invalidating the historical movement, but blocks new issue of known rejected stock', () => {
    const before = inspectionFixture()
    before.materialIssues = [issue(10, true)]
    const next = structuredClone(before)
    const entry = next.qualityWorkflow.cases[0]!
    const rev = currentInspection(entry)
    rev.zni.rows[0]!.accepted = 8
    rev.zni.rows[0]!.result = 'remarks'
    rev.zni.rows[0]!.remarks = 'Два не приняты'
    entry.revisions[0] = signInspection(rev, 'zni', localToday())
    validateQualityWorkspace(next, before)
    expect(balance(next)).toMatchObject({
      stock: 0,
      toReturn: 2,
      awaitingAct: 8,
    })
    const rejected = acceptFixture(0)
    expect(() =>
      validateQualityWorkspace(
        { ...rejected, materialIssues: [issue(1, true)] },
        rejected,
      ),
    ).toThrow(/непринятого/)
    expect(balance(rejected).availableBeforeInspection).toBe(0)
  })
  it('does not allow rewriting an ordinary issue as an exception', () => {
    const before = acceptFixture(10)
    before.materialIssues = [issue()]
    expect(() =>
      validateQualityWorkspace(
        { ...before, materialIssues: [issue(6, true)] },
        before,
      ),
    ).toThrow(/режим/)
  })
})
