import { describe, expect, it } from 'vitest'
import { normalizeImportRow } from './domain'
import {
  applyMaterialImportRows,
  buildIdentityLineFromImport,
} from './project-material-data'

const row = (name: string, cipher = 'ТК1', quantity = 1) =>
  normalizeImportRow(
    { projectMaterialName: name, cipher, quantity, unit: 'м' },
    1,
  )

describe('project material import indexing', () => {
  it('preserves IDs and histories, updates duplicate rows in file order and keeps ciphers separate', () => {
    const current = [
      {
        ...buildIdentityLineFromImport(row('Труба')),
        id: 'existing',
        requested: 7,
      },
    ]
    const before = structuredClone(current)
    const result = applyMaterialImportRows(current, [
      row('Труба', 'ТК1', 5),
      row('Отвод'),
      row('Труба', 'ТК2', 3),
      row('Отвод', 'ТК1', 4),
    ])
    expect(
      result.map((line) => [
        line.projectMaterialName,
        line.cipher,
        line.plannedQuantity,
      ]),
    ).toEqual([
      ['Труба', 'ТК2', 3],
      ['Отвод', 'ТК1', 4],
      ['Труба', 'ТК1', 5],
    ])
    expect(result[2]).toMatchObject({ id: 'existing', requested: 7 })
    expect(new Set(result.map((line) => line.id)).size).toBe(3)
    expect(current).toEqual(before)
  })
  it('imports and then updates 10000 materials without duplicating their IDs', () => {
    const rows = Array.from({ length: 10000 }, (_, index) =>
      row(`Материал ${index}`),
    )
    const initial = applyMaterialImportRows([], rows)
    const updated = applyMaterialImportRows(
      initial,
      rows.map((value) => ({ ...value, quantity: 2.5 })),
    )
    expect(updated).toHaveLength(10000)
    expect(updated.map((line) => line.id)).toEqual(
      initial.map((line) => line.id),
    )
    expect(updated.every((line) => line.plannedQuantity === 2.5)).toBe(true)
    expect(initial.every((line) => line.plannedQuantity === 1)).toBe(true)
  })
})
