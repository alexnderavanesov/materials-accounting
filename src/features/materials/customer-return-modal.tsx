import { useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  localToday,
  findInspectionMaterial,
  pendingCustomerReturns,
  recordCustomerReturn,
} from './quality-workflow'
import type { InspectionCase, QualityWorkflow } from './quality-workflow'
import { customerReturnAlternative } from './receipt-balances'
import type { SubobjectMaterialMetric } from './types'

export function CustomerReturnModal({
  entry,
  workflow,
  receipts,
  lines,
  onSave,
  onClose,
}: {
  entry: InspectionCase
  workflow: QualityWorkflow
  receipts: Array<{
    id: string
    quantity: number
    projectUnit: string
    altQuantity: number | null
    altUnit: string
    altUnitFactor?: number | null
  }>
  lines: Array<SubobjectMaterialMetric>
  onSave: (next: QualityWorkflow) => void
  onClose: () => void
}) {
  const pending = pendingCustomerReturns(workflow, entry)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [date, setDate] = useState(localToday())
  const [documentNumber, setDocumentNumber] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const saving = useRef(false)
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-auto bg-black/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Возврат заказчику"
        className="grid max-h-[90vh] w-full max-w-3xl gap-4 overflow-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-xl font-semibold">
          Возврат заказчику · ЗНИ №{entry.revisions.at(-1)?.zni.number}
        </h2>
        <p className="text-sm text-slate-600">
          Укажите фактически возвращённое количество. После сохранения оно
          уменьшит остаток на складе и снова станет доступно к получению по
          исходной заявке.
        </p>
        <label>
          Дата возврата
          <Input
            aria-label="Дата возврата"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        {pending.map(({ row, quantity }) => {
          const amount = Number(
            (quantities[row.receiptId] ?? '').replace(',', '.'),
          )
          const alternative = customerReturnAlternative(
            amount || 0,
            row,
            receipts.find((receipt) => receipt.id === row.receiptId),
            findInspectionMaterial(lines, row.projectLineId),
          )
          return (
            <label
              key={row.receiptId}
              className="grid gap-1 rounded-lg border p-3"
            >
              {row.name} · {row.requestNumber} · к возврату {quantity}{' '}
              {row.unit}
              <Input
                aria-label={`Возвратить: ${row.name}`}
                inputMode="decimal"
                value={quantities[row.receiptId] ?? ''}
                onChange={(event) =>
                  setQuantities({
                    ...quantities,
                    [row.receiptId]: event.target.value,
                  })
                }
              />
              {!alternative.error && alternative.altQuantity !== null && (
                <span className="text-sm text-slate-500">
                  {alternative.altQuantity} {alternative.altUnit}
                </span>
              )}
            </label>
          )
        })}
        <label>
          Номер документа (необязательно)
          <Input
            value={documentNumber}
            onChange={(event) => setDocumentNumber(event.target.value)}
          />
        </label>
        <label>
          Примечание
          <textarea
            className="w-full rounded-lg border p-2"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            onClick={() => {
              if (saving.current) return
              saving.current = true
              try {
                const selection = Object.entries(quantities)
                  .filter(([, value]) => value.trim())
                  .map(([receiptId, value]) => ({
                    receiptId,
                    quantity: Number(
                      value.trim().replace(/\s/g, '').replace(',', '.'),
                    ),
                  }))
                for (const item of selection) {
                  const row = pending.find(
                    (candidate) => candidate.row.receiptId === item.receiptId,
                  )?.row
                  if (!row) throw new Error('Позиция недоступна для возврата.')
                  const alternative = customerReturnAlternative(
                    item.quantity,
                    row,
                    receipts.find((receipt) => receipt.id === item.receiptId),
                    findInspectionMaterial(lines, row.projectLineId),
                  )
                  if (alternative.error) throw new Error(alternative.error)
                }
                onSave(
                  recordCustomerReturn(
                    workflow,
                    entry.id,
                    selection,
                    date,
                    documentNumber,
                    note,
                  ),
                )
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Не удалось сохранить возврат.',
                )
                saving.current = false
              }
            }}
          >
            Сохранить фактический возврат
          </Button>
        </div>
      </section>
    </div>
  )
}
