import type { NormalizedImportRow, SubobjectMaterialMetric } from './types'

export function applyMaterialImportRows(
  current: Array<SubobjectMaterialMetric>,
  importRows: Array<NormalizedImportRow>,
) {
  const next = [...current]
  const key = (line: SubobjectMaterialMetric) =>
    JSON.stringify([getMaterialIdentityKey(line), line.cipher])
  const indexes = new Map<string, number>()
  next.forEach((line, index) => {
    if (!indexes.has(key(line))) indexes.set(key(line), index)
  })

  for (const row of importRows) {
    const importedLine = buildIdentityLineFromImport(row)
    const importedKey = key(importedLine)
    const existingIndex = indexes.get(importedKey) ?? -1

    const existingLine = next[existingIndex]
    if (existingLine) {
      next[existingIndex] = withStableId({
        ...existingLine,
        category: importedLine.category,
        materialId: importedLine.materialId,
        projectMaterialName: importedLine.projectMaterialName,
        changeNumber: importedLine.changeNumber,
        materialType: importedLine.materialType,
        normativeDocument: importedLine.normativeDocument,
        material: importedLine.material,
        unit: importedLine.unit,
        unitWeight: importedLine.unitWeight,
        alternativeUnit: importedLine.alternativeUnit,
        alternativeUnitFactor: importedLine.alternativeUnitFactor,
        plannedQuantity: row.quantity,
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
