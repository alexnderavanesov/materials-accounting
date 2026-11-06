import { describe, expect, it } from 'vitest'
import { normalizeImportRow } from './domain'
import {
  applyMaterialImportRows,
  buildIdentityLineFromImport,
  previewMaterialImportRows,
} from './project-material-data'

const row = (name: string, cipher = 'ТК1', quantity = 1) =>
  normalizeImportRow(
    { projectMaterialName: name, cipher, quantity, unit: 'м' },
    1,
  )

describe('project material import indexing', () => {
  it('previews exact changes per cipher, including clearing a revision and starting from zero', () => {
    const current = [
      {
        ...buildIdentityLineFromImport(row('Труба', 'ТК1', 0)),
        id: 'one',
        changeNumber: '2',
      },
      { ...buildIdentityLineFromImport(row('Труба', 'ТК2', 100)), id: 'two' },
    ]
    const before = structuredClone(current)
    const imported = [
      row('Труба', 'ТК1', 3.5),
      row('Труба', 'ТК2', 100),
      row('Труба', 'ТК3', 7),
      row('Отвод'),
    ]
    const preview = previewMaterialImportRows(current, imported)
    expect(preview[0]).toMatchObject({
      existing: true,
      changes: [
        { field: 'changeNumber', before: '2', after: '' },
        { field: 'plannedQuantity', before: 0, after: 3.5 },
      ],
    })
    expect(preview[1]).toMatchObject({ existing: true, changes: [] })
    expect(preview[2]).toMatchObject({
      existing: false,
      existingMaterial: true,
      changes: [],
    })
    expect(preview[3]).toMatchObject({
      existing: false,
      existingMaterial: false,
      changes: [],
    })
    const applied = applyMaterialImportRows(current, imported)
    for (const [index, id] of ['one', 'two'].entries()) {
      const after = applied.find((line) => line.id === id)!
      for (const change of preview[index]!.changes)
        expect(after[change.field] ?? '').toBe(change.after)
    }
    expect(current).toEqual(before)
  })

  it('compares the final duplicate with the database, not an intermediate file value', () => {
    const current = [
      {
        ...buildIdentityLineFromImport(row('Труба', 'ТК1', 10)),
        id: 'existing',
      },
    ]
    const imported = [
      { ...row('Труба', 'ТК1', 5), rowNumber: 1 },
      { ...row('Труба', 'ТК1', 12), rowNumber: 2 },
      { ...row('Отвод'), rowNumber: 3 },
      { ...row('Отвод', 'ТК1', 4), rowNumber: 4 },
    ]
    const preview = previewMaterialImportRows(current, imported)
    expect(preview.map((item) => item.supersededBy)).toEqual([2, null, 4, null])
    expect(preview[1]!.changes).toEqual([
      {
        field: 'plannedQuantity',
        label: 'Количество по шифру',
        before: 10,
        after: 12,
      },
    ])
    expect(preview[3]).toMatchObject({ existing: false, changes: [] })
    expect(
      applyMaterialImportRows(current, imported).find(
        (line) => line.id === 'existing',
      )?.plannedQuantity,
    ).toBe(12)
  })

  it('treats changed identity fields as new materials and reflects current database values', () => {
    const imported = row('Труба', 'ТК1', 5)
    const original = {
      ...buildIdentityLineFromImport(imported),
      id: 'existing',
    }
    for (const changed of [
      { ...original, unit: 'шт' },
      { ...original, unitWeight: 2 },
      { ...original, alternativeUnit: 'кг', alternativeUnitFactor: 2 },
    ])
      expect(
        previewMaterialImportRows([changed], [imported])[0]!.existing,
      ).toBe(false)
    expect(
      previewMaterialImportRows(
        [{ ...original, plannedQuantity: 30 }],
        [imported],
      )[0]!.changes,
    ).toEqual([
      {
        field: 'plannedQuantity',
        label: 'Количество по шифру',
        before: 30,
        after: 5,
      },
    ])
  })

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
    const preview = previewMaterialImportRows(
      initial,
      rows.map((value) => ({ ...value, quantity: 2.5 })),
    )
    expect(preview).toHaveLength(10000)
    expect(
      preview.every(
        (item) =>
          item.existing &&
          item.changes.length === 1 &&
          item.changes[0]?.before === 1 &&
          item.changes[0].after === 2.5,
      ),
    ).toBe(true)
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
