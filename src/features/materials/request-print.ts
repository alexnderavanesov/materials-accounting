import { z } from 'zod'

export const printHeaderFields = {
  number: 'Номер заявки',
  date: 'Дата заявки',
  numberAndDate: 'Номер и дата одной строкой',
  requester: 'Заявитель',
  cipher: 'Шифр',
  materialType: 'Тип материала',
} as const
export const printLineFields = {
  index: '№ п/п',
  name: 'Наименование',
  nameWithDetails: 'Наименование, нормативный документ и состав',
  document: 'Нормативный документ',
  alloy: 'Состав',
  unit: 'ЕИ',
  quantity: 'Количество',
  altUnit: 'А.ЕИ',
  altQuantity: 'А.Количество',
  cipher: 'Шифр проекта / Титул',
  note: 'Примечание',
} as const
export type PrintHeaderField = keyof typeof printHeaderFields
export type PrintLineField = keyof typeof printLineFields
const cell = z.string().regex(/^$|^[A-Z]{1,2}[1-9]\d{0,2}$/)
const column = z.string().regex(/^$|^[A-Z]{1,2}$/)
export const printConfigSchema = z
  .object({
    version: z.literal(1),
    sheetName: z.string().min(1).max(31),
    repeatRow: z.number().int().min(1).max(200),
    printArea: z
      .string()
      .regex(/^[A-Z]{1,2}[1-9]\d{0,2}:[A-Z]{1,2}[1-9]\d{0,2}$/),
    headerRows: z.string().regex(/^$|^[1-9]\d{0,2}:[1-9]\d{0,2}$/),
    fields: z
      .object({
        number: cell,
        date: cell,
        numberAndDate: cell.default(''),
        requester: cell,
        cipher: cell,
        materialType: cell,
      })
      .strict(),
    columns: z
      .object({
        index: column,
        name: column,
        nameWithDetails: column.default(''),
        document: column,
        alloy: column,
        unit: column,
        quantity: column,
        altUnit: column,
        altQuantity: column,
        cipher: column.default(''),
        note: column,
      })
      .strict(),
  })
  .strict()
export type PrintConfig = z.infer<typeof printConfigSchema>
export const defaultPrintConfig: PrintConfig = {
  version: 1,
  sheetName: 'Заявка',
  repeatRow: 8,
  printArea: 'A1:I13',
  headerRows: '7:7',
  fields: {
    number: '',
    date: '',
    numberAndDate: 'A6',
    requester: 'H9',
    cipher: '',
    materialType: '',
  },
  columns: {
    index: 'A',
    name: '',
    nameWithDetails: 'B',
    document: '',
    alloy: '',
    unit: 'C',
    quantity: 'E',
    altUnit: 'D',
    altQuantity: 'F',
    cipher: 'H',
    note: 'I',
  },
}
export type PrintData = {
  headers: Record<Exclude<PrintHeaderField, 'numberAndDate'>, string>
  rows: Array<
    Record<Exclude<PrintLineField, 'nameWithDetails'>, string | number | null>
  >
}
export type TemplateSheet = {
  name: string
  rows: number
  columns: number
  cells: Array<{ address: string; text: string }>
  merges: Array<string>
}
export type PrintTemplate = {
  fileName: string
  base64: string
  config: PrintConfig
  revision: string
  sheet: TemplateSheet
}
export const maxTemplateBytes = 5 * 1024 * 1024
export function columnName(value: number): string {
  let name = ''
  for (let n = value; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}
export function cellPosition(address: string) {
  const match = /^([A-Z]+)([1-9]\d*)$/.exec(address)
  if (!match) throw new Error(`Неверный адрес ячейки: ${address}`)
  return {
    row: Number(match[2]),
    column: [...match[1]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
  }
}
export function cellRange(range: string) {
  const [start, end = start] = range.split(':')
  const a = cellPosition(start!),
    b = cellPosition(end!)
  if (b.row < a.row || b.column < a.column)
    throw new Error('Начало диапазона должно быть выше и левее его конца.')
  return { top: a.row, left: a.column, bottom: b.row, right: b.column }
}
export const samplePrintData: PrintData = {
  headers: {
    number: 'ЗП-2026-0001',
    date: '16.10.2026',
    requester: 'Иванов И.И.',
    cipher: 'ТК1',
    materialType: 'Соединительные детали трубопроводов',
  },
  rows: [
    {
      index: 1,
      name: 'Отвод стальной 90° 108×4',
      document: 'ГОСТ 17375-2001',
      alloy: '09Г2С',
      unit: 'шт',
      quantity: 3,
      altUnit: 'кг',
      altQuantity: 6,
      cipher: 'ТК1',
      note: 'Для участка ТК1',
    },
    {
      index: 2,
      name: 'Тройник стальной переходной 108×4–76×3,5',
      document: 'ГОСТ 17376-2001',
      alloy: '09Г2С',
      unit: 'шт',
      quantity: 2,
      altUnit: 'кг',
      altQuantity: 7.5,
      cipher: 'ТК1',
      note: '',
    },
  ],
}
