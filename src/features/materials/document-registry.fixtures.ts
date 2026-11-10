import { acceptFixture } from './quality-workflow.fixtures'

export function documentRegistryFixture() {
  const workspace = acceptFixture(8)
  workspace.lines.push({
    ...workspace.lines[0],
    id: 'line-second-cipher',
    cipher: 'ТК2',
  })
  workspace.materialRequests = [
    {
      id: 'request',
      projectLineId: 'line',
      projectMaterialName: 'Клапан',
      materialType: 'Арматура',
      projectUnit: 'шт',
      quantity: 10,
      number: 'ЗП-1',
      date: '2026-01-01',
      cipher: 'ТК1',
      requester: '',
      note: '',
      altQuantity: 25,
      altUnit: 'кг',
      altUnitFactor: 2.5,
    },
    {
      id: 'request-2',
      projectLineId: 'line-second-cipher',
      projectMaterialName: 'Клапан',
      materialType: 'Арматура',
      projectUnit: 'шт',
      quantity: 4,
      number: 'ЗП-2',
      date: '2026-01-02',
      cipher: 'ТК2',
      requester: '',
      note: '',
      altQuantity: 10,
      altUnit: 'кг',
      altUnitFactor: 2.5,
    },
  ]
  workspace.materialReceipts.push({
    ...workspace.materialReceipts[0],
    id: 'receipt-2',
    projectLineId: 'line-second-cipher',
    requestId: 'request-2',
    quantity: 4,
    altQuantity: 10,
  })
  workspace.qualityWorkflow.receiptDocuments!.push({
    id: 'm15',
    kind: 'm15',
    number: '42',
    date: '2026-01-02',
  })
  workspace.materialReceipts[0]!.m15DocumentId = 'm15'
  workspace.materialReceipts[0]!.customerArvk = 'АРВК-9'
  workspace.materialIssues = [
    {
      id: 'issue',
      projectLineId: 'line',
      receiptId: 'receipt',
      date: '2026-01-03',
      document: 'ПМ-1',
      quantity: 2,
    },
  ]
  workspace.qualityWorkflow.customerReturns = [
    {
      id: 'return',
      kind: 'rejected',
      caseId: workspace.qualityWorkflow.cases[0]!.id,
      revision: 1,
      receiptId: 'receipt',
      date: '2026-01-04',
      quantity: 2,
      documentNumber: 'В-1',
      note: '',
    },
  ]
  return workspace
}
