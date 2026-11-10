import { acceptFixture } from './quality-workflow.fixtures'

// Synthetic accounting history; never load production data into this fixture.
export function scaledWorkspace(count: number) {
  const seed = acceptFixture(8)
  const workspace = {
    ...seed,
    lines: [] as typeof seed.lines,
    materialRequests: [] as typeof seed.materialRequests,
    materialReceipts: [] as typeof seed.materialReceipts,
    materialIssues: [] as typeof seed.materialIssues,
    qualityWorkflow: {
      ...seed.qualityWorkflow,
      cases: [] as typeof seed.qualityWorkflow.cases,
      receiptDocuments: [] as NonNullable<
        typeof seed.qualityWorkflow.receiptDocuments
      >,
      customerReturns: [] as NonNullable<
        typeof seed.qualityWorkflow.customerReturns
      >,
    },
  }
  for (let index = 0; index < count; index++) {
    const lineId = `line-${index}`,
      receiptId = `receipt-${index}`,
      requestId = `request-${index}`
    const document = {
      ...seed.qualityWorkflow.receiptDocuments![0]!,
      id: `app-${index}`,
      number: `АПП-${index}`,
    }
    const entry = structuredClone(seed.qualityWorkflow.cases[0]!)
    entry.id = `case-${index}`
    entry.basis = document
    const revision = entry.revisions[0]!
    revision.zni.number = `ЗНИ-${index}`
    revision.avk!.number = `АВК-${index}`
    Object.assign(revision.zni.rows[0]!, { receiptId, projectLineId: lineId })
    workspace.lines.push({
      ...seed.lines[0],
      id: lineId,
      projectMaterialName: `Материал ${index}`,
    })
    workspace.materialRequests.push({
      id: requestId,
      date: revision.zni.date,
      projectLineId: lineId,
      quantity: 10,
      number: `Заявка-${index}`,
      projectUnit: seed.lines[0]!.unit ?? 'шт',
    })
    workspace.materialReceipts.push({
      ...seed.materialReceipts[0],
      id: receiptId,
      projectLineId: lineId,
      requestId,
      appDocumentId: document.id,
    })
    workspace.materialIssues.push({
      id: `issue-${index}`,
      date: revision.avk!.signedOn!,
      receiptId,
      projectLineId: lineId,
      quantity: 1,
    })
    workspace.qualityWorkflow.cases.push(entry)
    workspace.qualityWorkflow.receiptDocuments.push(document)
    workspace.qualityWorkflow.customerReturns.push({
      id: `return-${index}`,
      kind: 'rejected',
      receiptId,
      caseId: entry.id,
      revision: 1,
      quantity: 2,
      date: revision.zni.signedOn!,
      documentNumber: '',
      note: '',
    })
  }
  return workspace
}
