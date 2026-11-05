import { describe, expect, it } from 'vitest'
import {
  acceptFixture,
  historicalReinspection,
  inspectionFixture,
} from './quality-workflow.fixtures'
import {
  canReopenInspection,
  currentInspection,
  deleteInspectionDocument,
  inspectionApprovals,
  inspectionAvailableQuantities,
  localToday,
  recordCustomerReturn,
  reopenInspection,
  validateQualityWorkspace,
} from './quality-workflow'
import { receiptBalances } from './receipt-balances'

function signedZni() {
  const workspace = acceptFixture()
  currentInspection(workspace.qualityWorkflow.cases[0]!).avk = null
  return workspace
}
function balances(workspace: ReturnType<typeof inspectionFixture>) {
  return receiptBalances(
    workspace.materialReceipts as unknown as Parameters<
      typeof receiptBalances
    >[0],
    workspace.qualityWorkflow,
    inspectionApprovals(workspace.qualityWorkflow),
    [],
  ).get('receipt')!
}

describe('repeat inspection before AVK', () => {
  it('allows a signed ZNI without AVK, preserves its history and receipt allocation', () => {
    const previous = signedZni()
    const next = structuredClone(previous)
    const old = next.qualityWorkflow.cases[0]!
    old.revisions[0]!.zni.signedOn = '2099-01-02'
    const reopened = reopenInspection(old)
    expect(currentInspection(reopened).zni.inspectionDate).toBe('2099-01-02')
    next.qualityWorkflow.cases[0] = reopenInspection(
      previous.qualityWorkflow.cases[0]!,
    )
    expect(() => validateQualityWorkspace(next, previous)).not.toThrow()
    expect(next.qualityWorkflow.cases[0].revisions[0]).toEqual(
      previous.qualityWorkflow.cases[0]!.revisions[0],
    )
    expect(
      currentInspection(next.qualityWorkflow.cases[0]).zni.signedOn,
    ).toBeNull()
    expect(
      inspectionAvailableQuantities(
        next.qualityWorkflow,
        next.materialReceipts as unknown as Parameters<
          typeof inspectionAvailableQuantities
        >[1],
      ).get('receipt'),
    ).toBe(0)
    expect(inspectionApprovals(next.qualityWorkflow)).toEqual([])
    expect(() => reopenInspection(next.qualityWorkflow.cases[0]!)).toThrow(
      /в работе/,
    )
  })

  it.each(['draft', 'signed'] as const)(
    'rejects repeat inspection with %s AVK on client and server',
    (status) => {
      const previous = acceptFixture()
      const entry = previous.qualityWorkflow.cases[0]!
      if (status === 'draft') currentInspection(entry).avk!.signedOn = null
      expect(canReopenInspection(entry)).toBe(false)
      expect(() => reopenInspection(entry)).toThrow(/до создания АВК/)
      const next = structuredClone(previous)
      next.qualityWorkflow.cases[0] = historicalReinspection(
        next.qualityWorkflow.cases[0]!,
      )
      expect(() => validateQualityWorkspace(next, previous)).toThrow(
        /до создания АВК/,
      )
      next.qualityWorkflow.cases[0].revisions[0]!.avk = null
      expect(() => validateQualityWorkspace(next, previous)).toThrow(
        /до создания АВК/,
      )
    },
  )

  it('preserves saved history but cannot append another revision after its AVK', () => {
    const previous = acceptFixture()
    previous.qualityWorkflow.cases[0] = historicalReinspection(
      previous.qualityWorkflow.cases[0]!,
    )
    expect(() => validateQualityWorkspace(previous, previous)).not.toThrow()
    const next = structuredClone(previous)
    currentInspection(next.qualityWorkflow.cases[0]!).zni.signedOn =
      localToday()
    next.qualityWorkflow.cases[0] = historicalReinspection(
      next.qualityWorkflow.cases[0]!,
    )
    expect(() => validateQualityWorkspace(next, previous)).toThrow(
      /до создания АВК/,
    )
  })

  it('still blocks reinspection after an actual rejected return even without AVK', () => {
    const previous = signedZni()
    const entry = previous.qualityWorkflow.cases[0]!
    previous.qualityWorkflow = recordCustomerReturn(
      previous.qualityWorkflow,
      entry.id,
      [{ receiptId: 'receipt', quantity: 1 }],
      localToday(),
    )
    const next = structuredClone(previous)
    next.qualityWorkflow.cases[0] = reopenInspection(
      next.qualityWorkflow.cases[0]!,
    )
    expect(() => validateQualityWorkspace(next, previous)).toThrow(
      /После фактического возврата/,
    )
  })
})

describe('deleting inspection documents', () => {
  it.each(['draft', 'signed'] as const)(
    'deletes %s AVK while keeping signed ZNI and moving material to awaiting AVK',
    (status) => {
      const previous = acceptFixture()
      const entry = previous.qualityWorkflow.cases[0]!
      if (status === 'draft') currentInspection(entry).avk!.signedOn = null
      const next = {
        ...previous,
        qualityWorkflow: deleteInspectionDocument(
          previous.qualityWorkflow,
          entry.id,
          'avk',
        ),
      }
      expect(() => validateQualityWorkspace(next, previous)).not.toThrow()
      expect(currentInspection(next.qualityWorkflow.cases[0]!).zni).toEqual(
        currentInspection(entry).zni,
      )
      expect(currentInspection(entry).avk).not.toBeNull()
      expect(balances(next)).toMatchObject({
        received: 10,
        stock: 10,
        awaitingAct: 8,
        availableToIssue: 0,
        toReturn: 2,
      })
      expect(canReopenInspection(next.qualityWorkflow.cases[0]!)).toBe(true)
      expect(() =>
        deleteInspectionDocument(next.qualityWorkflow, entry.id, 'avk'),
      ).toThrow(/АВК не найден/)
      const changed = structuredClone(next)
      currentInspection(changed.qualityWorkflow.cases[0]!).zni.remarks =
        'подмена'
      expect(() => validateQualityWorkspace(changed, previous)).toThrow(/ЗНИ/)
    },
  )

  it.each(['draft', 'signed'] as const)(
    'deletes %s ZNI without AVK and releases receipts for inspection',
    (status) => {
      const previous = status === 'signed' ? signedZni() : inspectionFixture()
      const entry = previous.qualityWorkflow.cases[0]!
      const next = {
        ...previous,
        qualityWorkflow: deleteInspectionDocument(
          previous.qualityWorkflow,
          entry.id,
          'zni',
        ),
      }
      expect(() => validateQualityWorkspace(next, previous)).not.toThrow()
      expect(next.qualityWorkflow.cases).toEqual([])
      expect(next.materialReceipts).toEqual(previous.materialReceipts)
      expect(next.qualityWorkflow.receiptDocuments).toEqual(
        previous.qualityWorkflow.receiptDocuments,
      )
      expect(balances(next)).toMatchObject({
        received: 10,
        stock: 10,
        awaitingInspection: 10,
        availableToIssue: 0,
      })
      expect(() =>
        deleteInspectionDocument(next.qualityWorkflow, entry.id, 'zni'),
      ).toThrow(/не найдена/)
    },
  )

  it('requires deleting AVK first and protects AVKs in saved revision history', () => {
    const previous = acceptFixture()
    const entry = previous.qualityWorkflow.cases[0]!
    expect(() =>
      deleteInspectionDocument(previous.qualityWorkflow, entry.id, 'zni'),
    ).toThrow(/Сначала удалите АВК/)
    expect(() =>
      validateQualityWorkspace(
        {
          ...previous,
          qualityWorkflow: { ...previous.qualityWorkflow, cases: [] },
        },
        previous,
      ),
    ).toThrow(/Сначала удалите АВК/)
    const historical = historicalReinspection(entry)
    currentInspection(historical).zni.signedOn = localToday()
    currentInspection(historical).avk = structuredClone(
      currentInspection(entry).avk,
    )
    const workflow = { ...previous.qualityWorkflow, cases: [historical] }
    expect(() => deleteInspectionDocument(workflow, entry.id, 'avk')).toThrow(
      /в истории/,
    )
  })

  it.each(['zni', 'avk'] as const)(
    'blocks deleting %s with returns, including removal of dependencies in the same save',
    (kind) => {
      const previous = kind === 'zni' ? signedZni() : acceptFixture()
      const entry = previous.qualityWorkflow.cases[0]!
      previous.qualityWorkflow = recordCustomerReturn(
        previous.qualityWorkflow,
        entry.id,
        [{ receiptId: 'receipt', quantity: 1 }],
        localToday(),
      )
      expect(() =>
        deleteInspectionDocument(previous.qualityWorkflow, entry.id, kind),
      ).toThrow(/возврат/)
      const next = structuredClone(previous)
      next.qualityWorkflow.customerReturns = []
      if (kind === 'zni') next.qualityWorkflow.cases = []
      else currentInspection(next.qualityWorkflow.cases[0]!).avk = null
      expect(() => validateQualityWorkspace(next, previous)).toThrow(/возврат/)
    },
  )

  it('blocks AVK deletion with issues, including simultaneous removal of issues', () => {
    const previous = acceptFixture()
    previous.materialIssues = [
      { id: 'issue', receiptId: 'receipt', quantity: 1, date: localToday() },
    ]
    const entry = previous.qualityWorkflow.cases[0]!
    expect(() =>
      deleteInspectionDocument(
        previous.qualityWorkflow,
        entry.id,
        'avk',
        previous.materialIssues,
      ),
    ).toThrow(/выдачи/)
    const next = structuredClone(previous)
    next.materialIssues = []
    currentInspection(next.qualityWorkflow.cases[0]!).avk = null
    expect(() => validateQualityWorkspace(next, previous)).toThrow(/выдачи/)
  })
})
