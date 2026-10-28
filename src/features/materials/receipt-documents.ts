import { z } from 'zod'
import { normalizeCalendarDate } from './calendar-date'

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
type DocumentWorkspace = {
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
export function receiptDocumentLabel(document: ReceiptDocument) {
  return `${receiptDocumentKindLabel(document.kind)} №${document.number} от ${document.date.split('-').reverse().join('.')}`
}
export function receiptDocumentKey(
  document: Pick<ReceiptDocument, 'kind' | 'number' | 'date'>,
) {
  return JSON.stringify([
    document.kind,
    document.number.trim().toLocaleLowerCase('ru'),
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
  const documents = receiptDocuments(workflow)
  const find = (id?: string) =>
    id
      ? index
        ? index.get(id)
        : documents.find((doc) => doc.id === id)
      : undefined
  return [find(receipt.appDocumentId), find(receipt.m15DocumentId)].filter(
    (doc): doc is ReceiptDocument => !!doc,
  )
}

/** Build once for a calculation/render; never cache a mutable catalog globally. */
export function indexReceiptDocuments(workflow?: DocumentWorkspace) {
  return new Map(
    receiptDocuments(workflow).map((document) => [document.id, document]),
  )
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
  for (const kind of ['app', 'm15'] as const) {
    const number = fields[`${kind}Number`].trim(),
      date = fields[`${kind}Date`]
    if (!number && !date) continue
    if (!number || !calendarDate.safeParse(date).success)
      return `Укажите номер и корректную дату ${receiptDocumentKindLabel(kind)}.`
  }
  if (!fields.appNumber.trim() && !fields.m15Number.trim())
    return 'Укажите АПП или М-15: номер и дату хотя бы одного документа.'
  return ''
}
/** The caller saves the returned catalog and receipt references in one workspace update. */
export function bindReceiptDocuments(
  fields: ReceiptDocumentFields,
  catalog: Array<ReceiptDocument>,
) {
  const result: { appDocumentId?: string; m15DocumentId?: string } = {}
  for (const kind of ['app', 'm15'] as const) {
    const number = fields[`${kind}Number`].trim(),
      date = fields[`${kind}Date`]
    if (!number) continue
    const input = { kind, number, date }
    let document = catalog.find(
      (doc) => receiptDocumentKey(doc) === receiptDocumentKey(input),
    )
    if (!document) {
      document = receiptDocumentSchema.parse({
        ...input,
        id: crypto.randomUUID(),
      })
      catalog.push(document)
    }
    result[kind === 'app' ? 'appDocumentId' : 'm15DocumentId'] = document.id
  }
  return result
}
