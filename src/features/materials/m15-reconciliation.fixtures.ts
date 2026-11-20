import { acceptFixture } from './quality-workflow.fixtures'
import { m15Allocation, m15ReceiptIndex } from './m15-reconciliation'
import type { M15Reconciliation } from './m15-reconciliation'

export function m15Fixture(accepted = 8) {
  const workspace = acceptFixture(accepted)
  workspace.qualityWorkflow.receiptDocuments!.push({
    id: 'm15',
    kind: 'm15',
    number: '15-1',
    date: workspace.qualityWorkflow.receiptDocuments![0]!.date,
  })
  workspace.materialReceipts[0]!.m15DocumentId = 'm15'
  workspace.materialRequests = [
    {
      id: 'request',
      projectLineId: 'line',
      number: 'ЗП-1',
      cipher: 'ТК1',
      projectMaterialName: 'Клапан по проекту',
      projectUnit: 'шт',
      quantity: 10,
    },
  ]
  const value: M15Reconciliation = {
    id: 'm15',
    lines: [
      { id: 'row1', position: '1', name: 'Клапан', unit: 'шт', quantity: 10 },
    ],
    allocations: [
      m15Allocation(m15ReceiptIndex(workspace).get('receipt')!, 'row1', 10),
    ],
  }
  return { workspace, value }
}

/** Explicit quantitative composition used by the new workflow. */
export function linkedM15Fixture() {
  const { workspace, value } = m15Fixture()
  workspace.materialRequests[0]!.cipher = String(workspace.lines[0]!.cipher)
  delete workspace.materialReceipts[0]!.m15DocumentId
  const linked: M15Reconciliation = {
    ...value,
    mode: 'linked',
    cipher: String(workspace.lines[0]!.cipher),
    lines: value.lines.map((line) => ({ ...line, projectLineId: 'line' })),
    allocations: value.allocations.map((link) => ({
      ...link,
      documentQuantity: link.quantity,
    })),
  }
  workspace.m15Reconciliations = [linked]
  return { workspace, value: linked }
}
