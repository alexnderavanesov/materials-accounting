import { describe, expect, it } from 'vitest'
import {
  indexM15Links,
  prepareReceiptM15,
  validateLinkedM15Workspace,
} from './m15-linked'
import { validateM15Workspace } from './m15-reconciliation'
import type { M15Reconciliation, M15Workspace } from './m15-reconciliation'
import { emptyQualityWorkflow, newInspection } from './quality-workflow'
import { documentsForReceipt } from './receipt-documents'
import { entityGroups } from './workspace-protocol'

function fixture() {
  const workspace: M15Workspace = {
    lines: [
      { id: 'line', cipher: 'ТК1', unit: 'шт', projectMaterialName: 'Клапан' },
    ],
    materialRequests: [
      { id: 'request', projectLineId: 'line', cipher: 'ТК1', quantity: 20 },
    ],
    materialReceipts: [
      {
        id: 'receipt',
        requestId: 'request',
        projectLineId: 'line',
        actualName: 'Клапан',
        quantity: 12,
        projectUnit: 'шт',
        appDocumentId: 'app',
      },
    ],
    qualityWorkflow: {
      ...emptyQualityWorkflow(),
      receiptDocuments: [
        { id: 'app', kind: 'app', number: '1', date: '2026-11-18' },
        { id: 'm1', kind: 'm15', number: '1', date: '2026-11-18' },
        { id: 'm2', kind: 'm15', number: '2', date: '2026-11-18' },
      ],
    },
    m15Reconciliations: [],
  }
  const doc = (id: string, quantity: number): M15Reconciliation => ({
    id,
    mode: 'linked',
    cipher: 'ТК1',
    lines: [
      {
        id: 'l',
        projectLineId: 'line',
        name: 'Клапан',
        unit: 'шт',
        position: '',
        quantity,
      },
    ],
    allocations: [
      {
        lineId: 'l',
        receiptId: 'receipt',
        quantity,
        documentQuantity: quantity,
        receiptQuantity: 12,
        receiptUnit: 'шт',
      },
    ],
  })
  return { workspace, doc }
}
describe('количественные связи М-15', () => {
  it('подтверждает получение 12 двумя М-15 на 10 и 2, не дублируя количество', () => {
    const { workspace, doc } = fixture()
    workspace.m15Reconciliations = [doc('m1', 10)]
    expect(() => validateLinkedM15Workspace(workspace)).not.toThrow()
    expect(
      indexM15Links(workspace.m15Reconciliations).byReceiptTotal.get('receipt'),
    ).toBe(10)
    workspace.m15Reconciliations.push(doc('m2', 2))
    expect(() => validateLinkedM15Workspace(workspace)).not.toThrow()
    expect(
      indexM15Links(workspace.m15Reconciliations).byReceiptTotal.get('receipt'),
    ).toBe(12)
    expect(
      documentsForReceipt(
        { id: 'receipt', appDocumentId: 'app' },
        {
          ...workspace.qualityWorkflow!,
          m15Reconciliations: workspace.m15Reconciliations,
        },
      ).map((row) => row.id),
    ).toEqual(['app'])
  })
  it('блокирует переполнение одной М-15, повторное покрытие и другой шифр', () => {
    const { workspace, doc } = fixture()
    const a = doc('m1', 10)
    workspace.m15Reconciliations = [a]
    a.allocations[0]!.quantity = 12
    a.allocations[0]!.documentQuantity = 12
    expect(() => validateLinkedM15Workspace(workspace)).toThrow(
      'больше, чем указано',
    )
    workspace.m15Reconciliations = [doc('m1', 10), doc('m2', 3)]
    expect(() => validateLinkedM15Workspace(workspace)).toThrow('другой М-15')
    workspace.m15Reconciliations = [doc('m1', 10)]
    workspace.m15Reconciliations[0]!.cipher = 'ТК2'
    expect(() => validateLinkedM15Workspace(workspace)).toThrow('шифру')
  })
  it('проверяет документальное покрытие и при изменении получения', () => {
    const { workspace, doc } = fixture()
    workspace.m15Reconciliations = [doc('m1', 10)]
    const previous = structuredClone(workspace)
    delete workspace.materialReceipts[0]!.appDocumentId
    expect(() => validateM15Workspace(workspace, previous)).toThrow('Без АПП')
    workspace.m15Reconciliations.push(doc('m2', 2))
    expect(() => validateM15Workspace(workspace, previous)).not.toThrow()
    workspace.materialReceipts[0]!.quantity = 11
    expect(() => validateM15Workspace(workspace, previous)).toThrow(
      'другой М-15',
    )
  })
  it('запрещает удаление получения и не освобождает документ после возврата', () => {
    const { workspace, doc } = fixture()
    workspace.m15Reconciliations = [doc('m1', 10)]
    const previous = structuredClone(workspace)
    workspace.materialReceipts = []
    expect(() => validateM15Workspace(workspace, previous)).toThrow('удалены')
    expect(
      indexM15Links(previous.m15Reconciliations).byReceiptTotal.get('receipt'),
    ).toBe(10)
  })
  it('требует известный пересчёт и согласованное количество в обеих единицах', () => {
    const { workspace, doc } = fixture()
    const record = doc('m1', 10)
    workspace.m15Reconciliations = [record]
    record.lines[0]!.unit = 'кг'
    record.lines[0]!.quantity = 20
    expect(() => validateLinkedM15Workspace(workspace)).toThrow('пересчёт')
    record.allocations[0]!.conversion = {
      fromUnit: 'шт',
      toUnit: 'кг',
      factor: 2,
    }
    record.allocations[0]!.documentQuantity = 20
    expect(() => validateLinkedM15Workspace(workspace)).not.toThrow()
  })
  it('подготавливает только допустимое количество выбранной М-15', () => {
    const { workspace, doc } = fixture()
    const record = doc('m1', 10)
    record.allocations = []
    const result = prepareReceiptM15(
      [
        {
          id: 'receipt',
          quantity: 12,
          projectLineId: 'line',
          requestId: 'request',
          projectUnit: 'шт',
          actualName: 'Клапан',
          m15DocumentId: 'm1',
        },
      ],
      workspace,
      [record],
    )
    expect(result.records[0]!.allocations[0]!.quantity).toBe(10)
    expect(result.entries[0]).not.toHaveProperty('m15DocumentId')
    expect(
      entityGroups({
        collection: 'm15Reconciliations',
        value: result.records[0]!,
      }),
    ).toContain('stock:receipt')
  })
  it('ограничивает ЗНИ подтверждённой частью получения', () => {
    const { workspace, doc } = fixture()
    const workflow = {
      ...workspace.qualityWorkflow!,
      m15Reconciliations: [doc('m1', 10)],
    }
    const receipt = {
      id: 'receipt',
      requestId: 'request',
      projectLineId: 'line',
      quantity: 12,
      projectUnit: 'шт',
      actualName: 'Клапан',
      factoryNumber: '',
      heatBatch: '',
      altUnit: '',
      appDocumentId: 'app',
    }
    expect(() =>
      newInspection(
        workflow,
        [{ receiptId: 'receipt', quantity: 11 }],
        [receipt],
        [],
        'm1',
      ),
    ).toThrow('только по АПП')
    expect(
      newInspection(
        workflow,
        [{ receiptId: 'receipt', quantity: 10 }],
        [receipt],
        [],
        'app',
      ).revisions[0]!.zni.rows[0]!.presented,
    ).toBe(10)
  })
})

it('does not remove the last quantitative basis from a receipt without APP', () => {
  const { workspace, doc } = fixture()
  delete workspace.materialReceipts[0]!.appDocumentId
  workspace.m15Reconciliations = [doc('m1', 12)]
  const previous = structuredClone(workspace)
  workspace.m15Reconciliations[0]!.allocations = []
  expect(() => validateM15Workspace(workspace, previous)).toThrow('Без АПП')
})
it('protects quantities already presented for inspection through this M15', () => {
  const { workspace, doc } = fixture()
  workspace.m15Reconciliations = [doc('m1', 10)]
  const workflow = {
    ...workspace.qualityWorkflow!,
    m15Reconciliations: workspace.m15Reconciliations,
  }
  const receipt = {
    id: 'receipt',
    requestId: 'request',
    projectLineId: 'line',
    quantity: 12,
    projectUnit: 'шт',
    actualName: 'Клапан',
    factoryNumber: '',
    heatBatch: '',
    altUnit: '',
    appDocumentId: 'app',
  }
  workflow.cases.push(
    newInspection(
      workflow,
      [{ receiptId: 'receipt', quantity: 10 }],
      [receipt],
      [],
      'app',
    ),
  )
  workflow.cases[0]!.basis = {
    ...workflow.cases[0]!.basis,
    kind: 'm15',
    id: 'm1',
  }
  workspace.qualityWorkflow = workflow
  const previous = structuredClone(workspace)
  Object.assign(workspace.m15Reconciliations[0]!.allocations[0]!, {
    quantity: 9,
    documentQuantity: 9,
  })
  expect(() => validateM15Workspace(workspace, previous)).toThrow(
    'используется в ЗНИ',
  )
})

it('keeps historical inspection bases editable without inventing retroactive coverage', () => {
  const { workspace, doc } = fixture()
  const workflow = {
    ...workspace.qualityWorkflow!,
    m15Reconciliations: [doc('m1', 10)],
  }
  const entry = newInspection(
    workflow,
    [{ receiptId: 'receipt', quantity: 10 }],
    [
      {
        id: 'receipt',
        requestId: 'request',
        projectLineId: 'line',
        quantity: 12,
        projectUnit: 'шт',
        actualName: 'Клапан',
        factoryNumber: '',
        heatBatch: '',
        altUnit: '',
        appDocumentId: 'app',
      },
    ],
    [],
    'app',
  )
  entry.basis = { ...entry.basis, kind: 'm15', id: 'm1' }
  entry.revisions[0]!.zni.signedOn = '2026-11-18'
  workspace.qualityWorkflow!.cases = [entry]
  workspace.materialReceipts[0]!.m15DocumentId = 'm1'
  // The signed legacy basis has no quantitative links; composition is added later.
  workspace.m15Reconciliations = [{ ...doc('m1', 10), allocations: [] }]
  const previous = structuredClone(workspace)
  workspace.m15Reconciliations[0]!.lines[0]!.name = 'Клапан по накладной'
  expect(() => validateM15Workspace(workspace, previous)).not.toThrow()
  expect(workspace.qualityWorkflow).toEqual(previous.qualityWorkflow)
  expect(indexM15Links(workspace.m15Reconciliations).byReceiptTotal.size).toBe(
    0,
  )
  // An explicit partial confirmation is still reserved once it exists.
  previous.m15Reconciliations = [doc('m1', 4)]
  workspace.m15Reconciliations = [doc('m1', 3)]
  expect(() => validateM15Workspace(workspace, previous)).toThrow(
    'используется в ЗНИ',
  )
})

it('validates and indexes 50,000 explicit receipt links without quadratic scans', () => {
  const { workspace, doc } = fixture()
  const seedReceipt = workspace.materialReceipts[0]!,
    seedRequest = workspace.materialRequests[0]!,
    seedLine = workspace.lines![0]!
  workspace.materialReceipts = []
  workspace.materialRequests = []
  workspace.lines = []
  workspace.m15Reconciliations = []
  workspace.qualityWorkflow!.receiptDocuments = []
  for (let i = 0; i < 50000; i++) {
    const lineId = `line-${i}`,
      receiptId = `receipt-${i}`,
      requestId = `request-${i}`,
      documentId = `m-${i}`
    workspace.materialReceipts.push({
      ...seedReceipt,
      id: receiptId,
      projectLineId: lineId,
      requestId,
    })
    workspace.materialRequests.push({
      ...seedRequest,
      id: requestId,
      projectLineId: lineId,
    })
    workspace.lines.push({ ...seedLine, id: lineId })
    const record = doc(documentId, 10)
    record.lines[0]!.projectLineId = lineId
    record.allocations[0]!.receiptId = receiptId
    workspace.m15Reconciliations.push(record)
    workspace.qualityWorkflow!.receiptDocuments.push({
      id: documentId,
      kind: 'm15',
      number: String(i),
      date: '2026-11-18',
    })
  }
  const started = performance.now()
  validateM15Workspace(workspace)
  const index = indexM15Links(workspace.m15Reconciliations)
  expect(index.byReceiptTotal.size).toBe(50000)
  expect(index.byReceiptTotal.get('receipt-49999')).toBe(10)
  expect(performance.now() - started).toBeLessThan(6000)
}, 15000)
