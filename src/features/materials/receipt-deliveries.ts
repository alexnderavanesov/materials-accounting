import { normalizeCalendarDate } from './calendar-date'
import { bindReceiptDocuments, receiptDocumentError } from './receipt-documents'
import type {
  DocumentReceipt,
  ReceiptDocument,
  ReceiptDocumentFields,
} from './receipt-documents'

type DeliveryReceipt = DocumentReceipt & { date: string }
export type ReceiptDelivery<T extends DeliveryReceipt> = {
  key: string
  date: string
  entries: Array<T>
}

/** One receipt belongs to one delivery, even when it has both documents.
 * Callers pass the receipts of the current request; shared documents do not
 * extend an edit to other requests. Different receipt dates remain separate.
 */
export function groupReceiptDeliveries<T extends DeliveryReceipt>(
  receipts: Array<T>,
): Array<ReceiptDelivery<T>> {
  const groups = new Map<string, ReceiptDelivery<T>>()
  for (const receipt of receipts) {
    const key = JSON.stringify([
      receipt.date,
      receipt.appDocumentId || '',
      receipt.m15DocumentId || '',
      receipt.appDocumentId || receipt.m15DocumentId ? '' : receipt.id,
    ])
    const group = groups.get(key)
    if (group) group.entries.push(receipt)
    else groups.set(key, { key, date: receipt.date, entries: [receipt] })
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date))
}

/** Build a replacement without mutating receipts or the live document catalog.
 * The caller validates and saves both through the existing workspace queue.
 */
export function updateReceiptDeliveryDocuments<T extends DeliveryReceipt>(
  receipts: Array<T>,
  fields: ReceiptDocumentFields & { date: string },
  documents: Array<ReceiptDocument>,
) {
  if (groupReceiptDeliveries(receipts).length !== 1)
    throw new Error('Выберите одну поставку для изменения реквизитов.')
  if (!fields.date || normalizeCalendarDate(fields.date) !== fields.date)
    throw new Error('Укажите корректную дату получения.')
  const error = receiptDocumentError(fields)
  if (error) throw new Error(error)
  const catalog = [...documents]
  const refs = bindReceiptDocuments(fields, catalog)
  return {
    documents: catalog,
    entries: receipts.map((receipt) => ({
      ...receipt,
      date: fields.date,
      appDocumentId: refs.appDocumentId,
      m15DocumentId: refs.m15DocumentId,
    })),
  }
}
