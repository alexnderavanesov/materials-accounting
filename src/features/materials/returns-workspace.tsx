import { formatCalendarDate } from './calendar-date'
import { DateInput } from '#/components/ui/date-input'
import { Undo2 } from 'lucide-react'
import { RowActionButton } from '#/components/ui/row-action'
import { WorkflowDialog } from './workflow-dialog'
import type { ProjectReturnTarget } from './project-changes-ui'
import type { StockTransfer } from './project-change-types'
import { stockAssignmentKey } from './project-change-types'
import { stockAssignments } from './stock-assignments'
import { useDocumentNumber } from './document-numbering-context'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { assignedOperationIndicators } from './operation-overview-indicators'
import type { OperationIndicatorIndex } from './operation-overview-indicators'
import {
  emptyOperationListView,
  emptyReceiptPriority,
  matchesOperationMaterial,
  operationMaterial,
  sortOperationsNewestFirst,
} from './operation-list-view'
import type { OperationListView, ReceiptPriority } from './operation-list-view'
import {
  currentInspection,
  customerReturnReason,
  emptyQualityWorkflow,
  findInspectionMaterial,
  indexInspectionMaterials,
  localToday,
  pendingCustomerReturns,
  rejectedReturnsByCase,
  rejectedReturnAllocations,
  recordSurplusReturn,
  surplusReturnSources,
} from './quality-workflow'
import type {
  inspectionApprovals,
  QualityWorkflow,
  ReturnIssue,
} from './quality-workflow'
import type { SubobjectMaterialMetric } from './types'
import { useWorkspaceViewState } from './workspace-view'

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
const displayDate = (value: string) => formatCalendarDate(value)

export function ReturnsWorkspace({
  projectReturnTarget,
  onClearProjectReturnTarget,
  stockTransfers,
  indicatorIndex,
  search = '',
  listView = emptyOperationListView,
  priority = emptyReceiptPriority,
  value,
  receipts,
  requests,
  controls,
  issues,
  lines,
  onChange,
}: {
  projectReturnTarget?: ProjectReturnTarget | null
  onClearProjectReturnTarget?: () => void
  stockTransfers?: StockTransfer[]
  indicatorIndex?: OperationIndicatorIndex
  search?: string
  listView?: OperationListView
  priority?: ReceiptPriority
  value?: QualityWorkflow
  receipts: Array<Receipt>
  requests: Array<{
    id: string
    number: string
    cipher?: string
    materialType?: string
  }>
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
  const [returnCaseId, setReturnCaseId] = useState<string | null>(null)
  const [surplusReceiptId, setSurplusReceiptId] = useState<string | null>(null)
  const [surplusLineId, setSurplusLineId] = useState<string | null>(null)
  useEffect(() => {
    if (projectReturnTarget) setMode('stock')
  }, [projectReturnTarget, setMode])
  const entry = workflow.cases.find((item) => item.id === returnCaseId)
  const originalSurplusReceipt = receipts.find(
    (item) => item.id === surplusReceiptId,
  )
  const surplusReceipt = originalSurplusReceipt
    ? {
        ...originalSurplusReceipt,
        projectLineId: surplusLineId ?? originalSurplusReceipt.projectLineId,
      }
    : undefined
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
      requests.map((request) => [request.id, request]),
    )
    const documentById = indexReceiptDocuments(workflow)
    const materialById = indexInspectionMaterials(lines)
    const caseById = new Map(workflow.cases.map((item) => [item.id, item]))
    const describeReceipt = (receipt?: Receipt) => {
      const line = receipt ? materialById.get(receipt.projectLineId) : undefined
      const request = receipt ? requestById.get(receipt.requestId) : undefined
      return {
        name: receipt?.actualName || line?.projectMaterialName || 'Материал',
        request: receipt ? (request?.number ?? 'Заявка удалена') : '',
        ...operationMaterial(
          line,
          line ? { ...request, cipher: line.cipher } : request,
        ),
        normativeDocument: line?.normativeDocument ?? '',
        alloy: line?.material ?? '',
        documents: receipt
          ? documentsForReceipt(receipt, workflow, documentById)
              .map(receiptDocumentLabel)
              .join('; ')
          : '',
      }
    }
    const rejectedReturns = rejectedReturnsByCase(workflow)
    const returnAllocations = rejectedReturnAllocations(workflow)
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
    const assignments = stockAssignments({
      materialReceipts: receipts,
      materialIssues: issues,
      qualityWorkflow: workflow,
      stockTransfers,
    })
    const ownersByReceipt = new Map<
      string,
      Array<typeof assignments extends Map<string, infer V> ? V : never>
    >()
    for (const owner of assignments.values()) {
      const owners = ownersByReceipt.get(owner.receiptId) ?? []
      owners.push(owner)
      ownersByReceipt.set(owner.receiptId, owners)
    }
    const transferredReceipts = new Set(
      stockTransfers?.map((item) => item.receiptId),
    )
    const ownerAvailable = new Map<string, number>()
    const stockRows = receipts.flatMap((original) => {
      const owners = transferredReceipts.has(original.id)
        ? (ownersByReceipt.get(original.id) ?? [])
        : []
      return (
        owners.length
          ? owners.map((owner) => ({
              receipt: { ...original, projectLineId: owner.projectLineId },
              owner,
            }))
          : [{ receipt: original, owner: undefined }]
      ).map(({ receipt, owner }) => {
        const key = stockAssignmentKey(receipt.id, receipt.projectLineId)
        const amount = Math.max(
          0,
          Math.min(
            availableByReceipt.get(receipt.id) ?? 0,
            owner ? owner.stock - owner.quarantined : Infinity,
          ),
        )
        ownerAvailable.set(key, amount)
        return {
          key: owner ? key : receipt.id,
          receipt,
          ...describeReceipt(receipt),
          balance: {
            ...balances.get(receipt.id)!,
            ...(owner ? { stock: owner.stock } : {}),
          },
          available: amount,
        }
      })
    })
    const historyRows = [...(workflow.customerReturns ?? [])]
      .reverse()
      .map((item) => {
        const original = receiptById.get(item.receiptId)
        const receipt = original
          ? {
              ...original,
              projectLineId: item.projectLineId ?? original.projectLineId,
            }
          : undefined
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
          reason: customerReturnReason(
            item,
            item.caseId ? caseById.get(item.caseId) : undefined,
            returnAllocations.get(item.id),
          ),
          unit: receipt?.projectUnit ?? '',
          alternative,
          zni: zni ?? '',
        }
      })
    return {
      pending: sortOperationsNewestFirst(
        pendingRows,
        ({ entry: inspection }) => {
          const zni = currentInspection(inspection).zni
          return zni.signedOn || zni.date
        },
      ),
      stock: sortOperationsNewestFirst(
        stockRows,
        ({ receipt }) => receipt.date,
      ),
      history: sortOperationsNewestFirst(historyRows, ({ item }) => item.date),
      describe: describeReceipt,
      available: ownerAvailable,
    }
  }, [workflow, receipts, requests, controls, issues, lines, stockTransfers])
  const matches = (values: Array<unknown>) =>
    values
      .join(' ')
      .toLocaleLowerCase('ru')
      .includes(search.trim().toLocaleLowerCase('ru'))
  const visiblePending = pending.filter(
    (row) =>
      matches([
        row.name,
        row.request,
        row.cipher,
        row.documents,
        row.zni,
        row.materialType,
        row.normativeDocument,
        row.alloy,
      ]) && matchesOperationMaterial(row, listView),
  )
  const visibleStock = stock.filter(
    (row) =>
      (!projectReturnTarget ||
        row.receipt.projectLineId === projectReturnTarget.projectLineId) &&
      matches([
        row.name,
        row.request,
        row.cipher,
        row.documents,
        row.materialType,
        row.normativeDocument,
        row.alloy,
        row.receipt.date,
        displayDate(row.receipt.date),
      ]) &&
      matchesOperationMaterial(row, listView),
  )
  const visibleHistory = history.filter(
    (row) =>
      matches([
        row.name,
        row.request,
        row.cipher,
        row.documents,
        row.materialType,
        row.normativeDocument,
        row.alloy,
        row.zni,
        row.item.documentNumber,
        row.item.note,
        row.item.date,
        displayDate(row.item.date),
        row.reason,
      ]) && matchesOperationMaterial(row, listView),
  )
  return (
    <section className="min-w-0 p-4" aria-label="Возврат заказчику">
      {projectReturnTarget && (
        <div className="mb-3 flex items-center justify-between rounded bg-slate-50 p-3 text-sm">
          <span>
            Возврат излишка по ИЗМ · {fmt(projectReturnTarget.quantity)}.
            Выберите исходную партию.
          </span>
          <Button
            variant="ghost"
            onClick={() => onClearProjectReturnTarget?.()}
          >
            Показать все возвраты
          </Button>
        </div>
      )}
      <div className="my-4 flex flex-wrap gap-2">
        <Button
          variant={mode === 'rejected' ? 'default' : 'outline'}
          onClick={() => setMode('rejected')}
        >
          Не принято по ЗНИ / АВК ({pending.length})
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
      {mode === 'rejected' &&
        (visiblePending.length ? (
          <OperationsGrid
            id="returns-pending"
            indicators={
              indicatorIndex && {
                values: (row) =>
                  indicatorIndex.byReceipt.get(row.row.receiptId),
                unit: (row) => row.row.unit,
                existing: { toReturn: 'quantity' },
              }
            }
            pagination
            paginationFilterKey={JSON.stringify([search, listView])}
            priorityRow={
              priority.key
                ? (row) => priority.ids.has(row.row.receiptId)
                : undefined
            }
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
                width: 96,
                render: (row) => (
                  <RowActionButton
                    iconOnly
                    aria-label="Оформить возврат"
                    onClick={() => setReturnCaseId(row.entry.id)}
                  >
                    <Undo2 size={14} aria-hidden="true" />
                  </RowActionButton>
                ),
              },
            ]}
          />
        ) : (
          <p className="rounded-lg border border-dashed p-8 text-center text-slate-500">
            {search || listView.cipher || listView.materialType
              ? 'Материалы по запросу не найдены.'
              : 'Непринятых материалов к возврату нет.'}
          </p>
        ))}
      {mode === 'stock' && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Возвращать можно оставшееся на складе количество. Для позиций в
            неподписанной ЗНИ сначала удалите черновик и создайте его заново на
            нужное количество. Для непринятого материала используйте раздел «Не
            принято по ЗНИ / АВК».
          </p>
          {visibleStock.length ? (
            <OperationsGrid
              id="returns-stock"
              indicators={
                indicatorIndex && {
                  values: (row) =>
                    assignedOperationIndicators(
                      indicatorIndex,
                      row.receipt.id,
                      row.receipt.projectLineId,
                    ),
                  unit: (row) => row.receipt.projectUnit,
                  existing: {
                    received: 'received',
                    returned: 'returned',
                    toReturn: 'rejected',
                  },
                }
              }
              pagination
              paginationFilterKey={JSON.stringify([search, listView])}
              priorityRow={
                priority.key
                  ? (row) => priority.ids.has(row.receipt.id)
                  : undefined
              }
              label="Полученные материалы для возврата"
              rows={visibleStock}
              rowId={(row) => row.key}
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
                  date: true,
                  title: 'Дата получения',
                  value: (row) => row.receipt.date,
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
                  value: (row) =>
                    Math.min(
                      row.available,
                      projectReturnTarget?.quantity ?? Infinity,
                    ),
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
                  width: 96,
                  render: (row) => (
                    <RowActionButton
                      iconOnly
                      aria-label="Вернуть лишнее"
                      disabled={row.available <= 0}
                      onClick={() => {
                        setSurplusReceiptId(row.receipt.id)
                        setSurplusLineId(row.receipt.projectLineId)
                      }}
                    >
                      <Undo2 size={14} aria-hidden="true" />
                    </RowActionButton>
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
            indicators={
              indicatorIndex && {
                values: (row) =>
                  assignedOperationIndicators(
                    indicatorIndex,
                    row.item.receiptId,
                    row.item.projectLineId,
                  ),
                unit: (row) => row.unit,
                existing: { returned: 'quantity' },
              }
            }
            pagination
            paginationFilterKey={JSON.stringify([search, listView])}
            priorityRow={
              priority.key
                ? (row) => priority.ids.has(row.item.receiptId)
                : undefined
            }
            label="История возвратов заказчику"
            rows={visibleHistory}
            rowId={(row) => row.item.id}
            columns={[
              {
                id: 'date',
                date: true,
                title: 'Дата возврата',
                value: (row) => row.item.date,
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
                value: (row) => row.reason,
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
          available={Math.min(
            available.get(
              stockAssignmentKey(
                surplusReceipt.id,
                surplusReceipt.projectLineId,
              ),
            ) ?? 0,
            projectReturnTarget?.projectLineId === surplusReceipt.projectLineId
              ? projectReturnTarget.quantity
              : Infinity,
          )}
          line={findInspectionMaterial(lines, surplusReceipt.projectLineId)}
          onClose={() => setSurplusReceiptId(null)}
          onSave={(quantity, date, documentNumber, note) => {
            const limit =
              available.get(
                stockAssignmentKey(
                  surplusReceipt.id,
                  surplusReceipt.projectLineId,
                ),
              ) ?? 0
            if (
              quantity > limit ||
              (projectReturnTarget &&
                (surplusReceipt.projectLineId !==
                  projectReturnTarget.projectLineId ||
                  quantity > projectReturnTarget.quantity))
            )
              throw new Error(
                'Количество превышает доступный излишек этого шифра.',
              )
            const next = recordSurplusReturn(
              workflow,
              receipts,
              issues,
              [
                {
                  receiptId: surplusReceipt.id,
                  quantity,
                  approvedOnly:
                    receipts.find((item) => item.id === surplusReceipt.id)
                      ?.projectLineId !== surplusReceipt.projectLineId,
                },
              ],
              date,
              documentNumber,
              note,
            )
            const existing = new Set(
              workflow.customerReturns?.map((item) => item.id),
            )
            next.customerReturns = next.customerReturns?.map((item) =>
              existing.has(item.id)
                ? item
                : {
                    ...item,
                    projectLineId: surplusReceipt.projectLineId,
                    ...(projectReturnTarget
                      ? {
                          projectChangeId: projectReturnTarget.projectChangeId,
                          projectChangeItemId:
                            projectReturnTarget.projectChangeItemId,
                        }
                      : {}),
                  },
            )
            onChange(next)
            setSurplusReceiptId(null)
            onClearProjectReturnTarget?.()
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
  const [step, setStep] = useState(0)
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(localToday())
  const suggestNumber = useDocumentNumber()
  const [manualNumber, setDocumentNumber] = useState<string | null>(null)
  const documentNumber =
    manualNumber ??
    suggestNumber('return', {
      date,
      cipher: line?.cipher,
      materialType: line?.materialType ?? undefined,
    })
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const saving = useRef(false)
  const amount = Number(quantity.trim().replace(/\s/g, '').replace(',', '.'))
  const alternative = getOperationAlternative(
    Number.isFinite(amount) ? amount : 0,
    getOperationConversion(line, receipt.projectUnit, receipt),
    receipt,
  )
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
    if (
      next > 1 &&
      (!Number.isFinite(amount) ||
        amount <= 0 ||
        amount > available ||
        alternative.error)
    ) {
      setError(
        alternative.error ||
          `Укажите положительное количество не больше ${fmt(available)} ${receipt.projectUnit}.`,
      )
      return
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
        {step < 2 ? 'Далее' : 'Сохранить фактический возврат'}
      </Button>
    </div>
  )
  return (
    <WorkflowDialog
      title="Возврат лишнего материала"
      onClose={onClose}
      step={step}
      onStep={advance}
      footer={footer}
    >
      <div className="grid gap-4">
        <p>
          {name} · доступно {fmt(available)} {receipt.projectUnit}
        </p>
        <p className="text-sm text-slate-600">
          После сохранения складской остаток уменьшится. Остаток к получению по
          заявке не изменится.
        </p>
        <label hidden={step !== 0}>
          Дата возврата
          <DateInput value={date} onValueChange={(value) => setDate(value)} />
        </label>
        <label hidden={step === 0}>
          Возвращаемое количество
          <Input
            inputMode="decimal"
            readOnly={step === 2}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        {!alternative.error && alternative.altQuantity !== null && (
          <p className="text-sm text-slate-500">
            {fmt(alternative.altQuantity)} {alternative.altUnit}
          </p>
        )}
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
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
    </WorkflowDialog>
  )
}
