import { DateInput } from '#/components/ui/date-input'
import { WorkflowDialog } from './workflow-dialog'
import { materialNumberContext } from './document-numbering'
import { documentNumberLabel } from './document-number'
import { useDocumentNumber } from './document-numbering-context'
import { useMemo, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  localToday,
  findInspectionMaterial,
  indexInspectionMaterials,
  pendingCustomerReturns,
  recordCustomerReturn,
} from './quality-workflow'
import type { InspectionCase, QualityWorkflow } from './quality-workflow'
import { customerReturnAlternative } from './receipt-balances'
import type { SubobjectMaterialMetric } from './types'
import { CustomerReturnGrid } from './customer-return-grid'
import type { CustomerReturnGridRow } from './customer-return-grid'

const returnQuantity = (value: string) =>
  Number(value.replace(/\s/g, '').replace(',', '.'))

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
  const pending = useMemo(
    () => pendingCustomerReturns(workflow, entry),
    [workflow, entry],
  )
  const materialById = useMemo(() => indexInspectionMaterials(lines), [lines])
  const receiptById = useMemo(
    () => new Map(receipts.map((receipt) => [receipt.id, receipt])),
    [receipts],
  )
  const [step, setStep] = useState(0)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [date, setDate] = useState(localToday())
  const suggestNumber = useDocumentNumber()
  const [manualNumber, setDocumentNumber] = useState<string | null>(null)
  const documentNumber =
    manualNumber ??
    suggestNumber('return', {
      date,
      ...materialNumberContext(
        pending
          .filter(
            ({ row }) => returnQuantity(quantities[row.receiptId] ?? '') > 0,
          )
          .map(({ row }) => ({
            cipher: row.cipher,
            materialType: findInspectionMaterial(
              lines,
              row.projectLineId,
              materialById,
            )?.materialType,
          })),
      ),
    })
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const saving = useRef(false)
  const rows = useMemo<CustomerReturnGridRow[]>(
    () =>
      pending.map(({ row, quantity }) => {
        const draft = quantities[row.receiptId] ?? ''
        const amount = returnQuantity(draft)
        const valid =
          Number.isFinite(amount) && amount > 0 && amount <= quantity
        const alternative = customerReturnAlternative(
          valid ? amount : 0,
          row,
          receiptById.get(row.receiptId),
          findInspectionMaterial(lines, row.projectLineId, materialById),
        )
        return {
          id: row.receiptId,
          name: row.name,
          requestNumber: row.requestNumber ?? '',
          cipher: row.cipher,
          unit: row.unit,
          available: quantity,
          quantity: draft,
          amount: draft.trim() && Number.isFinite(amount) ? amount : null,
          alternativeQuantity:
            draft.trim() && valid && !alternative.error
              ? alternative.altQuantity
              : null,
          alternativeUnit: alternative.altUnit,
          error: !draft.trim()
            ? ''
            : !valid
              ? `Проверьте количество. Доступно ${quantity} ${row.unit}.`
              : alternative.error,
        }
      }),
    [pending, quantities, receiptById, lines, materialById],
  )
  function updateQuantity(id: string, value: string) {
    setQuantities((current) => ({ ...current, [id]: value }))
    setError('')
  }
  function advance(next: number) {
    if (next <= step) {
      setStep(next)
      setError('')
      return
    }
    if (!date) {
      setError('Укажите дату возврата.')
      return
    }
    if (next > 1) {
      const chosen = pending.filter(({ row }) =>
        quantities[row.receiptId]?.trim(),
      )
      if (!chosen.length) {
        setError('Укажите количество хотя бы одного материала.')
        return
      }
      for (const { row, quantity } of chosen) {
        const amount = returnQuantity(quantities[row.receiptId]!)
        if (!Number.isFinite(amount) || amount <= 0 || amount > quantity) {
          setError(
            `Проверьте количество: ${row.name}. Доступно ${quantity} ${row.unit}.`,
          )
          return
        }
        const alternative = customerReturnAlternative(
          amount,
          row,
          receiptById.get(row.receiptId),
          findInspectionMaterial(lines, row.projectLineId, materialById),
        )
        if (alternative.error) {
          setError(alternative.error)
          return
        }
      }
    }
    setError('')
    setStep(Math.min(next, step + 1))
  }
  const footer = (
    <div className="flex justify-end gap-2">
      <Button
        variant="outline"
        onClick={() => (step ? setStep(step - 1) : onClose())}
      >
        {step ? 'Назад' : 'Отмена'}
      </Button>
      <Button
        onClick={() => {
          if (step < 2) {
            advance(step + 1)
            return
          }
          if (saving.current) return
          saving.current = true
          try {
            const selection = Object.entries(quantities)
              .filter(([, value]) => value.trim())
              .map(([receiptId, value]) => ({
                receiptId,
                quantity: returnQuantity(value),
              }))
            for (const item of selection) {
              const row = pending.find(
                (candidate) => candidate.row.receiptId === item.receiptId,
              )?.row
              if (!row) throw new Error('Позиция недоступна для возврата.')
              const alternative = customerReturnAlternative(
                item.quantity,
                row,
                receiptById.get(item.receiptId),
                findInspectionMaterial(lines, row.projectLineId, materialById),
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
        {step < 2 ? 'Далее' : 'Сохранить фактический возврат'}
      </Button>
    </div>
  )
  return (
    <WorkflowDialog
      title="Возврат заказчику"
      onClose={onClose}
      step={step}
      onStep={advance}
      footer={footer}
      fillBody={step > 0}
    >
      <div
        className={
          step > 0 ? 'flex min-h-0 flex-1 flex-col gap-4' : 'grid gap-4'
        }
      >
        <p className="shrink-0 text-sm text-slate-600">
          {entry.revisions.at(-1)?.avk?.rejection?.kind === 'materials' &&
            `${documentNumberLabel('АВК', entry.revisions.at(-1)!.avk!.number)}: есть непринятое количество. `}
          Укажите фактически возвращённое количество. После сохранения оно
          уменьшит остаток на складе и снова станет доступно к получению по
          исходной заявке.
        </p>
        <label hidden={step !== 0}>
          Дата возврата
          <DateInput
            aria-label="Дата возврата"
            value={date}
            onValueChange={(value) => setDate(value)}
          />
        </label>
        <div className={step === 1 ? 'flex min-h-0 flex-1' : 'hidden'}>
          <CustomerReturnGrid rows={rows} onUpdate={updateQuantity} />
        </div>
        <div className={step === 2 ? 'flex min-h-0 flex-1' : 'hidden'}>
          {step === 2 && (
            <CustomerReturnGrid
              rows={rows.filter((row) => (row.amount ?? 0) > 0)}
              readOnly
              onUpdate={updateQuantity}
            />
          )}
        </div>
        <label hidden={step !== 0}>
          Номер документа (необязательно)
          <Input
            value={documentNumber}
            onChange={(event) => setDocumentNumber(event.target.value)}
          />
        </label>
        <label hidden={step !== 0}>
          Примечание
          <textarea
            className="w-full rounded-lg border p-2"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="shrink-0 text-red-700">
            {error}
          </p>
        )}
      </div>
    </WorkflowDialog>
  )
}
