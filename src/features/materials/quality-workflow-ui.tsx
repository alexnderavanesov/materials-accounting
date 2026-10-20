import { OperationsGrid } from './operations-grid'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  activeInspection,
  currentInspection,
  emptyQualityDefaults,
  emptyQualityWorkflow,
  findInspectionMaterial,
  inspectionChecks,
  inspectionMatches,
  inspectionAvailableQuantities,
  inspectionDocuments,
  localToday,
  newInspection,
  newInspectionAct,
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
  TransferAct,
} from './quality-workflow'
import type { SubobjectMaterialMetric } from './types'
import { QualityPrintButton, QualityPrintSettings } from './quality-print-ui'
import { getOperationAlternative, getOperationConversion } from './domain'

type Receipt = {
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
  invoiceNumber: string
  certificate?: string
  qualityDocument?: string
}
type Props = {
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
export function TransferActs({ value, receipts, lines, onChange }: Props) {
  const workflow = value ?? emptyQualityWorkflow()
  const [draft, setDraft] = useState<TransferAct | null>(null),
    [error, setError] = useState(''),
    [expanded, setExpanded] = useState(false)
  const save = () => {
    try {
      if (!draft) return
      onChange({
        ...workflow,
        apps: [...workflow.apps.filter((app) => app.id !== draft.id), draft],
      })
      setDraft(null)
      setError('')
    } catch (cause) {
      setError(message(cause))
    }
  }
  return (
    <section className="border-b bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setExpanded(!expanded)}>
          <ChevronDown size={16} />
          Акты приёма-передачи ({workflow.apps.length})
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setError('')
            setDraft({
              id: crypto.randomUUID(),
              number: '',
              date: localToday(),
              receiptIds: [],
              documents: [],
            })
          }}
        >
          <Plus size={16} />
          Оформить АПП
        </Button>
        <span className="text-sm text-slate-500">
          АПП хранит акт заказчика. ЗНИ можно оформить на весь АПП или выбранные
          материалы.
        </span>
      </div>
      {expanded && (
        <div className="mt-3 grid gap-2">
          {workflow.apps.map((app) => (
            <div
              key={app.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3"
            >
              <span className="mr-auto">
                АПП №{app.number} от {displayDate(app.date)} · Получений:{' '}
                {app.receiptIds.length}
              </span>
              {workflow.cases.some((entry) => entry.appId === app.id) ? (
                <span className="text-sm text-slate-500">ЗНИ оформлена</span>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError('')
                      setDraft(structuredClone(app))
                    }}
                  >
                    Изменить АПП
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Удалить АПП №${app.number}? Получения сохранятся.`,
                        )
                      ) {
                        try {
                          onChange({
                            ...workflow,
                            apps: workflow.apps.filter(
                              (entry) => entry.id !== app.id,
                            ),
                          })
                        } catch (cause) {
                          setError(message(cause))
                        }
                      }
                    }}
                  >
                    Удалить АПП
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {error && !draft && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {draft && (
        <QualityModal
          title="Акт приёма-передачи материала"
          onClose={() => setDraft(null)}
        >
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Номер АПП"
                value={draft.number}
                onChange={(number) => setDraft({ ...draft, number })}
              />
              <Field
                label="Дата АПП"
                type="date"
                value={draft.date}
                onChange={(date) => setDraft({ ...draft, date })}
              />
            </div>
            <h3 className="font-semibold">Получения по этому АПП</h3>
            <div className="max-h-72 overflow-auto rounded-lg border p-3">
              {receipts
                .filter(
                  (receipt) =>
                    !workflow.apps.some(
                      (app) =>
                        app.id !== draft.id &&
                        app.receiptIds.includes(receipt.id),
                    ),
                )
                .map((receipt) => (
                  <label
                    key={receipt.id}
                    className="flex cursor-pointer items-center gap-3 border-b py-3"
                  >
                    <input
                      type="checkbox"
                      checked={draft.receiptIds.includes(receipt.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          receiptIds: e.target.checked
                            ? [...draft.receiptIds, receipt.id]
                            : draft.receiptIds.filter(
                                (id) => id !== receipt.id,
                              ),
                        })
                      }
                    />
                    <span>
                      {receipt.actualName ||
                        lines.find((line) => line.id === receipt.projectLineId)
                          ?.projectMaterialName}{' '}
                      · {fmt(receipt.quantity)} {receipt.projectUnit} ·{' '}
                      {displayDate(receipt.date)} ·{' '}
                      {receipt.invoiceNumber || 'Без накладной'} · Партия:{' '}
                      {receipt.heatBatch || '—'} · Зав. №{' '}
                      {receipt.factoryNumber || '—'}
                    </span>
                  </label>
                ))}
              {!receipts.length && <p>Сначала оформите получение материала.</p>}
            </div>
            <DocumentsEditor
              value={draft.documents}
              onChange={(documents) => setDraft({ ...draft, documents })}
            />
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <Button onClick={save}>Сохранить АПП</Button>
          </div>
        </QualityModal>
      )}
    </section>
  )
}
function InspectionMaterialPicker({
  workflow,
  receipts,
  lines,
  legacyReceiptIds,
  onCreate,
  onClose,
}: {
  workflow: QualityWorkflow
  receipts: Array<Receipt>
  lines: Array<SubobjectMaterialMetric>
  legacyReceiptIds: Array<string>
  onCreate: (selection: Array<InspectionSelection>) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [selectedApp, setSelectedApp] = useState('')
  const [error, setError] = useState('')
  const available = inspectionAvailableQuantities(workflow, receipts)
  const eligible = receipts.filter(
    (receipt) =>
      (available.get(receipt.id) ?? 0) > 0 &&
      !legacyReceiptIds.includes(receipt.id),
  )
  const eligibleById = new Map(eligible.map((receipt) => [receipt.id, receipt]))
  const query = search.trim().toLocaleLowerCase('ru')
  const visible = eligible.filter((receipt) => {
    const line = findInspectionMaterial(lines, receipt.projectLineId)
    return [
      receipt.actualName,
      line?.cipher,
      line?.normativeDocument,
      receipt.invoiceNumber,
      receipt.factoryNumber,
      receipt.heatBatch,
      displayDate(receipt.date),
    ].some((value) => value?.toLocaleLowerCase('ru').includes(query))
  })
  const entireAppAvailable = (app: TransferAct) =>
    app.receiptIds.every((receiptId) => {
      const receipt = eligibleById.get(receiptId)
      return receipt && available.get(receiptId) === receipt.quantity
    })
  return (
    <QualityModal title="Материалы для ЗНИ" onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          Выберите поступившие материалы и количество для инспекции.
          Поступления, партии и заводские номера учитываются отдельно. Создавать
          АПП необязательно.
        </p>
        {workflow.apps.length > 0 && (
          <label className="grid gap-1 text-sm text-slate-600">
            Выбрать весь АПП
            <select
              className="rounded-lg border p-2"
              value={selectedApp}
              onChange={(event) => {
                const app = workflow.apps.find(
                  (item) => item.id === event.target.value,
                )
                setSelectedApp(event.target.value)
                if (!app || !entireAppAvailable(app)) return
                setSelected(
                  Object.fromEntries(
                    app.receiptIds.map((receiptId) => [
                      receiptId,
                      String(available.get(receiptId)),
                    ]),
                  ),
                )
                setSearch('')
                setError('')
              }}
            >
              <option value="">Выбрать материалы вручную</option>
              {workflow.apps.map((app) => (
                <option
                  key={app.id}
                  value={app.id}
                  disabled={!entireAppAvailable(app)}
                >
                  АПП №{app.number} от {displayDate(app.date)}
                  {!entireAppAvailable(app)
                    ? ' — часть материалов уже в ЗНИ / ВК'
                    : ''}
                </option>
              ))}
            </select>
            <span className="text-xs">
              Если часть АПП уже включена в ЗНИ, выберите оставшиеся материалы
              ниже.
            </span>
          </label>
        )}
        <Input
          aria-label="Поиск материалов для ЗНИ"
          placeholder="Материал, шифр, накладная, партия или заводской номер"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <p className="text-sm text-slate-500">
          Выбрано поступлений: {Object.keys(selected).length}. Доступно:{' '}
          {eligible.length}.
        </p>
        <div className="grid max-h-[45vh] gap-2 overflow-auto">
          {visible.map((receipt) => {
            const line = findInspectionMaterial(lines, receipt.projectLineId)
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
                      setSelectedApp('')
                      setSelected((current) => {
                        const next = { ...current }
                        if (event.target.checked)
                          next[receipt.id] = String(available.get(receipt.id))
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
                      {displayDate(receipt.date)} · Накладная{' '}
                      {receipt.invoiceNumber || '—'} · Партия{' '}
                      {receipt.heatBatch || '—'} · Зав. №{' '}
                      {receipt.factoryNumber || '—'}
                    </span>
                    <span className="block text-sm">
                      Получено: {fmt(receipt.quantity)} {receipt.projectUnit}.
                      Доступно для ЗНИ: {fmt(available.get(receipt.id) ?? 0)}{' '}
                      {receipt.projectUnit}.
                    </span>
                  </span>
                </label>
                {checked && (
                  <Field
                    label={`Количество для ЗНИ: ${receipt.actualName} (${receipt.invoiceNumber || 'без накладной'}), ${receipt.projectUnit}`}
                    value={selected[receipt.id]!}
                    onChange={(amount) => {
                      setSelectedApp('')
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
                : 'Нет доступных материалов: оформите получение или откройте существующую ЗНИ для повторной проверки. Материалы из прежнего ВК учитываются отдельно.'}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button
          disabled={!Object.keys(selected).length}
          onClick={() => {
            try {
              onCreate(
                Object.entries(selected).map(([receiptId, amount]) => ({
                  receiptId,
                  quantity: Number(
                    amount.trim().replace(/\s/g, '').replace(',', '.'),
                  ),
                })),
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

export function InspectionWorkspace({
  value,
  receipts,
  lines,
  onChange,
  prepare,
  search = '',
  focusId,
  legacyReceiptIds = [],
}: Props & {
  prepare: () => Promise<string>
  search?: string
  focusId?: string
  legacyReceiptIds?: Array<string>
}) {
  const workflow = value ?? emptyQualityWorkflow()
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
  const updateRevision = (revision: InspectionRevision) =>
    setDraft(
      draft
        ? { ...draft, revisions: [...draft.revisions.slice(0, -1), revision] }
        : null,
    )
  const revision = draft && currentInspection(draft)
  useEffect(() => {
    const entry = value?.cases.find((item) =>
      focusId?.startsWith(`inspection:${item.id}:`),
    )
    if (entry) setExpanded((current) => ({ ...current, [entry.id]: true }))
  }, [focusId, value])
  const visible = workflow.cases.filter((entry) =>
    inspectionMatches(
      entry,
      workflow.apps.find((app) => app.id === entry.appId),
      search,
    ),
  )

  return (
    <section className="grid gap-4 p-4">
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => {
            setError('')
            setChoosingMaterials(true)
          }}
        >
          Создать ЗНИ
        </Button>
      </div>
      <p className="text-sm text-slate-500">
        Выберите весь АПП или отдельные полученные материалы, в том числе без
        АПП. К выдаче допускается принятое количество по подписанным АВК.
      </p>
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
      {visible.map((entry) => {
        const rev = currentInspection(entry),
          active = activeInspection(entry),
          app = workflow.apps.find((item) => item.id === entry.appId)
        return (
          <article
            key={entry.id}
            className={`rounded-xl border p-4 ${rev.avk?.signedOn ? 'border-emerald-200 bg-emerald-50/40' : 'bg-white'}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="icon"
                variant="outline"
                aria-label={`Материалы ЗНИ ${rev.zni.number}`}
                aria-expanded={!!expanded[entry.id]}
                onClick={() =>
                  setExpanded({ ...expanded, [entry.id]: !expanded[entry.id] })
                }
              >
                <ChevronDown size={16} />
              </Button>
              <div className="mr-auto">
                <h3 className="font-semibold">
                  ЗНИ №{rev.zni.number} · Ревизия {rev.revision}
                </h3>
                <p className="text-sm text-slate-500">
                  {app
                    ? `АПП №${app.number} от ${displayDate(app.date)} · `
                    : ''}
                  {rev.zni.rows.length} поз. · ЗНИ:{' '}
                  {rev.zni.signedOn
                    ? `подписана ${displayDate(rev.zni.signedOn)}`
                    : 'в работе'}
                </p>
                <p className="text-sm text-slate-500">
                  {[...new Set(rev.zni.rows.map((row) => row.name))].join('; ')}
                </p>
                <p className="text-sm text-slate-500">
                  АВК{' '}
                  {rev.avk
                    ? `№${rev.avk.number || '…'} · ${rev.avk.signedOn ? `подписан ${displayDate(rev.avk.signedOn)}` : 'в работе'}`
                    : 'не создан'}
                  {active && active.revision !== rev.revision
                    ? ` · Действует АВК ревизии ${active.revision}`
                    : ''}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setError('')
                  setDraft(structuredClone(entry))
                }}
              >
                {rev.avk?.signedOn ? 'Просмотр' : 'Открыть документы'}
              </Button>
              <Button variant="ghost" onClick={() => setHistory(entry)}>
                История
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <QualityPrintButton
                kind="zni"
                caseId={entry.id}
                revision={rev.revision}
                prepare={prepare}
              />
              {rev.avk && (
                <QualityPrintButton
                  kind="avk"
                  caseId={entry.id}
                  revision={rev.revision}
                  prepare={prepare}
                />
              )}
              <Button
                variant="outline"
                disabled={!!rev.zni.signedOn}
                onClick={() =>
                  setSigning({ entry, kind: 'zni', date: localToday() })
                }
              >
                Подписать ЗНИ
              </Button>
              {!rev.avk && (
                <Button
                  variant="outline"
                  onClick={() =>
                    run(() => {
                      const next = structuredClone(entry)
                      currentInspection(next).avk = newInspectionAct(
                        inspectionDocuments(workflow, next),
                      )
                      save(next)
                      setDraft(next)
                    })
                  }
                >
                  Создать АВК
                </Button>
              )}
              {rev.avk && !rev.avk.signedOn && (
                <Button
                  variant="outline"
                  disabled={!rev.zni.signedOn}
                  onClick={() =>
                    setSigning({ entry, kind: 'avk', date: localToday() })
                  }
                >
                  Подписать АВК
                </Button>
              )}
              {rev.zni.signedOn && (
                <Button
                  variant="outline"
                  onClick={() =>
                    run(() => {
                      const next = reopenInspection(entry)
                      save(next)
                      setDraft(next)
                    })
                  }
                >
                  Повторная проверка
                </Button>
              )}
              {!entry.revisions.some((item) => item.zni.signedOn) && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    run(() => {
                      if (
                        window.confirm(
                          `Удалить черновик ЗНИ №${rev.zni.number}? АПП и получения сохранятся.`,
                        )
                      )
                        onChange({
                          ...workflow,
                          cases: workflow.cases.filter(
                            (item) => item.id !== entry.id,
                          ),
                        })
                    })
                  }
                >
                  Удалить черновик
                </Button>
              )}
            </div>
            {expanded[entry.id] && (
              <InspectionRows
                gridId={`inspection:${entry.id}:${rev.revision}`}
                revision={rev}
                lines={lines}
                receipts={receipts}
              />
            )}
          </article>
        )
      })}
      {choosingMaterials && (
        <InspectionMaterialPicker
          workflow={workflow}
          receipts={receipts}
          lines={lines}
          legacyReceiptIds={legacyReceiptIds}
          onClose={() => setChoosingMaterials(false)}
          onCreate={(selection) => {
            setDraft(newInspection(workflow, selection, receipts, lines))
            setChoosingMaterials(false)
          }}
        />
      )}
      {draft && revision && (
        <QualityModal
          title={`ЗНИ №${revision.zni.number} и АВК · ревизия ${revision.revision}`}
          onClose={() => setDraft(null)}
        >
          <div className="grid gap-5">
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
              value={inspectionDocuments(workflow, draft, revision)}
              disabled={!!revision.zni.signedOn}
              onChange={(documents) =>
                updateRevision({
                  ...revision,
                  zni: { ...revision.zni, documents },
                })
              }
            />
            <h3 className="font-semibold">Результаты проверки материалов</h3>
            {revision.zni.rows.map((row, index) => (
              <div
                key={row.receiptId}
                className="grid gap-3 rounded-lg border p-3"
              >
                <p className="font-medium">
                  {row.name} · {row.cipher} · Предъявлено: {fmt(row.presented)}{' '}
                  {row.unit}
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
                    value={row.accepted === null ? '' : String(row.accepted)}
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
                                    accepted === '' ? null : Number(accepted),
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
            {revision.avk ? (
              <ActEditor revision={revision} onChange={updateRevision} />
            ) : (
              <Button
                variant="outline"
                onClick={() =>
                  updateRevision({
                    ...revision,
                    avk: newInspectionAct(inspectionDocuments(workflow, draft)),
                  })
                }
              >
                Добавить черновик АВК
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
  revision,
  onChange,
}: {
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
      <QualityPrintSettings kind="zni" />
      <QualityPrintSettings kind="avk" />
    </div>
  )
}
