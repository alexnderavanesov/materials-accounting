import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { documentInspectionFixture } from './quality-workflow.fixtures'
import {
  createAcceptedInspectionAct,
  currentInspection,
  inspectionApprovals,
  inspectionAvailableQuantities,
  newInspection,
  pendingCustomerReturns,
  recordCustomerReturn,
  recordSurplusReturn,
  reopenInspection,
  signInspection,
  surplusReturnSources,
  validateQualityWorkspace,
} from './quality-workflow'
import { receiptBalances, receivedByRequest } from './receipt-balances'
import { createWorkspaceStore } from './workspace-snapshot.server'

const date = '2026-10-24'
const fixture = documentInspectionFixture
const receipts = (workspace: ReturnType<typeof fixture>) =>
  workspace.materialReceipts as unknown as Parameters<typeof newInspection>[2] &
    Array<{ date: string }>
const issues = (workspace: ReturnType<typeof fixture>) =>
  workspace.materialIssues as unknown as Parameters<
    typeof surplusReturnSources
  >[2]
function surplus(
  workspace: ReturnType<typeof fixture>,
  quantity: number,
  returnDate = date,
) {
  workspace.qualityWorkflow = recordSurplusReturn(
    workspace.qualityWorkflow,
    receipts(workspace),
    issues(workspace),
    [{ receiptId: 'receipt', quantity }],
    returnDate,
  )
}
function signAct(workspace: ReturnType<typeof fixture>) {
  const entry = workspace.qualityWorkflow.cases[0]!
  const rev = currentInspection(entry)
  rev.avk ??= createAcceptedInspectionAct(entry)
  Object.assign(rev.avk, { number: 'АВК-1', conclusion: 'Принято 3', date })
  rev.avk.checks.fill('Проверено')
  entry.revisions[0] = signInspection(rev, 'avk', date)
}
function balance(workspace: ReturnType<typeof fixture>) {
  return receiptBalances(
    receipts(workspace),
    workspace.qualityWorkflow,
    inspectionApprovals(workspace.qualityWorkflow),
    issues(workspace),
  ).get('receipt')!
}
const folders: Array<string> = []
beforeEach(() => {
  // Fixture receipts/signatures and explicit return dates share one timeline.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${date}T12:00:00Z`))
})
afterEach(async () => {
  vi.useRealTimers()
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true })
})

describe('surplus and rejected customer returns', () => {
  it('keeps the return badge and list aligned during a repeated inspection and partial returns', () => {
    const workspace = fixture()
    const entry = workspace.qualityWorkflow.cases[0]!
    currentInspection(entry).avk = null
    const signed = structuredClone(currentInspection(entry))
    const pendingTotal = () =>
      workspace.qualityWorkflow.cases
        .flatMap((item) =>
          pendingCustomerReturns(workspace.qualityWorkflow, item),
        )
        .reduce((total, item) => total + item.quantity, 0)
    expect(balance(workspace).toReturn).toBe(pendingTotal())
    expect(balance(workspace).toReturn).toBe(1)

    const before = structuredClone(workspace)
    const repeated = reopenInspection(entry)
    workspace.qualityWorkflow.cases[0] = repeated
    currentInspection(repeated).zni.rows[0]!.accepted = 2.5
    validateQualityWorkspace(workspace, before)
    expect(balance(workspace).toReturn).toBe(pendingTotal())
    expect(balance(workspace)).toMatchObject({
      toReturn: 0,
      stock: 4,
      returned: 0,
      awaitingAct: 3,
      awaitingInspection: 0,
    })
    expect(() =>
      recordCustomerReturn(
        workspace.qualityWorkflow,
        repeated.id,
        [{ receiptId: 'receipt', quantity: 1 }],
        date,
      ),
    ).toThrow(/остаток/)

    repeated.revisions[1] = signInspection(
      currentInspection(repeated),
      'zni',
      date,
    )
    expect(balance(workspace).toReturn).toBe(pendingTotal())
    expect(balance(workspace).toReturn).toBe(1.5)
    workspace.qualityWorkflow = recordCustomerReturn(
      workspace.qualityWorkflow,
      repeated.id,
      [{ receiptId: 'receipt', quantity: 0.5 }],
      date,
    )
    expect(balance(workspace).toReturn).toBe(pendingTotal())
    expect(balance(workspace)).toMatchObject({
      toReturn: 1,
      returned: 0.5,
      stock: 3.5,
    })
    expect(repeated.revisions[0]).toEqual(signed)
  })

  it('subtracts returns from the corresponding partial inspection of a shared receipt', () => {
    const workspace = fixture()
    const first = workspace.qualityWorkflow.cases[0]!
    currentInspection(first).zni.rows[0]!.presented = 2
    currentInspection(first).zni.rows[0]!.accepted = 1
    currentInspection(first).avk = null
    const second = structuredClone(first)
    second.id = 'second-inspection'
    workspace.qualityWorkflow.cases.push(second)
    workspace.qualityWorkflow = recordCustomerReturn(
      workspace.qualityWorkflow,
      first.id,
      [{ receiptId: 'receipt', quantity: 0.5 }],
      date,
    )
    workspace.qualityWorkflow.cases[1] = reopenInspection(second)
    expect(balance(workspace).toReturn).toBe(0.5)
    expect(
      pendingCustomerReturns(workspace.qualityWorkflow, first)[0]!.quantity,
    ).toBe(0.5)
    expect(
      pendingCustomerReturns(
        workspace.qualityWorkflow,
        workspace.qualityWorkflow.cases[1],
      ),
    ).toEqual([])
  })

  it('returns excess before inspection without reopening the request or making returned stock available to ZNI', () => {
    const workspace = fixture()
    workspace.qualityWorkflow.cases = []
    const previous = structuredClone(workspace)
    surplus(workspace, 1)
    validateQualityWorkspace(workspace, previous)
    expect(balance(workspace)).toMatchObject({
      received: 4,
      returned: 1,
      stock: 3,
      awaitingInspection: 3,
      availableToIssue: 0,
    })
    expect(
      receivedByRequest(receipts(workspace), workspace.qualityWorkflow).get(
        'request',
      ),
    ).toBe(4)
    expect(
      inspectionAvailableQuantities(
        workspace.qualityWorkflow,
        receipts(workspace),
      ).get('receipt'),
    ).toBe(3)
    expect(() =>
      newInspection(
        workspace.qualityWorkflow,
        [{ receiptId: 'receipt', quantity: 4 }],
        receipts(workspace),
        [],
        'source',
      ),
    ).toThrow(/остаток/)
    const forged = structuredClone(workspace)
    forged.qualityWorkflow.cases = fixture().qualityWorkflow.cases
    expect(() => validateQualityWorkspace(forged, workspace)).toThrow(
      /возврат/i,
    )
  })
  it('keeps rejected and accepted pools separate: 4 received, 3 approved, 1 excess and 1 rejected returned', () => {
    const workspace = fixture()
    signAct(workspace)
    const previous = structuredClone(workspace)
    surplus(workspace, 1)
    validateQualityWorkspace(workspace, previous)
    expect(balance(workspace)).toMatchObject({
      stock: 3,
      toReturn: 1,
      availableToIssue: 2,
    })
    expect(
      receivedByRequest(receipts(workspace), workspace.qualityWorkflow).get(
        'request',
      ),
    ).toBe(4)
    workspace.qualityWorkflow = recordCustomerReturn(
      workspace.qualityWorkflow,
      workspace.qualityWorkflow.cases[0]!.id,
      [{ receiptId: 'receipt', quantity: 1 }],
      date,
    )
    validateQualityWorkspace(workspace, previous)
    expect(balance(workspace)).toMatchObject({
      stock: 2,
      toReturn: 0,
      availableToIssue: 2,
      returned: 2,
    })
    expect(
      receivedByRequest(receipts(workspace), workspace.qualityWorkflow).get(
        'request',
      ),
    ).toBe(3)
    workspace.materialIssues = [
      { id: 'issue', receiptId: 'receipt', quantity: 2, date },
    ]
    validateQualityWorkspace(workspace, previous)
    expect(balance(workspace)).toMatchObject({ stock: 0, availableToIssue: 0 })
    expect(() => surplus(workspace, 0.1)).toThrow(/остаток/)
  })
  it('preserves a return made after ZNI but before AVK signing, including when AVK is signed later', () => {
    const workspace = fixture()
    const previous = structuredClone(workspace)
    surplus(workspace, 1)
    validateQualityWorkspace(workspace, previous)
    expect(balance(workspace)).toMatchObject({
      awaitingAct: 2,
      availableToIssue: 0,
      toReturn: 1,
    })
    const afterReturn = structuredClone(workspace)
    signAct(workspace)
    currentInspection(workspace.qualityWorkflow.cases[0]!).avk!.signedOn =
      '2026-10-25'
    validateQualityWorkspace(workspace, afterReturn)
    expect(balance(workspace)).toMatchObject({
      awaitingAct: 0,
      availableToIssue: 2,
      toReturn: 1,
    })
  })
  it('excludes issued material, rejects repeated returns, and checks the same constraints on the server', () => {
    const workspace = fixture()
    signAct(workspace)
    workspace.materialIssues = [
      { id: 'issue', receiptId: 'receipt', quantity: 2.6, date },
    ]
    expect(() => surplus(workspace, 0.5)).toThrow(/остаток/)
    surplus(workspace, 0.4)
    validateQualityWorkspace(workspace)
    expect(balance(workspace).availableToIssue).toBe(0)
    expect(() => surplus(workspace, 0.1)).toThrow()
    const forged = structuredClone(workspace)
    forged.qualityWorkflow.customerReturns![0]!.quantity = 0.5
    expect(() => validateQualityWorkspace(forged)).toThrow(/выданного/)
  })
  it('protects draft inspections while allowing the unreserved part of a receipt to be returned', () => {
    const workspace = fixture()
    workspace.qualityWorkflow.cases = []
    workspace.qualityWorkflow.cases = [
      newInspection(
        workspace.qualityWorkflow,
        [{ receiptId: 'receipt', quantity: 3 }],
        receipts(workspace),
        [],
        'source',
      ),
    ]
    expect(
      surplusReturnSources(
        workspace.qualityWorkflow,
        receipts(workspace),
        [],
      ).reduce((sum, row) => sum + row.quantity, 0),
    ).toBe(1)
    surplus(workspace, 1)
    validateQualityWorkspace(workspace)
    expect(() => surplus(workspace, 1)).toThrow()
  })
  it('does not treat a fully rejected batch as surplus', () => {
    const workspace = fixture()
    const entry = workspace.qualityWorkflow.cases[0]!
    const rev = currentInspection(entry)
    Object.assign(rev.zni.rows[0]!, { accepted: 0, result: 'rejected' })
    rev.avk = null
    expect(
      surplusReturnSources(workspace.qualityWorkflow, receipts(workspace), []),
    ).toEqual([])
    expect(() => surplus(workspace, 1)).toThrow()
    workspace.qualityWorkflow = recordCustomerReturn(
      workspace.qualityWorkflow,
      entry.id,
      [{ receiptId: 'receipt', quantity: 4 }],
      date,
    )
    expect(balance(workspace)).toMatchObject({
      stock: 0,
      toReturn: 0,
      availableToIssue: 0,
    })
    expect(
      receivedByRequest(receipts(workspace), workspace.qualityWorkflow).get(
        'request',
      ),
    ).toBe(0)
  })
  it('rejects deletion, changing the source batch, invalid sources and backdated returns', () => {
    const workspace = fixture()
    workspace.qualityWorkflow.cases = []
    expect(() => surplus(workspace, 1, '2000-01-01')).toThrow()
    expect(() => surplus(workspace, 1, '')).toThrow()
    surplus(workspace, 1)
    for (const change of [
      (next: typeof workspace) => {
        next.qualityWorkflow.customerReturns = []
      },
      (next: typeof workspace) => {
        next.materialReceipts = []
      },
      (next: typeof workspace) => {
        next.materialReceipts[0]!.quantity = 5
      },
      (next: typeof workspace) => {
        next.qualityWorkflow.customerReturns![0]!.source = 'accepted'
      },
      (next: typeof workspace) => {
        next.qualityWorkflow.customerReturns![0]!.caseId = 'missing'
      },
    ]) {
      const next = structuredClone(workspace)
      change(next)
      expect(() => validateQualityWorkspace(next, workspace)).toThrow()
    }
  })
  it('persists returns atomically and rejects a stale tab without changing the saved result', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'materials-returns-test-'))
    folders.push(directory)
    const store = createWorkspaceStore(directory)
    const workspace = fixture()
    workspace.qualityWorkflow.cases = []
    const initial = await store.save(workspace, null)
    if (initial.status !== 'saved') throw new Error('Fixture save failed')
    const stale = structuredClone(workspace)
    surplus(workspace, 1)
    expect((await store.save(workspace, initial.revision)).status).toBe('saved')
    surplus(stale, 2)
    expect((await store.save(stale, initial.revision)).status).toBe('conflict')
    const reloaded = await createWorkspaceStore(directory).load()
    expect(reloaded.workspace!.qualityWorkflow!.customerReturns).toEqual(
      JSON.parse(JSON.stringify(workspace.qualityWorkflow.customerReturns)),
    )
  })
})
