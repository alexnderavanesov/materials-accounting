import * as XLSX from 'xlsx'
import { normalizeOperationSearch } from './operation-list-view'
import { m15Unit } from './m15-reconciliation'
import { automaticM15, m15MaterialKey } from './m15-automatic'
import type { M15Line, M15Reconciliation } from './m15-reconciliation'

export type M15Sheet = {
  name: string
  rows: string[][]
  numericCells?: Record<string, number>
}
export type M15ImportColumns = {
  name: number
  unit: number
  quantity: number
  position: number
}
export type M15ImportRow = {
  sourceRow: number
  position: string
  name: string
  unit: string
  quantity: string
}
const m15TemplateHeaders = [
  '№ позиции',
  'Наименование',
  'Единица',
  'Количество по М-15',
]

/** Recognize the exported layout by its headers, not the filename or sheet name.
 * Multiple matching tables require a sheet choice rather than a silent guess. */
export function findM15Template(sheets: M15Sheet[]) {
  const expected = m15TemplateHeaders.map(normalizeOperationSearch)
  let found: {
    sheetIndex: number
    headerRow: number
    columns: M15ImportColumns
  } | null = null
  for (const [sheetIndex, sheet] of sheets.entries()) {
    for (const [index, row] of sheet.rows.slice(0, 50).entries()) {
      if (
        expected.every(
          (name, column) =>
            normalizeOperationSearch(row[column] ?? '') === name,
        ) &&
        row.slice(expected.length).every((cell) => !cell.trim())
      ) {
        if (found) return null
        found = {
          sheetIndex,
          headerRow: index + 1,
          columns: guessM15Columns(row),
        }
      }
    }
  }
  return found
}
export function createM15ImportTemplate(
  materials: ReadonlyArray<Pick<M15Line, 'name' | 'unit'>> = [],
) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    m15TemplateHeaders,
    ...materials.map((material, index) => [
      index + 1,
      material.name,
      material.unit,
      // The documentary quantity must be entered from the invoice, never from receipts.
      null,
    ]),
  ])
  sheet['!cols'] = [{ wch: 12 }, { wch: 85 }, { wch: 16 }, { wch: 24 }]
  sheet['!rows'] = [{ hpt: 28 }]
  XLSX.utils.book_append_sheet(workbook, sheet, 'Состав М-15')
  return workbook
}
export function downloadM15ImportTemplate(
  materials: ReadonlyArray<Pick<M15Line, 'name' | 'unit'>> = [],
) {
  XLSX.writeFile(createM15ImportTemplate(materials), 'Шаблон_М-15.xlsx', {
    compression: true,
  })
}
export function readM15Workbook(buffer: ArrayBuffer): M15Sheet[] {
  if (buffer.byteLength > 20 * 1024 * 1024)
    throw new Error('Размер Excel должен быть не больше 20 МБ.')
  const book = XLSX.read(buffer, { type: 'array', sheetRows: 50101 })
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name]!
    const range = XLSX.utils.decode_range(
      sheet['!fullref'] ?? sheet['!ref'] ?? 'A1',
    )
    if (range.e.r >= 50100 || range.e.c >= 200)
      throw new Error(
        `Лист «${name}» слишком большой: допустимо до 50 100 строк и 200 столбцов. Сохраните нужный диапазон отдельным файлом.`,
      )
    const numericCells: Record<string, number> = {}
    for (const address of Object.keys(sheet)) {
      if (address.startsWith('!')) continue
      const cell = sheet[address] as XLSX.CellObject
      if (
        cell.t === 'n' &&
        typeof cell.v === 'number' &&
        Number.isFinite(cell.v)
      )
        numericCells[address] = cell.v
    }
    return {
      name,
      numericCells,
      // Preserve Excel row/column numbers, including leading empty rows/columns.
      rows: XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: true,
        range: { s: { r: 0, c: 0 }, e: range.e },
      }),
    }
  })
}
export function guessM15Columns(headers: string[]): M15ImportColumns {
  const names = headers.map(normalizeOperationSearch)
  const find = (re: RegExp) => names.findIndex((name) => re.test(name))
  return {
    name: find(/наименование|материал/),
    unit: find(/^ед( |$)|единиц/),
    quantity: find(/отпущено|количество|кол во/),
    position: find(/^№|^поз|номер позиции/),
  }
}
export function m15ImportRows(
  sheet: M15Sheet,
  headerRow: number,
  columns: M15ImportColumns,
): M15ImportRow[] {
  if (
    !Number.isInteger(headerRow) ||
    headerRow < 1 ||
    headerRow > sheet.rows.length
  )
    throw new Error('Укажите строку заголовков на выбранном листе.')
  const required = [columns.name, columns.unit, columns.quantity]
  if (
    [...required, ...(columns.position < 0 ? [] : [columns.position])].some(
      (index) =>
        !Number.isInteger(index) ||
        index < 0 ||
        index >= sheet.rows[headerRow - 1]!.length,
    ) ||
    new Set([...required, ...(columns.position < 0 ? [] : [columns.position])])
      .size !== (columns.position < 0 ? 3 : 4)
  )
    throw new Error(
      'Выберите разные столбцы наименования, единицы и количества.',
    )
  const rows = sheet.rows
    .slice(headerRow)
    .map((row, index) => ({
      sourceRow: headerRow + index + 1,
      position:
        columns.position < 0 ? '' : String(row[columns.position] ?? '').trim(),
      name: String(row[columns.name] ?? '').trim(),
      unit: String(row[columns.unit] ?? '').trim(),
      quantity: String(
        sheet.numericCells?.[
          XLSX.utils.encode_cell({ r: headerRow + index, c: columns.quantity })
        ] ??
          row[columns.quantity] ??
          '',
      ).trim(),
    }))
    .filter((row) => row.name || row.unit || row.quantity || row.position)
  if (rows.length > 50000)
    throw new Error('В одной М-15 поддерживается до 50 000 строк.')
  if (!rows.length) throw new Error('В выбранном диапазоне нет позиций.')
  return rows
}
export function parseM15Amount(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(',', '.')
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null
  const result = Number(normalized)
  return Number.isFinite(result) && result >= 0 ? result : null
}
export function validateM15Import(rows: M15ImportRow[]) {
  return rows.flatMap((row) => {
    const issues = []
    if (!row.name.trim()) issues.push('нет наименования')
    if (!row.unit.trim()) issues.push('нет единицы')
    if (
      row.name.length > 5000 ||
      row.unit.length > 100 ||
      row.position.length > 100
    )
      issues.push('слишком длинное значение')
    if (parseM15Amount(row.quantity) === null)
      issues.push('количество должно быть нулём или положительным числом')
    return issues.length
      ? [`Строка ${row.sourceRow}: ${issues.join(', ')}.`]
      : []
  })
}
/** Match exact content first (occurrence by occurrence), then an unambiguous position.
 * Duplicate names never collapse into one line. Changed lines lose their old allocations. */
export function mergeM15Import(
  current: M15Reconciliation,
  rows: M15ImportRow[],
) {
  const errors = validateM15Import(rows)
  if (errors.length) throw new Error(errors.join('\n'))
  if (current.mode === 'automatic') {
    const before = new Map(
      current.lines.map((line) => [m15MaterialKey(line.name, line.unit), line]),
    )
    const incoming = automaticM15(current.id, {
      id: current.id,
      allocations: [],
      lines: rows.map((row) => ({
        id: crypto.randomUUID(),
        position: '',
        name: row.name.trim(),
        unit: row.unit.trim(),
        quantity: parseM15Amount(row.quantity)!,
      })),
    })
    const changes: Array<{ before?: M15Line; after?: M15Line }> = []
    let preserved = 0
    incoming.lines = incoming.lines.map((line) => {
      const key = m15MaterialKey(line.name, line.unit)
      const old = before.get(key)
      before.delete(key)
      if (old?.quantity === line.quantity) {
        preserved++
        return old
      }
      const after = { ...line, id: old?.id ?? line.id }
      changes.push({ before: old, after })
      return after
    })
    for (const old of before.values()) changes.push({ before: old })
    return {
      changes,
      value: incoming,
      preserved,
      changed: incoming.lines.length - preserved,
      removed: before.size,
      droppedAllocations: 0,
      replacesQuantities: changes.some((change) => !!change.before),
    }
  }
  const signature = (
    line: Pick<M15Line, 'name' | 'unit' | 'quantity' | 'position'>,
  ) =>
    JSON.stringify([
      line.position.trim(),
      line.name.trim(),
      m15Unit(line.unit),
      line.quantity,
    ])
  const exact = new Map<string, { items: M15Line[]; offset: number }>()
  for (const line of current.lines) {
    const key = signature(line)
    const queue = exact.get(key) ?? { items: [], offset: 0 }
    queue.items.push(line)
    exact.set(key, queue)
  }
  const used = new Set<string>(),
    unchanged = new Set<string>()
  const incoming = rows.map((row) => ({
    position: row.position,
    name: row.name.trim(),
    unit: row.unit.trim(),
    quantity: parseM15Amount(row.quantity)!,
  }))
  // Reserve all exact matches before considering changed positions.
  const lines = incoming.map((line) => {
    const queue = exact.get(signature(line))
    const match = queue?.items[queue.offset++]
    if (match) {
      used.add(match.id)
      unchanged.add(match.id)
    }
    return { ...line, id: match?.id ?? '' }
  })
  const positions = new Map<string, Set<M15Line>>()
  for (const line of current.lines)
    if (line.position && !used.has(line.id)) {
      const group = positions.get(line.position) ?? new Set<M15Line>()
      group.add(line)
      positions.set(line.position, group)
    }
  for (const line of lines)
    if (!line.id) {
      const candidates = positions.get(line.position)
      const match = candidates?.size === 1 ? [...candidates][0] : undefined
      line.id = match?.id ?? crypto.randomUUID()
      if (match) candidates?.delete(match)
      used.add(line.id)
    }
  const dropped = current.allocations.filter(
    (item) => !unchanged.has(item.lineId),
  )
  const beforeById = new Map(current.lines.map((line) => [line.id, line]))
  const changes: Array<{ before?: M15Line; after?: M15Line }> = lines
    .filter((line) => !unchanged.has(line.id))
    .map((line) => ({ before: beforeById.get(line.id), after: line }))
  for (const line of current.lines)
    if (!used.has(line.id)) changes.push({ before: line })
  const next = {
    id: current.id,
    lines,
    allocations: current.allocations.filter((item) =>
      unchanged.has(item.lineId),
    ),
  }
  return {
    changes,
    value: next,
    replacesQuantities: changes.some((change) => !!change.before),
    removed: current.lines.filter((line) => !used.has(line.id)).length,
    changed: lines.filter((line) => !unchanged.has(line.id)).length,
    preserved: unchanged.size,
    droppedAllocations: dropped.length,
  }
}
