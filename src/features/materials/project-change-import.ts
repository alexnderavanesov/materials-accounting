import { validateImportDraft } from './domain'
import {
  buildIdentityLineFromImport,
  getMaterialIdentityKey,
} from './project-material-data'
import { positionLine, projectPosition } from './project-changes'
import type { ImportRowInput } from './types'
import type { ProjectPosition } from './project-change-types'

/** Missing rows are exclusions only for an explicitly selected full specification. */
export function importProjectRevision(
  current: ProjectPosition[],
  rows: ImportRowInput[],
  mode: 'full' | 'changes',
  project: string,
  cipher: string,
) {
  const draft = validateImportDraft(rows)
  if (!draft.rows.length) throw new Error('В файле нет позиций.')
  const invalid = draft.rows.find(
    (row) => row.errors.length || row.cipher !== cipher,
  )
  if (invalid)
    throw new Error(
      `Строка ${invalid.rowNumber}: ${invalid.errors.join('; ') || 'шифр отличается от выбранного'}.`,
    )
  const existing = new Map(
    current.map((row) => [getMaterialIdentityKey(positionLine(row)), row]),
  )
  const matched = new Set<string>()
  const result = new Map(
    current.map((row) => [
      row.id,
      mode === 'full' ? { ...row, plannedQuantity: 0 } : row,
    ]),
  )
  for (const row of draft.rows) {
    const line = { ...buildIdentityLineFromImport(row), project, cipher }
    const identity = getMaterialIdentityKey(line)
    if (matched.has(identity))
      throw new Error(
        `Строка ${row.rowNumber}: материал повторяется в файле. Объедините количества перед импортом.`,
      )
    matched.add(identity)
    const old = existing.get(identity)
    const position = projectPosition({
      ...line,
      id: old?.id ?? crypto.randomUUID(),
    })
    result.set(position.id, position)
  }
  return [...result.values()]
}
