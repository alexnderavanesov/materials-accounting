import { expect, it } from 'vitest'
import { validateProjectUnitChanges } from './project-unit-guard'
import {
  applyMaterialImportRows,
  buildIdentityLineFromImport,
} from './project-material-data'
import { normalizeImportRow } from './domain'

const previous = [{ id: 'line', unit: 'м', projectMaterialName: 'Труба' }]
const next = [{ ...previous[0], unit: 'шт' }]
it.each([
  { materialRequests: [{ projectLineId: 'line' }] },
  { materialReceipts: [{ projectLineId: 'line' }] },
  { materialIssues: [{ projectLineId: 'line' }] },
  {
    qualityWorkflow: {
      cases: [{ revisions: [{ zni: { rows: [{ projectLineId: 'line' }] } }] }],
    },
  },
])('protects primary units referenced by operations: %j', (history) => {
  expect(() => validateProjectUnitChanges(next, previous, history)).toThrow(
    'основную единицу',
  )
  expect(() =>
    validateProjectUnitChanges(previous, previous, history),
  ).not.toThrow()
})
it('allows unused units and alternative conversion changes', () => {
  expect(() => validateProjectUnitChanges(next, previous, {})).not.toThrow()
  const alternatives = [
    { ...previous[0], alternativeUnit: 'кг', alternativeUnitFactor: 3 },
  ]
  expect(() =>
    validateProjectUnitChanges(alternatives, previous, {
      materialRequests: [{ projectLineId: 'line' }],
    }),
  ).not.toThrow()
})
it('imports a different unit as a separate material without rewriting the used original', () => {
  const original = normalizeImportRow(
    { projectMaterialName: 'Труба', cipher: 'ТК1', unit: 'м', quantity: 10 },
    1,
  )
  const lines = [{ ...buildIdentityLineFromImport(original), id: 'line' }]
  const imported = applyMaterialImportRows(lines, [{ ...original, unit: 'шт' }])
  expect(imported).toHaveLength(2)
  expect(imported.find((line) => line.id === 'line')).toEqual(lines[0])
  expect(() =>
    validateProjectUnitChanges(imported, lines, {
      materialRequests: [{ projectLineId: 'line' }],
    }),
  ).not.toThrow()
})
