import type { NormalizedImportRow, SubobjectMaterialMetric } from './types'

const materialImportKey = (line: SubobjectMaterialMetric) =>
  JSON.stringify([getMaterialIdentityKey(line), line.cipher])

function materialImportValues(line: SubobjectMaterialMetric) {
  return {
    category: line.category,
    materialId: line.materialId,
    projectMaterialName: line.projectMaterialName,
    changeNumber: line.changeNumber,
    materialType: line.materialType,
    normativeDocument: line.normativeDocument,
    material: line.material,
    unit: line.unit,
    unitWeight: line.unitWeight,
    alternativeUnit: line.alternativeUnit,
    alternativeUnitFactor: line.alternativeUnitFactor,
    plannedQuantity: line.plannedQuantity,
  }
}

type MaterialImportField = keyof ReturnType<typeof materialImportValues>
const materialImportLabels: Record<MaterialImportField, string> = {
  category: 'Категория',
  materialId: 'Код материала',
  projectMaterialName: 'Наименование по проекту',
  changeNumber: 'Номер изменения',
  materialType: 'Тип материала',
  normativeDocument: 'Нормативный документ',
  material: 'Состав',
  unit: 'Единица измерения',
  unitWeight: 'Масса единицы',
  alternativeUnit: 'Альтернативная единица',
  alternativeUnitFactor: 'Коэффициент пересчёта',
  plannedQuantity: 'Количество по шифру',
}

export type MaterialImportPreview = {
  existing: boolean
  existingMaterial: boolean
  supersededBy: number | null
  changes: Array<{
    field: MaterialImportField
    label: string
    before: string | number
    after: string | number
  }>
}

/** Compare with the actual target line, using the same key and values as Apply. */
export function previewMaterialImportRows(
  current: Array<SubobjectMaterialMetric>,
  importRows: Array<NormalizedImportRow>,
): Array<MaterialImportPreview> {
  if (importRows.length === 0) return []
  const existing = new Map<string, SubobjectMaterialMetric>()
  const materials = new Set<string>()
  for (const line of current) {
    const key = materialImportKey(line)
    if (!existing.has(key)) existing.set(key, line)
    materials.add(getMaterialIdentityKey(line))
  }
  const imported = importRows.map(buildIdentityLineFromImport)
  const lastRows = new Map<string, number>()
  imported.forEach((line, index) =>
    lastRows.set(materialImportKey(line), index),
  )

  return imported.map((line, index) => {
    const key = materialImportKey(line)
    const previous = existing.get(key)
    const lastIndex = lastRows.get(key)!
    const values = materialImportValues(line)
    const fields = Object.keys(values) as Array<MaterialImportField>
    return {
      existing: Boolean(previous),
      existingMaterial: materials.has(getMaterialIdentityKey(line)),
      supersededBy:
        lastIndex === index ? null : importRows[lastIndex]!.rowNumber,
      changes: previous
        ? fields.flatMap((field) => {
            const before = previous[field] ?? ''
            const after = values[field] ?? ''
            return before === after
              ? []
              : [{ field, label: materialImportLabels[field], before, after }]
          })
        : [],
    }
  })
}

export function applyMaterialImportRows(
  current: Array<SubobjectMaterialMetric>,
  importRows: Array<NormalizedImportRow>,
) {
  const next = [...current]
  const indexes = new Map<string, number>()
  next.forEach((line, index) => {
    const key = materialImportKey(line)
    if (!indexes.has(key)) indexes.set(key, index)
  })

  for (const row of importRows) {
    const importedLine = buildIdentityLineFromImport(row)
    const importedKey = materialImportKey(importedLine)
    const existingIndex = indexes.get(importedKey) ?? -1

    const existingLine = next[existingIndex]
    if (existingLine) {
      next[existingIndex] = withStableId({
        ...existingLine,
        ...materialImportValues(importedLine),
      })
    } else {
      indexes.set(importedKey, next.length)
      next.push(
        withStableId({
          ...importedLine,
          id: crypto.randomUUID(),
        }),
      )
    }
  }

  // New materials appear first, newest first, without shifting the array per row.
  return [
    ...next.slice(current.length).reverse(),
    ...next.slice(0, current.length),
  ]
}

export function buildIdentityLineFromImport(
  row: NormalizedImportRow,
): SubobjectMaterialMetric {
  return {
    id: 'identity-preview',
    project: row.project || 'Проектная база',
    cipher: row.cipher,
    category: row.materialType || row.category || 'Материалы',
    materialId: row.materialId,
    projectMaterialName: row.projectMaterialName,
    changeNumber: row.changeNumber,
    materialType: row.materialType,
    normativeDocument: row.normativeDocument,
    material: row.material,
    plannedQuantity: row.quantity,
    unit: row.unit,
    unitWeight: row.unitWeight,
    alternativeUnit: row.alternativeUnit,
    alternativeUnitFactor: row.alternativeUnitFactor,
    requested: 0,
    received: 0,
    qcPending: 0,
    accepted: 0,
    issued: 0,
    returned: 0,
    writtenOff: 0,
  }
}

export function withStableId(
  line: SubobjectMaterialMetric,
): SubobjectMaterialMetric {
  return {
    ...line,
    id:
      line.id ??
      [
        line.project,
        line.cipher,
        line.materialType ?? line.category,
        line.materialId ?? '',
        line.projectMaterialName ?? '',
        line.normativeDocument ?? '',
        line.material,
        line.unit,
        line.unitWeight ?? '',
        line.alternativeUnit ?? '',
      ]
        .join('-')
        .toLocaleLowerCase('ru')
        .replace(/\s+/g, '-'),
  }
}

export function getMaterialIdentityKey(line: SubobjectMaterialMetric) {
  return [
    line.projectMaterialName ?? '',
    line.materialType ?? line.category,
    line.materialId ?? '',
    line.normativeDocument ?? '',
    line.unit,
    line.material,
    line.unitWeight ?? '',
    line.alternativeUnit ?? '',
    line.alternativeUnitFactor ?? '',
  ]
    .join('|')
    .toLocaleLowerCase('ru')
}
