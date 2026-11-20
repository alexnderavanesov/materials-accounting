import { formatCalendarDate, normalizeCalendarDate } from './calendar-date'
import type { M15Reconciliation } from './m15-reconciliation'
import { indexM15Links } from './m15-linked'
import { z } from 'zod'
import { documentNumberLabel, normalizeDocumentNumber } from './document-number'

const calendarDate = z
  .string()
  .refine(
    (value) => normalizeCalendarDate(value) === value && !!value,
    'Укажите корректную дату документа',
  )
export const receiptDocumentSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['app', 'm15']),
    number: z.string().trim().min(1).max(500),
    date: calendarDate,
  })
  .strict()
export type ReceiptDocument = z.infer<typeof receiptDocumentSchema>
export type ReceiptDocumentFields = {
  appNumber: string
  appDate: string
  m15Number: string
  m15Date: string
}
export type DocumentReceipt = {
  id: string
  appDocumentId?: string
  m15DocumentId?: string
}
export type DocumentWorkspace = {
  /** Read-only projection; composition is stored in the workspace collection. */
  m15Reconciliations?: readonly M15Reconciliation[]
  receiptDocuments?: Array<ReceiptDocument>
}
export const emptyReceiptDocumentFields: ReceiptDocumentFields = {
  appNumber: '',
  appDate: '',
  m15Number: '',
  m15Date: '',
}
export const receiptDocumentKindLabel = (kind: ReceiptDocument['kind']) =>
  kind === 'app' ? 'АПП' : 'М-15'
export function receiptDocumentNumberLabel(
  document: Pick<ReceiptDocument, 'kind' | 'number'>,
) {
  return documentNumberLabel(
    receiptDocumentKindLabel(document.kind),
    document.number,
  )
}
export function receiptDocumentLabel(document: ReceiptDocument) {
  return `${receiptDocumentNumberLabel(document)} от ${formatCalendarDate(document.date)}`
}
export function receiptDocumentKey(
  document: Pick<ReceiptDocument, 'kind' | 'number' | 'date'>,
) {
  return JSON.stringify([
    document.kind,
    normalizeDocumentNumber(document.number).trim().toLocaleLowerCase('ru'),
    document.date,
  ])
}
export function receiptDocuments(
  workflow?: DocumentWorkspace,
): Array<ReceiptDocument> {
  return workflow?.receiptDocuments ?? []
}
export function documentsForReceipt(
  receipt: DocumentReceipt,
  workflow?: DocumentWorkspace,
  index?: ReadonlyMap<string, ReceiptDocument>,
): Array<ReceiptDocument> {
  const document = (index ?? indexReceiptDocuments(workflow)).get(
    receipt.appDocumentId ?? '',
  )
  return document?.kind === 'app' ? [document] : []
}

export type ReceiptDocumentIndex = Map<string, ReceiptDocument> & {
  linkedIds: Set<string>
  m15ByReceipt: ReturnType<typeof indexM15Links>['byReceipt']
}
/** Build once for a calculation/render. Quantities come only from M-15 composition. */
export function indexReceiptDocuments(
  workflow?: DocumentWorkspace,
): ReceiptDocumentIndex {
  return Object.assign(
    new Map(
      receiptDocuments(workflow).map((document) => [document.id, document]),
    ),
    {
      linkedIds: new Set(
        workflow?.m15Reconciliations
          ?.filter((row) => row.mode === 'linked')
          .map((row) => row.id),
      ),
      m15ByReceipt: indexM15Links(workflow?.m15Reconciliations).byReceipt,
    },
  )
}

export function quantityForReceiptDocument(
  receipt: DocumentReceipt & { quantity: number },
  documentId: string,
  workflow?: DocumentWorkspace,
  index = indexReceiptDocuments(workflow),
) {
  if (receipt.appDocumentId === documentId) return receipt.quantity
  if (index.linkedIds.has(documentId))
    return (index.m15ByReceipt.get(receipt.id) ?? [])
      .filter((row) => row.documentId === documentId)
      .reduce((total, row) => total + row.link.quantity, 0)
  return 0
}

/** Documentary coverage is distinct from physical receipts and never added to stock totals. */
export function receiptDocumentCoverage(
  receipt: DocumentReceipt & { quantity: number; projectUnit: string },
  workflow?: DocumentWorkspace,
  index = indexReceiptDocuments(workflow),
) {
  return documentsForReceipt(receipt, workflow, index).map((document) => ({
    document,
    quantity:
      document.kind === 'app'
        ? receipt.quantity
        : index.linkedIds.has(document.id)
          ? quantityForReceiptDocument(receipt, document.id, workflow, index)
          : null,
    unit: receipt.projectUnit,
    links: (index.m15ByReceipt.get(receipt.id) ?? []).filter(
      (link) => link.documentId === document.id,
    ),
  }))
}
export function receiptDocumentCoverageLabel(
  item: ReturnType<typeof receiptDocumentCoverage>[number],
) {
  return `${receiptDocumentLabel(item.document)}${item.document.kind === 'm15' && item.quantity !== null ? ` · ${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 9 }).format(item.quantity)} ${item.unit}` : ''}`
}

export function receiptDocumentFields(
  receipt: DocumentReceipt,
  workflow?: DocumentWorkspace,
): ReceiptDocumentFields {
  const docs = documentsForReceipt(receipt, workflow)
  const app = docs.find((doc) => doc.kind === 'app'),
    m15 = docs.find((doc) => doc.kind === 'm15')
  return {
    appNumber: app?.number ?? '',
    appDate: app?.date ?? '',
    m15Number: m15?.number ?? '',
    m15Date: m15?.date ?? '',
  }
}
export function receiptDocumentError(fields: ReceiptDocumentFields) {
  if (
    !normalizeDocumentNumber(fields.appNumber).trim() ||
    !calendarDate.safeParse(fields.appDate).success
  )
    return 'Укажите номер и корректную дату АПП.'
  return ''
}
/** The caller saves the returned catalog and receipt references in one workspace update. */
export function bindReceiptDocuments(
  fields: ReceiptDocumentFields,
  catalog: Array<ReceiptDocument>,
) {
  const result: { appDocumentId?: string; m15DocumentId?: string } = {}
  for (const kind of ['app'] as const) {
    const rawNumber = fields[`${kind}Number`].trim(),
      number = normalizeDocumentNumber(rawNumber),
      date = fields[`${kind}Date`]
    if (!number) continue
    const input = { kind, number, date }
    // Preserve exact historical links; reuse older prefixed numbers without rewriting them.
    let document =
      catalog.find(
        (doc) =>
          receiptDocumentKey(doc) ===
          receiptDocumentKey({ ...input, number: rawNumber }),
      ) ??
      catalog.find(
        (doc) =>
          receiptDocumentKey({
            ...doc,
            number: normalizeDocumentNumber(doc.number),
          }) === receiptDocumentKey(input),
      )
    if (!document) {
      document = receiptDocumentSchema.parse({
        ...input,
        id: crypto.randomUUID(),
      })
      catalog.push(document)
    }
    result.appDocumentId = document.id
  }
  return result
}
