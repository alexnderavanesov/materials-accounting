import { DateInput } from '#/components/ui/date-input'
import { SelectField } from '#/components/ui/select-field'
import { useMemo, useRef, useState } from 'react'
import { ZodError } from 'zod'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { ProjectDialog } from './project-changes-ui'
import { projectMatrixColumns } from './project-matrix-columns'
import { getMaterialIdentityKey } from './project-material-data'
import { positionLine, projectConsequences } from './project-changes'
import type { ProjectPosition } from './project-change-types'
import { localToday } from './quality-workflow'
import type { ProjectChangeWorkspace } from './project-changes'
import { cancelledRequestQuantity } from './project-change-types'
import {
  prepareProjectDraft,
  projectDraftChanges,
  projectDraftScopes,
  projectEditMetadataErrors,
} from './project-edit-draft'
import type { ProjectEditDraft } from './project-edit-draft'

const fmt = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 12 }).format(value)
const detailColumns = [
  ...projectMatrixColumns.filter(
    (column) => !['projectMaterialName', 'unit'].includes(column.key),
  ),
  { key: 'materialId', label: 'Код материала' } as const,
]
function positionValue(
  position: ProjectPosition,
  field: keyof ProjectPosition,
) {
  const value =
    field === 'materialType'
      ? position.materialType || position.category
      : position[field]
  return typeof value === 'number' ? fmt(value) : value || '—'
}
function reviewError(cause: unknown, fallback: string) {
  if (cause instanceof ZodError) {
    const field = cause.issues[0]?.path.at(-1)
    if (field === 'reason') return 'Укажите основание изменения.'
    if (field === 'date') return 'Укажите корректную дату.'
    return 'Проверьте заполнение полей и значения изменённых позиций.'
  }
  return cause instanceof Error ? cause.message : fallback
}
function FieldError({ id, message }: { id: string; message: string }) {
  return message ? (
    <span id={id} role="alert" className="text-xs text-red-700">
      {message}
    </span>
  ) : null
}
export function ProjectEditReview({
  draft,
  author,
  onApply,
  onClose,
  onRefresh,
  onSourceQuantity,
}: {
  draft: ProjectEditDraft
  author: string
  onApply: (
    workspace: ProjectChangeWorkspace,
    baseline: ProjectChangeWorkspace,
  ) => Promise<void>
  onClose: () => void
  onRefresh: () => void
  onSourceQuantity: (id: string, quantity: number) => void
}) {
  const form = useRef<HTMLFormElement>(null)
  const [selectedKind, setKind] = useState<'revision' | 'correction' | ''>('')
  const [date, setDate] = useState(localToday),
    [reason, setReason] = useState('')
  const [numbers, setNumbers] = useState<Record<string, string>>({})
  const [replacements, setReplacements] = useState<Record<string, string>>({})
  const [prepared, setPrepared] = useState<{
    draft: ProjectEditDraft
    workspace: ProjectChangeWorkspace
  } | null>(null)
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false)
  const [showValidation, setShowValidation] = useState(false),
    [saveFailed, setSaveFailed] = useState(false)
  const [page, setPage] = useState(0),
    [impactPage, setImpactPage] = useState(0)
  const changes = useMemo(() => projectDraftChanges(draft), [draft])
  const scopes = useMemo(
    () => projectDraftScopes(draft, changes),
    [draft, changes],
  )
  const changedScopes = scopes.filter((scope) => !scope.initialImport)
  const initialScopes = scopes.filter((scope) => scope.initialImport)
  const onlyBaseline = initialScopes.length > 0 && !changedScopes.length
  const kind = onlyBaseline ? 'baseline' : selectedKind
  const errors = projectEditMetadataErrors(scopes, {
    kind,
    date,
    reason,
    numbers,
  })
  const originalById = useMemo(
    () => new Map(draft.baseline.lines.map((line) => [line.id, line])),
    [draft.baseline],
  )
  const currentById = useMemo(
    () => new Map(draft.lines.map((line) => [line.id, line])),
    [draft.lines],
  )
  const preview = prepared?.draft === draft ? prepared.workspace : null
  const previousChanges = new Set(
    draft.baseline.projectChanges?.map((change) => change.id),
  )
  const affected = new Set(
    preview?.projectChanges
      ?.filter((change) => !previousChanges.has(change.id))
      .flatMap((change) =>
        change.items
          .filter(
            (item) =>
              change.kind !== 'baseline' || !originalById.has(item.after.id),
          )
          .map((item) => item.after.id),
      ),
  )
  const consequences = preview
    ? projectConsequences(preview).filter(
        (row) => affected.has(row.line.id!) && (row.surplus || row.toRequest),
      )
    : []
  const oldRequests = new Map(
    draft.baseline.materialRequests.map((row) => [row.id, row]),
  )
  const cancellations =
    preview?.materialRequests.flatMap((row) => {
      const amount =
        cancelledRequestQuantity(row) -
        cancelledRequestQuantity(oldRequests.get(row.id) ?? row)
      return amount > 0 ? [{ row, amount }] : []
    }) ?? []
  const impactRows = [
    ...cancellations.map(({ row, amount }) => ({
      key: `request:${row.id}`,
      text: `Заявка ${row.number ?? row.id}: отменить ожидание ${fmt(amount)}`,
    })),
    ...consequences.map((row) => ({
      key: `line:${row.line.id}`,
      text: `${consequences.length > 1 ? `${row.line.cipher} · ${row.line.projectMaterialName}: ` : ''}${row.surplus ? `Требует решения ${fmt(row.surplus)} ${row.line.unit}${row.fromSite ? `, с площадки ${fmt(row.fromSite)}` : ''}` : `Требуется заявить ${fmt(row.toRequest)} ${row.line.unit}`}`,
    })),
  ]
  const showDetails = changes.some(
    ({ before, after, fields }) =>
      !before ||
      detailColumns.some((column) => fields.has(column.key)) ||
      (kind === 'revision' &&
        getMaterialIdentityKey(positionLine(before)) !==
          getMaterialIdentityKey(positionLine(after))),
  )
  const invalidate = () => {
    setPrepared(null)
    setImpactPage(0)
    setError('')
    setSaveFailed(false)
  }
  function prepare() {
    setShowValidation(true)
    if (
      errors.kind ||
      errors.date ||
      errors.reason ||
      Object.keys(errors.numbers).length
    ) {
      // Wait for aria-invalid to render before focusing the first invalid field.
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      )
      return
    }
    if (!kind) return
    try {
      setPrepared({
        draft,
        workspace: prepareProjectDraft(draft, {
          kind,
          date,
          reason,
          author,
          numbers,
          replacements,
        }),
      })
      setError('')
      setSaveFailed(false)
    } catch (cause) {
      setError(reviewError(cause, 'Проверьте правки.'))
    }
  }
  function numberField(
    scope: (typeof scopes)[number],
    index: number,
    multiple = false,
  ) {
    const message = showValidation ? (errors.numbers[scope.key] ?? '') : ''
    return (
      <label key={scope.key} className="grid content-start gap-1 text-sm">
        {multiple ? (
          <span className="break-words">
            {scope.cipher}
            {scopes.some(
              (other) =>
                other.key !== scope.key && other.cipher === scope.cipher,
            )
              ? ` · ${scope.project}`
              : ''}
          </span>
        ) : (
          'Номер ИЗМ'
        )}
        <Input
          aria-label={`Номер ИЗМ ${scope.cipher}`}
          aria-invalid={Boolean(message)}
          aria-describedby={
            message ? `project-number-error-${index}` : undefined
          }
          value={numbers[scope.key] ?? ''}
          onChange={(event) => {
            setNumbers((current) => ({
              ...current,
              [scope.key]: event.target.value,
            }))
            invalidate()
          }}
        />
        <FieldError id={`project-number-error-${index}`} message={message} />
      </label>
    )
  }
  return (
    <ProjectDialog
      title={
        onlyBaseline
          ? 'Сохранить исходный состав'
          : 'Сохранить изменения проекта'
      }
      compact
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      <form
        ref={form}
        noValidate
        className="grid gap-5"
        onSubmit={async (event) => {
          event.preventDefault()
          if (saving) return
          if (!preview) {
            prepare()
            return
          }
          setSaving(true)
          try {
            await onApply(preview, draft.baseline)
          } catch (cause) {
            setError(reviewError(cause, 'Не удалось сохранить изменения.'))
            setSaveFailed(true)
          } finally {
            setSaving(false)
          }
        }}
      >
        <p className="break-words text-sm text-stone-500">
          {scopes.length === 1 ? (
            <>
              Шифр{' '}
              <span className="font-medium text-stone-700">
                {scopes[0]!.cipher}
              </span>{' '}
              ·{' '}
            </>
          ) : (
            <>Шифров: {scopes.length} · </>
          )}
          Позиций: {changes.length}
        </p>
        <fieldset disabled={saving} className="grid gap-4">
          <legend className="sr-only">Данные для сохранения</legend>
          {initialScopes.length > 0 && !onlyBaseline && (
            <p className="text-sm">
              Исходный состав для новых шифров:{' '}
              {initialScopes.map((scope) => scope.cipher).join(', ')}.
            </p>
          )}
          {!onlyBaseline && (
            <div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="text-stone-500">
                  {initialScopes.length
                    ? `Причина изменения для ${changedScopes.map((scope) => scope.cipher).join(', ')}`
                    : 'Причина изменения'}
                </span>
                {(
                  [
                    {
                      value: 'correction',
                      label: 'Ошибка',
                      hint: 'Исправляем ошибку во введённых данных',
                    },
                    {
                      value: 'revision',
                      label: 'ИЗМ',
                      hint: 'Получен изменённый проект',
                    },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    title={option.hint}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="radio"
                      name="project-edit-reason"
                      checked={kind === option.value}
                      aria-invalid={showValidation && Boolean(errors.kind)}
                      aria-describedby={
                        showValidation && errors.kind
                          ? 'project-kind-error'
                          : undefined
                      }
                      onChange={() => {
                        setKind(option.value)
                        invalidate()
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <FieldError
                id="project-kind-error"
                message={showValidation ? errors.kind : ''}
              />
            </div>
          )}
          <div
            className={`grid items-start gap-3 ${kind === 'revision' && changedScopes.length === 1 ? 'sm:grid-cols-[10rem_7rem_minmax(0,1fr)]' : 'sm:grid-cols-[10rem_minmax(0,1fr)]'}`}
          >
            <label className="grid gap-1 text-sm">
              Дата
              <DateInput
                value={date}
                aria-invalid={showValidation && Boolean(errors.date)}
                aria-describedby={
                  showValidation && errors.date
                    ? 'project-date-error'
                    : undefined
                }
                onValueChange={(value) => {
                  setDate(value)
                  invalidate()
                }}
              />
              <FieldError
                id="project-date-error"
                message={showValidation ? errors.date : ''}
              />
            </label>
            {kind === 'revision' &&
              changedScopes.length === 1 &&
              numberField(changedScopes[0]!, 0)}
            {!onlyBaseline && (
              <label className="grid gap-1 text-sm">
                {kind === 'correction'
                  ? 'Причина исправления'
                  : 'Основание изменения'}
                <Input
                  aria-label="Основание / причина"
                  value={reason}
                  placeholder={
                    kind === 'correction'
                      ? 'Например, опечатка в количестве'
                      : 'Например, письмо или новая спецификация'
                  }
                  aria-invalid={showValidation && Boolean(errors.reason)}
                  aria-describedby={
                    showValidation && errors.reason
                      ? 'project-reason-error'
                      : undefined
                  }
                  onChange={(event) => {
                    setReason(event.target.value)
                    invalidate()
                  }}
                />
                <FieldError
                  id="project-reason-error"
                  message={showValidation ? errors.reason : ''}
                />
              </label>
            )}
          </div>
          {kind === 'revision' && changedScopes.length > 1 && (
            <div className="grid gap-2">
              <p className="text-sm text-stone-500">
                Номер ИЗМ по каждому шифру
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {changedScopes.map((scope, index) =>
                  numberField(scope, index, true),
                )}
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-sm"
              aria-label="Предпросмотр изменений проекта"
            >
              <thead className="text-stone-500">
                <tr>
                  <th className="py-2 pr-4 font-normal">Материал</th>
                  {showDetails && (
                    <th className="py-2 pr-4 font-normal">Изменения</th>
                  )}
                  <th className="py-2 pl-2 text-right font-normal">
                    Количество
                  </th>
                </tr>
              </thead>
              <tbody>
                {changes
                  .slice(page * 50, (page + 1) * 50)
                  .map(({ before, after, fields }) => {
                    const quantityChanged =
                      !before ||
                      before.plannedQuantity !== after.plannedQuantity ||
                      before.unit !== after.unit
                    const delta =
                      after.plannedQuantity - (before?.plannedQuantity ?? 0)
                    const candidates = !before
                      ? draft.baseline.lines.filter(
                          (line) =>
                            line.project === after.project &&
                            line.cipher === after.cipher,
                        )
                      : []
                    return (
                      <tr
                        key={after.id}
                        className="border-t border-stone-200 align-top"
                      >
                        <td className="py-3 pr-4">
                          <div className="font-medium">
                            {after.projectMaterialName}
                          </div>
                          {scopes.length > 1 && (
                            <div className="mt-1 text-xs text-stone-500">
                              {after.cipher}
                              {scopes.some(
                                (scope) =>
                                  scope.cipher === after.cipher &&
                                  scope.project !== after.project,
                              )
                                ? ` · ${after.project}`
                                : ''}
                            </div>
                          )}
                          {before && fields.has('projectMaterialName') && (
                            <div className="mt-1 text-xs text-stone-500">
                              Было: {before.projectMaterialName}
                            </div>
                          )}
                          {!before && (
                            <div className="mt-1 text-xs text-stone-500">
                              Новая позиция
                            </div>
                          )}
                        </td>
                        {showDetails && (
                          <td className="py-3 pr-4">
                            <div className="grid gap-2">
                              {detailColumns
                                .filter(
                                  (column) =>
                                    fields.has(column.key) &&
                                    (before ||
                                      positionValue(after, column.key) !== '—'),
                                )
                                .map((column) => (
                                  <div key={column.key}>
                                    <span className="text-stone-500">
                                      {column.label}:{' '}
                                    </span>
                                    {before && (
                                      <>
                                        <span className="text-stone-500">
                                          {positionValue(before, column.key)}
                                        </span>{' '}
                                        →{' '}
                                      </>
                                    )}
                                    {positionValue(after, column.key)}
                                  </div>
                                ))}
                              {before &&
                                kind === 'revision' &&
                                getMaterialIdentityKey(positionLine(before)) !==
                                  getMaterialIdentityKey(
                                    positionLine(after),
                                  ) && (
                                  <p className="text-xs text-stone-500">
                                    Будет создана связанная новая позиция
                                  </p>
                                )}
                              {!before && candidates.length > 0 && (
                                <div className="grid gap-2">
                                  <SelectField
                                    aria-label={`Заменяет ${after.projectMaterialName}`}
                                    className="w-full max-w-64 rounded border border-stone-200 p-2"
                                    value={replacements[after.id] ?? ''}
                                    onChange={(event) => {
                                      setReplacements((current) => ({
                                        ...current,
                                        [after.id]: event.target.value,
                                      }))
                                      invalidate()
                                    }}
                                  >
                                    <option value="">Новая потребность</option>
                                    {candidates.map((line) => (
                                      <option key={line.id} value={line.id}>
                                        {line.projectMaterialName} ·{' '}
                                        {line.material} · {line.plannedQuantity}{' '}
                                        {line.unit}
                                      </option>
                                    ))}
                                  </SelectField>
                                  {!!replacements[after.id] && (
                                    <label className="grid gap-1 text-xs">
                                      Остаток старой потребности
                                      <Input
                                        type="number"
                                        min="0"
                                        step="any"
                                        aria-label={`Остаток старой потребности ${after.projectMaterialName}`}
                                        value={
                                          currentById.get(
                                            replacements[after.id],
                                          )?.plannedQuantity ?? 0
                                        }
                                        onChange={(event) => {
                                          const value = Number(
                                            event.target.value,
                                          )
                                          if (
                                            Number.isFinite(value) &&
                                            value >= 0
                                          ) {
                                            onSourceQuantity(
                                              replacements[after.id]!,
                                              value,
                                            )
                                            invalidate()
                                          }
                                        }}
                                      />
                                      <span className="text-stone-500">
                                        Было:{' '}
                                        {
                                          originalById.get(
                                            replacements[after.id],
                                          )?.plannedQuantity
                                        }
                                        . Для полной замены укажите 0.
                                      </span>
                                    </label>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="py-3 pl-2 text-right whitespace-nowrap">
                          {before && quantityChanged && (
                            <>
                              <span className="text-stone-500">
                                {fmt(before.plannedQuantity)}
                                {before.unit !== after.unit
                                  ? ` ${before.unit}`
                                  : ''}
                              </span>{' '}
                              →{' '}
                            </>
                          )}
                          <span className="font-medium">
                            {fmt(after.plannedQuantity)} {after.unit}
                          </span>
                          {!!delta &&
                            (!before || before.unit === after.unit) && (
                              <div className="mt-1 text-xs text-stone-500">
                                {delta > 0 ? '+' : ''}
                                {fmt(delta)} {after.unit}
                              </div>
                            )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          {changes.length > 50 && (
            <div className="flex items-center justify-end gap-3 text-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Назад
              </Button>
              <span>
                {page + 1} / {Math.ceil(changes.length / 50)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={(page + 1) * 50 >= changes.length}
                onClick={() => setPage(page + 1)}
              >
                Далее
              </Button>
            </div>
          )}
        </fieldset>
        {preview && (
          <section
            aria-label="Последствия изменений"
            className="grid max-h-64 gap-2 overflow-auto rounded-md bg-stone-50 p-3 text-sm"
          >
            <h3 className="font-medium">Последствия</h3>
            {!impactRows.length && <p>Сокращения ожидания и излишков нет.</p>}
            {impactRows
              .slice(impactPage * 50, (impactPage + 1) * 50)
              .map((row) => (
                <p key={row.key}>{row.text}</p>
              ))}
            {impactRows.length > 50 && (
              <nav
                aria-label="Страницы последствий"
                className="flex items-center gap-2"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!impactPage}
                  onClick={() => setImpactPage(impactPage - 1)}
                >
                  Предыдущие последствия
                </Button>
                <span>
                  {impactPage + 1} / {Math.ceil(impactRows.length / 50)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={(impactPage + 1) * 50 >= impactRows.length}
                  onClick={() => setImpactPage(impactPage + 1)}
                >
                  Следующие последствия
                </Button>
              </nav>
            )}
            {consequences.some((row) => row.surplus) && (
              <p className="text-xs text-stone-500">
                Возврат или перенос оформляется после сохранения.
              </p>
            )}
          </section>
        )}
        {error && (
          <div className="grid gap-2 text-sm">
            <p role="alert" className="text-red-700">
              {error}
            </p>
            {saveFailed && (
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                disabled={saving}
                onClick={() => {
                  try {
                    onRefresh()
                    invalidate()
                  } catch (cause) {
                    setError(reviewError(cause, 'Обновите данные.'))
                  }
                }}
              >
                Обновить предпросмотр
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={onClose}
          >
            Вернуться к таблице
          </Button>
          <Button type="submit" disabled={saving}>
            {saving
              ? 'Сохранение…'
              : preview
                ? onlyBaseline
                  ? 'Сохранить исходный состав'
                  : 'Подтвердить и сохранить'
                : 'Показать последствия'}
          </Button>
        </div>
      </form>
    </ProjectDialog>
  )
}
