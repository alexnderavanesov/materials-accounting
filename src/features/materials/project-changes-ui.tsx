import { formatCalendarDate } from './calendar-date'
import { DateInput } from '#/components/ui/date-input'
import { SelectField } from '#/components/ui/select-field'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { localToday } from './quality-workflow'
import {
  currentChangeNumber,
  latestProjectChange,
  prepareStockTransfer,
  projectConsequences,
} from './project-changes'
import type { ProjectChangeWorkspace } from './project-changes'
import {
  cancelledRequestQuantity,
  stockAssignmentKey,
} from './project-change-types'
import type { ProjectChange } from './project-change-types'
import { getMaterialIdentityKey } from './project-material-data'
import { availableAssignedStock } from './stock-assignments'

const fmt = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 12 }).format(value)
export type ProjectReturnTarget = {
  projectLineId: string
  projectChangeId: string
  projectChangeItemId: string
  quantity: number
}
export function ProjectChangesPanel({
  workspace,
  author,
  selectedCipher,
  onApply,
  onReturn,
}: {
  workspace: ProjectChangeWorkspace
  author: string
  selectedCipher?: string
  onApply: (
    next: ProjectChangeWorkspace,
    baseline: ProjectChangeWorkspace,
  ) => Promise<void>
  onReturn: (target: ProjectReturnTarget) => void
}) {
  const [view, setView] = useState(false)
  const [transferLine, setTransferLine] = useState<string | null>(null)
  const [error, setError] = useState('')
  const consequences = useMemo(
    () =>
      workspace.projectChanges?.length ? projectConsequences(workspace) : [],
    [workspace],
  )
  const pending = consequences.filter((row) => row.change && row.surplus > 0)
  return (
    <section
      className="mb-4 grid gap-3 rounded-xl border bg-white p-4"
      aria-label="Изменения проекта"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Изменения проекта</p>
          <p className="text-sm text-slate-600">
            История по шифрам · Требует решения: {pending.length}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setView(true)}>
            История изменений
          </Button>
        </div>
      </div>
      {!!pending.length && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Требует решения · {pending.length}
          </summary>
          <div className="max-h-80 overflow-auto">
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Шифр / материал</th>
                  <th>Излишек</th>
                  <th>С площадки</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.line.id} className="border-t">
                    <td className="p-2">
                      {row.line.cipher} · {row.line.projectMaterialName}
                    </td>
                    <td>
                      {fmt(row.surplus)} {row.line.unit}
                    </td>
                    <td>
                      {row.fromSite > 0
                        ? `${fmt(row.fromSite)} ${row.line.unit}`
                        : '—'}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            const change = [...(workspace.projectChanges ?? [])]
                              .reverse()
                              .find(
                                (entry) =>
                                  entry.kind !== 'baseline' &&
                                  entry.items.some(
                                    (item) => item.after.id === row.line.id,
                                  ),
                              )
                            const item = change?.items.find(
                              (entry) => entry.after.id === row.line.id,
                            )
                            if (!change || !item) {
                              setError(
                                'Для возврата выберите изменение этой позиции в истории.',
                              )
                              return
                            }
                            onReturn({
                              projectLineId: row.line.id!,
                              projectChangeId: change.id,
                              projectChangeItemId: item.id,
                              quantity: row.surplus,
                            })
                          }}
                        >
                          Перейти к возврату
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setTransferLine(row.line.id!)}
                          disabled={row.approved <= 0}
                          title={
                            row.approved <= 0
                              ? 'Нет свободного остатка по подписанному АВК; выданное количество сначала верните с площадки'
                              : undefined
                          }
                        >
                          Перенести на другой шифр
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {view && (
        <ProjectHistoryDialog
          workspace={workspace}
          selectedCipher={selectedCipher}
          onClose={() => setView(false)}
        />
      )}
      {transferLine && (
        <TransferDialog
          workspace={workspace}
          author={author}
          lineId={transferLine}
          onApply={onApply}
          onClose={() => setTransferLine(null)}
        />
      )}
    </section>
  )
}

export function ProjectDialog({
  title,
  children,
  onClose,
  compact = false,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  compact?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
      }
      if (event.key === 'Tab') {
        const items = [
          ...(container.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary',
          ) ?? []),
        ]
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
    }
    container.current?.focus()
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      previous?.focus()
    }
  }, [])
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-3">
      <div
        ref={container}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full ${compact ? 'max-w-4xl' : 'max-w-6xl'} flex-col overflow-hidden rounded-xl bg-white shadow-xl outline-none`}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Закрыть">
            ×
          </Button>
        </div>
        <div className="overflow-auto p-4">{children}</div>
      </div>
    </div>
  )
}
function ProjectHistoryDialog({
  workspace,
  selectedCipher,
  onClose,
}: {
  workspace: ProjectChangeWorkspace
  selectedCipher?: string
  onClose: () => void
}) {
  const scopes = [
    ...new Map(
      workspace.lines.map((line) => [
        JSON.stringify([line.project, line.cipher]),
        { project: line.project, cipher: line.cipher },
      ]),
    ).entries(),
  ]
  const [scope, setScope] = useState(
    scopes.find(([, row]) => row.cipher === selectedCipher)?.[0] ??
      scopes[0]?.[0] ??
      '',
  )
  const selected = scopes.find(([key]) => key === scope)?.[1]
  const history =
    workspace.projectChanges?.filter(
      (item) =>
        item.project === selected?.project && item.cipher === selected.cipher,
    ) ?? []
  const lineIndex = new Map(workspace.lines.map((line) => [line.id, line]))
  const transfers = (workspace.stockTransfers ?? []).filter((item) =>
    [item.fromProjectLineId, item.toProjectLineId].some((id) => {
      const line = lineIndex.get(id)
      return (
        line?.project === selected?.project && line?.cipher === selected?.cipher
      )
    }),
  )
  return (
    <ProjectDialog title="История изменений" onClose={onClose}>
      <div className="grid gap-4">
        <label className="grid gap-1 text-sm">
          Шифр
          <SelectField
            className="rounded border p-2"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            {scopes.map(([key, line]) => (
              <option key={key} value={key}>
                {line.cipher} · {line.project}
                {currentChangeNumber(
                  workspace.projectChanges,
                  line.project,
                  line.cipher,
                )
                  ? ` · ИЗМ ${currentChangeNumber(workspace.projectChanges, line.project, line.cipher)}`
                  : ''}
              </option>
            ))}
          </SelectField>
        </label>
        {!history.length && (
          <p>
            Изменений ещё нет. Исходный состав будет зафиксирован при сохранении
            первых правок.
          </p>
        )}
        {[...history].reverse().map((change) => (
          <HistoryEntry key={change.id} change={change} />
        ))}
        {!!transfers.length && (
          <details>
            <summary>Переносы между шифрами · {transfers.length}</summary>
            {[...transfers].reverse().map((item) => (
              <p key={item.id} className="border-t py-2 text-sm">
                {formatCalendarDate(item.date)} ·{' '}
                {lineIndex.get(item.fromProjectLineId)?.cipher} →{' '}
                {lineIndex.get(item.toProjectLineId)?.cipher} ·{' '}
                {lineIndex.get(item.fromProjectLineId)?.projectMaterialName} ·{' '}
                {fmt(item.quantity)}{' '}
                {lineIndex.get(item.fromProjectLineId)?.unit}
                <br />
                Партия: {item.receiptId} · {item.author}
              </p>
            ))}
          </details>
        )}
      </div>
    </ProjectDialog>
  )
}
function TransferDialog({
  workspace,
  author,
  lineId,
  onApply,
  onClose,
}: {
  workspace: ProjectChangeWorkspace
  author: string
  lineId: string
  onApply: (
    next: ProjectChangeWorkspace,
    baseline: ProjectChangeWorkspace,
  ) => Promise<void>
  onClose: () => void
}) {
  const [baseline] = useState(workspace),
    [date, setDate] = useState(localToday),
    [receiptId, setReceiptId] = useState(''),
    [toId, setToId] = useState(''),
    [quantity, setQuantity] = useState(''),
    [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<ProjectChangeWorkspace | null>(null)
  const originalRequests = useMemo(
    () => new Map(baseline.materialRequests.map((row) => [row.id, row])),
    [baseline.materialRequests],
  )
  const from = baseline.lines.find((row) => row.id === lineId)!
  const stock = availableAssignedStock(baseline, date)
  const sources = baseline.materialReceipts.filter(
    (row) =>
      (stock.get(stockAssignmentKey(row.id, lineId))?.availableApproved ?? 0) >
      0,
  )
  const consequences = projectConsequences(baseline)
  const targets = consequences.filter(
    (row) =>
      row.line.project === from.project &&
      row.line.cipher !== from.cipher &&
      getMaterialIdentityKey(row.line) === getMaterialIdentityKey(from) &&
      row.need > 0,
  )
  return (
    <ProjectDialog
      title="Перенести на другой шифр"
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      <div className="grid gap-3">
        <p>
          {from.cipher} · {from.projectMaterialName}
        </p>
        <p className="text-sm text-slate-600">
          Только свободный принятый остаток по подписанному АВК. Исходная партия
          и документы сохраняются.
        </p>
        <label>
          Дата
          <DateInput
            value={date}
            onValueChange={(value) => {
              setDate(value)
              setPreview(null)
            }}
          />
        </label>
        <label>
          Партия
          <SelectField
            aria-label="Партия переноса"
            className="block w-full rounded border p-2"
            value={receiptId}
            onChange={(event) => {
              setReceiptId(event.target.value)
              setPreview(null)
            }}
          >
            <option value="">Выберите партию</option>
            {sources.map((row) => (
              <option key={row.id} value={row.id}>
                Получение {formatCalendarDate(row.date)} · доступно{' '}
                {fmt(
                  stock.get(stockAssignmentKey(row.id, lineId))!
                    .availableApproved,
                )}{' '}
                {from.unit} · {row.id.slice(-8)}
              </option>
            ))}
          </SelectField>
        </label>
        <label>
          Принимающий шифр
          <SelectField
            aria-label="Принимающий шифр"
            className="block w-full rounded border p-2"
            value={toId}
            onChange={(event) => {
              setToId(event.target.value)
              setPreview(null)
            }}
          >
            <option value="">Выберите шифр</option>
            {targets.map((row) => (
              <option key={row.line.id} value={row.line.id}>
                {row.line.cipher} · требуется {fmt(row.need)} {row.line.unit}
              </option>
            ))}
          </SelectField>
        </label>
        <label>
          Количество
          <Input
            value={quantity}
            inputMode="decimal"
            onChange={(event) => {
              setQuantity(event.target.value)
              setPreview(null)
            }}
          />
        </label>
        <label>
          Примечание
          <Input
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              setPreview(null)
            }}
          />
        </label>
        {!sources.length && (
          <p>
            Нет свободных партий с подписанным АВК. Выданный материал сначала
            нужно вернуть с площадки.
          </p>
        )}
        {!targets.length && (
          <p>Нет другого шифра с потребностью в таком материале.</p>
        )}
        <Button
          variant="outline"
          onClick={() => {
            try {
              const change = latestProjectChange(
                baseline.projectChanges,
                from.project,
                from.cipher,
              )!
              const next = prepareStockTransfer(baseline, {
                receiptId,
                fromProjectLineId: lineId,
                toProjectLineId: toId,
                quantity: Number(quantity.replace(',', '.')),
                date,
                note,
                author,
                projectChangeId: change.id,
              })
              setPreview(next)
              setError('')
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : 'Проверьте перенос.',
              )
            }
          }}
        >
          Проверить перенос
        </Button>
        {preview && (
          <div className="rounded bg-slate-50 p-3 text-sm">
            <p>
              Будет перенесено {quantity} {from.unit}. Ожидание по заявкам
              принимающего шифра сократится на:
            </p>
            {preview.materialRequests
              .filter(
                (row) =>
                  cancelledRequestQuantity(row) >
                  cancelledRequestQuantity(originalRequests.get(row.id) ?? row),
              )
              .map((row) => (
                <p key={row.id}>
                  {row.number}:{' '}
                  {fmt(
                    cancelledRequestQuantity(row) -
                      cancelledRequestQuantity(originalRequests.get(row.id)!),
                  )}
                </p>
              ))}
          </div>
        )}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button
          disabled={!preview || saving}
          onClick={async () => {
            if (!preview) return
            setSaving(true)
            try {
              await onApply(preview, baseline)
              onClose()
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : 'Ошибка сохранения.',
              )
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Сохранение…' : 'Сохранить перенос'}
        </Button>
      </div>
    </ProjectDialog>
  )
}

function HistoryEntry({ change }: { change: ProjectChange }) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(0)
  return (
    <details
      className="rounded border p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">
        {change.kind === 'baseline'
          ? 'Исходный состав'
          : change.kind === 'revision'
            ? `ИЗМ ${change.number}`
            : 'Исправление ошибки'}{' '}
        · {formatCalendarDate(change.date)} · {change.author}
      </summary>
      {open && (
        <>
          <p className="my-2 text-sm">{change.reason}</p>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Было</th>
                  <th>Стало</th>
                  <th>Количество</th>
                </tr>
              </thead>
              <tbody>
                {change.items.slice(page * 50, (page + 1) * 50).map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-2">
                      {item.before?.projectMaterialName ?? '—'}{' '}
                      {item.before?.material} {item.before?.normativeDocument}
                    </td>
                    <td>
                      {item.after.projectMaterialName} {item.after.material}{' '}
                      {item.after.normativeDocument}
                      {item.replacesLineId ? ' · замена' : ''}
                    </td>
                    <td>
                      {item.before?.plannedQuantity ?? '—'} →{' '}
                      {item.after.plannedQuantity} {item.after.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {change.items.length > 50 && (
            <div className="mt-2 flex gap-3">
              <Button
                variant="outline"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Назад
              </Button>
              <span>
                {page + 1} / {Math.ceil(change.items.length / 50)}
              </span>
              <Button
                variant="outline"
                disabled={(page + 1) * 50 >= change.items.length}
                onClick={() => setPage(page + 1)}
              >
                Далее
              </Button>
            </div>
          )}
        </>
      )}
    </details>
  )
}
