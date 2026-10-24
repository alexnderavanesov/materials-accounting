import { describe, expect, it } from 'vitest'
import {
  acceptFixture,
  inspectionFixture,
  materialInspectionFixture,
} from './quality-workflow.fixtures'
import {
  activeInspection,
  createAcceptedInspectionAct,
  currentInspection,
  inspectionApprovals,
  inspectionAvailableQuantities,
  inspectionMatches,
  localToday,
  newInspection,
  reopenInspection,
  signInspection,
  validateQualityWorkspace,
} from './quality-workflow'
import { buildQualityPrintData } from './quality-print-data'
import { workspaceSnapshotSchema } from './workspace-snapshot'

const receipts = (workspace: ReturnType<typeof inspectionFixture>) =>
  workspace.materialReceipts as unknown as Parameters<typeof newInspection>[2]
const lines = (workspace: ReturnType<typeof inspectionFixture>) =>
  workspace.lines as unknown as Parameters<typeof newInspection>[3]
function sign(
  entry: Parameters<typeof createAcceptedInspectionAct>[0],
  accepted: number,
  number = 'АВК-1',
) {
  let rev = currentInspection(entry)
  Object.assign(rev.zni.rows[0]!, {
    accepted,
    result:
      accepted === rev.zni.rows[0]!.presented
        ? 'accepted'
        : accepted
          ? 'remarks'
          : 'rejected',
    remarks: 'Проверено',
  })
  entry.revisions[entry.revisions.length - 1] = signInspection(
    rev,
    'zni',
    localToday(),
  )
  rev = currentInspection(entry)
  if (!accepted) return
  rev.avk = createAcceptedInspectionAct(entry, rev.zni.documents)
  Object.assign(rev.avk, { number, conclusion: 'Проверено' })
  rev.avk.checks.fill('Проверено')
  entry.revisions[entry.revisions.length - 1] = signInspection(
    rev,
    'avk',
    localToday(),
  )
}
function another(
  workspace: ReturnType<typeof inspectionFixture>,
  quantity: number,
) {
  return newInspection(
    workspace.qualityWorkflow,
    [{ receiptId: 'receipt', quantity }],
    receipts(workspace),
    lines(workspace),
    'app',
  )
}

describe('document → ZNI → AVK accounting', () => {
  it('requires a receipt document and rejects obsolete process payloads', () => {
    const workspace = inspectionFixture()
    expect(workspaceSnapshotSchema.parse(workspace)).toEqual(workspace)
    expect(() =>
      newInspection(
        workspace.qualityWorkflow,
        [{ receiptId: 'receipt', quantity: 1 }],
        receipts(workspace),
        lines(workspace),
        '',
      ),
    ).toThrow('Документ получения')
    for (const workflow of [
      { ...workspace.qualityWorkflow, apps: [] },
      {
        ...workspace.qualityWorkflow,
        cases: workspace.qualityWorkflow.cases.map(
          ({ basis: _basis, ...entry }) => entry,
        ),
      },
    ])
      expect(
        workspaceSnapshotSchema.safeParse({
          ...workspace,
          qualityWorkflow: workflow,
        }).success,
      ).toBe(false)
    expect(
      workspaceSnapshotSchema.safeParse({
        ...workspace,
        qualityControls: [{ id: 'old' }],
      }).success,
    ).toBe(false)
  })
  it.each([0, 8, 10])(
    'accepts %s units; a full rejection never creates an AVK',
    (quantity) => {
      const workspace = acceptFixture(quantity)
      expect(() => validateQualityWorkspace(workspace)).not.toThrow()
      expect(
        inspectionApprovals(workspace.qualityWorkflow).reduce(
          (total, row) => total + row.quantity,
          0,
        ),
      ).toBe(quantity)
      if (!quantity)
        expect(() =>
          createAcceptedInspectionAct(workspace.qualityWorkflow.cases[0]!),
        ).toThrow('Нет принятого')
    },
  )
  it('keeps the effective signed AVK while reinspection is pending, then replaces it once', () => {
    const previous = acceptFixture(),
      next = structuredClone(previous)
    next.materialIssues.push({ id: 'issue', receiptId: 'receipt', quantity: 8 })
    next.qualityWorkflow.cases[0] = reopenInspection(
      next.qualityWorkflow.cases[0]!,
    )
    validateQualityWorkspace(next, previous)
    expect(inspectionApprovals(next.qualityWorkflow)[0]!.quantity).toBe(8)
    expect(currentInspection(next.qualityWorkflow.cases[0]).avk).toBeNull()
    sign(next.qualityWorkflow.cases[0], 10)
    validateQualityWorkspace(next, previous)
    expect(inspectionApprovals(next.qualityWorkflow)).toHaveLength(1)
    expect(inspectionApprovals(next.qualityWorkflow)[0]!.quantity).toBe(10)
    expect(activeInspection(next.qualityWorkflow.cases[0])?.revision).toBe(2)
  })
  it('rejects a replacement below already issued quantity', () => {
    const previous = acceptFixture(),
      next = structuredClone(previous)
    next.materialIssues.push({ id: 'issue', receiptId: 'receipt', quantity: 8 })
    next.qualityWorkflow.cases[0] = reopenInspection(
      next.qualityWorkflow.cases[0]!,
    )
    sign(next.qualityWorkflow.cases[0], 7)
    expect(() => validateQualityWorkspace(next, previous)).toThrow(
      'меньше уже выданного',
    )
    expect(inspectionApprovals(previous.qualityWorkflow)[0]!.quantity).toBe(8)
  })
  it('requires completed ZNI results and a signed ZNI before creating an AVK', () => {
    const entry = inspectionFixture().qualityWorkflow.cases[0]!
    expect(() => createAcceptedInspectionAct(entry)).toThrow(
      'Сначала подпишите ЗНИ',
    )
    expect(() =>
      signInspection(currentInspection(entry), 'zni', localToday()),
    ).toThrow('результаты всех позиций')
  })
  it('protects the source document, signed history and receipt from mutation or deletion', () => {
    const previous = acceptFixture()
    for (const change of [
      (next: typeof previous) => {
        next.qualityWorkflow.cases = []
      },
      (next: typeof previous) => {
        next.qualityWorkflow.receiptDocuments = []
      },
      (next: typeof previous) => {
        next.materialReceipts = []
      },
      (next: typeof previous) => {
        currentInspection(next.qualityWorkflow.cases[0]!).zni.remarks =
          'changed'
      },
      (next: typeof previous) => {
        currentInspection(next.qualityWorkflow.cases[0]!).avk!.conclusion =
          'changed'
      },
      (next: typeof previous) => {
        next.materialReceipts[0]!.factoryNumber = 'changed'
      },
    ]) {
      const next = structuredClone(previous)
      change(next)
      expect(() => validateQualityWorkspace(next, previous)).toThrow()
    }
  })
  it('reserves receipt quantities across cases and preserves the allocation during reinspection', () => {
    const workspace = materialInspectionFixture(4)
    workspace.qualityWorkflow.cases.push(another(workspace, 6))
    validateQualityWorkspace(workspace)
    expect(
      inspectionAvailableQuantities(
        workspace.qualityWorkflow,
        receipts(workspace),
      ).get('receipt'),
    ).toBe(0)
    expect(() => another(workspace, 1)).toThrow('доступный остаток')
    currentInspection(
      workspace.qualityWorkflow.cases[1]!,
    ).zni.rows[0]!.presented = 7
    expect(() => validateQualityWorkspace(workspace)).toThrow(
      'Суммарное количество',
    )
    currentInspection(
      workspace.qualityWorkflow.cases[1]!,
    ).zni.rows[0]!.presented = 6
    sign(workspace.qualityWorkflow.cases[0]!, 4)
    workspace.qualityWorkflow.cases[0] = reopenInspection(
      workspace.qualityWorkflow.cases[0]!,
    )
    validateQualityWorkspace(workspace)
    Object.assign(
      currentInspection(workspace.qualityWorkflow.cases[0]).zni.rows[0]!,
      { presented: 5, accepted: 5 },
    )
    expect(() => validateQualityWorkspace(workspace)).toThrow(
      'состав и предъявленное',
    )
  })
  it('sums partial signed acts while excluding unsigned drafts', () => {
    const workspace = materialInspectionFixture(4)
    workspace.qualityWorkflow.cases.push(another(workspace, 6))
    sign(workspace.qualityWorkflow.cases[0]!, 4, 'АВК-1')
    expect(
      inspectionApprovals(workspace.qualityWorkflow).reduce(
        (sum, row) => sum + row.quantity,
        0,
      ),
    ).toBe(4)
    sign(workspace.qualityWorkflow.cases[1]!, 2, 'АВК-2')
    workspace.materialIssues.push({
      id: 'issue',
      receiptId: 'receipt',
      quantity: 6,
    })
    validateQualityWorkspace(workspace)
    workspace.materialIssues[0]!.quantity = 6.01
    expect(() => validateQualityWorkspace(workspace)).toThrow(
      'меньше уже выданного',
    )
  })
  it('forbids issue without any signed act even if the receipt has no ZNI', () => {
    const workspace = inspectionFixture()
    workspace.qualityWorkflow.cases = []
    workspace.materialIssues.push({
      id: 'issue',
      receiptId: 'receipt',
      quantity: 1,
    })
    expect(() => validateQualityWorkspace(workspace)).toThrow(
      'меньше уже выданного',
    )
  })
  it('prints presented ZNI and accepted AVK quantities using the current conversion', () => {
    const workspace = acceptFixture(),
      entry = workspace.qualityWorkflow.cases[0]!
    workspace.lines[0]!.alternativeUnitFactor = 3
    expect(
      buildQualityPrintData(workspace, entry.id, 1, 'zni').materials[0],
    ).toMatchObject({ quantity: 10, altQuantity: 30 })
    expect(
      buildQualityPrintData(workspace, entry.id, 1, 'avk').materials[0],
    ).toMatchObject({ quantity: 8, altQuantity: 24 })
    workspace.lines = []
    expect(
      buildQualityPrintData(workspace, entry.id, 1, 'avk').materials[0],
    ).toMatchObject({ quantity: 8, altQuantity: 20 })
    expect(inspectionMatches(entry, 'АПП-1')).toBe(true)
    expect(inspectionMatches(entry, 'Клапан')).toBe(true)
    expect(inspectionMatches(entry, 'нет такого')).toBe(false)
  })
})

it('preserves signed content through schema serialization with reordered object keys', () => {
  const previous = acceptFixture()
  const reverseKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reverseKeys)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .reverse()
          .map(([key, item]) => [key, reverseKeys(item)]),
      )
    return value
  }
  const next = reverseKeys(previous) as typeof previous
  expect(() => validateQualityWorkspace(next, previous)).not.toThrow()
  currentInspection(next.qualityWorkflow.cases[0]!).zni.remarks =
    'Подмена подписи'
  expect(() => validateQualityWorkspace(next, previous)).toThrow(
    'Подписанную ЗНИ',
  )
})
