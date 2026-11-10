import { useRef, useState } from 'react'
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
const dateLabel = (value: string) => value.split('-').reverse().join('.')

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
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(localToday())
  const [condition, setCondition] = useState<SiteReturn['condition']>('good')
  const [document, setDocument] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const saving = useRef(false)
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (saving.current) return
        try {
          const result = siteReturnSchema.safeParse({
            id: crypto.randomUUID(),
            date,
            quantity: Number(quantity.replace(/\s/g, '').replace(',', '.')),
            condition,
            document: document.trim(),
            note: note.trim(),
          })
          if (!result.success)
            throw new Error(
              'Укажите корректную дату и положительное количество.',
            )
          if (result.data.quantity > netIssued(issue))
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
      <div>
        <p>{name}</p>
        <p className="text-sm text-slate-500">
          {issue.document} · {issue.receiver || 'Получатель не указан'} ·
          Осталось у площадки: {fmt(netIssued(issue))} {unit}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Возвращается, {unit}
          <Input
            aria-label="Количество возврата с площадки"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label>
          Дата возврата
          <Input
            aria-label="Дата возврата с площадки"
            type="date"
            min={issue.date}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <label>
        Состояние
        <select
          aria-label="Состояние материала"
          className="mt-1 block w-full rounded-md border p-2"
          value={condition}
          onChange={(e) =>
            setCondition(e.target.value as SiteReturn['condition'])
          }
        >
          <option value="good">Без повреждений</option>
          <option value="quarantine">Требует проверки / повреждён</option>
        </select>
      </label>
      <p className="text-sm text-slate-500">
        {condition === 'good'
          ? 'Повторная выдача доступна только в пределах подписанных АВК.'
          : 'Материал вернётся на склад заблокированным для выдачи.'}
      </p>
      <label>
        Документ возврата (необязательно)
        <Input value={document} onChange={(e) => setDocument(e.target.value)} />
      </label>
      <label>
        Примечание
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit">Сохранить возврат с площадки</Button>
      </div>
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
        ...operationMaterial(line, requestById.get(receipt?.requestId || '')),
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
              width: 170,
              render: ({ issue }) => (
                <Button variant="outline" onClick={() => onReturn(issue)}>
                  Принять возврат
                </Button>
              ),
            },
          ]}
        />
      )}
    </section>
  )
}
