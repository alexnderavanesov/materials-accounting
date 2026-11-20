import { expect, it } from 'vitest'
import { matchM15ProjectMaterials } from './m15-project-materials'
import type { M15ProjectMaterial } from './m15-project-materials'
import type { M15Line } from './m15-reconciliation'

const material: M15ProjectMaterial = {
  id: 'project1',
  cipher: 'A',
  name: 'Датчик PT 720-PG2150',
  unit: 'шт',
}
const line: M15Line = {
  id: 'row1',
  position: '1',
  name: material.name,
  unit: 'шт',
  quantity: 2,
}

it('matches a unique name and unit within its cipher, ignoring only case and spacing', () => {
  const result = matchM15ProjectMaterials(
    [{ ...line, name: '  ДАТЧИК  PT 720-PG2150 ', unit: 'ШТ.' }],
    [],
    [{ ...material, id: 'other', cipher: 'B' }, material],
    'A',
  )
  expect(result[0]!.projectLineId).toBe('project1')
})
it('leaves ambiguous names, different units and similar model numbers for manual selection', () => {
  const lines = [
    line,
    { ...line, id: 'different-model', name: 'Датчик PT 720-PG2141' },
    { ...line, id: 'different-unit', unit: 'компл' },
  ]
  const result = matchM15ProjectMaterials(
    lines,
    [],
    [material, { ...material, id: 'duplicate' }],
    'A',
  )
  expect(result.every((row) => !row.projectLineId)).toBe(true)
})
it('retains an explicit mapping with a custom invoice name when only the quantity changes', () => {
  const previous = {
    ...line,
    projectLineId: material.id,
    name: 'Название поставщика',
  }
  const result = matchM15ProjectMaterials(
    [{ ...previous, quantity: 5 }],
    [previous],
    [material],
    'A',
  )
  expect(result[0]!.projectLineId).toBe(material.id)
})
it('rematches a reused invoice position when its material changes and rejects mappings from another cipher', () => {
  const previous = { ...line, projectLineId: material.id }
  const next = { ...material, id: 'project2', name: 'Датчик PT 720-PG2141' }
  const result = matchM15ProjectMaterials(
    [{ ...line, name: next.name }],
    [previous],
    [material, next],
    'A',
  )
  expect(result[0]!.projectLineId).toBe(next.id)
  expect(
    matchM15ProjectMaterials([line], [previous], [material], 'B')[0]!
      .projectLineId,
  ).toBeUndefined()
})
