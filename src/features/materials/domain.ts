import type {
  CategorySummary,
  DocumentType,
  ImportDraftValidation,
  ImportRowInput,
  LedgerMovement,
  LotBalance,
  NormalizedImportRow,
  QcStatus,
  SubobjectMaterialMetric,
  SubobjectMaterialSummaryRow,
} from './types'

const documentPrefixes: Record<DocumentType, string> = {
  material_request: 'ЗП',
  receipt: 'ПР',
  quality_control: 'ВК',
  issue: 'ВР',
  return: 'ВЗ',
  write_off: 'СП',
  inventory_adjustment: 'ИНВ',
}

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

export function generateDocumentNumber(
  type: DocumentType,
  date: Date,
  sequence: number,
) {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Document sequence must be a positive integer')
  }

  const year = date.getFullYear()
  return `${documentPrefixes[type]}-${year}-${String(sequence).padStart(5, '0')}`
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
    ]
      .join('|')
      .toLocaleLowerCase('ru'),
    errors,
    warnings,
  }
}

export function calculateLotBalances(
  movements: Array<LedgerMovement>,
): Array<LotBalance> {
  const balances = new Map<string, LotBalance>()

  for (const movement of movements) {
    const current =
      balances.get(movement.lotId) ??
      ({
        lotId: movement.lotId,
        projectMaterialLineId: movement.projectMaterialLineId,
        quantity: 0,
      } satisfies LotBalance)

    current.quantity +=
      movement.direction === 'in' ? movement.quantity : -movement.quantity
    current.quantity = roundQuantity(current.quantity)
    balances.set(movement.lotId, current)
  }

  return Array.from(balances.values()).sort((a, b) =>
    a.lotId.localeCompare(b.lotId),
  )
}

export function assertAvailableBalance(
  available: number,
  requested: number,
  label = 'Материал',
) {
  if (requested <= 0) {
    throw new Error('Количество должно быть положительным')
  }

  if (roundQuantity(available - requested) < 0) {
    throw new Error(
      `${label}: нельзя провести операцию на ${requested}, доступно ${available}`,
    )
  }
}

export function getIssueWarnings(qcStatus: QcStatus) {
  if (qcStatus === 'accepted') {
    return []
  }

  if (qcStatus === 'accepted_with_notes') {
    return ['Материал принят с замечаниями входного контроля']
  }

  if (qcStatus === 'rejected') {
    return [
      'Материал отклонен входным контролем, выдача требует отдельного решения',
    ]
  }

  return ['Материал еще ожидает входной контроль']
}

export function summarizeSubobjectMaterials(
  metrics: Array<SubobjectMaterialMetric>,
): Array<CategorySummary> {
  const rows = metrics.map(toSummaryRow)
  const categories = new Map<string, Array<SubobjectMaterialSummaryRow>>()

  for (const row of rows) {
    const group = categories.get(row.category) ?? []
    group.push(row)
    categories.set(row.category, group)
  }

  return Array.from(categories.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'ru'))
    .map(([category, categoryRows]) => ({
      category,
      rows: categoryRows.sort((a, b) => {
        const projectOrder = a.project.localeCompare(b.project, 'ru')
        if (projectOrder !== 0) {
          return projectOrder
        }

        const cipherOrder = a.cipher.localeCompare(b.cipher, 'ru')
        return cipherOrder === 0
          ? a.material.localeCompare(b.material, 'ru')
          : cipherOrder
      }),
      totals: sumRows(categoryRows),
    }))
}

function toSummaryRow(
  metric: SubobjectMaterialMetric,
): SubobjectMaterialSummaryRow {
  const balance = roundQuantity(
    metric.accepted + metric.returned - metric.issued - metric.writtenOff,
  )

  return {
    ...metric,
    balance,
    deviation: roundQuantity(metric.plannedQuantity - metric.issued),
  }
}

function sumRows(rows: Array<SubobjectMaterialSummaryRow>) {
  return rows.reduce(
    (acc, row) => ({
      plannedQuantity: roundQuantity(acc.plannedQuantity + row.plannedQuantity),
      requested: roundQuantity(acc.requested + row.requested),
      received: roundQuantity(acc.received + row.received),
      qcPending: roundQuantity(acc.qcPending + row.qcPending),
      accepted: roundQuantity(acc.accepted + row.accepted),
      issued: roundQuantity(acc.issued + row.issued),
      returned: roundQuantity(acc.returned + row.returned),
      writtenOff: roundQuantity(acc.writtenOff + row.writtenOff),
      balance: roundQuantity(acc.balance + row.balance),
      deviation: roundQuantity(acc.deviation + row.deviation),
    }),
    {
      plannedQuantity: 0,
      requested: 0,
      received: 0,
      qcPending: 0,
      accepted: 0,
      issued: 0,
      returned: 0,
      writtenOff: 0,
      balance: 0,
      deviation: 0,
    },
  )
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

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}
