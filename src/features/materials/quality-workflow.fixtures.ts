import {
  currentInspection,
  emptyQualityWorkflow,
  localToday,
  newInspection,
  qualityWithM15,
  createAcceptedInspectionAct,
  signInspection,
} from './quality-workflow'
import { workspaceSnapshotSchema } from './workspace-snapshot'
import type { InspectionCase } from './quality-workflow'

// Saved histories from before reinspection was restricted to cases without AVK.
// Only fixtures may construct these; new revisions must use reopenInspection.
export function historicalReinspection(entry: InspectionCase): InspectionCase {
  const next = structuredClone(currentInspection(entry))
  next.revision++
  next.zni.signedOn = null
  next.avk = null
  return { ...entry, revisions: [...entry.revisions, next] }
}

export function inspectionFixture() {
  const receipt = {
    id: 'receipt',
    projectLineId: 'line',
    requestId: 'request',
    quantity: 10,
    projectUnit: 'шт',
    actualName: 'Клапан',
    factoryNumber: '123',
    heatBatch: 'Партия 1',
    altUnit: 'кг',
    altQuantity: 25,
    altUnitFactor: 2.5,
    date: localToday(),
    appDocumentId: 'app',
    certificate: 'Паспорт',
  }
  const line = {
    id: 'line',
    project: 'Объект',
    category: 'Арматура',
    cipher: 'ТКМ5',
    projectMaterialName: 'Клапан',
    normativeDocument: 'ГОСТ',
    material: 'Сталь',
    unit: 'шт',
    alternativeUnit: 'кг',
    alternativeUnitFactor: 2.5,
    plannedQuantity: 10,
    requested: 10,
    received: 10,
    qcPending: 10,
    accepted: 0,
    issued: 0,
    returned: 0,
    writtenOff: 0,
  }
  const workflow = emptyQualityWorkflow()
  workflow.receiptDocuments = [
    { id: 'app', kind: 'app', number: 'АПП-1', date: localToday() },
  ]
  workflow.cases.push(
    newInspection(
      workflow,
      [{ receiptId: receipt.id, quantity: receipt.quantity }],
      [receipt],
      [line],
      'app',
    ),
  )
  const workspace = workspaceSnapshotSchema.parse({
    configuredAlloys: [],
    configuredCiphers: [],
    configuredDocuments: [],
    configuredUnits: [],
    lines: [line],
    materialTypeSettings: [],
    materialIssues: [],
    materialReceipts: [receipt],
    materialRequests: [],
    qualityControls: [],
    qualityWorkflow: workflow,
  })
  return workspace as typeof workspace & { qualityWorkflow: typeof workflow }
}
export function acceptFixture(quantity = 8) {
  const workspace = inspectionFixture(),
    entry = workspace.qualityWorkflow.cases[0]!,
    revision = currentInspection(entry)
  revision.zni.rows[0]!.accepted = quantity
  revision.zni.rows[0]!.result =
    quantity === 10 ? 'accepted' : quantity === 0 ? 'rejected' : 'remarks'
  revision.zni.rows[0]!.remarks =
    quantity < 10 ? 'Замечания к части партии' : ''
  entry.revisions[0] = signInspection(revision, 'zni', localToday())
  if (!quantity) return workspace
  const signed = currentInspection(entry)
  signed.avk = createAcceptedInspectionAct(entry, signed.zni.documents)
  signed.avk.number = 'АВК-1'
  signed.avk.checks.fill('Проверено')
  signed.avk.conclusion = 'Принято по результатам проверки'
  entry.revisions[0] = signInspection(signed, 'avk', localToday())
  return workspace
}

export function materialInspectionFixture(presented = 10) {
  const workspace = inspectionFixture()
  workspace.qualityWorkflow.cases = []
  workspace.qualityWorkflow.cases.push(
    newInspection(
      workspace.qualityWorkflow,
      [{ receiptId: 'receipt', quantity: presented }],
      workspace.materialReceipts as unknown as Parameters<
        typeof newInspection
      >[2],
      workspace.lines as unknown as Parameters<typeof newInspection>[3],
      'app',
    ),
  )
  return workspace
}

export function documentInspectionFixture(kind: 'app' | 'm15' = 'app') {
  const workspace = inspectionFixture()
  workspace.qualityWorkflow.cases = []
  workspace.qualityWorkflow.receiptDocuments = [
    { id: 'source', kind: 'app', number: '42', date: localToday() },
  ]
  Object.assign(workspace.materialReceipts[0]!, {
    quantity: 4,
    altQuantity: 10,
    appDocumentId: 'source',
    m15DocumentId: kind === 'm15' ? 'source' : '',
  })
  workspace.materialRequests = [
    {
      id: 'request',
      number: 'ЗП-42-Материалы',
      projectLineId: 'line',
      cipher: 'ТКМ5',
      quantity: 4,
      date: localToday(),
    },
  ]
  if (kind === 'm15') {
    workspace.m15Reconciliations = [
      {
        id: 'source',
        mode: 'linked',
        cipher: 'ТКМ5',
        lines: [
          {
            id: 'composition',
            projectLineId: 'line',
            name: 'Клапан',
            unit: 'шт',
            quantity: 4,
            position: '',
          },
        ],
        allocations: [
          {
            lineId: 'composition',
            receiptId: 'receipt',
            quantity: 4,
            documentQuantity: 4,
            receiptQuantity: 4,
            receiptUnit: 'шт',
          },
        ],
      },
    ]
    workspace.qualityWorkflow = qualityWithM15(
      workspace.qualityWorkflow,
      workspace.m15Reconciliations,
    )!
  }
  const entry = newInspection(
    workspace.qualityWorkflow,
    [{ receiptId: 'receipt', quantity: 4 }],
    workspace.materialReceipts as unknown as Parameters<
      typeof newInspection
    >[2],
    workspace.lines as unknown as Parameters<typeof newInspection>[3],
    'source',
    [{ id: 'request', number: 'ЗП-42-Материалы' }],
  )
  if (kind === 'm15') {
    workspace.qualityWorkflow.receiptDocuments![0]!.kind = 'm15'
    workspace.qualityWorkflow.receiptDocuments!.push({
      id: 'historical-app',
      kind: 'app',
      number: 'Исторический АПП',
      date: localToday(),
    })
    workspace.materialReceipts[0]!.appDocumentId = 'historical-app'
    entry.basis = { ...entry.basis, kind: 'm15' }
  }
  const revision = currentInspection(entry)
  Object.assign(revision.zni.rows[0]!, {
    accepted: 3,
    result: 'remarks',
    remarks: 'Одна единица не принята. Возврат заказчику.',
  })
  entry.revisions[0] = signInspection(revision, 'zni', localToday())
  currentInspection(entry).avk = createAcceptedInspectionAct(entry)
  currentInspection(entry).avk!.number = 'АВК-42'
  workspace.qualityWorkflow.cases = [entry]
  delete workspace.qualityWorkflow.m15Reconciliations
  return workspace
}

export function coverFixtureM15(
  workspace: ReturnType<typeof inspectionFixture>,
  documentId: string,
) {
  const receipt = workspace.materialReceipts[0]!
  const quantity = Number(receipt.quantity)
  workspace.materialRequests = [
    {
      id: String(receipt.requestId),
      projectLineId: String(receipt.projectLineId),
      cipher: 'ТКМ5',
      number: 'ЗП-42-Материалы',
      quantity,
      date: localToday(),
    },
  ]
  workspace.m15Reconciliations = [
    {
      id: documentId,
      mode: 'linked',
      cipher: 'ТКМ5',
      lines: [
        {
          id: 'composition',
          projectLineId: String(receipt.projectLineId),
          name: 'Клапан',
          unit: 'шт',
          quantity,
          position: '',
        },
      ],
      allocations: [
        {
          lineId: 'composition',
          receiptId: String(receipt.id),
          quantity,
          documentQuantity: quantity,
          receiptQuantity: quantity,
          receiptUnit: 'шт',
        },
      ],
    },
  ]
  workspace.qualityWorkflow = qualityWithM15(
    workspace.qualityWorkflow,
    workspace.m15Reconciliations,
  )!
}
