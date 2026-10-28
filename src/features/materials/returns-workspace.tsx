import { useMemo, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { CustomerReturnModal } from './customer-return-modal'
import { OperationsGrid } from './operations-grid'
import { getOperationAlternative, getOperationConversion } from './domain'
import {
  documentsForReceipt,
  indexReceiptDocuments,
  receiptDocumentLabel,
} from './receipt-documents'
import { receiptBalances } from './receipt-balances'
import {
  currentInspection,
  emptyQualityWorkflow,
  findInspectionMaterial,
  indexInspectionMaterials,
  localToday,
  pendingCustomerReturns,
  rejectedReturnsByCase,
  recordSurplusReturn,
  surplusReturnSources,
} from './quality-workflow'
import type {
  inspectionApprovals,
  QualityWorkflow,
  ReturnIssue,
} from './quality-workflow'
import type { SubobjectMaterialMetric } from './types'
import { isViewString, useWorkspaceViewState } from './workspace-view'

type Receipt = {
  id: string
  quantity: number
  date: string
  requestId: string
  projectLineId: string
  projectUnit: string
  actualName: string
  appDocumentId?: string
  m15DocumentId?: string
  altUnit: string
  altQuantity: number | null
  altUnitFactor?: number | null
}
const fmt = (quantity: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 12 }).format(quantity)
const displayDate = (value: string) => value.split('-').reverse().join('.')

export function ReturnsWorkspace({
  value,
  receipts,
  requests,
  controls,
  issues,
  lines,
  onChange,
}: {
  value?: QualityWorkflow
  receipts: Array<Receipt>
  requests: Array<{ id: string; number: string }>
  controls: ReturnType<typeof inspectionApprovals>
  issues: Array<ReturnIssue>
  lines: Array<SubobjectMaterialMetric>
  onChange: (next: QualityWorkflow) => void
}) {
  const workflow = useMemo(() => value ?? emptyQualityWorkflow(), [value])
  const [mode, setMode] = useWorkspaceViewState<
    'rejected' | 'stock' | 'history'
  >(
    'returns.mode',
    'rejected',
    (item): item is 'rejected' | 'stock' | 'history' =>
      ['rejected', 'stock', 'history'].includes(String(item)),
  )
  const [search, setSearch] = useWorkspaceViewState(
    'returns.search',
    '',
    isViewString,
  )
  const [returnCaseId, setReturnCaseId] = useState<string | null>(null)
  const [surplusReceiptId, setSurplusReceiptId] = useState<string | null>(null)
  const entry = workflow.cases.find((item) => item.id === returnCaseId)
  const surplusReceipt = receipts.find((item) => item.id === surplusReceiptId)
  const { pending, stock, history, describe, available } = useMemo(() => {
    const balances = receiptBalances(receipts, workflow, controls, issues)
    const availableByReceipt = new Map<string, number>()
    for (const source of surplusReturnSources(workflow, receipts, issues))
      availableByReceipt.set(
        source.receiptId,
        Number(
          (
            (availableByReceipt.get(source.receiptId) ?? 0) + source.quantity
          ).toPrecision(15),
        ),
      )
    const receiptById = new Map(
      receipts.map((receipt) => [receipt.id, receipt]),
    )
    const requestById = new Map(
      requests.map((request) => [request.id, request.number]),
    )
    const documentById = indexReceiptDocuments(workflow)
    const materialById = indexInspectionMaterials(lines)
    const caseById = new Map(workflow.cases.map((item) => [item.id, item]))
    const describeReceipt = (receipt?: Receipt) => {
      const line = receipt ? materialById.get(receipt.projectLineId) : undefined
      return {
        name: receipt?.actualName || line?.projectMaterialName || 'Материал',
        request: receipt
          ? (requestById.get(receipt.requestId) ?? 'Заявка удалена')
          : '',
        cipher: line?.cipher ?? '',
        documents: receipt
          ? documentsForReceipt(receipt, workflow, documentById)
              .map(receiptDocumentLabel)
              .join('; ')
          : '',
      }
    }
    const rejectedReturns = rejectedReturnsByCase(workflow)
    const pendingRows = workflow.cases.flatMap((item) =>
      pendingCustomerReturns(workflow, item, rejectedReturns).map(
        ({ row, quantity }) => ({
          id: `${item.id}:${row.receiptId}`,
          entry: item,
          row,
          quantity,
          ...describeReceipt(receiptById.get(row.receiptId)),
          zni: currentInspection(item).zni.number,
        }),
      ),
    )
    const stockRows = receipts.map((receipt) => ({
      receipt,
      ...describeReceipt(receipt),
      balance: balances.get(receipt.id)!,
      available: availableByReceipt.get(receipt.id) ?? 0,
    }))
    const historyRows = [...(workflow.customerReturns ?? [])]
      .reverse()
      .map((item) => {
        const receipt = receiptById.get(item.receiptId)
        const line = receipt
          ? materialById.get(receipt.projectLineId)
          : undefined
        const alternative = getOperationAlternative(
          item.quantity,
          getOperationConversion(line, receipt?.projectUnit, receipt),
          receipt,
        )
        const zni = (
          item.caseId ? caseById.get(item.caseId) : undefined
        )?.revisions.find((revision) => revision.revision === item.revision)
          ?.zni.number
        return {
          ...describeReceipt(receipt),
          item,
          unit: receipt?.projectUnit ?? '',
          alternative,
          zni: zni ?? '',
        }
      })
    return {
      pending: pendingRows,
      stock: stockRows,
      history: historyRows,
      describe: describeReceipt,
      available: availableByReceipt,
    }
  }, [workflow, receipts, requests, controls, issues, lines])
  const matches = (values: Array<unknown>) =>
    values
      .join(' ')
      .toLocaleLowerCase('ru')
      .includes(search.trim().toLocaleLowerCase('ru'))
  const visiblePending = pending.filter((row) =>
    matches([row.name, row.request, row.cipher, row.documents, row.zni]),
  )
  const visibleStock = stock.filter((row) =>
    matches([
      row.name,
      row.request,
      row.cipher,
      row.documents,
      row.receipt.date,
      displayDate(row.receipt.date),
    ]),
  )
  const visibleHistory = history.filter((row) =>
    matches([
      row.name,
      row.request,
      row.cipher,
      row.documents,
      row.zni,
      row.item.documentNumber,
      row.item.note,
      row.item.date,
      displayDate(row.item.date),
      row.item.kind === 'surplus' ? 'Лишний материал' : 'Не принято по ЗНИ',
    ]),
  )
  return (
    <section className="min-w-0 p-4" aria-label="Возврат заказчику">
      <h2 className="text-lg font-semibold">Возврат</h2>
      <p className="mt-1 text-sm text-slate-600">
        Непринятое по ЗНИ восстанавливает остаток к получению по заявке. Возврат
        лишнего уменьшает только складской остаток.
      </p>
      <div className="my-4 flex flex-wrap gap-2">
        <Button
          variant={mode === 'rejected' ? 'default' : 'outline'}
          onClick={() => setMode('rejected')}
        >
          Не принято по ЗНИ ({pending.length})
        </Button>
        <Button
          variant={mode === 'stock' ? 'default' : 'outline'}
          onClick={() => setMode('stock')}
        >
          Все полученные материалы ({receipts.length})
        </Button>
        <Button
          variant={mode === 'history' ? 'default' : 'outline'}
          onClick={() => setMode('history')}
        >
          История возвратов ({history.length})
        </Button>
      </div>
      <Input
        aria-label="Поиск возвратов"
        placeholder="Поиск по материалу, заявке, АПП, М-15, ЗНИ или документу возврата"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="mb-4"
      />
      {mode === 'rejected' &&
        (visiblePending.length ? (
          <OperationsGrid
            id="returns-pending"
            pagination
            paginationFilterKey={search}
            label="Непринятые материалы к возврату"
            rows={visiblePending}
            rowId={(row) => row.id}
            columns={[
              {
                id: 'name',
                title: 'Материал',
                value: (row) => row.name,
                width: 260,
              },
              {
                id: 'request',
                title: 'Заявка',
                value: (row) => row.request,
                width: 260,
              },
              {
                id: 'documents',
                title: 'АПП / М-15',
                value: (row) => row.documents,
                width: 260,
              },
              { id: 'zni', title: 'ЗНИ', value: (row) => row.zni },
              {
                id: 'quantity',
                title: 'К возврату',
                value: (row) => row.quantity,
                numeric: true,
              },
              { id: 'unit', title: 'Единица', value: (row) => row.row.unit },
              {
                id: 'actions',
                title: 'Действия',
                value: () => '',
                actions: true,
                width: 200,
                render: (row) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReturnCaseId(row.entry.id)}
                  >
                    Оформить возврат
                  </Button>
                ),
              },
            ]}
          />
        ) : (
          <p className="rounded-lg border border-dashed p-8 text-center text-slate-500">
            {search
              ? 'Материалы по запросу не найдены.'
              : 'Непринятых материалов к возврату нет. После подписания ЗНИ они появятся здесь автоматически.'}
          </p>
        ))}
      {mode === 'stock' && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Возвращать можно оставшееся на складе количество. Для позиций в
            неподписанной ЗНИ сначала удалите черновик и создайте его заново на
            нужное количество. Для непринятого материала используйте раздел «Не
            принято по ЗНИ».
          </p>
          {visibleStock.length ? (
            <OperationsGrid
              id="returns-stock"
              pagination
              paginationFilterKey={search}
              label="Полученные материалы для возврата"
              rows={visibleStock}
              rowId={(row) => row.receipt.id}
              columns={[
                {
                  id: 'name',
                  title: 'Материал',
                  value: (row) => row.name,
                  width: 260,
                },
                {
                  id: 'request',
                  title: 'Заявка',
                  value: (row) => row.request,
                  width: 260,
                },
                {
                  id: 'documents',
                  title: 'АПП / М-15',
                  value: (row) => row.documents,
                  width: 260,
                },
                {
                  id: 'date',
                  title: 'Дата получения',
                  value: (row) => displayDate(row.receipt.date),
                },
                {
                  id: 'received',
                  title: 'Поступило',
                  value: (row) => row.receipt.quantity,
                  numeric: true,
                },
                {
                  id: 'returned',
                  title: 'Возвращено',
                  value: (row) => row.balance.returned,
                  numeric: true,
                },
                {
                  id: 'stock',
                  title: 'На складе',
                  value: (row) => row.balance.stock,
                  numeric: true,
                },
                {
                  id: 'rejected',
                  title: 'Не принято к возврату',
                  value: (row) => row.balance.toReturn,
                  numeric: true,
                },
                {
                  id: 'available',
                  title: 'Можно вернуть как лишнее',
                  value: (row) => row.available,
                  numeric: true,
                },
                {
                  id: 'unit',
                  title: 'Единица',
                  value: (row) => row.receipt.projectUnit,
                },
                {
                  id: 'actions',
                  title: 'Действия',
                  value: () => '',
                  actions: true,
                  width: 200,
                  render: (row) => (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={row.available <= 0}
                      onClick={() => setSurplusReceiptId(row.receipt.id)}
                    >
                      Вернуть лишнее
                    </Button>
                  ),
                },
              ]}
            />
          ) : (
            <p className="p-8 text-center text-slate-500">
              {search
                ? 'Материалы по запросу не найдены.'
                : 'Получений пока нет.'}
            </p>
          )}
        </>
      )}
      {mode === 'history' &&
        (visibleHistory.length ? (
          <OperationsGrid
            id="returns-history"
            pagination
            paginationFilterKey={search}
            label="История возвратов заказчику"
            rows={visibleHistory}
            rowId={(row) => row.item.id}
            columns={[
              {
                id: 'date',
                title: 'Дата возврата',
                value: (row) => displayDate(row.item.date),
              },
              {
                id: 'name',
                title: 'Материал',
                value: (row) => row.name,
                width: 260,
              },
              {
                id: 'request',
                title: 'Заявка',
                value: (row) => row.request,
                width: 260,
              },
              {
                id: 'reason',
                title: 'Причина',
                value: (row) =>
                  row.item.kind === 'surplus'
                    ? 'Лишний материал'
                    : 'Не принято по ЗНИ',
              },
              {
                id: 'quantity',
                title: 'Возвращено',
                value: (row) => row.item.quantity,
                numeric: true,
              },
              { id: 'unit', title: 'Единица', value: (row) => row.unit },
              {
                id: 'alternative',
                title: 'Альтернативно',
                value: (row) => row.alternative.altQuantity,
                numeric: true,
              },
              {
                id: 'altUnit',
                title: 'Альтернативная единица',
                value: (row) => row.alternative.altUnit,
              },
              {
                id: 'restored',
                title: 'Снова к получению',
                value: (row) =>
                  row.item.kind === 'surplus' ? 0 : row.item.quantity,
                numeric: true,
              },
              { id: 'zni', title: 'ЗНИ', value: (row) => row.zni },
              {
                id: 'documents',
                title: 'АПП / М-15',
                value: (row) => row.documents,
              },
              {
                id: 'document',
                title: 'Документ возврата',
                value: (row) => row.item.documentNumber,
              },
              {
                id: 'note',
                title: 'Примечание',
                value: (row) => row.item.note,
              },
            ]}
          />
        ) : (
          <p className="p-8 text-center text-slate-500">
            {search
              ? 'Возвраты по запросу не найдены.'
              : 'Фактических возвратов пока нет.'}
          </p>
        ))}
      {entry && (
        <CustomerReturnModal
          entry={entry}
          workflow={workflow}
          receipts={receipts}
          lines={lines}
          onClose={() => setReturnCaseId(null)}
          onSave={(next) => {
            onChange(next)
            setReturnCaseId(null)
          }}
        />
      )}
      {surplusReceipt && (
        <SurplusReturnModal
          key={surplusReceipt.id}
          receipt={surplusReceipt}
          name={describe(surplusReceipt).name}
          available={available.get(surplusReceipt.id) ?? 0}
          line={findInspectionMaterial(lines, surplusReceipt.projectLineId)}
          onClose={() => setSurplusReceiptId(null)}
          onSave={(quantity, date, documentNumber, note) => {
            onChange(
              recordSurplusReturn(
                workflow,
                receipts,
                issues,
                [{ receiptId: surplusReceipt.id, quantity }],
                date,
                documentNumber,
                note,
              ),
            )
            setSurplusReceiptId(null)
          }}
        />
      )}
    </section>
  )
}

function SurplusReturnModal({
  receipt,
  name,
  available,
  line,
  onClose,
  onSave,
}: {
  receipt: Receipt
  name: string
  available: number
  line?: SubobjectMaterialMetric
  onClose: () => void
  onSave: (
    quantity: number,
    date: string,
    document: string,
    note: string,
  ) => void
}) {
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(localToday())
  const [documentNumber, setDocumentNumber] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const saving = useRef(false)
  const amount = Number(quantity.trim().replace(/\s/g, '').replace(',', '.'))
  const alternative = getOperationAlternative(
    Number.isFinite(amount) ? amount : 0,
    getOperationConversion(line, receipt.projectUnit, receipt),
    receipt,
  )
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-auto bg-black/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Возврат лишнего материала"
        className="grid max-h-[90vh] w-full max-w-xl gap-4 overflow-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-xl font-semibold">Возврат лишнего материала</h2>
        <p>
          {name} · доступно {fmt(available)} {receipt.projectUnit}
        </p>
        <p className="text-sm text-slate-600">
          После сохранения складской остаток уменьшится. Остаток к получению по
          заявке не изменится.
        </p>
        <label>
          Дата возврата
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          Возвращаемое количество
          <Input
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        {!alternative.error && alternative.altQuantity !== null && (
          <p className="text-sm text-slate-500">
            {fmt(alternative.altQuantity)} {alternative.altUnit}
          </p>
        )}
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
                if (alternative.error) throw new Error(alternative.error)
                onSave(amount, date, documentNumber, note)
              } catch (cause) {
                saving.current = false
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Не удалось сохранить возврат.',
                )
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
