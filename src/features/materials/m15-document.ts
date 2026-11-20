import { emptyQualityWorkflow } from './quality-workflow'
import { normalizeDocumentNumber } from './document-number'
import { receiptDocumentKey, receiptDocumentSchema } from './receipt-documents'
import { jsonEqual } from './workspace-protocol'
import type { ReceiptDocument } from './receipt-documents'
import type { M15Workspace } from './m15-reconciliation'

/** Prepare the document and composition in one workspace update, without creating receipts. */
export function withM15Document<T extends M15Workspace>(
  workspace: T,
  input?: ReceiptDocument,
  correctingPending = false,
): T {
  if (!input) return workspace
  const parsed = receiptDocumentSchema.safeParse({
    ...input,
    number: normalizeDocumentNumber(input.number),
  })
  if (!parsed.success || parsed.data.kind !== 'm15')
    throw new Error('Укажите номер и корректную дату М-15.')
  const document = parsed.data
  const catalog = workspace.qualityWorkflow?.receiptDocuments ?? []
  const identity = (doc: ReceiptDocument) =>
    receiptDocumentKey({ ...doc, number: normalizeDocumentNumber(doc.number) })
  if (
    catalog.some(
      (doc) => doc.id !== document.id && identity(doc) === identity(document),
    )
  )
    throw new Error(
      'М-15 с таким номером и датой уже существует. Откройте её в списке накладных.',
    )
  const existing = catalog.find((doc) => doc.id === document.id)
  if (existing && jsonEqual(existing, document)) return workspace
  if (existing && (!correctingPending || existing.kind !== 'm15'))
    throw new Error('Реквизиты М-15 изменились. Откройте накладную заново.')
  if (
    existing &&
    (workspace.materialReceipts.some(
      (receipt) => receipt.m15DocumentId === document.id,
    ) ||
      workspace.qualityWorkflow?.cases.some(
        (entry) => entry.basis.id === document.id,
      ))
  )
    throw new Error(
      'Реквизиты М-15 уже используются в получениях или ЗНИ и защищены от изменения.',
    )
  return {
    ...workspace,
    qualityWorkflow: {
      ...(workspace.qualityWorkflow ?? emptyQualityWorkflow()),
      receiptDocuments: [
        ...catalog.filter((doc) => doc.id !== document.id),
        document,
      ],
    },
  }
}

/** Link existing physical receipts only; never copy or recreate them. */
export function withM15Receipts<T extends M15Workspace>(
  workspace: T,
  documentId: string,
  receiptIds: readonly string[],
): T {
  if (!receiptIds.length) return workspace
  if (
    !workspace.qualityWorkflow?.receiptDocuments?.some(
      (doc) => doc.id === documentId && doc.kind === 'm15',
    )
  )
    throw new Error('М-15 не найдена. Обновите список накладных.')
  const ids = new Set(receiptIds),
    current = new Map(
      workspace.materialReceipts.map((receipt) => [
        String(receipt.id),
        receipt,
      ]),
    )
  for (const id of ids) {
    const receipt = current.get(id)
    if (!receipt)
      throw new Error('Выбранное получение удалено. Обновите список получений.')
    if (receipt.m15DocumentId && receipt.m15DocumentId !== documentId)
      throw new Error(
        'Выбранное получение уже относится к другой М-15. Обновите список получений.',
      )
  }
  return {
    ...workspace,
    materialReceipts: workspace.materialReceipts.map((receipt) =>
      ids.has(String(receipt.id)) && receipt.m15DocumentId !== documentId
        ? { ...receipt, m15DocumentId: documentId }
        : receipt,
    ),
  }
}
