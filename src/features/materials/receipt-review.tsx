import { formatCalendarDate } from './calendar-date'
import { receiptDocumentLabel } from './receipt-documents'
import type { ReceiptDocument } from './receipt-documents'

export function ReceiptReview({
  receipts,
  documents,
}: {
  receipts: Array<{
    id: string
    actualName: string
    date: string
    quantity: number
    projectUnit: string
    appDocumentId?: string
  }>
  documents: ReceiptDocument[]
}) {
  const byId = new Map(documents.map((document) => [document.id, document]))
  return (
    <div className="grid gap-4">
      {receipts.map((receipt) => {
        const app = byId.get(receipt.appDocumentId ?? '')
        return (
          <section
            key={receipt.id}
            className="grid gap-2 border-b border-slate-200 py-4"
          >
            <h3 className="font-medium">{receipt.actualName}</h3>
            <p className="text-sm text-slate-500">
              Получение {formatCalendarDate(receipt.date)} ·{' '}
              {app ? receiptDocumentLabel(app) : 'Укажите АПП'}
            </p>
            <p className="text-sm">
              Получено: {receipt.quantity} {receipt.projectUnit}
            </p>
          </section>
        )
      })}
    </div>
  )
}
