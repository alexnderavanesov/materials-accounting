import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

import type { ImportRowInput, SubobjectMaterialMetric } from './types'

type WorkbookMaterialType = {
  description?: string
  name: string
}
export type MaterialRequestTemplateLine = {
  alternativeUnit?: string | null
  lineId: string
  material?: string | null
  materialId?: string | null
  normativeDocument?: string | null
  plannedQuantity: number
  projectMaterialName?: string | null
  requestBalance: number
  unit: string
}
export type MaterialRequestImportRowInput = {
  altQuantity: number | null
  altUnit: string
  materialId: string
  note: string
  plannedQuantity: number | null
  projectLineId: string
  projectMaterialName: string
  quantity: number | null
  requestBalance: number | null
  rowNumber: number
  unit: string
}
export type MaterialReceiptTemplateLine = {
  altUnit?: string | null
  materialId?: string | null
  projectLineId: string
  projectMaterialName: string
  receivedQuantity: number
  requestId: string
  requestQuantity: number
  requestRest: number
  unit: string
}
export type MaterialReceiptImportRowInput = {
  actualName: string
  altQuantity: number | null
  altUnit: string
  certificate: string
  customerArvk: string
  customerReceiptDocument: string
  date: string
  factoryNumber: string
  heatBatch: string
  invoiceNumber: string
  manufacturer: string
  materialId: string
  note: string
  projectLineId: string
  projectMaterialName: string
  qualityDocument: string
  quantity: number | null
  receivedQuantity: number | null
  requestId: string
  requestQuantity: number | null
  requestRest: number | null
  rowNumber: number
  technicalDecision: string
  unit: string
}
type WorksheetWithRangeValidations = ExcelJS.Worksheet & {
  dataValidations: {
    add: (range: string, validation: ExcelJS.DataValidation) => void
  }
}

const fixedExportHeaders = [
  'Тип материала',
  'ID материала',
  'Наименование по проекту',
  'Нормативный документ',
  'Ед. изм.',
  'Состав',
  'Масса единицы',
]

const headerMap: Partial<Record<string, keyof ImportRowInput>> = {
  проект: 'project',
  шифр: 'cipher',
  титул: 'title',
  категория: 'category',
  тип_материала: 'materialType',
  тип: 'materialType',
  id_материала: 'materialId',
  идентификатор_материала: 'materialId',
  код_материала: 'materialId',
  id: 'materialId',
  наименование_по_проекту: 'projectMaterialName',
  проектное_наименование: 'projectMaterialName',
  наименование_проекта: 'projectMaterialName',
  материал: 'material',
  состав_элемента: 'material',
  'материал_/_сплав': 'material',
  сплав: 'material',
  состав: 'material',
  марка_материала: 'material',
  номенклатура: 'material',
  номер_изм: 'changeNumber',
  изм: 'changeNumber',
  изменение: 'changeNumber',
  нормативный_документ: 'normativeDocument',
  нормативный: 'normativeDocument',
  документ: 'normativeDocument',
  нд: 'normativeDocument',
  единица: 'unit',
  ед: 'unit',
  ед_изм: 'unit',
  масса_единицы: 'unitWeight',
  масса_ед: 'unitWeight',
  вес_единицы: 'unitWeight',
  вес_ед: 'unitWeight',
  альтернативная_ед_изм: 'alternativeUnit',
  альт_ед: 'alternativeUnit',
  альтернативная_единица: 'alternativeUnit',
  количество: 'quantity',
  колво: 'quantity',
  примечание: 'notes',
}
const requestHeaderMap: Partial<
  Record<string, keyof Omit<MaterialRequestImportRowInput, 'rowNumber'>>
> = {
  id_позиции: 'projectLineId',
  id_строки: 'projectLineId',
  служебный_id: 'projectLineId',
  id_материала: 'materialId',
  id: 'materialId',
  наименование_по_проекту: 'projectMaterialName',
  тмц: 'projectMaterialName',
  всего_по_проекту: 'plannedQuantity',
  количество_по_проекту: 'plannedQuantity',
  остаток_к_заявке: 'requestBalance',
  количество_по_заявке: 'quantity',
  кол_во_по_заявке: 'quantity',
  единица_измерения_проекта: 'unit',
  единица_проекта: 'unit',
  еи_проекта: 'unit',
  количество_в_альтернативной_единице: 'altQuantity',
  альтернативное_количество: 'altQuantity',
  альтернативная_единица_измерения: 'altUnit',
  единица_альтернативная: 'altUnit',
  примечание: 'note',
}
const receiptHeaderMap: Partial<
  Record<string, keyof Omit<MaterialReceiptImportRowInput, 'rowNumber'>>
> = {
  id_позиции: 'projectLineId',
  служебный_id: 'projectLineId',
  id_заявки: 'requestId',
  id_материала: 'materialId',
  id: 'materialId',
  наименование_по_проекту: 'projectMaterialName',
  количество_по_заявке: 'requestQuantity',
  уже_получено: 'receivedQuantity',
  остаток_к_получению: 'requestRest',
  единица_измерения_проекта: 'unit',
  единица_проекта: 'unit',
  наименование_тмц_по_факту_поступления: 'actualName',
  фактическое_наименование_тмц: 'actualName',
  поступило: 'quantity',
  поступило_в_альтернативной_единице: 'altQuantity',
  альтернативная_единица_измерения: 'altUnit',
  дата_поступления: 'date',
  номер_накладной: 'invoiceNumber',
  заводской_номер: 'factoryNumber',
  завод_изготовитель: 'manufacturer',
  изготовитель: 'manufacturer',
  производитель: 'manufacturer',
  партия_плавки: 'heatBatch',
  плавка: 'heatBatch',
  номер_документа_о_получении_заказчика: 'customerReceiptDocument',
  документ_о_получении_заказчика: 'customerReceiptDocument',
  документ_получения_заказчика: 'customerReceiptDocument',
  арвк_заказчика: 'customerArvk',
  документ_качества: 'qualityDocument',
  паспорт_сертификат: 'certificate',
  'паспорт_/_сертификат': 'certificate',
  техническое_решение_согласование: 'technicalDecision',
  тех_решение: 'technicalDecision',
  примечание: 'note',
}

export function parseProjectMaterialsWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    return []
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  })

  return rows.flatMap((row) => {
    const parsed: ImportRowInput = {}
    const cipherEntries: Array<[string, number]> = []

    for (const [rawHeader, value] of Object.entries(row)) {
      const normalizedHeader = rawHeader
        .trim()
        .toLocaleLowerCase('ru')
        .replace(/[.\s-]+/g, '_')
        .replace(/^_+|_+$/g, '')
      const field = headerMap[normalizedHeader]

      if (field === 'quantity') {
        parsed.quantity = value as string | number
      } else if (field === 'unitWeight') {
        parsed.unitWeight = value as string | number
      } else if (field) {
        parsed[field] = String(value)
      } else if (String(value).trim() !== '') {
        const quantity = parseWorkbookNumber(value)

        if (quantity !== null) {
          cipherEntries.push([rawHeader.trim(), quantity])
        }
      }
    }

    if (cipherEntries.length === 0 && parsed.quantity === undefined) {
      return []
    }

    if (cipherEntries.length <= 1) {
      const [cipher, quantity] = cipherEntries[0] ?? []
      return [
        {
          ...parsed,
          cipher: parsed.cipher ?? cipher,
          quantity: parsed.quantity ?? quantity,
        },
      ]
    }

    return cipherEntries.map(([cipher, quantity]) => ({
      ...parsed,
      cipher,
      quantity,
    }))
  })
}

export async function createProjectMaterialsTemplateWorkbook(
  ciphers: Array<string>,
  materialTypes: Array<WorkbookMaterialType>,
) {
  return createWorkbook(
    [
      Object.fromEntries(
        [...fixedExportHeaders, ...ciphers].map((header) => [header, '']),
      ),
    ],
    materialTypes,
  )
}

export async function createProjectMaterialsExportWorkbook(
  lines: Array<SubobjectMaterialMetric>,
  ciphers: Array<string>,
  materialTypes: Array<WorkbookMaterialType>,
) {
  const rows = buildExportRows(lines, ciphers)

  return createWorkbook(
    rows.length > 0
      ? rows
      : [
          Object.fromEntries(
            [...fixedExportHeaders, ...ciphers].map((header) => [header, '']),
          ),
        ],
    materialTypes,
  )
}

export async function createMaterialRequestTemplateWorkbook({
  cipher,
  lines,
  materialType,
}: {
  cipher: string
  lines: Array<MaterialRequestTemplateLine>
  materialType: string
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Материалы'
  workbook.created = new Date()
  workbook.modified = new Date()

  const worksheet = workbook.addWorksheet('Заявка', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  worksheet.mergeCells('A1:L1')
  worksheet.getCell('A1').value = 'Шаблон заявки на получение'
  worksheet.getCell('A1').font = { bold: true, size: 15 }
  worksheet.getCell('A2').value = 'Шифр проекта'
  worksheet.getCell('B2').value = cipher
  worksheet.getCell('A3').value = 'Тип материала'
  worksheet.getCell('B3').value = materialType || 'Не выбран'
  worksheet.getCell('A4').value =
    'Серые колонки заполняются из проектной базы и не редактируются. Заполните только количество, альтернативную единицу и примечание.'
  worksheet.mergeCells('A4:L4')

  const columns = [
    { header: 'ID позиции', key: 'projectLineId', width: 18, locked: true },
    { header: 'ID материала', key: 'materialId', width: 16, locked: true },
    {
      header: 'Наименование по проекту',
      key: 'projectMaterialName',
      width: 56,
      locked: true,
    },
    {
      header: 'Нормативный документ',
      key: 'normativeDocument',
      width: 28,
      locked: true,
    },
    { header: 'Состав', key: 'material', width: 20, locked: true },
    {
      header: 'Всего по проекту',
      key: 'plannedQuantity',
      width: 16,
      locked: true,
    },
    {
      header: 'Остаток к заявке',
      key: 'requestBalance',
      width: 16,
      locked: true,
    },
    {
      header: 'Количество по заявке',
      key: 'quantity',
      width: 20,
      locked: false,
    },
    {
      header: 'Единица измерения проекта',
      key: 'unit',
      width: 22,
      locked: true,
    },
    {
      header: 'Количество в альтернативной единице',
      key: 'altQuantity',
      width: 28,
      locked: false,
    },
    {
      header: 'Альтернативная единица измерения',
      key: 'altUnit',
      width: 30,
      locked: false,
    },
    { header: 'Примечание', key: 'note', width: 34, locked: false },
  ]

  worksheet.columns = columns.map((column) => ({
    key: column.key,
    width: column.width,
  }))

  worksheet.getRow(5).values = columns.map((column) => column.header)
  worksheet.getRow(5).height = 28

  for (const line of lines) {
    worksheet.addRow({
      altQuantity: '',
      altUnit: line.alternativeUnit ?? '',
      material: line.material ?? '',
      materialId: line.materialId ?? '',
      normativeDocument: line.normativeDocument ?? '',
      note: '',
      plannedQuantity: line.plannedQuantity,
      projectLineId: line.lineId,
      projectMaterialName: line.projectMaterialName ?? '',
      quantity: '',
      requestBalance: line.requestBalance,
      unit: line.unit,
    })
  }

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, columnNumber) => {
      const isHeader = rowNumber <= 5
      const column = columns[columnNumber - 1]
      const locked = isHeader || column?.locked

      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      }

      if (rowNumber === 5) {
        cell.font = { bold: true, color: { argb: 'FF334155' } }
        cell.fill = {
          fgColor: { argb: 'FFF1F5F9' },
          pattern: 'solid',
          type: 'pattern',
        }
      } else if (locked) {
        cell.fill = {
          fgColor: { argb: 'FFF3F4F6' },
          pattern: 'solid',
          type: 'pattern',
        }
        cell.font = { color: { argb: 'FF64748B' } }
      } else {
        cell.fill = {
          fgColor: { argb: 'FFFFFFFF' },
          pattern: 'solid',
          type: 'pattern',
        }
      }
    })
  })

  worksheet.getCell('A4').font = { color: { argb: 'FF64748B' }, size: 11 }
  worksheet.getCell('A4').fill = {
    fgColor: { argb: 'FFF8FAFC' },
    pattern: 'solid',
    type: 'pattern',
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return buffer
}

export function parseMaterialRequestWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    return []
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    range: 4,
  })

  return rows.map((row, index) => {
    const parsed: MaterialRequestImportRowInput = {
      altQuantity: null,
      altUnit: '',
      materialId: '',
      note: '',
      plannedQuantity: null,
      projectLineId: '',
      projectMaterialName: '',
      quantity: null,
      requestBalance: null,
      rowNumber: index + 6,
      unit: '',
    }

    for (const [rawHeader, value] of Object.entries(row)) {
      const field = requestHeaderMap[normalizeWorkbookHeader(rawHeader)]

      if (!field) {
        continue
      }

      if (
        field === 'altQuantity' ||
        field === 'plannedQuantity' ||
        field === 'quantity' ||
        field === 'requestBalance'
      ) {
        parsed[field] = parseWorkbookOptionalNumber(value)
      } else {
        parsed[field] = String(value).trim()
      }
    }

    return parsed
  })
}

export async function createMaterialReceiptTemplateWorkbook({
  requestNumber,
  lines,
}: {
  requestNumber: string
  lines: Array<MaterialReceiptTemplateLine>
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Материалы'
  workbook.created = new Date()
  workbook.modified = new Date()

  const worksheet = workbook.addWorksheet('Получение', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  worksheet.mergeCells('A1:W1')
  worksheet.getCell('A1').value = 'Шаблон получения по заявке'
  worksheet.getCell('A1').font = { bold: true, size: 15 }
  worksheet.getCell('A2').value = 'Заявка'
  worksheet.getCell('B2').value = requestNumber
  worksheet.getCell('A4').value =
    'Серые колонки заполняются из заявки и не редактируются. Заполните фактическое поступление, документы и сведения о замене.'
  worksheet.mergeCells('A4:W4')

  const columns = [
    { header: 'ID позиции', key: 'projectLineId', width: 18, locked: true },
    { header: 'ID заявки', key: 'requestId', width: 24, locked: true },
    { header: 'ID материала', key: 'materialId', width: 16, locked: true },
    {
      header: 'Наименование по проекту',
      key: 'projectMaterialName',
      width: 56,
      locked: true,
    },
    {
      header: 'Количество по заявке',
      key: 'requestQuantity',
      width: 20,
      locked: true,
    },
    {
      header: 'Уже получено',
      key: 'receivedQuantity',
      width: 16,
      locked: true,
    },
    {
      header: 'Остаток к получению',
      key: 'requestRest',
      width: 18,
      locked: true,
    },
    {
      header: 'Единица измерения проекта',
      key: 'unit',
      width: 22,
      locked: true,
    },
    {
      header: 'Наименование ТМЦ по факту поступления',
      key: 'actualName',
      width: 56,
      locked: false,
    },
    { header: 'Поступило', key: 'quantity', width: 16, locked: false },
    {
      header: 'Поступило в альтернативной единице',
      key: 'altQuantity',
      width: 28,
      locked: false,
    },
    {
      header: 'Альтернативная единица измерения',
      key: 'altUnit',
      width: 30,
      locked: false,
    },
    { header: 'Дата поступления', key: 'date', width: 18, locked: false },
    {
      header: 'Номер накладной',
      key: 'invoiceNumber',
      width: 22,
      locked: false,
    },
    {
      header: 'Заводской номер',
      key: 'factoryNumber',
      width: 22,
      locked: false,
    },
    {
      header: 'Завод-изготовитель',
      key: 'manufacturer',
      width: 26,
      locked: false,
    },
    {
      header: 'Партия плавки',
      key: 'heatBatch',
      width: 22,
      locked: false,
    },
    {
      header: 'Номер документа о получении (Заказчика)',
      key: 'customerReceiptDocument',
      width: 36,
      locked: false,
    },
    { header: 'АРВК заказчика', key: 'customerArvk', width: 22, locked: false },
    {
      header: 'Документ качества',
      key: 'qualityDocument',
      width: 28,
      locked: false,
    },
    {
      header: 'Паспорт / сертификат',
      key: 'certificate',
      width: 28,
      locked: false,
    },
    {
      header: 'Техническое решение / согласование',
      key: 'technicalDecision',
      width: 34,
      locked: false,
    },
    { header: 'Примечание', key: 'note', width: 34, locked: false },
  ]

  worksheet.columns = columns.map((column) => ({
    key: column.key,
    width: column.width,
  }))

  worksheet.getRow(5).values = columns.map((column) => column.header)
  worksheet.getRow(5).height = 28

  for (const line of lines) {
    worksheet.addRow({
      actualName: line.projectMaterialName,
      altQuantity: '',
      altUnit: line.altUnit ?? '',
      certificate: '',
      customerArvk: '',
      customerReceiptDocument: '',
      date: '',
      factoryNumber: '',
      heatBatch: '',
      invoiceNumber: '',
      manufacturer: '',
      materialId: line.materialId ?? '',
      note: '',
      projectLineId: line.projectLineId,
      projectMaterialName: line.projectMaterialName,
      qualityDocument: '',
      quantity: '',
      receivedQuantity: line.receivedQuantity,
      requestId: line.requestId,
      requestQuantity: line.requestQuantity,
      requestRest: line.requestRest,
      technicalDecision: '',
      unit: line.unit,
    })
  }

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, columnNumber) => {
      const isHeader = rowNumber <= 5
      const column = columns[columnNumber - 1]
      const locked = isHeader || column?.locked

      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      }

      if (rowNumber === 5) {
        cell.font = { bold: true, color: { argb: 'FF334155' } }
        cell.fill = {
          fgColor: { argb: 'FFF1F5F9' },
          pattern: 'solid',
          type: 'pattern',
        }
      } else if (locked) {
        cell.fill = {
          fgColor: { argb: 'FFF3F4F6' },
          pattern: 'solid',
          type: 'pattern',
        }
        cell.font = { color: { argb: 'FF64748B' } }
      } else {
        cell.fill = {
          fgColor: { argb: 'FFFFFFFF' },
          pattern: 'solid',
          type: 'pattern',
        }
      }
    })
  })

  worksheet.getCell('A4').font = { color: { argb: 'FF64748B' }, size: 11 }
  worksheet.getCell('A4').fill = {
    fgColor: { argb: 'FFF8FAFC' },
    pattern: 'solid',
    type: 'pattern',
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return buffer
}

export function parseMaterialReceiptWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    return []
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    range: 4,
  })

  return rows.map((row, index) => {
    const parsed: MaterialReceiptImportRowInput = {
      actualName: '',
      altQuantity: null,
      altUnit: '',
      certificate: '',
      customerArvk: '',
      customerReceiptDocument: '',
      date: '',
      factoryNumber: '',
      heatBatch: '',
      invoiceNumber: '',
      manufacturer: '',
      materialId: '',
      note: '',
      projectLineId: '',
      projectMaterialName: '',
      qualityDocument: '',
      quantity: null,
      receivedQuantity: null,
      requestId: '',
      requestQuantity: null,
      requestRest: null,
      rowNumber: index + 6,
      technicalDecision: '',
      unit: '',
    }

    for (const [rawHeader, value] of Object.entries(row)) {
      const field = receiptHeaderMap[normalizeWorkbookHeader(rawHeader)]

      if (!field) {
        continue
      }

      if (
        field === 'altQuantity' ||
        field === 'quantity' ||
        field === 'receivedQuantity' ||
        field === 'requestQuantity' ||
        field === 'requestRest'
      ) {
        parsed[field] = parseWorkbookOptionalNumber(value)
      } else {
        parsed[field] = String(value).trim()
      }
    }

    return parsed
  })
}

function buildExportRows(
  lines: Array<SubobjectMaterialMetric>,
  ciphers: Array<string>,
) {
  const groups = new Map<string, Record<string, string | number>>()

  for (const line of lines) {
    const key = [
      line.materialType ?? line.category,
      line.materialId ?? '',
      line.projectMaterialName ?? '',
      line.normativeDocument ?? '',
      line.unit,
      line.material,
      line.unitWeight ?? '',
    ].join('|')
    const row =
      groups.get(key) ??
      ({
        'Тип материала': line.materialType ?? line.category,
        'ID материала': line.materialId ?? '',
        'Наименование по проекту': line.projectMaterialName ?? '',
        'Нормативный документ': line.normativeDocument ?? '',
        'Ед. изм.': line.unit,
        Состав: line.material,
        'Масса единицы': line.unitWeight ?? '',
      } satisfies Record<string, string | number>)

    row[line.cipher] = line.plannedQuantity
    groups.set(key, row)
  }

  return Array.from(groups.values()).map((row) => {
    for (const cipher of ciphers) {
      row[cipher] ??= ''
    }

    return row
  })
}

function normalizeWorkbookHeader(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/[()]/g, '')
    .replace(/[.\s-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

async function createWorkbook(
  rows: Array<Record<string, string | number>>,
  materialTypes: Array<WorkbookMaterialType>,
) {
  const headers = Object.keys(rows[0] ?? {})
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Материалы'
  workbook.created = new Date()
  workbook.modified = new Date()

  const worksheet = workbook.addWorksheet('Проектная база', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: getWorkbookColumnWidth(header),
  }))
  worksheet.getRow(1).font = { bold: true }
  worksheet.getRow(1).height = 24

  for (const row of rows) {
    worksheet.addRow(headers.map((header) => row[header] ?? ''))
  }

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      }
    })
  })
  worksheet.getRow(1).fill = {
    fgColor: { argb: 'FFF8FAFC' },
    pattern: 'solid',
    type: 'pattern',
  }

  const referenceSheet = workbook.addWorksheet('Справочники')
  referenceSheet.state = 'veryHidden'
  referenceSheet.columns = [
    { header: 'Тип материала', key: 'name', width: 42 },
    { header: 'Описание', key: 'description', width: 90 },
  ]
  const normalizedTypes = uniqueMaterialTypes(materialTypes)
  for (const type of normalizedTypes) {
    referenceSheet.addRow({
      description: type.description ?? '',
      name: type.name,
    })
  }

  applyMaterialTypeValidation(worksheet, normalizedTypes.length)

  const buffer = await workbook.xlsx.writeBuffer()
  return buffer
}

function uniqueMaterialTypes(materialTypes: Array<WorkbookMaterialType>) {
  const seen = new Set<string>()
  const result: Array<WorkbookMaterialType> = []

  for (const type of materialTypes) {
    const name = type.name.trim()
    const key = name.toLocaleLowerCase('ru')

    if (name.length === 0 || seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push({ description: type.description ?? '', name })
  }

  return result
}

function applyMaterialTypeValidation(
  worksheet: ExcelJS.Worksheet,
  materialTypesCount: number,
) {
  if (materialTypesCount === 0) {
    return
  }

  const typeColumnIndex = fixedExportHeaders.indexOf('Тип материала') + 1
  const typeColumnLetter = worksheet.getColumn(typeColumnIndex).letter
  const formulaRange = `'Справочники'!$A$2:$A$${materialTypesCount + 1}`

  ;(worksheet as WorksheetWithRangeValidations).dataValidations.add(
    `${typeColumnLetter}2:${typeColumnLetter}1000`,
    {
      allowBlank: true,
      error: 'Выберите тип материала из выпадающего списка.',
      errorStyle: 'warning',
      errorTitle: 'Тип материала',
      formulae: [formulaRange],
      showErrorMessage: true,
      type: 'list',
    },
  )
}

function getWorkbookColumnWidth(header: string) {
  if (header === 'Наименование по проекту') {
    return 54
  }

  if (header === 'Тип материала') {
    return 32
  }

  if (header === 'Нормативный документ') {
    return 26
  }

  if (header === 'Состав') {
    return 20
  }

  if (header.length > 18) {
    return 18
  }

  return 14
}

function parseWorkbookNumber(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).trim().replace(',', '.'))

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseWorkbookOptionalNumber(value: unknown) {
  const raw = String(value).trim()

  if (raw.length === 0) {
    return null
  }

  const parsed =
    typeof value === 'number'
      ? value
      : Number(raw.replace(/\s/g, '').replace(',', '.'))

  return Number.isFinite(parsed) ? parsed : null
}
