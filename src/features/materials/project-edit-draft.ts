import { getAlternativeConversionError } from './domain'
import { projectMatrixColumns } from './project-matrix-columns'
import { getMaterialIdentityKey } from './project-material-data'
import { importProjectRevision } from './project-change-import'
import {
  cipherKey,
  positionLine,
  prepareProjectChange,
  projectPosition,
} from './project-changes'
import type { ProjectChangeWorkspace } from './project-changes'
import type { ProjectPosition } from './project-change-types'
import type { ImportRowInput, SubobjectMaterialMetric } from './types'
import { jsonEqual } from './workspace-protocol'
import { parseProjectQuantity } from './project-grid-state'
import { validateProjectUnitChanges } from './project-unit-guard'
import { normalizeCalendarDate } from './calendar-date'

export type ProjectEditableField = (typeof projectMatrixColumns)[number]['key']
export type ProjectEditDraft = {
  baseline: ProjectChangeWorkspace
  lines: SubobjectMaterialMetric[]
}
export type ProjectEditMetadata = {
  kind: 'revision' | 'correction'
  date: string
  reason: string
  author: string
  numbers: Record<string, string>
  replacements: Record<string, string>
}
export function projectEditMetadataErrors(
  draft: ProjectEditDraft,
  metadata: Pick<ProjectEditMetadata, 'date' | 'reason' | 'numbers'> & {
    kind: ProjectEditMetadata['kind'] | ''
  },
) {
  return {
    kind: metadata.kind ? '' : 'Выберите «Ошибка» или «ИЗМ».',
    date:
      /^\d{4}-\d{2}-\d{2}$/.test(metadata.date) &&
      normalizeCalendarDate(metadata.date) === metadata.date
        ? ''
        : 'Укажите корректную дату.',
    reason: metadata.reason.trim()
      ? ''
      : metadata.kind === 'correction'
        ? 'Укажите причину исправления.'
        : 'Укажите основание изменения.',
    numbers: Object.fromEntries(
      projectDraftScopes(draft)
        .filter(
          (scope) =>
            metadata.kind === 'revision' &&
            !metadata.numbers[scope.key]?.trim(),
        )
        .map((scope) => [scope.key, 'Укажите номер ИЗМ.']),
    ),
  }
}
export function projectFieldValue(
  field: ProjectEditableField,
  value: unknown,
): string | number | null {
  const text = String(value ?? '').trim()
  if (field === 'unitWeight' || field === 'alternativeUnitFactor') {
    if (!text) return null
    const amount = parseProjectQuantity(value)
    if (amount === null || (field === 'alternativeUnitFactor' && amount === 0))
      throw new Error(
        field === 'unitWeight'
          ? 'Введите массу не меньше нуля.'
          : 'Коэффициент должен быть больше нуля.',
      )
    return amount
  }
  if (['projectMaterialName', 'unit', 'materialType'].includes(field) && !text)
    throw new Error('Это поле не может быть пустым.')
  return text
}
export function updateProjectFields(
  lines: SubobjectMaterialMetric[],
  ids: string[],
  field: ProjectEditableField,
  value: unknown,
) {
  const parsed = projectFieldValue(field, value),
    selected = new Set(ids)
  return lines.map((line) =>
    selected.has(line.id!)
      ? {
          ...line,
          [field]: parsed,
          ...(field === 'materialType' ? { category: String(parsed) } : {}),
        }
      : line,
  )
}
function equalPositionField(
  before: ProjectPosition,
  after: ProjectPosition,
  field: keyof ProjectPosition,
) {
  const value = (position: ProjectPosition) =>
    field === 'materialType'
      ? position.materialType || position.category
      : (position[field] ?? '')
  return jsonEqual(value(before), value(after))
}
export function projectDraftChanges(draft: ProjectEditDraft) {
  const old = new Map(
    draft.baseline.lines.map((line) => [line.id, projectPosition(line)]),
  )
  return draft.lines.flatMap((line) => {
    const before = old.get(line.id),
      after = projectPosition(line)
    if (before && jsonEqual(before, after)) return []
    const fields = new Set<string>()
    for (const field of [
      ...projectMatrixColumns.map((column) => column.key),
      'plannedQuantity',
      'materialId',
      'category',
    ] as const)
      if (!before || !equalPositionField(before, after, field))
        fields.add(field)
    return before && !fields.size
      ? []
      : [{ before: before ?? null, after, fields }]
  })
}
export function projectDraftScopes(draft: ProjectEditDraft) {
  return [
    ...new Map(
      projectDraftChanges(draft).map(({ after }) => [
        cipherKey(after.project, after.cipher),
        {
          key: cipherKey(after.project, after.cipher),
          project: after.project,
          cipher: after.cipher,
        },
      ]),
    ).values(),
  ]
}
/** The same staged positions become corrections or replacements only after the user selects the reason. */
export function prepareProjectDraft(
  draft: ProjectEditDraft,
  metadata: ProjectEditMetadata,
) {
  const errors = projectEditMetadataErrors(draft, metadata)
  const metadataError =
    errors.kind ||
    errors.date ||
    errors.reason ||
    Object.values(errors.numbers)[0]
  if (metadataError) throw new Error(metadataError)
  for (const { before, after, fields } of projectDraftChanges(draft)) {
    if (
      !before ||
      fields.has('alternativeUnit') ||
      fields.has('alternativeUnitFactor')
    ) {
      const error = getAlternativeConversionError(
        after.alternativeUnit ?? '',
        after.alternativeUnitFactor,
      )
      if (error) throw new Error(`${after.projectMaterialName}: ${error}`)
    }
  }
  const scopes = projectDraftScopes(draft)
  if (!scopes.length) throw new Error('Нет изменений для сохранения.')
  const originals = new Map(
    draft.baseline.lines.map((line) => [line.id, projectPosition(line)]),
  )
  const unallocated = draft.lines.find(
    (line) => !originals.has(line.id) && line.plannedQuantity === 0,
  )
  if (unallocated)
    throw new Error(
      `Укажите количество по шифру для новой позиции «${unallocated.projectMaterialName}» перед сохранением.`,
    )
  let next = draft.baseline
  const usedReplacements = new Set<string>()
  for (const scope of scopes) {
    const positions = new Map(
      draft.lines
        .filter((line) => cipherKey(line.project, line.cipher) === scope.key)
        .map((line) => [line.id!, projectPosition(line)]),
    )
    const replacements: Record<string, string> = {}
    for (const [id, sourceId] of Object.entries(metadata.replacements)) {
      if (!sourceId || !positions.has(id)) continue
      const fresh = positions.get(id)!,
        source = positions.get(sourceId)
      if (
        originals.has(id) ||
        !originals.has(sourceId) ||
        !source ||
        sourceId === id
      )
        throw new Error('Для замены выберите исходную позицию того же шифра.')
      if (usedReplacements.has(sourceId))
        throw new Error(
          'Одна исходная позиция не может быть связана с несколькими новыми строками в этом сохранении.',
        )
      usedReplacements.add(sourceId)
      if (metadata.kind === 'correction') {
        if (source.plannedQuantity > 0)
          throw new Error(
            'Для исправления характеристики обнулите старую строку. Частичную замену оформляйте как ИЗМ.',
          )
        positions.delete(id)
        positions.set(sourceId, { ...fresh, id: sourceId })
      } else {
        if (source.plannedQuantity >= originals.get(sourceId)!.plannedQuantity)
          throw new Error(
            'Уменьшите старую потребность для замены. Для полной замены укажите 0.',
          )
        replacements[id] = sourceId
      }
    }
    if (metadata.kind === 'revision')
      for (const [id, after] of [...positions]) {
        const before = originals.get(id)
        if (
          !before ||
          getMaterialIdentityKey(positionLine(before)) ===
            getMaterialIdentityKey(positionLine(after))
        )
          continue
        const replacementId = crypto.randomUUID()
        positions.set(id, { ...before, plannedQuantity: 0 })
        positions.set(replacementId, { ...after, id: replacementId })
        replacements[replacementId] = id
      }
    next = prepareProjectChange(next, {
      project: scope.project,
      cipher: scope.cipher,
      kind: metadata.kind,
      number:
        metadata.kind === 'revision'
          ? (metadata.numbers[scope.key]?.trim() ?? '')
          : '',
      date: metadata.date,
      reason: metadata.reason,
      author: metadata.author,
      positions: [...positions.values()],
      replacements,
    })
  }
  validateProjectUnitChanges(next.lines, draft.baseline.lines, draft.baseline)
  return next
}
/** Full mode excludes missing rows only in ciphers present in the import. Other ciphers remain untouched. */
export function importProjectDraft(
  draft: ProjectEditDraft,
  rows: ImportRowInput[],
  mode: 'full' | 'changes',
) {
  if (!rows.length) throw new Error('В файле нет позиций.')
  const groups = new Map<string, ImportRowInput[]>()
  for (const row of rows) {
    const cipher = row.cipher?.trim()
    if (!cipher) throw new Error('Укажите шифр для каждой строки Excel.')
    const entries = groups.get(cipher) ?? []
    entries.push(row)
    groups.set(cipher, entries)
  }
  let lines = draft.lines
  for (const [cipher, entries] of groups) {
    const current = lines.filter((line) => line.cipher === cipher)
    const projects = new Set(current.map((line) => line.project))
    if (projects.size > 1)
      throw new Error(
        `Шифр ${cipher} есть в нескольких проектах. Разделите импорт по проектам.`,
      )
    const project =
      current[0]?.project ?? (entries[0]!.project?.trim() || 'Проектная база')
    const imported = importProjectRevision(
      current.map(projectPosition),
      entries,
      mode,
      project,
      cipher,
    )
    const originals = new Map(lines.map((line) => [line.id, line]))
    lines = [
      ...lines.filter((line) => line.cipher !== cipher),
      ...imported.map((position) => {
        const original = originals.get(position.id)
        const merged = { ...positionLine(position), ...original, ...position }
        if (original) {
          const before = projectPosition(original)
          for (const key of Object.keys(position) as Array<
            keyof ProjectPosition
          >)
            if (equalPositionField(before, position, key))
              Object.assign(merged, { [key]: original[key] })
        }
        return merged
      }),
    ]
  }
  return { ...draft, lines }
}

/** Keep local edits when unrelated operations change; never overwrite a concurrently edited field. */
export function refreshProjectDraft(
  draft: ProjectEditDraft,
  workspace: ProjectChangeWorkspace,
): ProjectEditDraft {
  const latest = new Map(workspace.lines.map((line) => [line.id, line]))
  for (const { before, after, fields } of projectDraftChanges(draft)) {
    if (!before) {
      if (latest.has(after.id))
        throw new Error(
          'Новая позиция уже появилась в базе. Проверьте черновик.',
        )
      latest.set(after.id, positionLine(after))
      continue
    }
    const current = latest.get(after.id)
    if (!current)
      throw new Error(
        `Позиция «${before.projectMaterialName}» удалена другим пользователем. Ваши правки сохранены в черновике.`,
      )
    const currentPosition = projectPosition(current)
    for (const field of fields) {
      const key = field as keyof ProjectPosition
      if (
        !jsonEqual(currentPosition[key], before[key]) &&
        !jsonEqual(currentPosition[key], after[key])
      )
        throw new Error(
          `Поле «${field}» позиции «${before.projectMaterialName}» изменено другим пользователем. Отмените эту правку и внесите её заново после сверки значений.`,
        )
    }
    const patch = Object.fromEntries(
      [...fields].map((field) => [
        field,
        after[field as keyof ProjectPosition],
      ]),
    )
    latest.set(after.id, {
      ...current,
      ...patch,
      ...(fields.has('materialType') ? { category: after.category } : {}),
    })
  }
  return { baseline: workspace, lines: [...latest.values()] }
}
