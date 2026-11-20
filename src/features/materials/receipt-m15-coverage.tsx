import { formatCalendarDate } from './calendar-date'
import { useMemo, useState } from 'react'
import { AppSelect } from '#/components/ui/app-select'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import type { M15Reconciliation } from './m15-reconciliation'
import { indexM15Links, m15Uncovered } from './m15-linked'
import type { ReceiptDocument } from './receipt-documents'
import { receiptDocumentLabel } from './receipt-documents'

type Receipt = {
  id: string
  projectLineId: string
  requestId: string
  quantity: number
  projectUnit: string
  actualName: string
  date?: string
  appDocumentId?: string
  altUnit?: string
  altUnitFactor?: number | null
}
export function ReceiptM15Coverage({
  receipts,
  records,
  documents,
  onChange,
}: {
  receipts: Receipt[]
  records: M15Reconciliation[]
  documents: ReceiptDocument[]
  onChange: (records: M15Reconciliation[]) => void
}) {
  const index = useMemo(() => indexM15Links(records), [records])
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [factors, setFactors] = useState<Record<string, string>>({})
  const docs = new Map(documents.map((doc) => [doc.id, doc]))
  function change(
    documentId: string,
    receipt: Receipt,
    lineId: string,
    quantity: number,
    factor: number,
    unit: string,
  ) {
    onChange(
      records.map((record) =>
        record.id !== documentId
          ? record
          : {
              ...record,
              allocations: [
                ...record.allocations.filter(
                  (link) =>
                    !(link.receiptId === receipt.id && link.lineId === lineId),
                ),
                ...(quantity > 0
                  ? [
                      {
                        lineId,
                        receiptId: receipt.id,
                        quantity,
                        receiptQuantity: receipt.quantity,
                        receiptUnit: receipt.projectUnit,
                        receiptName: receipt.actualName,
                        receiptRequestId: receipt.requestId,
                        documentQuantity: quantity * factor,
                        ...(unit !== receipt.projectUnit
                          ? {
                              conversion: {
                                fromUnit: receipt.projectUnit,
                                toUnit: unit,
                                factor,
                              },
                            }
                          : {}),
                      },
                    ]
                  : []),
              ],
            },
      ),
    )
  }
  return (
    <div className="grid gap-4">
      {receipts.map((receipt) => {
        const options = records
          .filter((record) => record.mode === 'linked')
          .flatMap((record) =>
            record.lines
              .filter((line) => line.projectLineId === receipt.projectLineId)
              .map((line) => ({
                record,
                line,
                key: JSON.stringify([record.id, line.id]),
              })),
          )
        const choice = options.find(
          (option) => option.key === selected[receipt.id],
        )
        const factor = choice
          ? choice.line.unit === receipt.projectUnit
            ? 1
            : choice.line.unit === receipt.altUnit
              ? receipt.altUnitFactor
              : Number(factors[receipt.id])
          : 0
        const uncovered = m15Uncovered(
          receipt.quantity,
          index.byReceiptTotal.get(receipt.id) ?? 0,
        )
        return (
          <section
            key={receipt.id}
            className="grid gap-3 border-b border-slate-200 py-4"
          >
            <h3 className="font-medium">{receipt.actualName}</h3>
            <p className="text-sm text-slate-500">
              {receipt.date
                ? `Получение ${formatCalendarDate(receipt.date)} · `
                : ''}
              {receipt.appDocumentId && docs.has(receipt.appDocumentId)
                ? receiptDocumentLabel(docs.get(receipt.appDocumentId)!)
                : 'Основание: М-15'}
            </p>
            <div className="flex flex-wrap gap-5 text-sm">
              <span>
                Получено: {receipt.quantity} {receipt.projectUnit}
              </span>
              {!receipt.appDocumentId && (
                <>
                  <span>
                    Подтверждено М-15:{' '}
                    {index.byReceiptTotal.get(receipt.id) ?? 0}
                  </span>
                  <span>Ожидает М-15: {uncovered}</span>
                </>
              )}
            </div>
            {!receipt.appDocumentId && (
              <>
                {(index.byReceipt.get(receipt.id) ?? []).map(
                  ({ documentId, line, link }) => (
                    <div
                      key={JSON.stringify([documentId, line.id])}
                      className="flex flex-wrap items-center gap-3 text-sm"
                    >
                      <span className="min-w-48 flex-1">
                        {docs.has(documentId)
                          ? receiptDocumentLabel(docs.get(documentId)!)
                          : documentId}{' '}
                        · {line.name}
                      </span>
                      <label className="flex items-center gap-2">
                        Подтверждено, {receipt.projectUnit}
                        <Input
                          className="w-32"
                          aria-label={`Подтверждено ${documentId}: ${receipt.actualName}`}
                          type="number"
                          min="0"
                          step="any"
                          value={link.quantity}
                          onChange={(event) =>
                            change(
                              documentId,
                              receipt,
                              line.id,
                              Number(event.target.value),
                              link.conversion?.factor ?? 1,
                              line.unit,
                            )
                          }
                        />
                      </label>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          change(documentId, receipt, line.id, 0, 1, line.unit)
                        }
                      >
                        Убрать связь
                      </Button>
                    </div>
                  ),
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-56 flex-1">
                    <AppSelect
                      label={`М-15 для ${receipt.actualName}`}
                      value={selected[receipt.id] ?? ''}
                      options={[
                        { value: '', label: 'Добавить подтверждение М-15' },
                        ...options
                          .filter(
                            ({ record, line }) =>
                              !record.allocations.some(
                                (link) =>
                                  link.receiptId === receipt.id &&
                                  link.lineId === line.id,
                              ),
                          )
                          .map(({ record, line, key }) => ({
                            value: key,
                            label: `${docs.has(record.id) ? receiptDocumentLabel(docs.get(record.id)!) : record.id} · ${line.name} · остаток ${m15Uncovered(line.quantity, index.byLine.get(key) ?? 0)} ${line.unit}`,
                          })),
                      ]}
                      onChange={(value) =>
                        setSelected({ ...selected, [receipt.id]: value })
                      }
                    />
                  </div>
                  {choice &&
                    choice.line.unit !== receipt.projectUnit &&
                    choice.line.unit !== receipt.altUnit && (
                      <label className="grid gap-1 text-xs">
                        1 {receipt.projectUnit} = … {choice.line.unit}
                        <Input
                          className="w-28"
                          inputMode="decimal"
                          value={factors[receipt.id] ?? ''}
                          onChange={(event) =>
                            setFactors({
                              ...factors,
                              [receipt.id]: event.target.value.replace(
                                ',',
                                '.',
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                  <Button
                    variant="outline"
                    disabled={!choice || !factor || factor <= 0 || !uncovered}
                    onClick={() => {
                      if (choice && factor) {
                        change(
                          choice.record.id,
                          receipt,
                          choice.line.id,
                          Math.min(
                            uncovered,
                            m15Uncovered(
                              choice.line.quantity,
                              index.byLine.get(choice.key) ?? 0,
                            ) / factor,
                          ),
                          factor,
                          choice.line.unit,
                        )
                        setSelected({ ...selected, [receipt.id]: '' })
                      }
                    }}
                  >
                    Связать
                  </Button>
                </div>
                {uncovered > 0 && (
                  <p className="text-sm text-amber-800">
                    Без АПП необходимо подтвердить всё полученное количество.
                  </p>
                )}
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
