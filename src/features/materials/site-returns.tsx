import { formatCalendarDate, normalizeCalendarDate } from './calendar-date'
import { DateInput } from '#/components/ui/date-input'
import { Undo2 } from 'lucide-react'
import { RowActionButton } from '#/components/ui/row-action'
import { WorkflowSteps } from './workflow-dialog'
import { SelectField } from '#/components/ui/select-field'
import { useId, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { OperationsGrid } from './operations-grid'
import { netIssued, siteReturned, siteReturnSchema } from './material-issues'
import type { IssueMovement, SiteReturn } from './material-issues'
import { getOperationAlternative, getOperationConversion } from './domain'
import { localToday } from './quality-workflow'
import {
  matchesOperationMaterial,
  operationMaterial,
} from './operation-list-view'
import type { OperationListView, ReceiptPriority } from './operation-list-view'
import type { SubobjectMaterialMetric } from './types'

type Issue = IssueMovement & {
  id: string
  date: string
  document: string
  receiver: string
  projectLineId: string
  projectUnit?: string
  altQuantity: number | null
  altUnit?: string
  altUnitFactor?: number | null
}
type Receipt = {
  id: string
  actualName: string
  projectUnit: string
  requestId: string
}
const fmt = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 12 }).format(value)
const dateLabel = (value: string) => formatCalendarDate(value)

export function SiteReturnForm({
  issue,
  name,
  unit,
  onSubmit,
  onClose,
}: {
  issue: Issue
  name: string
  unit: string
  onSubmit: (issueId: string, value: SiteReturn) => void
  onClose: () => void
}) {
  const quantityId = useId()
  const [step, setStep] = useState(0)
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(localToday())
  const [condition, setCondition] = useState<SiteReturn['condition']>('good')
  const [document, setDocument] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const saving = useRef(false)
  const available = netIssued(issue)
  const amount = Number(quantity.replace(/\s/g, '').replace(',', '.'))
  const validQuantity =
    Number.isFinite(amount) && amount > 0 && amount <= available
  const conditionLabel =
    condition === 'good' ? 'Без повреждений' : 'Требует проверки / повреждён'
  const conditionHint =
    condition === 'good'
      ? 'Повторная выдача доступна только в пределах подписанных АВК.'
      : 'Материал вернётся на склад заблокированным для выдачи.'
  function advance(next: number) {
    if (next <= step) {
      setStep(next)
      setError('')
      return
    }
    if (!date || normalizeCalendarDate(date) !== date) {
      setError('Укажите корректную дату возврата.')
      return
    }
    if (date < issue.date) {
      setError('Дата возврата не может быть раньше даты выдачи.')
      return
    }
    if (step === 1 && !validQuantity) {
      setError(
        `Укажите количество больше нуля и не больше ${fmt(available)} ${unit}.`,
      )
      return
    }
    setError('')
    setStep(Math.min(next, step + 1))
  }
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          !(event.target instanceof HTMLButtonElement) &&
          !(event.target instanceof HTMLTextAreaElement)
        )
          event.preventDefault()
      }}
      onSubmit={(event) => {
        event.preventDefault()
        if (saving.current) return
        if (step < 2) {
          advance(step + 1)
          return
        }
        try {
          const result = siteReturnSchema.safeParse({
            id: crypto.randomUUID(),
            date,
            quantity: amount,
            condition,
            document: document.trim(),
            note: note.trim(),
          })
          if (!result.success)
            throw new Error(
              'Укажите корректную дату и положительное количество.',
            )
          if (result.data.quantity > available)
            throw new Error(
              'Количество превышает остаток у площадки по этой выдаче.',
            )
          saving.current = true
          onSubmit(issue.id, result.data)
          onClose()
        } catch (e) {
          saving.current = false
          setError(
            e instanceof Error ? e.message : 'Не удалось сохранить возврат.',
          )
        }
      }}
    >
      <WorkflowSteps compact step={step} onStep={advance} />
      <div className="min-h-0 space-y-5 overflow-auto px-5 py-4">
        <section
          aria-label="Исходная выдача"
          className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div className="min-w-0">
            <p className="break-words text-sm font-medium leading-5 text-slate-900">
              {name}
            </p>
            <p className="mt-1.5 break-words text-xs leading-5 text-slate-500">
              {issue.document || 'Выдача без номера'} · {dateLabel(issue.date)}{' '}
              · {issue.receiver || 'Получатель не указан'}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-blue-50 px-3 py-2 sm:block sm:min-w-36">
            <p className="text-xs text-blue-700">Осталось у площадки</p>
            <p className="text-lg font-semibold tabular-nums text-blue-950 sm:mt-1">
              {fmt(available)}{' '}
              <span className="text-sm font-normal">{unit}</span>
            </p>
          </div>
        </section>
        <div
          className={
            step === 0
              ? 'grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]'
              : 'hidden'
          }
        >
          <label className="grid gap-1.5 text-sm text-slate-600">
            Дата возврата
            <DateInput
              aria-label="Дата возврата с площадки"
              min={issue.date}
              value={date}
              onValueChange={(value) => {
                setDate(value)
                setError('')
              }}
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm text-slate-600">
            Документ возврата (необязательно)
            <Input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-600 sm:col-span-2">
            Примечание
            <textarea
              rows={2}
              className="min-h-20 w-full resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        <div className={step === 1 ? 'space-y-3' : 'hidden'}>
          <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="grid gap-1.5 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={quantityId}>Вернуть, {unit}</label>
                <button
                  type="button"
                  className="text-xs text-blue-700 hover:text-blue-900"
                  onClick={() => {
                    setQuantity(String(available))
                    setError('')
                  }}
                >
                  Всё
                </button>
              </div>
              <Input
                id={quantityId}
                aria-label="Количество возврата с площадки"
                aria-invalid={
                  (Boolean(quantity.trim()) && !validQuantity) || undefined
                }
                inputMode="decimal"
                placeholder="0"
                className="text-right tabular-nums aria-invalid:border-red-500"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value)
                  setError('')
                }}
              />
            </div>
            <label className="grid min-w-0 gap-1.5 text-sm text-slate-600">
              Состояние материала
              <SelectField
                aria-label="Состояние материала"
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as SiteReturn['condition'])
                }
              >
                <option value="good">Без повреждений</option>
                <option value="quarantine">Требует проверки / повреждён</option>
              </SelectField>
            </label>
          </div>
          <p
            className={`rounded-md px-3 py-2 text-xs leading-5 ${condition === 'quarantine' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-500'}`}
          >
            {conditionHint}
          </p>
        </div>
        {step === 2 && (
          <section
            aria-label="Проверка возврата с площадки"
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
              <div>
                <p className="text-xs text-blue-700">Вернётся на склад</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-blue-950">
                  {fmt(amount)}{' '}
                  <span className="text-sm font-normal">{unit}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Останется у площадки</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                  {fmt(Number((available - amount).toPrecision(15)))}{' '}
                  <span className="text-sm font-normal">{unit}</span>
                </p>
              </div>
            </div>
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Дата возврата</dt>
                <dd className="mt-1 text-slate-900">{dateLabel(date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Документ возврата</dt>
                <dd className="mt-1 break-words text-slate-900">
                  {document.trim() || 'Не указан'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Состояние материала</dt>
                <dd
                  className={`mt-1 ${condition === 'quarantine' ? 'text-amber-800' : 'text-slate-900'}`}
                >
                  {conditionLabel}
                </dd>
              </div>
              {note.trim() && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-500">Примечание</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-slate-900">
                    {note.trim()}
                  </dd>
                </div>
              )}
            </dl>
            {condition === 'quarantine' && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                {conditionHint}
              </p>
            )}
          </section>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-5 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => (step ? advance(step - 1) : onClose())}
        >
          {step ? 'Назад' : 'Отмена'}
        </Button>
        <Button
          type="submit"
          aria-label={step === 2 ? 'Сохранить возврат с площадки' : undefined}
        >
          {step < 2 ? 'Далее' : 'Сохранить возврат'}
        </Button>
      </footer>
    </form>
  )
}

export function SiteReturnsWorkspace({
  issues,
  receipts,
  lines,
  requests,
  search,
  view,
  priority,
  onReturn,
}: {
  issues: Issue[]
  receipts: Receipt[]
  lines: SubobjectMaterialMetric[]
  requests: Array<{ id: string; cipher?: string; materialType?: string }>
  search: string
  view: OperationListView
  priority: ReceiptPriority
  onReturn: (issue: Issue) => void
}) {
  const [history, setHistory] = useState(false)
  const lineById = new Map(lines.map((line) => [line.id, line]))
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  const requestById = new Map(requests.map((request) => [request.id, request]))
  const rows = issues
    .map((issue) => {
      const receipt = receiptById.get(issue.receiptId)
      const line = lineById.get(issue.projectLineId)
      return {
        issue,
        line,
        name: receipt?.actualName || line?.projectMaterialName || 'Материал',
        unit: issue.projectUnit || receipt?.projectUnit || '',
        ...operationMaterial(line, {
          ...requestById.get(receipt?.requestId || ''),
          ...(line ? { cipher: line.cipher } : {}),
        }),
      }
    })
    .filter(
      (row) =>
        matchesOperationMaterial(row, view) &&
        search
          .toLocaleLowerCase('ru')
          .split(/\s+/)
          .filter(Boolean)
          .every((token) =>
            [
              row.name,
              row.cipher,
              row.materialType,
              row.issue.document,
              row.issue.receiver,
              ...(row.issue.siteReturns ?? []).flatMap((item) => [
                item.document,
                item.note,
              ]),
            ]
              .join(' ')
              .toLocaleLowerCase('ru')
              .includes(token),
          ),
    )
  const pending = rows
    .filter((row) => netIssued(row.issue) > 0)
    .sort((a, b) => b.issue.date.localeCompare(a.issue.date))
  const returned = rows
    .flatMap((row) =>
      (row.issue.siteReturns ?? []).map((item) => ({ ...row, item })),
    )
    .sort((a, b) => b.item.date.localeCompare(a.item.date))
  return (
    <section className="min-w-0 p-4" aria-label="Возвраты с площадки">
      <div className="mb-4 flex gap-2">
        <Button
          variant={history ? 'outline' : 'default'}
          onClick={() => setHistory(false)}
        >
          У площадки ({pending.length})
        </Button>
        <Button
          variant={history ? 'default' : 'outline'}
          onClick={() => setHistory(true)}
        >
          Принятые возвраты ({returned.length})
        </Button>
      </div>
      {history ? (
        <OperationsGrid
          key="history"
          id="site-returns-history"
          label="Принятые возвраты с площадки"
          rows={returned}
          rowId={(row) => row.item.id}
          priorityRow={
            priority.key
              ? ({ issue }) => priority.ids.has(issue.receiptId)
              : undefined
          }
          pagination
          paginationFilterKey={JSON.stringify([search, view])}
          columns={[
            {
              id: 'date',
              date: true,
              title: 'Дата возврата',
              value: ({ item }) => item.date,
              render: ({ item }) => dateLabel(item.date),
            },
            {
              id: 'name',
              title: 'Материал',
              value: (row) => row.name,
              width: 320,
            },
            {
              id: 'issue',
              title: 'Исходная выдача',
              value: ({ issue }) => issue.document,
            },
            {
              id: 'quantity',
              title: 'Возвращено с площадки',
              value: ({ item }) => item.quantity,
              numeric: true,
            },
            { id: 'unit', title: 'Ед.', value: (row) => row.unit },
            {
              id: 'alternative',
              title: 'Альтернативное количество',
              value: ({ item, issue, line, unit }) => {
                const alternative = getOperationAlternative(
                  item.quantity,
                  getOperationConversion(line, unit, issue),
                  issue,
                )
                return alternative.altQuantity === null
                  ? '—'
                  : `${fmt(alternative.altQuantity)} ${alternative.altUnit}`
              },
            },
            {
              id: 'condition',
              title: 'Состояние',
              value: ({ item }) =>
                item.condition === 'good'
                  ? 'Без повреждений'
                  : 'Требует проверки / повреждён',
            },
            {
              id: 'document',
              title: 'Документ возврата',
              value: ({ item }) => item.document,
            },
            { id: 'note', title: 'Примечание', value: ({ item }) => item.note },
          ]}
        />
      ) : (
        <OperationsGrid
          key="sources"
          id="site-return-sources"
          label="Материалы у площадки"
          rows={pending}
          rowId={({ issue }) => issue.id}
          priorityRow={
            priority.key
              ? ({ issue }) => priority.ids.has(issue.receiptId)
              : undefined
          }
          pagination
          paginationFilterKey={JSON.stringify([search, view])}
          columns={[
            {
              id: 'date',
              date: true,
              title: 'Дата выдачи',
              value: ({ issue }) => issue.date,
              render: ({ issue }) => dateLabel(issue.date),
            },
            {
              id: 'name',
              title: 'Материал',
              value: (row) => row.name,
              width: 320,
            },
            {
              id: 'issue',
              title: 'Документ выдачи',
              value: ({ issue }) => issue.document,
            },
            {
              id: 'receiver',
              title: 'Получатель',
              value: ({ issue }) => issue.receiver,
            },
            {
              id: 'quantity',
              title: 'Выдано',
              value: ({ issue }) => issue.quantity,
              numeric: true,
            },
            {
              id: 'returned',
              title: 'Возвращено с площадки',
              value: ({ issue }) => siteReturned(issue),
              numeric: true,
            },
            {
              id: 'remaining',
              title: 'У площадки',
              value: ({ issue }) => netIssued(issue),
              numeric: true,
            },
            { id: 'unit', title: 'Ед.', value: (row) => row.unit },
            {
              id: 'actions',
              title: 'Действия',
              value: () => '',
              actions: true,
              width: 96,
              render: ({ issue }) => (
                <RowActionButton
                  iconOnly
                  aria-label="Принять возврат"
                  onClick={() => onReturn(issue)}
                >
                  <Undo2 size={14} aria-hidden="true" />
                </RowActionButton>
              ),
            },
          ]}
        />
      )}
    </section>
  )
}
