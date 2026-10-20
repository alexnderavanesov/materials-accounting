import { describe, expect, it } from 'vitest'
import {
  activeInspection,
  currentInspection,
  inspectionApprovals,
  localToday,
  findInspectionMaterial,
  newInspectionAct,
  reopenInspection,
  signInspection,
  validateQualityWorkspace,
} from './quality-workflow'
import { acceptFixture, inspectionFixture } from './quality-workflow.fixtures'
import { buildQualityPrintData } from './quality-print-data'

describe('APP → ZNI → AVK accounting', () => {
  it('matches old material identities and preserves whole legacy alternatives without guessing a partial factor', () => {
    const workspace = acceptFixture(10)
    expect(
      findInspectionMaterial(
        [
          {
            cipher: 'ТКМ5',
            projectMaterialName: 'Клапан',
            category: 'Арматура',
            material: 'Сталь',
            unit: 'шт',
          },
        ],
        'клапан|арматура|||шт|сталь|||',
      )?.cipher,
    ).toBe('ТКМ5')
    workspace.lines = []
    workspace.materialReceipts[0]!.altUnitFactor = null
    const revision = currentInspection(workspace.qualityWorkflow.cases[0]!)
    revision.zni.rows[0]!.altUnitFactor = null
    const print = () =>
      buildQualityPrintData(
        workspace,
        workspace.qualityWorkflow.cases[0]!.id,
        1,
        'avk',
      )
    expect(print().materials[0]).toMatchObject({
      altQuantity: 25,
      altAccepted: 25,
    })
    revision.zni.rows[0]!.accepted = 8
    expect(print).toThrow('настройте альтернативную единицу')
    revision.zni.rows[0]!.accepted = null
    expect(print().materials[0]!.altAccepted).toBeNull()
  })
  it('keeps old signed acceptance while reopened and replaces it once, even after issue', () => {
    const previous = acceptFixture(),
      next = structuredClone(previous)
    next.materialIssues.push({ id: 'issue', receiptId: 'receipt', quantity: 8 })
    next.qualityWorkflow.cases[0] = reopenInspection(
      next.qualityWorkflow.cases[0]!,
    )
    validateQualityWorkspace(next, previous)
    expect(inspectionApprovals(next.qualityWorkflow)[0]!.quantity).toBe(8)
    const rev = currentInspection(next.qualityWorkflow.cases[0])
    rev.zni.rows[0]!.accepted = 10
    rev.zni.rows[0]!.result = 'accepted'
    next.qualityWorkflow.cases[0].revisions[1] = signInspection(
      signInspection(rev, 'zni', localToday()),
      'avk',
      localToday(),
    )
    validateQualityWorkspace(next, previous)
    expect(inspectionApprovals(next.qualityWorkflow)).toHaveLength(1)
    expect(inspectionApprovals(next.qualityWorkflow)[0]!.quantity).toBe(10)
    expect(activeInspection(next.qualityWorkflow.cases[0])?.revision).toBe(2)
  })
  it('rejects a signed replacement below issued quantity and preserves the old history', () => {
    const previous = acceptFixture(),
      next = structuredClone(previous)
    next.materialIssues.push({ id: 'issue', receiptId: 'receipt', quantity: 8 })
    next.qualityWorkflow.cases[0] = reopenInspection(
      next.qualityWorkflow.cases[0]!,
    )
    const rev = currentInspection(next.qualityWorkflow.cases[0])
    rev.zni.rows[0]!.accepted = 7
    next.qualityWorkflow.cases[0].revisions[1] = signInspection(
      signInspection(rev, 'zni', localToday()),
      'avk',
      localToday(),
    )
    expect(() => validateQualityWorkspace(next, previous)).toThrow(
      'меньше уже выданного',
    )
    expect(inspectionApprovals(previous.qualityWorkflow)[0]!.quantity).toBe(8)
  })
  it('requires all results, forbids AVK signing before ZNI and does not admit drafts', () => {
    const workspace = inspectionFixture(),
      rev = currentInspection(workspace.qualityWorkflow.cases[0]!)
    rev.avk = newInspectionAct(workspace.qualityWorkflow.apps[0]!)
    expect(() => signInspection(rev, 'avk', localToday())).toThrow(
      'Сначала подпишите ЗНИ',
    )
    expect(() => signInspection(rev, 'zni', localToday())).toThrow(
      'результаты всех позиций',
    )
    expect(inspectionApprovals(workspace.qualityWorkflow)).toEqual([])
  })
  it.each([0, 8, 10])(
    'supports rejected, partial and complete acceptance: %s',
    (quantity) => {
      const workspace = acceptFixture(quantity)
      expect(() => validateQualityWorkspace(workspace)).not.toThrow()
      expect(inspectionApprovals(workspace.qualityWorkflow)[0]!.quantity).toBe(
        quantity,
      )
    },
  )
  it('protects signed documents, APP, receipts and history from mutation/deletion', () => {
    const previous = acceptFixture()
    for (const mutate of [
      (next: typeof previous) => {
        next.qualityWorkflow.cases = []
      },
      (next: typeof previous) => {
        next.qualityWorkflow.apps = []
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
        next.qualityWorkflow.apps[0]!.number = 'changed'
      },
      (next: typeof previous) => {
        next.materialReceipts[0]!.factoryNumber = 'changed'
      },
    ]) {
      const next = structuredClone(previous)
      mutate(next)
      expect(() => validateQualityWorkspace(next, previous)).toThrow()
    }
  })
  it('covers the entire APP, rejects legacy overlap and does not group APPs by number', () => {
    const workspace = inspectionFixture()
    workspace.qualityWorkflow.apps.push({
      ...workspace.qualityWorkflow.apps[0]!,
      id: 'other',
      receiptIds: ['another'],
    })
    workspace.materialReceipts.push({
      ...workspace.materialReceipts[0]!,
      id: 'another',
    })
    expect(() => validateQualityWorkspace(workspace)).not.toThrow()
    workspace.qualityControls.push({
      id: 'legacy',
      receiptId: 'receipt',
      quantity: 1,
    })
    expect(() => validateQualityWorkspace(workspace)).toThrow(
      'прежнем входном контроле',
    )
  })
  it('prints whole saved revision with partial results and current alternatives, falling back for removed material', () => {
    const workspace = acceptFixture(),
      original = JSON.stringify(workspace)
    const data = buildQualityPrintData(
      workspace,
      workspace.qualityWorkflow.cases[0]!.id,
      1,
      'avk',
    )
    expect(data.materials[0]).toMatchObject({
      quantity: 10,
      accepted: 8,
      altQuantity: 25,
      altAccepted: 20,
    })
    expect(data.fields.conclusion).toContain('не принято 2 шт')
    expect(JSON.stringify(workspace)).toBe(original)
    workspace.lines[0]!.alternativeUnitFactor = 3
    expect(
      buildQualityPrintData(
        workspace,
        workspace.qualityWorkflow.cases[0]!.id,
        1,
        'zni',
      ).materials[0]!.altAccepted,
    ).toBe(24)
    workspace.lines = []
    expect(
      buildQualityPrintData(
        workspace,
        workspace.qualityWorkflow.cases[0]!.id,
        1,
        'avk',
      ).materials[0]!.altAccepted,
    ).toBe(20)
  })
})
