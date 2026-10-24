import type {
  ImportDraftValidation,
  ImportRowInput,
  NormalizedImportRow,
  SubobjectMaterialMetric,
} from './types'

const requiredImportFields = [
  'cipher',
  'projectMaterialName',
  'unit',
  'quantity',
]
const importFieldLabels: Record<string, string> = {
  cipher: 'шифр',
  projectMaterialName: 'наименование по проекту',
  unit: 'единица измерения',
  quantity: 'количество по шифру',
}

export function calculateAlternativeQuantity(quantity: number, factor: number) {
  const result = quantity * factor
  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    !Number.isFinite(factor) ||
    factor <= 0 ||
    !Number.isFinite(result)
  )
    return null
  return Number(result.toPrecision(15))
}

type MaterialConversion = Pick<
  SubobjectMaterialMetric,
  'id' | 'unit' | 'alternativeUnit' | 'alternativeUnitFactor'
>

export type AlternativeConversion = {
  factor: number
  unit: string
  baseUnit?: string
}
type OperationAlternative = {
  quantity: number
  altQuantity: number | null
  altUnit?: string
  altUnitFactor?: number | null
  projectUnit?: string
}

export function getOperationConversion(
  line: MaterialConversion | undefined,
  projectUnit: string | undefined,
  ...previous: Array<OperationAlternative | null | undefined>
): AlternativeConversion | null {
  if (!projectUnit) return null
  const current = getMaterialRequestConversion(line, projectUnit)
  if (current) return { ...current, baseUnit: projectUnit }
  for (const entry of previous) {
    const factor = entry?.altUnitFactor
    const unit = entry?.altUnit?.trim()
    if (
      entry &&
      normalizeText(entry.projectUnit).toLocaleLowerCase('ru') ===
        normalizeText(projectUnit).toLocaleLowerCase('ru') &&
      unit &&
      factor != null &&
      Number.isFinite(factor) &&
      factor > 0
    )
      return { factor, unit, baseUnit: projectUnit }
  }
  return null
}

export function getOperationAlternative(
  quantity: number | null,
  conversion: AlternativeConversion | null,
  previous?: OperationAlternative | null,
) {
  const altQuantity = conversion
    ? quantity === null
      ? null
      : calculateAlternativeQuantity(quantity, conversion.factor)
    : (previous?.altQuantity ?? null)
  const hasPrevious =
    previous && (previous.altQuantity !== null || previous.altUnit?.trim())
  return {
    altQuantity,
    altUnit: conversion?.unit ?? previous?.altUnit ?? '',
    altUnitFactor:
      conversion?.factor ?? (previous ? previous.altUnitFactor : null),
    error:
      conversion && quantity !== null && altQuantity === null
        ? 'Не удалось пересчитать альтернативное количество. Проверьте количество и коэффициент в проектной базе.'
        : !conversion && hasPrevious && quantity !== previous.quantity
          ? 'Для изменения количества настройте альтернативную единицу и коэффициент в проектной базе. Прежние альтернативные значения сохранены без изменений.'
          : '',
  }
}

export function recalculateOperationAlternatives<
  T extends OperationAlternative,
>(
  entries: Array<T>,
  getConversion: (entry: T) => AlternativeConversion | null,
): Array<T> {
  let recalculated: Array<T> | undefined
  for (const [index, entry] of entries.entries()) {
    const conversion = getConversion(entry)
    if (!conversion) continue
    const { error, ...alternative } = getOperationAlternative(
      entry.quantity,
      conversion,
    )
    const values = {
      ...alternative,
      ...(conversion.baseUnit ? { projectUnit: conversion.baseUnit } : {}),
    }
    if (
      error ||
      (entry.altQuantity === values.altQuantity &&
        entry.altUnit === values.altUnit &&
        entry.altUnitFactor === values.altUnitFactor &&
        (!conversion.baseUnit || entry.projectUnit === conversion.baseUnit))
    )
      continue
    recalculated ??= entries.slice()
    recalculated[index] = { ...entry, ...values }
  }
  return recalculated ?? entries
}

export function getMaterialRequestConversion(
  line: MaterialConversion | undefined,
  projectUnit = line?.unit,
) {
  const factor = line?.alternativeUnitFactor
  const unit = line?.alternativeUnit?.trim()
  // A coefficient for a different base unit cannot convert an old quantity.
  if (
    !line ||
    normalizeText(line.unit).toLocaleLowerCase('ru') !==
      normalizeText(projectUnit).toLocaleLowerCase('ru') ||
    !unit ||
    factor == null ||
    !Number.isFinite(factor) ||
    factor <= 0
  )
    return null
  return { factor, unit }
}

export function recalculateRequestAlternatives<
  T extends {
    projectLineId: string
    projectUnit: string
    quantity: number
    altQuantity: number | null
    altUnit: string
    altUnitFactor?: number | null
  },
>(requests: Array<T>, lines: Array<MaterialConversion>): Array<T> {
  const lineById = new Map(lines.map((line) => [line.id, line]))
  return recalculateOperationAlternatives(requests, (entry) =>
    getOperationConversion(
      lineById.get(entry.projectLineId),
      entry.projectUnit,
      entry,
    ),
  )
}

export function getAlternativeConversionError(unit: string, factor: unknown) {
  const hasFactor =
    factor !== null && factor !== undefined && String(factor).trim() !== ''
  if (!unit.trim() && !hasFactor) return ''
  if (!unit.trim()) return 'Укажите альтернативную единицу измерения.'
  const parsed = parseQuantity(factor)
  if (!hasFactor || !Number.isFinite(parsed) || parsed <= 0) {
    return 'Укажите количество альтернативных единиц на одну основную — число больше нуля.'
  }
  return ''
}

export function validateImportDraft(
  rows: Array<ImportRowInput>,
): ImportDraftValidation {
  const fingerprints = new Map<string, number>()
  const normalizedRows = rows.map((row, index) => {
    const normalized = normalizeImportRow(row, index + 1)
    const firstSeenAt = fingerprints.get(normalized.fingerprint)

    if (firstSeenAt) {
      normalized.warnings.push(
        `Дубликат позиции ${firstSeenAt}: тот же проект, шифр, материал и единица`,
      )
    } else if (normalized.errors.length === 0) {
      fingerprints.set(normalized.fingerprint, normalized.rowNumber)
    }

    return normalized
  })

  const newMaterialCandidates = Array.from(
    new Set(
      normalizedRows
        .filter((row) => row.errors.length === 0)
        .map((row) => row.projectMaterialName ?? row.material),
    ),
  ).sort((a, b) => a.localeCompare(b, 'ru'))

  return {
    rows: normalizedRows,
    summary: {
      totalRows: normalizedRows.length,
      validRows: normalizedRows.filter((row) => row.errors.length === 0).length,
      errorRows: normalizedRows.filter((row) => row.errors.length > 0).length,
      duplicateRows: normalizedRows.filter((row) =>
        row.warnings.some((warning) => warning.startsWith('Дубликат позиции')),
      ).length,
      newMaterialCandidates,
    },
  }
}

export function normalizeImportRow(
  row: ImportRowInput,
  rowNumber: number,
): NormalizedImportRow {
  const errors: Array<string> = []
  const warnings: Array<string> = []
  const quantity = parseQuantity(row.quantity)
  const unitWeight = parseOptionalQuantity(row.unitWeight)
  const normalized = {
    project: normalizeText(row.project),
    cipher: normalizeText(row.cipher),
    title: nullableText(row.title),
    category: normalizeText(row.category),
    material: normalizeText(row.material),
    materialId: nullableText(row.materialId),
    projectMaterialName: nullableText(row.projectMaterialName),
    changeNumber: nullableText(row.changeNumber),
    materialType: nullableText(row.materialType),
    normativeDocument: nullableText(row.normativeDocument),
    unit: normalizeText(row.unit),
    unitWeight,
    alternativeUnit: nullableText(row.alternativeUnit),
    alternativeUnitFactor: parseOptionalQuantity(row.alternativeUnitFactor),
    quantity,
    notes: nullableText(row.notes),
  }

  for (const field of requiredImportFields) {
    const value = row[field as keyof ImportRowInput]
    if (value === undefined || String(value).trim() === '') {
      errors.push(`Не заполнена колонка «${importFieldLabels[field] ?? field}»`)
    }
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push('Количество по шифру должно быть больше 0')
  }

  // Older imports may contain an alternative unit without a conversion factor.
  if (normalized.alternativeUnitFactor !== null) {
    const conversionError = getAlternativeConversionError(
      normalized.alternativeUnit ?? '',
      normalized.alternativeUnitFactor,
    )
    if (conversionError) errors.push(conversionError)
  }

  return {
    rowNumber,
    ...normalized,
    fingerprint: [
      normalized.cipher,
      normalized.project,
      normalized.projectMaterialName ?? '',
      normalized.materialId ?? '',
      normalized.material,
      normalized.changeNumber ?? '',
      normalized.materialType ?? '',
      normalized.normativeDocument ?? '',
      normalized.unit,
      normalized.unitWeight ?? '',
      normalized.alternativeUnit ?? '',
      normalized.alternativeUnitFactor ?? '',
    ]
      .join('|')
      .toLocaleLowerCase('ru'),
    errors,
    warnings,
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function nullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized.length > 0 ? normalized : null
}

function parseQuantity(value: unknown) {
  if (typeof value === 'number') {
    return value
  }

  return Number(
    String(value ?? '')
      .replace(',', '.')
      .trim(),
  )
}

function parseOptionalQuantity(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null
  }

  return parseQuantity(value)
}
