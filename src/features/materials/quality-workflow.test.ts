import { describe, expect, it } from 'vitest'
import {
  activeInspection,
  currentInspection,
  inspectionApprovals,
  localToday,
  findInspectionMaterial,
  inspectionAvailableQuantities,
  inspectionDocuments,
  newInspection,
  newInspectionAct,
  reopenInspection,
  signInspection,
  validateQualityWorkspace,
} from './quality-workflow'
import {
  acceptFixture,
  inspectionFixture,
  materialInspectionFixture,
} from './quality-workflow.fixtures'
import { buildQualityPrintData } from './quality-print-data'
import { workspaceSnapshotSchema } from './workspace-snapshot'

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
    rev.avk = newInspectionAct(workspace.qualityWorkflow.apps[0]!.documents)
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

describe('material-based ZNI with optional APP', () => {
  function another(
    workspace: ReturnType<typeof materialInspectionFixture>,
    amount: number,
  ) {
    return newInspection(
      workspace.qualityWorkflow,
      [{ receiptId: 'receipt', quantity: amount }],
      workspace.materialReceipts as unknown as Parameters<
        typeof newInspection
      >[2],
      workspace.lines as unknown as Parameters<typeof newInspection>[3],
    )
  }
  function sign(
    entry: ReturnType<typeof newInspection>,
    accepted: number,
    actNumber: string,
  ) {
    const rev = currentInspection(entry)
    const row = rev.zni.rows[0]!
    row.accepted = accepted
    row.result = accepted === row.presented ? 'accepted' : 'remarks'
    row.remarks =
      accepted < row.presented ? 'Часть партии требует повторной проверки' : ''
    rev.avk ??= newInspectionAct(rev.zni.documents)
    rev.avk.number = actNumber
    rev.avk.checks.fill('Проверено')
    rev.avk.conclusion = 'Принято'
    entry.revisions[entry.revisions.length - 1] = signInspection(
      signInspection(rev, 'zni', localToday()),
      'avk',
      localToday(),
    )
  }

  it('creates and prints ZNI/AVK without APP and preserves old snapshots without migration', () => {
    const old = inspectionFixture()
    expect(workspaceSnapshotSchema.parse(old)).toEqual(old)
    const workspace = materialInspectionFixture(4)
    const entry = workspace.qualityWorkflow.cases[0]!
    expect(entry.appId).toBeUndefined()
    expect(() => validateQualityWorkspace(workspace)).not.toThrow()
    expect(workspaceSnapshotSchema.parse(workspace)).toEqual(workspace)
    const zni = buildQualityPrintData(workspace, entry.id, 1, 'zni')
    expect(zni.fields.description).toContain('Клапан')
    expect(zni.fields.appNumber).toBe('')
    expect(zni.materials[0]).toMatchObject({
      quantity: 4,
      altQuantity: 10,
      appNumber: '',
      appDate: '',
    })
    sign(entry, 3, 'АВК-1')
    validateQualityWorkspace(workspace)
    expect(
      buildQualityPrintData(workspace, entry.id, 1, 'avk').materials[0],
    ).toMatchObject({ accepted: 3, altAccepted: 7.5 })
  })

  it('reserves presented quantities across cases, not revisions, and rejects overbooking on the server', () => {
    const workspace = materialInspectionFixture(4)
    workspace.qualityWorkflow.cases.push(another(workspace, 6))
    validateQualityWorkspace(workspace)
    expect(
      inspectionAvailableQuantities(workspace.qualityWorkflow, [
        { id: 'receipt', quantity: 10 },
      ]).get('receipt'),
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
    sign(workspace.qualityWorkflow.cases[0]!, 4, 'АВК-1')
    workspace.qualityWorkflow.cases[0] = reopenInspection(
      workspace.qualityWorkflow.cases[0]!,
    )
    validateQualityWorkspace(workspace)
    currentInspection(
      workspace.qualityWorkflow.cases[0],
    ).zni.rows[0]!.presented = 5
    currentInspection(
      workspace.qualityWorkflow.cases[0],
    ).zni.rows[0]!.accepted = 5
    expect(() => validateQualityWorkspace(workspace)).toThrow(
      'состав и предъявленное',
    )
  })

  it('sums signed AVKs for partial batches and protects issued amounts during reinspection', () => {
    const previous = materialInspectionFixture(4)
    previous.qualityWorkflow.cases.push(another(previous, 6))
    sign(previous.qualityWorkflow.cases[0]!, 4, 'АВК-1')
    sign(previous.qualityWorkflow.cases[1]!, 2, 'АВК-2')
    previous.materialIssues.push({
      id: 'issue',
      receiptId: 'receipt',
      quantity: 6,
    })
    validateQualityWorkspace(previous)
    expect(
      inspectionApprovals(previous.qualityWorkflow).reduce(
        (sum, row) => sum + row.quantity,
        0,
      ),
    ).toBe(6)
    const next = structuredClone(previous)
    next.qualityWorkflow.cases[0] = reopenInspection(
      next.qualityWorkflow.cases[0]!,
    )
    validateQualityWorkspace(next, previous)
    sign(next.qualityWorkflow.cases[0], 3, 'АВК-1')
    expect(() => validateQualityWorkspace(next, previous)).toThrow(
      'меньше уже выданного',
    )
  })

  it('protects receipts used by a direct ZNI and disallows mixing with legacy inspection', () => {
    const previous = materialInspectionFixture()
    for (const mutate of [
      (next: typeof previous) => {
        next.materialReceipts = []
      },
      (next: typeof previous) => {
        next.materialReceipts[0]!.quantity = 9
      },
      (next: typeof previous) => {
        next.materialReceipts[0]!.factoryNumber = 'other'
      },
      (next: typeof previous) => {
        next.qualityControls.push({
          id: 'legacy',
          receiptId: 'receipt',
          quantity: 1,
        })
      },
    ]) {
      const next = structuredClone(previous)
      mutate(next)
      expect(() => validateQualityWorkspace(next, previous)).toThrow()
    }
    const cancelled = structuredClone(previous)
    cancelled.qualityWorkflow.cases = []
    validateQualityWorkspace(cancelled, previous)
    expect(
      inspectionAvailableQuantities(cancelled.qualityWorkflow, [
        { id: 'receipt', quantity: 10 },
      ]).get('receipt'),
    ).toBe(10)
  })

  it('accepts materials from different APPs, snapshots their references and copies quality documents', () => {
    const workspace = inspectionFixture()
    workspace.qualityWorkflow.cases = []
    workspace.materialReceipts.push({
      ...workspace.materialReceipts[0]!,
      id: 'second',
      actualName: 'Другой материал',
      certificate: 'Паспорт-2',
    })
    workspace.qualityWorkflow.apps.push({
      id: 'app-2',
      number: 'АПП-2',
      date: localToday(),
      receiptIds: ['second'],
      documents: [],
    })
    const entry = newInspection(
      workspace.qualityWorkflow,
      [
        { receiptId: 'receipt', quantity: 2 },
        { receiptId: 'second', quantity: 3 },
      ],
      workspace.materialReceipts as unknown as Parameters<
        typeof newInspection
      >[2],
      workspace.lines as unknown as Parameters<typeof newInspection>[3],
    )
    workspace.qualityWorkflow.cases.push(entry)
    validateQualityWorkspace(workspace)
    expect(inspectionDocuments(workspace.qualityWorkflow, entry)).toHaveLength(
      2,
    )
    const before = structuredClone(workspace)
    workspace.qualityWorkflow.apps = []
    validateQualityWorkspace(workspace, before)
    const print = buildQualityPrintData(workspace, entry.id, 1, 'zni')
    expect(print.materials.map((row) => row.appNumber)).toEqual([
      'АПП-1',
      'АПП-2',
    ])
    expect(print.documents.map((doc) => doc.name)).toEqual([
      'Паспорт',
      'Паспорт-2',
    ])
  })

  it('does not treat the full legacy alternative quantity as a partial batch quantity', () => {
    const workspace = materialInspectionFixture(4)
    workspace.lines = []
    workspace.materialReceipts[0]!.altUnitFactor = null
    const entry = workspace.qualityWorkflow.cases[0]!
    currentInspection(entry).zni.rows[0]!.altUnitFactor = null
    expect(() => buildQualityPrintData(workspace, entry.id, 1, 'zni')).toThrow(
      'настройте альтернативную единицу',
    )
  })
})
