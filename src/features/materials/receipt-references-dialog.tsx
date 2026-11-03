import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import { receiptDocumentLabel } from './receipt-documents'
import type { ReceiptDocument } from './receipt-documents'

export type ReceiptReference = {
  id: string
  date: string
  quantity: string
  request: string
  documents: Array<ReceiptDocument>
}

export function ReceiptReferencesDialog({
  kind,
  material,
  receipts,
  onClose,
  onOpenReceipt,
}: {
  kind: 'receipts' | 'documents'
  material: string
  receipts: Array<ReceiptReference>
  onClose: () => void
  onOpenReceipt: (id: string) => void
}) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    close.current?.focus()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus()
    }
  }, [])
  const documents = useMemo(() => {
    const byId = new Map<
      string,
      { document: ReceiptDocument; receipts: Array<ReceiptReference> }
    >()
    for (const receipt of receipts) {
      for (const document of receipt.documents) {
        const group = byId.get(document.id) ?? { document, receipts: [] }
        group.receipts.push(receipt)
        byId.set(document.id, group)
      }
    }
    return [...byId.values()]
  }, [receipts])
  const title =
    kind === 'receipts' ? 'Получения материала' : 'Документы получения'

  function receiptLink(receipt: ReceiptReference, showDocuments: boolean) {
    return (
      <button
        key={receipt.id}
        type="button"
        title="Открыть получение"
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500"
        onClick={() => onOpenReceipt(receipt.id)}
      >
        <span className="grid min-w-0 gap-1 text-sm">
          <span className="font-medium text-blue-700">
            Получение от {receipt.date}
          </span>
          <span className="break-words text-xs text-slate-500">
            {receipt.request}
          </span>
          {showDocuments && (
            <span className="break-words text-xs text-slate-500">
              {receipt.documents.map(receiptDocumentLabel).join('; ') ||
                'Документы не указаны'}
            </span>
          )}
        </span>
        <span className="rounded-md bg-slate-50 px-2 py-1 text-sm tabular-nums text-slate-700">
          {receipt.quantity}
        </span>
      </button>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/25 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[calc(100dvh-3rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          }
          if (event.key === 'Tab') {
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button, summary',
              ),
            ).filter((item) => item.getClientRects().length > 0)
            const first = items[0],
              last = items.at(-1)
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-medium text-slate-950">{title}</h2>
            <p className="mt-1 break-words text-sm text-slate-500">
              {material}
            </p>
          </div>
          <button
            ref={close}
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-2">
          {kind === 'receipts'
            ? receipts.map((receipt) => receiptLink(receipt, true))
            : documents.map(({ document, receipts: linked }) => (
                <details
                  key={document.id}
                  className="group rounded-lg border border-slate-200 mb-2 last:mb-0"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-3 text-sm hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      size={16}
                      className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                    />
                    <span className="min-w-0 flex-1 break-words font-medium text-slate-800">
                      {receiptDocumentLabel(document)}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      Получений: {linked.length}
                    </span>
                  </summary>
                  <div className="border-t border-slate-100 p-1">
                    {linked.map((receipt) => receiptLink(receipt, false))}
                  </div>
                </details>
              ))}
          {kind === 'documents' && !documents.length && (
            <p className="p-3 text-sm text-slate-500">Документы не указаны.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
