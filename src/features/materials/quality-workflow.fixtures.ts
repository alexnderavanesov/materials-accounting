import {
  currentInspection,
  emptyQualityWorkflow,
  localToday,
  newInspection,
  newInspectionAct,
  signInspection,
} from './quality-workflow'
import { workspaceSnapshotSchema } from './workspace-snapshot'

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
    invoiceNumber: 'Н-1',
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
  workflow.apps.push({
    id: 'app',
    number: 'АПП-1',
    date: localToday(),
    receiptIds: ['receipt'],
    documents: [
      {
        id: 'passport',
        name: 'Паспорт',
        number: '1',
        date: localToday(),
        orderNumber: '12',
      },
    ],
  })
  workflow.cases.push(newInspection(workflow, 'app', [receipt], [line]))
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
  revision.avk = newInspectionAct(workspace.qualityWorkflow.apps[0]!)
  revision.avk.number = 'АВК-1'
  revision.avk.checks.fill('Проверено')
  revision.avk.conclusion = 'Принято по результатам проверки'
  entry.revisions[0] = signInspection(
    signInspection(revision, 'zni', localToday()),
    'avk',
    localToday(),
  )
  return workspace
}
