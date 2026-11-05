import { materialNumberContext } from './document-numbering'
import { useDocumentNumber } from './document-numbering-context'
import { CustomerReturnModal } from './customer-return-modal'
import { customerReturnAlternative } from './receipt-balances'
import { receiptDocuments, receiptDocumentLabel } from './receipt-documents'
import { OperationsGrid } from './operations-grid'
import {
  emptyOperationListView,
  emptyReceiptPriority,
  matchesOperationMaterial,
  operationMaterial,
  prioritizeReceiptRows,
} from './operation-list-view'
import type { OperationListView, ReceiptPriority } from './operation-list-view'
import {
  OperationPagination,
  useOperationPagination,
} from './operation-pagination'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  activeInspection,
  canReopenInspection,
  deleteInspectionDocument,
  inspectionDeletionError,
  currentInspection,
  emptyQualityDefaults,
  emptyQualityWorkflow,
  findInspectionMaterial,
  indexInspectionMaterials,
  inspectionChecks,
  inspectionMatches,
  inspectionAvailableQuantities,
  localToday,
  newInspection,
  createAcceptedInspectionAct,
  pendingCustomerReturns,
  reopenInspection,
  resultLabels,
  signInspection,
} from './quality-workflow'
import type {
  InspectionCase,
  InspectionRevision,
  InspectionSelection,
  QualityDefaults,
  QualityDocument,
  QualityWorkflow,
} from './quality-workflow'
import type { SubobjectMaterialMetric } from './types'
import { QualityPrintButton, useQualityPrint } from './quality-print-ui'
import { InspectionActionsMenu } from './inspection-actions-menu'
import type { InspectionAction } from './inspection-actions-menu'
import { getOperationAlternative, getOperationConversion } from './domain'

type Receipt = {
  appDocumentId?: string
  m15DocumentId?: string
  id: string
  requestId: string
  projectLineId: string
  quantity: number
  projectUnit: string
  actualName: string
  factoryNumber: string
  heatBatch: string
  altUnit: string
  altUnitFactor?: number | null
  altQuantity: number | null
  date: string
  certificate?: string
  qualityDocument?: string
}
type Props = {
  requests?: Array<{
    id: string
    number: string
    cipher?: string
    materialType?: string
  }>
  value?: QualityWorkflow
  receipts: Array<Receipt>
  lines: Array<SubobjectMaterialMetric>
  onChange: (next: QualityWorkflow) => void
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось сохранить документ.'
const displayDate = (value: string | null) =>
  value ? value.split('-').reverse().join('.') : '—'
const fmt = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 9 }).format(value)
const labelNames: Record<keyof QualityDefaults, string> = {
  customer: 'Заказчик',
  generalContractor: 'Генподрядчик',
  contractor: 'Подрядчик',
  project: 'Объект строительства',
  location: 'Место инспекции',
  issuerRole: 'Должность составителя',
  issuerName: 'Составитель ЗНИ',
  customerRepresentative: 'Представитель заказчика',
  generalRepresentative: 'Представитель генподрядчика',
  contractorRepresentative: 'Представитель подрядчика',
  chairmanRole: 'Должность председателя комиссии',
  chairmanName: 'Председатель комиссии',
  contractorRole: 'Должность представителя подрядчика',
  generalRole: 'Должность представителя генподрядчика',
  customerRole: 'Должность представителя заказчика',
}
export function QualityModal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    return () => previous?.focus()
  }, [])
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      ref={ref}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
        if (event.key === 'Tab') {
          const elements = ref.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]',
          )
          const first = elements?.[0],
            last = elements?.[elements.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          }
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center border-b p-5">
          <h2 className="mr-auto text-xl font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Закрыть документ"
            onClick={onClose}
          >
            <X size={20} />
          </Button>
        </div>
        <div className="overflow-auto p-5">{children}</div>
      </div>
    </div>
  )
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  disabled?: boolean
}) {
  return (
    <label className="grid gap-1 text-sm text-slate-600">
      {label}
      <Input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
function TextField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <label className="grid gap-1 text-sm text-slate-600">
      {label}
      <textarea
        className="min-h-20 rounded-lg border p-2 text-slate-900"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
function DetailsFields({
  value,
  onChange,
  disabled,
}: {
  value: QualityDefaults
  onChange: (next: QualityDefaults) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Object.entries(labelNames).map(([key, label]) => (
        <Field
          key={key}
          label={label}
          value={value[key as keyof QualityDefaults]}
          disabled={disabled}
          onChange={(text) => onChange({ ...value, [key]: text })}
        />
      ))}
    </div>
  )
}
function DocumentsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: Array<QualityDocument>
  onChange: (next: Array<QualityDocument>) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-3">
      <h3 className="font-semibold">Документы качества</h3>
      {value.map((doc, index) => (
        <div
          className="grid gap-2 rounded-lg border p-3 md:grid-cols-5"
          key={doc.id}
        >
          {(['name', 'number', 'date', 'orderNumber'] as const).map(
            (key, i) => (
              <Field
                key={key}
                label={['Наименование', 'Номер', 'Дата', 'Номер заказа'][i]!}
                type={key === 'date' ? 'date' : 'text'}
                value={doc[key]}
                disabled={disabled}
                onChange={(text) =>
                  onChange(
                    value.map((entry, n) =>
                      n === index ? { ...entry, [key]: text } : entry,
                    ),
                  )
                }
              />
            ),
          )}
          {!disabled && (
            <Button
              variant="ghost"
              onClick={() => onChange(value.filter((_, n) => n !== index))}
            >
              Удалить документ
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button
          variant="outline"
          onClick={() =>
            onChange([
              ...value,
              {
                id: crypto.randomUUID(),
                name: '',
                number: '',
                date: '',
                orderNumber: '',
              },
            ])
          }
        >
          Добавить документ качества
        </Button>
      )}
    </div>
  )
}
function InspectionMaterialPicker({
  workflow,
  requests,
  receipts,
  lines,
  onCreate,
  onClose,
}: {
  requests: Array<{ id: string; number: string }>
  workflow: QualityWorkflow
  receipts: Array<Receipt>
  lines: Array<SubobjectMaterialMetric>
  onCreate: (selection: Array<InspectionSelection>, basisId: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [basisId, setBasisId] = useState('')
  const [documentKind, setDocumentKind] = useState<'app' | 'm15' | null>(null)
  const [error, setError] = useState('')
  const available = useMemo(
    () => inspectionAvailableQuantities(workflow, receipts),
    [workflow, receipts],
  )
  const materialById = useMemo(() => indexInspectionMaterials(lines), [lines])
  const requestById = new Map(requests.map((request) => [request.id, request]))
  const basis = receiptDocuments(workflow).find(
    (document) => document.id === basisId,
  )
  const allEligible = receipts.filter(
    (receipt) => (available.get(receipt.id) ?? 0) > 0,
  )
  const eligible = allEligible.filter(
    (receipt) =>
      receipt.appDocumentId === basisId || receipt.m15DocumentId === basisId,
  )
  const eligibleDocumentIds = new Set(
    allEligible.flatMap((receipt) => [
      receipt.appDocumentId,
      receipt.m15DocumentId,
    ]),
  )
  const availableDocuments = receiptDocuments(workflow).filter(
    (doc) => doc.kind === documentKind && eligibleDocumentIds.has(doc.id),
  )
  const query = search.trim().toLocaleLowerCase('ru')
  const visible = eligible.filter((receipt) => {
    const line = materialById.get(receipt.projectLineId)
    return [
      receipt.actualName,
      requestById.get(receipt.requestId)?.number,
      line?.cipher,
      line?.normativeDocument,
      receipt.factoryNumber,
      receipt.heatBatch,
      displayDate(receipt.date),
    ].some((value) => value?.toLocaleLowerCase('ru').includes(query))
  })
  const pagination = useOperationPagination(
    'inspection-selection',
    visible,
    JSON.stringify([basisId, query]),
  )
  return (
    <QualityModal title="Материалы для ЗНИ" onClose={onClose}>
      <div className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm text-slate-600">Тип документа</legend>
          <div className="flex gap-2">
            {(['app', 'm15'] as const).map((kind) => (
              <label
                key={kind}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-5 py-3 text-sm ${documentKind === kind ? 'border-slate-500 bg-slate-100' : 'border-slate-200'}`}
              >
                <input
                  type="radio"
                  name="inspection-document-kind"
                  value={kind}
                  checked={documentKind === kind}
                  onChange={() => {
                    setDocumentKind(kind)
                    setBasisId('')
                    setSelected({})
                    setSearch('')
                    setError('')
                  }}
                />
                {kind === 'app' ? 'АПП' : 'М-15'}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1 text-sm">
          {documentKind === 'app'
            ? 'АПП'
            : documentKind === 'm15'
              ? 'М-15'
              : 'Документ получения'}
          <select
            aria-label="Документ получения для ЗНИ"
            className="rounded-lg border p-2"
            disabled={!documentKind}
            value={basisId}
            onChange={(event) => {
              setBasisId(event.target.value)
              setSelected({})
              setSearch('')
              setError('')
            }}
          >
            <option value="">
              {documentKind
                ? `Выберите ${documentKind === 'app' ? 'АПП' : 'М-15'}`
                : 'Сначала выберите тип документа'}
            </option>
            {availableDocuments.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {receiptDocumentLabel(doc)}
              </option>
            ))}
          </select>
        </label>
        {documentKind && !availableDocuments.length && (
          <p className="text-sm text-slate-500">
            Нет документов этого типа с материалами, доступными для ЗНИ.
          </p>
        )}
        {basisId && (
          <>
            <Button
              variant="outline"
              disabled={!eligible.length}
              onClick={() =>
                setSelected(
                  Object.fromEntries(
                    eligible.map((receipt) => [
                      receipt.id,
                      String(available.get(receipt.id)),
                    ]),
                  ),
                )
              }
            >
              Выбрать все позиции документа
            </Button>
            <Input
              aria-label="Поиск материалов для ЗНИ"
              placeholder="Материал, заявка, шифр, партия или заводской номер"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <p className="text-sm text-slate-500">
              Выбрано поступлений: {Object.keys(selected).length}. Доступно:{' '}
              {eligible.length}.
            </p>
            <div
              ref={pagination.containerRef}
              className="grid max-h-[45vh] gap-2 overflow-auto"
            >
              {pagination.items.map((receipt) => {
                const line = materialById.get(receipt.projectLineId)
                const checked = selected[receipt.id] !== undefined
                return (
                  <div
                    key={receipt.id}
                    className={`grid gap-3 rounded-lg border p-3 ${checked ? 'border-blue-200 bg-blue-50/40' : ''}`}
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelected((current) => {
                            const next = { ...current }
                            if (event.target.checked)
                              next[receipt.id] = String(
                                available.get(receipt.id),
                              )
                            else delete next[receipt.id]
                            return next
                          })
                        }}
                      />
                      <span>
                        <span className="font-medium">
                          {receipt.actualName ||
                            line?.projectMaterialName ||
                            'Материал'}
                        </span>
                        <span className="block text-sm text-slate-500">
                          {line?.cipher || 'Без шифра'} ·{' '}
                          {displayDate(receipt.date)} ·{' '}
                          {requestById.get(receipt.requestId)?.number ||
                            'Заявка удалена'}{' '}
                          · Партия {receipt.heatBatch || '—'} · Зав. №{' '}
                          {receipt.factoryNumber || '—'}
                        </span>
                        <span className="block text-sm">
                          Получено: {fmt(receipt.quantity)}{' '}
                          {receipt.projectUnit}. Доступно для ЗНИ:{' '}
                          {fmt(available.get(receipt.id) ?? 0)}{' '}
                          {receipt.projectUnit}.
                        </span>
                      </span>
                    </label>
                    {checked && (
                      <Field
                        label={`Количество для ЗНИ: ${receipt.actualName} (${basis ? receiptDocumentLabel(basis) : ''}), ${receipt.projectUnit}`}
                        value={selected[receipt.id]!}
                        onChange={(amount) => {
                          setSelected({ ...selected, [receipt.id]: amount })
                        }}
                      />
                    )}
                  </div>
                )
              })}
              {!visible.length && (
                <p className="rounded-lg border border-dashed p-5 text-slate-500">
                  {eligible.length
                    ? 'Материалы по запросу не найдены.'
                    : 'Все позиции документа уже включены в ЗНИ.'}
                </p>
              )}
            </div>
            <OperationPagination
              pagination={pagination}
              label="Материалы для ЗНИ"
            />
          </>
        )}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button
          disabled={!basisId || !Object.keys(selected).length}
          onClick={() => {
            try {
              onCreate(
                Object.entries(selected).map(([receiptId, amount]) => ({
                  receiptId,
                  quantity: Number(
                    amount.trim().replace(/\s/g, '').replace(',', '.'),
                  ),
                })),
                basisId,
              )
            } catch (cause) {
              setError(message(cause))
            }
          }}
        >
          Продолжить с выбранными материалами
        </Button>
      </div>
    </QualityModal>
  )
}

function canCreateAct(entry: InspectionCase) {
  const rev = currentInspection(entry)
  return (
    !!rev.zni.signedOn &&
    !rev.avk &&
    rev.zni.rows.some((row) => (row.accepted ?? 0) > 0)
  )
}

function InspectionActPicker({
  cases,
  onSelect,
  onClose,
}: {
  cases: Array<InspectionCase>
  onSelect: (entry: InspectionCase) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const eligible = cases.filter(canCreateAct)
  const query = search.trim().toLocaleLowerCase('ru')
  const visible = eligible.filter((entry) => inspectionMatches(entry, query))
  const pagination = useOperationPagination(
    'inspection-act-selection',
    visible,
    query,
  )
  return (
    <QualityModal title="Создать АВК" onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          Выберите подписанную ЗНИ. В акт войдут только принятые материалы.
        </p>
        {!!eligible.length && (
          <Input
            aria-label="Поиск ЗНИ для АВК"
            placeholder="Номер ЗНИ, документ или материал"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        <div ref={pagination.containerRef} className="grid gap-2">
          {pagination.items.map((entry) => {
            const rev = currentInspection(entry)
            return (
              <button
                key={entry.id}
                type="button"
                className="rounded-lg border border-slate-200 p-4 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-500"
                onClick={() => onSelect(entry)}
              >
                <span className="block font-medium">ЗНИ №{rev.zni.number}</span>
                <span className="mt-1 block text-sm text-slate-500">
                  {receiptDocumentLabel(entry.basis)} · Подписана{' '}
                  {displayDate(rev.zni.signedOn)}
                </span>
                <span className="mt-1 block text-sm text-slate-600">
                  Принято позиций:{' '}
                  {rev.zni.rows.filter((row) => (row.accepted ?? 0) > 0).length}
                </span>
              </button>
            )
          })}
          {!visible.length && (
            <p className="rounded-lg border border-dashed p-6 text-center text-slate-500">
              {eligible.length
                ? 'ЗНИ по запросу не найдены.'
                : 'Нет ЗНИ, ожидающих АВК. Нужна подписанная ЗНИ с принятыми материалами, для которой акт ещё не создан.'}
            </p>
          )}
        </div>
        {pagination.total > pagination.pageSize && (
          <OperationPagination pagination={pagination} label="ЗНИ для АВК" />
        )}
      </div>
    </QualityModal>
  )
}

export function InspectionWorkspace({
  value,
  requests = [],
  receipts,
  lines,
  onChange,
  prepare,
  search = '',
  focusId,
  listView = emptyOperationListView,
  priority = emptyReceiptPriority,
  issues = [],
}: Props & {
  issues?: ReadonlyArray<{ receiptId?: unknown }>
  prepare: () => Promise<string>
  search?: string
  focusId?: string
  listView?: OperationListView
  priority?: ReceiptPriority
}) {
  const suggestNumber = useDocumentNumber()
  const printing = useQualityPrint(prepare)
  const [choosingAct, setChoosingAct] = useState(false)
  const [editorKind, setEditorKind] = useState<'zni' | 'avk'>('zni')
  const workflow = value ?? emptyQualityWorkflow()
  const numberMaterials = useMemo(
    () => indexInspectionMaterials(lines),
    [lines],
  )
  const materialByReceipt = useMemo(() => {
    const requestById = new Map(
      requests.map((request) => [request.id, request]),
    )
    return new Map(
      receipts.map((receipt) => [
        receipt.id,
        operationMaterial(
          numberMaterials.get(receipt.projectLineId),
          requestById.get(receipt.requestId),
        ),
      ]),
    )
  }, [requests, receipts, numberMaterials])
  function numberContext(rev: InspectionRevision, kind: 'zni' | 'avk') {
    const rows =
      kind === 'avk'
        ? rev.zni.rows.filter((row) => (row.accepted ?? 0) > 0)
        : rev.zni.rows
    return materialNumberContext(
      rows.map((row) => {
        const line = numberMaterials.get(row.projectLineId)
        return {
          cipher: row.cipher,
          materialType: line?.materialType || line?.category,
        }
      }),
    )
  }
  function makeAct(entry: InspectionCase) {
    const rev = currentInspection(entry)
    const act = createAcceptedInspectionAct(entry, rev.zni.documents)
    if (!act.number)
      act.number = suggestNumber('avk', {
        date: act.date,
        ...numberContext(rev, 'avk'),
      })
    return act
  }
  const [returnCase, setReturnCase] = useState<InspectionCase | null>(null)
  const [draft, setDraft] = useState<InspectionCase | null>(null),
    [error, setError] = useState(''),
    [choosingMaterials, setChoosingMaterials] = useState(false),
    [history, setHistory] = useState<InspectionCase | null>(null)
  const [signing, setSigning] = useState<{
    entry: InspectionCase
    kind: 'zni' | 'avk'
    date: string
  } | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const save = (entry: InspectionCase) => {
    onChange({
      ...workflow,
      cases: [...workflow.cases.filter((item) => item.id !== entry.id), entry],
    })
  }
  const run = (action: () => void) => {
    setError('')
    try {
      action()
    } catch (cause) {
      setError(message(cause))
    }
  }
  const updateRevision = (revision: InspectionRevision) => {
    if (!draft) return
    const previous = currentInspection(draft)
    const stored = workflow.cases.find((entry) => entry.id === draft.id)
    for (const kind of ['zni', 'avk'] as const) {
      const old = previous[kind],
        next = revision[kind]
      // Date tokens follow an unsaved, automatically suggested number only.
      if (
        !old ||
        !next ||
        old.date === next.date ||
        old.number !== next.number ||
        stored?.revisions.some((rev) => rev[kind])
      )
        continue
      if (
        old.number ===
        suggestNumber(kind, {
          date: old.date,
          ...numberContext(previous, kind),
        })
      ) {
        revision = {
          ...revision,
          [kind]: {
            ...next,
            number: suggestNumber(kind, {
              date: next.date,
              ...numberContext(revision, kind),
            }),
          },
        }
      }
    }
    setDraft({
      ...draft,
      revisions: [...draft.revisions.slice(0, -1), revision],
    })
  }
  const openAct = (entry: InspectionCase) =>
    run(() => {
      const next = structuredClone(entry)
      currentInspection(next).avk = makeAct(next)
      setEditorKind('avk')
      setDraft(next)
      setChoosingAct(false)
    })
  const revision = draft && currentInspection(draft)
  useEffect(() => {
    const entry = value?.cases.find((item) =>
      focusId?.startsWith(`inspection:${item.id}:`),
    )
    if (entry) {
      setExpanded((current) => ({ ...current, [entry.id]: true }))
      window.requestAnimationFrame(() => {
        document
          .getElementById(`inspection-case-${entry.id}`)
          ?.scrollIntoView({ block: 'center' })
      })
    }
  }, [focusId, value])
  const visible = prioritizeReceiptRows(
    workflow.cases.filter((entry) => {
      const rows = currentInspection(entry).zni.rows
      const materialMatches = rows.some((row) =>
        matchesOperationMaterial(
          {
            ...(materialByReceipt.get(row.receiptId) ??
              operationMaterial(numberMaterials.get(row.projectLineId))),
            cipher: row.cipher,
          },
          listView,
        ),
      )
      const materialSearchMatches = rows.some((row) => {
        const line = numberMaterials.get(row.projectLineId)
        return [
          (materialByReceipt.get(row.receiptId) ?? operationMaterial(line))
            .materialType,
          line?.projectMaterialName,
          line?.normativeDocument,
          line?.material,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('ru')
          .includes(search.trim().toLocaleLowerCase('ru'))
      })
      return (
        materialMatches &&
        (inspectionMatches(entry, search) || materialSearchMatches)
      )
    }),
    priority,
    (entry) => currentInspection(entry).zni.rows.map((row) => row.receiptId),
  )
  const pagination = useOperationPagination(
    'quality',
    visible,
    JSON.stringify([search, listView]),
    {
      key: focusId,
      index: visible.findIndex((entry) =>
        focusId?.startsWith(`inspection:${entry.id}:`),
      ),
    },
  )

  return (
    <section className="grid gap-4 p-4">
      <div
        ref={pagination.containerRef}
        className="flex scroll-mt-[32rem] flex-wrap gap-3 md:scroll-mt-48 xl:scroll-mt-32"
      >
        <Button
          onClick={() => {
            setError('')
            setChoosingMaterials(true)
          }}
        >
          Создать ЗНИ
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setError('')
            setChoosingAct(true)
          }}
        >
          Создать АВК
        </Button>
      </div>
      {printing.busy && (
        <p role="status" className="text-sm text-slate-500">
          Формирование печатного документа…
        </p>
      )}
      {printing.output}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {!visible.length && (
        <p className="rounded-lg border border-dashed p-8 text-center text-slate-500">
          {workflow.cases.length
            ? 'Документы по запросу не найдены.'
            : 'ЗНИ ещё нет. Создайте её по полученным материалам.'}
        </p>
      )}
      {pagination.items.map((entry) => {
        const rev = currentInspection(entry),
          active = activeInspection(entry)
        const returns = pendingCustomerReturns(workflow, entry)
        const actions: Array<InspectionAction> = [
          {
            label: rev.avk?.signedOn ? 'Просмотр' : 'Открыть документы',
            onSelect: () => {
              setError('')
              setEditorKind('zni')
              setDraft(structuredClone(entry))
            },
          },
          {
            label: 'Печать ЗНИ',
            onSelect: () =>
              void printing.print({
                kind: 'zni',
                caseId: entry.id,
                revision: rev.revision,
              }),
          },
        ]
        if (rev.avk)
          actions.push({
            label: 'Печать АВК',
            onSelect: () =>
              void printing.print({
                kind: 'avk',
                caseId: entry.id,
                revision: rev.revision,
              }),
          })
        if (!rev.zni.signedOn)
          actions.push({
            label: 'Подписать ЗНИ',
            onSelect: () => {
              setError('')
              setSigning({ entry, kind: 'zni', date: localToday() })
            },
          })
        if (canCreateAct(entry))
          actions.push({ label: 'Создать АВК', onSelect: () => openAct(entry) })
        if (rev.avk && !rev.avk.signedOn && rev.zni.signedOn)
          actions.push({
            label: 'Подписать АВК',
            onSelect: () => {
              setError('')
              setSigning({ entry, kind: 'avk', date: localToday() })
            },
          })
        if (returns.length)
          actions.push({
            label: 'Оформить возврат заказчику',
            onSelect: () => setReturnCase(entry),
          })
        actions.push({ label: 'История', onSelect: () => setHistory(entry) })
        if (
          canReopenInspection(entry) &&
          !(workflow.customerReturns ?? []).some(
            (item) => item.caseId === entry.id,
          )
        )
          actions.push({
            label: 'Повторная проверка',
            onSelect: () =>
              run(() => {
                const next = reopenInspection(entry)
                save(next)
                setEditorKind('zni')
                setDraft(next)
              }),
          })
        for (const kind of rev.avk
          ? (['avk', 'zni'] as const)
          : (['zni'] as const))
          actions.push({
            label: kind === 'avk' ? 'Удалить АВК' : 'Удалить ЗНИ',
            destructive: true,
            onSelect: () =>
              run(() => {
                const blocked = inspectionDeletionError(
                  entry,
                  kind,
                  workflow,
                  issues,
                )
                if (blocked) throw new Error(blocked)
                const description =
                  kind === 'avk'
                    ? `Удалить АВК №${rev.avk!.number}? ЗНИ останется подписанной. Материал будет ожидать нового АВК.`
                    : `Удалить ЗНИ №${rev.zni.number}? Получение сохранится, материал снова будет доступен для инспекции.`
                if (window.confirm(description))
                  onChange(
                    deleteInspectionDocument(workflow, entry.id, kind, issues),
                  )
              }),
          })
        return (
          <article
            key={entry.id}
            id={`inspection-case-${entry.id}`}
            className={`rounded-xl border p-4 ${rev.avk?.signedOn ? 'border-emerald-200 bg-emerald-50/40' : 'bg-white'}`}
          >
            <div className="flex items-start gap-3">
              <Button
                size="icon"
                variant="outline"
                className="shrink-0"
                aria-label={`Материалы ЗНИ ${rev.zni.number}`}
                aria-expanded={!!expanded[entry.id]}
                onClick={() =>
                  setExpanded({ ...expanded, [entry.id]: !expanded[entry.id] })
                }
              >
                <ChevronDown
                  size={16}
                  className={expanded[entry.id] ? 'rotate-180' : ''}
                />
              </Button>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">ЗНИ №{rev.zni.number}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {displayDate(rev.zni.date)} · {rev.zni.rows.length} поз. ·{' '}
                  {receiptDocumentLabel(entry.basis)}
                  {rev.revision > 1 ? ` · Ревизия ${rev.revision}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded-md px-2 py-1 ${rev.zni.signedOn ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {rev.zni.signedOn
                      ? `ЗНИ подписана ${displayDate(rev.zni.signedOn)}`
                      : 'ЗНИ в работе'}
                  </span>
                  <span
                    className={`rounded-md px-2 py-1 ${rev.avk?.signedOn ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {rev.avk
                      ? `АВК №${rev.avk.number || '…'} · ${rev.avk.signedOn ? `подписан ${displayDate(rev.avk.signedOn)}` : 'в работе'}`
                      : rev.zni.signedOn
                        ? canCreateAct(entry)
                          ? 'Ожидает АВК'
                          : 'Нет принятых материалов'
                        : 'АВК после подписания ЗНИ'}
                  </span>
                  {returns.length > 0 && (
                    <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                      К возврату: {returns.length} поз.
                    </span>
                  )}
                </div>
                {active && active.revision !== rev.revision && (
                  <p className="mt-1 text-sm text-slate-500">
                    Действует АВК ревизии {active.revision}
                  </p>
                )}
              </div>
              <InspectionActionsMenu
                number={rev.zni.number}
                actions={actions}
              />
            </div>
            {expanded[entry.id] && (
              <>
                <InspectionRows
                  gridId={`inspection:${entry.id}:${rev.revision}`}
                  revision={rev}
                  lines={lines}
                  receipts={receipts}
                />
                {returns.length > 0 && (
                  <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    К возврату:{' '}
                    {returns
                      .map(
                        (item) =>
                          `${item.row.name}: ${fmt(item.quantity)} ${item.row.unit}`,
                      )
                      .join('; ')}
                  </p>
                )}
                {(workflow.customerReturns ?? [])
                  .filter((item) => item.caseId === entry.id)
                  .map((item) => {
                    const row = rev.zni.rows.find(
                      (candidate) => candidate.receiptId === item.receiptId,
                    )!
                    const alternative = customerReturnAlternative(
                      item.quantity,
                      row,
                      receipts.find((receipt) => receipt.id === item.receiptId),
                      findInspectionMaterial(lines, row.projectLineId),
                    )
                    return (
                      <p key={item.id} className="mt-2 text-sm text-slate-600">
                        Возвращено {displayDate(item.date)} (
                        {item.kind === 'surplus'
                          ? 'лишний материал'
                          : 'не принято по ЗНИ'}
                        ): {row.name} — {fmt(item.quantity)} {row.unit}
                        {!alternative.error &&
                          alternative.altQuantity !== null && (
                            <>
                              {' '}
                              ({fmt(alternative.altQuantity)}{' '}
                              {alternative.altUnit})
                            </>
                          )}
                        . {item.documentNumber} {item.note}
                      </p>
                    )
                  })}
              </>
            )}
          </article>
        )
      })}
      {pagination.total > 0 && (
        <OperationPagination pagination={pagination} label="Входной контроль" />
      )}
      {choosingAct && (
        <InspectionActPicker
          cases={workflow.cases}
          onSelect={openAct}
          onClose={() => setChoosingAct(false)}
        />
      )}
      {returnCase && (
        <CustomerReturnModal
          entry={returnCase}
          workflow={workflow}
          receipts={receipts}
          lines={lines}
          onClose={() => setReturnCase(null)}
          onSave={(next) => {
            onChange(next)
            setReturnCase(null)
          }}
        />
      )}
      {choosingMaterials && (
        <InspectionMaterialPicker
          workflow={workflow}
          requests={requests}
          receipts={receipts}
          lines={lines}
          onClose={() => setChoosingMaterials(false)}
          onCreate={(selection, basisId) => {
            const created = newInspection(
              workflow,
              selection,
              receipts,
              lines,
              basisId,
              requests,
            )
            const zni = currentInspection(created).zni
            zni.number = suggestNumber('zni', {
              date: zni.date,
              ...numberContext(currentInspection(created), 'zni'),
            })
            setEditorKind('zni')
            setDraft(created)
            setChoosingMaterials(false)
          }}
        />
      )}
      {draft && revision && (
        <QualityModal
          title={
            editorKind === 'avk'
              ? `АВК №${revision.avk?.number || '…'} · ЗНИ №${revision.zni.number}`
              : `ЗНИ №${revision.zni.number} · ревизия ${revision.revision}`
          }
          onClose={() => setDraft(null)}
        >
          <div className="grid gap-5">
            {revision.avk && (
              <div
                className="flex gap-2"
                role="group"
                aria-label="Документ контроля"
              >
                {(['zni', 'avk'] as const).map((kind) => (
                  <Button
                    key={kind}
                    variant={editorKind === kind ? 'secondary' : 'ghost'}
                    aria-pressed={editorKind === kind}
                    onClick={() => setEditorKind(kind)}
                  >
                    {kind === 'zni' ? 'ЗНИ' : 'АВК'}
                  </Button>
                ))}
              </div>
            )}
            {editorKind === 'zni' && (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <Field
                    label="Номер ЗНИ"
                    value={revision.zni.number}
                    disabled={!!revision.zni.signedOn}
                    onChange={(number) =>
                      updateRevision({
                        ...revision,
                        zni: { ...revision.zni, number },
                      })
                    }
                  />
                  <Field
                    label="Дата ЗНИ"
                    type="date"
                    value={revision.zni.date}
                    disabled={!!revision.zni.signedOn}
                    onChange={(date) =>
                      updateRevision({
                        ...revision,
                        zni: { ...revision.zni, date },
                      })
                    }
                  />
                  <Field
                    label="Дата инспекции"
                    type="date"
                    value={revision.zni.inspectionDate}
                    disabled={!!revision.zni.signedOn}
                    onChange={(inspectionDate) =>
                      updateRevision({
                        ...revision,
                        zni: { ...revision.zni, inspectionDate },
                      })
                    }
                  />
                  <Field
                    label="Время инспекции"
                    type="time"
                    value={revision.zni.inspectionTime}
                    disabled={!!revision.zni.signedOn}
                    onChange={(inspectionTime) =>
                      updateRevision({
                        ...revision,
                        zni: { ...revision.zni, inspectionTime },
                      })
                    }
                  />
                </div>
                <DetailsFields
                  value={revision.zni.details}
                  disabled={!!revision.zni.signedOn}
                  onChange={(details) =>
                    updateRevision({
                      ...revision,
                      zni: { ...revision.zni, details },
                    })
                  }
                />
                <DocumentsEditor
                  value={revision.zni.documents}
                  disabled={!!revision.zni.signedOn}
                  onChange={(documents) =>
                    updateRevision({
                      ...revision,
                      zni: { ...revision.zni, documents },
                    })
                  }
                />
                <h3 className="font-semibold">
                  Результаты проверки материалов
                </h3>
                {revision.zni.rows.map((row, index) => (
                  <div
                    key={row.receiptId}
                    className="grid gap-3 rounded-lg border p-3"
                  >
                    <p className="font-medium">
                      {row.name} · {row.cipher} · Предъявлено:{' '}
                      {fmt(row.presented)} {row.unit}
                    </p>
                    <p className="text-sm text-slate-500">
                      Зав. № {row.factoryNumber || '—'} · Партия:{' '}
                      {row.heatBatch || '—'}
                    </p>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="grid gap-1 text-sm text-slate-600">
                        Результат
                        <select
                          className="rounded-lg border p-2"
                          disabled={!!revision.zni.signedOn}
                          value={row.result}
                          onChange={(e) => {
                            const result = e.target.value as typeof row.result
                            updateRevision({
                              ...revision,
                              zni: {
                                ...revision.zni,
                                rows: revision.zni.rows.map((item, n) =>
                                  n === index
                                    ? {
                                        ...item,
                                        result,
                                        accepted:
                                          result === 'accepted'
                                            ? item.presented
                                            : result === 'rejected'
                                              ? 0
                                              : item.accepted,
                                      }
                                    : item,
                                ),
                              },
                            })
                          }}
                        >
                          {Object.entries(resultLabels).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Field
                        label={`Принято, ${row.unit}`}
                        type="number"
                        value={
                          row.accepted === null ? '' : String(row.accepted)
                        }
                        disabled={!!revision.zni.signedOn}
                        onChange={(accepted) =>
                          updateRevision({
                            ...revision,
                            zni: {
                              ...revision.zni,
                              rows: revision.zni.rows.map((item, n) =>
                                n === index
                                  ? {
                                      ...item,
                                      accepted:
                                        accepted === ''
                                          ? null
                                          : Number(accepted),
                                    }
                                  : item,
                              ),
                            },
                          })
                        }
                      />
                      <TextField
                        label="Замечания по позиции"
                        value={row.remarks}
                        disabled={!!revision.zni.signedOn}
                        onChange={(remarks) =>
                          updateRevision({
                            ...revision,
                            zni: {
                              ...revision.zni,
                              rows: revision.zni.rows.map((item, n) =>
                                n === index ? { ...item, remarks } : item,
                              ),
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
                <TextField
                  label="Общие замечания ЗНИ"
                  value={revision.zni.remarks}
                  disabled={!!revision.zni.signedOn}
                  onChange={(remarks) =>
                    updateRevision({
                      ...revision,
                      zni: { ...revision.zni, remarks },
                    })
                  }
                />
              </>
            )}
            {editorKind === 'avk' && revision.avk && (
              <ActEditor
                revision={revision}
                onChange={updateRevision}
                acceptedOnly
              />
            )}
            {!revision.avk &&
              revision.zni.signedOn &&
              revision.zni.rows.some((row) => (row.accepted ?? 0) > 0) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    updateRevision({ ...revision, avk: makeAct(draft) })
                    setEditorKind('avk')
                  }}
                >
                  Создать АВК на принятые позиции
                </Button>
              )}
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            {!revision.avk?.signedOn && (
              <Button
                onClick={() =>
                  run(() => {
                    save(draft)
                    setDraft(null)
                  })
                }
              >
                Сохранить документы
              </Button>
            )}
          </div>
        </QualityModal>
      )}
      {signing && (
        <QualityModal
          title={`Подписание ${signing.kind === 'zni' ? 'ЗНИ' : 'АВК'}`}
          onClose={() => setSigning(null)}
        >
          <div className="grid gap-4">
            <Field
              label="Фактическая дата подписания"
              type="date"
              value={signing.date}
              onChange={(date) => setSigning({ ...signing, date })}
            />
            <p className="text-sm text-slate-500">
              Подписанный документ сохраняется в истории. Изменения оформляются
              новой ревизией.
            </p>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <Button
              onClick={() =>
                run(() => {
                  const next = structuredClone(signing.entry)
                  next.revisions[next.revisions.length - 1] = signInspection(
                    currentInspection(next),
                    signing.kind,
                    signing.date,
                  )
                  save(next)
                  setSigning(null)
                })
              }
            >
              Подтвердить подписание
            </Button>
          </div>
        </QualityModal>
      )}
      {history && (
        <QualityModal
          title="История ЗНИ и АВК"
          onClose={() => setHistory(null)}
        >
          <div className="grid gap-4">
            {history.revisions.map((rev) => (
              <section key={rev.revision} className="rounded-lg border p-4">
                <h3 className="font-semibold">
                  Ревизия {rev.revision} · ЗНИ №{rev.zni.number} · АВК №
                  {rev.avk?.number || '—'}
                </h3>
                <p>
                  ЗНИ подписана: {displayDate(rev.zni.signedOn)} · АВК подписан:{' '}
                  {displayDate(rev.avk?.signedOn ?? null)}
                </p>
                <InspectionRows
                  gridId={`inspection-history:${history.id}:${rev.revision}`}
                  revision={rev}
                  lines={lines}
                  receipts={receipts}
                />
                <div className="mt-3 flex gap-2">
                  <QualityPrintButton
                    kind="zni"
                    caseId={history.id}
                    revision={rev.revision}
                    prepare={prepare}
                  />
                  {rev.avk && (
                    <QualityPrintButton
                      kind="avk"
                      caseId={history.id}
                      revision={rev.revision}
                      prepare={prepare}
                    />
                  )}
                </div>
              </section>
            ))}
          </div>
        </QualityModal>
      )}
    </section>
  )
}
function InspectionRows({
  gridId,
  revision,
  lines,
  receipts,
}: {
  gridId: string
  revision: InspectionRevision
  lines: Array<SubobjectMaterialMetric>
  receipts: Array<Receipt>
}) {
  const rows = revision.zni.rows.map((row) => {
    const line = findInspectionMaterial(lines, row.projectLineId)
    const receipt = receipts.find((item) => item.id === row.receiptId)
    const alt = getOperationAlternative(
      row.accepted,
      getOperationConversion(line, row.unit, receipt, {
        ...row,
        quantity: row.presented,
        altQuantity: null,
        projectUnit: row.unit,
      }),
      row.accepted === null ? null : receipt,
    )
    return { ...row, alt }
  })
  return (
    <div className="mt-3 min-w-0">
      <OperationsGrid
        id={gridId}
        label={`Материалы ЗНИ ${revision.zni.number}`}
        rows={rows}
        rowId={(row) => row.receiptId}
        columns={[
          {
            id: 'name',
            title: 'Материал',
            value: (row) => row.name,
            width: 320,
          },
          { id: 'cipher', title: 'Шифр', value: (row) => row.cipher },
          {
            id: 'factoryNumber',
            title: 'Заводской номер',
            value: (row) => row.factoryNumber,
          },
          {
            id: 'heatBatch',
            title: 'Партия плавки',
            value: (row) => row.heatBatch,
          },
          {
            id: 'presented',
            title: 'Предъявлено',
            value: (row) => row.presented,
            numeric: true,
          },
          {
            id: 'accepted',
            title: 'Принято',
            value: (row) => row.accepted,
            numeric: true,
          },
          { id: 'unit', title: 'Единица измерения', value: (row) => row.unit },
          {
            id: 'result',
            title: 'Результат',
            value: (row) => resultLabels[row.result],
          },
          {
            id: 'altQuantity',
            title: 'Альтернативное количество',
            value: (row) =>
              row.accepted === null ? null : row.alt.altQuantity,
            numeric: true,
          },
          { id: 'altUnit', title: 'А.ЕИ', value: (row) => row.alt.altUnit },
          {
            id: 'remarks',
            title: 'Замечания',
            value: (row) =>
              [row.remarks, row.alt.error].filter(Boolean).join(' '),
            width: 320,
          },
        ]}
      />
    </div>
  )
}
function ActEditor({
  acceptedOnly = false,
  revision,
  onChange,
}: {
  acceptedOnly?: boolean
  revision: InspectionRevision
  onChange: (next: InspectionRevision) => void
}) {
  const act = revision.avk!
  const set = (patch: Partial<typeof act>) =>
    onChange({ ...revision, avk: { ...act, ...patch } })
  return (
    <section className="grid gap-4 border-t pt-4">
      <h3 className="text-lg font-semibold">Акт входного контроля</h3>
      <p className="text-sm text-slate-500">
        Материалы и результаты берутся из ЗНИ этой ревизии. Проверки заполняются
        по факту; для неприменимых укажите «Не применимо».
      </p>
      {acceptedOnly && (
        <div className="rounded-lg border bg-emerald-50 p-3 text-sm">
          <strong>Принятые позиции АВК</strong>
          {revision.zni.rows
            .filter((row) => (row.accepted ?? 0) > 0)
            .map((row) => (
              <p key={row.receiptId}>
                {row.name}: {fmt(row.accepted!)} {row.unit}
              </p>
            ))}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {(
          [
            'number',
            'date',
            'buyer',
            'supplier',
            'manufacturer',
            'standards',
          ] as const
        ).map((key, i) => (
          <Field
            key={key}
            label={
              [
                'Номер АВК',
                'Дата АВК',
                'Покупатель',
                'Поставщик',
                'Изготовитель',
                'Нормативные документы',
              ][i]!
            }
            type={key === 'date' ? 'date' : 'text'}
            value={act[key]}
            disabled={!!act.signedOn}
            onChange={(value) => set({ [key]: value })}
          />
        ))}
      </div>
      <DocumentsEditor
        value={act.documents}
        disabled={!!act.signedOn}
        onChange={(documents) => set({ documents })}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {inspectionChecks.map((label, index) => (
          <TextField
            key={label}
            label={`${index + 1}. ${label}`}
            value={act.checks[index]!}
            disabled={!!act.signedOn}
            onChange={(value) =>
              set({
                checks: act.checks.map((item, n) =>
                  n === index ? value : item,
                ),
              })
            }
          />
        ))}
      </div>
      <TextField
        label="Заключение комиссии"
        value={act.conclusion}
        disabled={!!act.signedOn}
        onChange={(conclusion) => set({ conclusion })}
      />
      <TextField
        label="Приложения"
        value={act.attachments}
        disabled={!!act.signedOn}
        onChange={(attachments) => set({ attachments })}
      />
      <label className="grid gap-1 text-sm">
        Фотоматериалы приложены
        <select
          className="rounded-lg border p-2"
          value={act.photos}
          disabled={!!act.signedOn}
          onChange={(e) => set({ photos: e.target.value as typeof act.photos })}
        >
          <option value="">Не указано</option>
          <option value="yes">Да</option>
          <option value="no">Нет</option>
        </select>
      </label>
    </section>
  )
}
export function QualitySettings({
  value,
  onChange,
}: {
  value?: QualityWorkflow
  onChange: (next: QualityWorkflow) => void
}) {
  const [draft, setDraft] = useState(
      value?.defaults ?? { ...emptyQualityDefaults },
    ),
    [notice, setNotice] = useState('')
  return (
    <div className="grid gap-5">
      <h3 className="text-lg font-semibold">
        Входной контроль: реквизиты новых документов
      </h3>
      <p className="text-sm text-slate-500">
        Изменение реквизитов здесь применяется только к новым ЗНИ. Уже
        оформленные документы сохраняют свои значения.
      </p>
      <DetailsFields value={draft} onChange={setDraft} />
      <div className="flex gap-3">
        <Button
          onClick={() => {
            try {
              onChange({
                ...(value ?? emptyQualityWorkflow()),
                defaults: draft,
              })
              setNotice('Реквизиты сохранены.')
            } catch (cause) {
              setNotice(message(cause))
            }
          }}
        >
          Сохранить реквизиты
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setDraft(value?.defaults ?? { ...emptyQualityDefaults })
            setNotice('')
          }}
        >
          Отменить изменения
        </Button>
      </div>
      <p role="status">{notice}</p>
    </div>
  )
}
