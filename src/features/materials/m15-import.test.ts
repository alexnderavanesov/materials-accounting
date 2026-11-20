import { expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  createM15ImportTemplate,
  findM15Template,
  guessM15Columns,
  m15ImportRows,
  mergeM15Import,
  parseM15Amount,
  readM15Workbook,
  validateM15Import,
} from './m15-import'
import { m15Fixture } from './m15-reconciliation.fixtures'

it('downloads an importable template with real names/units and blank documentary quantities', () => {
  const materials = [
    { name: 'Труба 57х4 09г2с', unit: 'м' },
    { name: 'Клапан', unit: 'шт' },
  ]
  const workbook = createM15ImportTemplate(materials)
  const buffer = () =>
    XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const sheet = readM15Workbook(buffer())[0]!
  const columns = guessM15Columns(sheet.rows[0]!)
  expect(columns).toEqual({ position: 0, name: 1, unit: 2, quantity: 3 })
  expect(m15ImportRows(sheet, 1, columns).map((row) => row.quantity)).toEqual([
    '',
    '',
  ])
  // Filling only the quantity column makes the downloaded file ready for import.
  XLSX.utils.sheet_add_aoa(
    workbook.Sheets[workbook.SheetNames[0]!]!,
    [[100], [0]],
    { origin: 'D2' },
  )
  const filled = m15ImportRows(readM15Workbook(buffer())[0]!, 1, columns)
  expect(validateM15Import(filled)).toEqual([])
  expect(filled.map((row) => [row.name, row.unit, row.quantity])).toEqual([
    ['Труба 57х4 09г2с', 'м', '100'],
    ['Клапан', 'шт', '0'],
  ])
  const empty = createM15ImportTemplate()
  expect(
    XLSX.utils.sheet_to_json(empty.Sheets[empty.SheetNames[0]!]!, {
      header: 1,
    }),
  ).toHaveLength(1)
})

it.each(['xlsx', 'xls'] as const)(
  'reads %s with sheet, header, mapped columns and Russian decimals',
  (bookType) => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([['Другой лист']]),
      'Обложка',
    )
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        [],
        ['Состав М-15'],
        ['№', 'Наименование', 'Единица', 'Количество'],
        ['1', 'Труба', 'м', '1 234,5'],
        ['2', 'Труба', 'м', 10],
      ]),
      'Состав',
    )
    const sheets = readM15Workbook(
      XLSX.write(book, { bookType, type: 'array' }) as ArrayBuffer,
    )
    const rows = m15ImportRows(
      sheets[1]!,
      3,
      guessM15Columns(sheets[1]!.rows[2]!),
    )
    expect(rows).toEqual([
      {
        sourceRow: 4,
        position: '1',
        name: 'Труба',
        unit: 'м',
        quantity: '1 234,5',
      },
      { sourceRow: 5, position: '2', name: 'Труба', unit: 'м', quantity: '10' },
    ])
    expect(validateM15Import(rows)).toEqual([])
    expect(parseM15Amount(rows[0]!.quantity)).toBe(1234.5)
  },
)
it('does not silently truncate oversized sheets', () => {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([['Наименование']])
  sheet['!ref'] = 'A1:A50102'
  sheet.A50102 = { t: 's', v: 'Последняя строка' }
  XLSX.utils.book_append_sheet(book, sheet, 'Лист')
  expect(() =>
    readM15Workbook(
      XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer,
    ),
  ).toThrow('слишком большой')
})
it('keeps duplicate positions separate and unchanged associations after reordered import', () => {
  const { value } = m15Fixture()
  value.lines.push({
    ...value.lines[0]!,
    id: 'row2',
    position: '2',
    quantity: 5,
  })
  const rows = [...value.lines].reverse().map((line, i) => ({
    ...line,
    sourceRow: i + 2,
    quantity: String(line.quantity),
  }))
  const merged = mergeM15Import(value, rows)
  expect(merged.preserved).toBe(2)
  expect(merged.value.lines.map((line) => line.id)).toEqual(['row2', 'row1'])
  expect(merged.value.allocations).toEqual(value.allocations)
  const changed = mergeM15Import(
    value,
    rows.map((row) => ({ ...row, quantity: '9' })),
  )
  expect(changed.droppedAllocations).toBe(1)
  expect(changed.value.allocations).toEqual([])
  expect(mergeM15Import(value, rows.slice(0, 1))).toMatchObject({
    removed: 1,
    droppedAllocations: 1,
  })
  expect(value.allocations).toHaveLength(1)
})
it('preserves every occurrence of fully identical duplicate rows', () => {
  const { value } = m15Fixture()
  value.lines.push({ ...value.lines[0]!, id: 'duplicate' })
  const merged = mergeM15Import(
    value,
    value.lines.map((line) => ({ ...line, sourceRow: 2, quantity: '10' })),
  )
  expect(merged.value.lines.map((line) => line.id)).toEqual([
    'row1',
    'duplicate',
  ])
})
it('rejects bad mapping and invalid quantities without changing current data', () => {
  expect(() =>
    m15ImportRows(
      {
        name: 'Лист',
        rows: [
          ['x', 'y', 'z'],
          ['a', 'шт', '0'],
        ],
      },
      1,
      { name: 0, unit: 1, quantity: 1, position: -1 },
    ),
  ).toThrow('разные столбцы')
  expect(parseM15Amount('0')).toBe(0)
  for (const quantity of ['', '-1', 'NaN', '1,2,3', '10 шт'])
    expect(parseM15Amount(quantity)).toBeNull()
  const { value } = m15Fixture(),
    before = structuredClone(value)
  expect(() =>
    mergeM15Import(value, [
      { sourceRow: 2, position: '1', name: '', unit: '', quantity: 'x' },
    ]),
  ).toThrow('Строка 2')
  expect(value).toEqual(before)
})
it('reimports 50,000 identical positions without collapsing records or quadratic queues', () => {
  const { value } = m15Fixture()
  value.lines = Array.from({ length: 50000 }, (_, i) => ({
    ...value.lines[0]!,
    id: String(i),
  }))
  value.allocations = []
  const started = performance.now()
  const result = mergeM15Import(
    value,
    value.lines.map((line) => ({ ...line, sourceRow: 2, quantity: '10' })),
  )
  expect(result.preserved).toBe(50000)
  expect(new Set(result.value.lines.map((row) => row.id)).size).toBe(50000)
  expect(performance.now() - started).toBeLessThan(5000)
})

it('reads numeric quantities independently of thousands separators and preserves formatted position numbers', () => {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['№', 'Наименование', 'Единица', 'Количество'],
    [1, 'Труба', 'м', 1000],
    [2, 'Труба', 'м', 1234.5],
  ])
  sheet.A2!.z = '0000'
  sheet.D2!.z = '#,##0'
  sheet.D3!.z = '#,##0.00'
  XLSX.utils.book_append_sheet(book, sheet, 'М-15')
  const imported = readM15Workbook(
    XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer,
  )[0]!
  const rows = m15ImportRows(imported, 1, guessM15Columns(imported.rows[0]!))
  expect(rows.map((row) => row.quantity)).toEqual(['1000', '1234.5'])
  expect(rows[0]!.position).toBe('0001')
})

it('recognizes a template by headers after renaming or moving the worksheet, and does not guess between two tables', () => {
  const book = createM15ImportTemplate([{ name: 'Труба', unit: 'м' }])
  const sheets = readM15Workbook(
    XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer,
  )
  sheets[0]!.name = 'Новое название'
  sheets[0]!.rows.unshift(['Накладная №1'])
  sheets.unshift({ name: 'Обложка', rows: [['Справка']] })
  expect(findM15Template(sheets)).toEqual({
    sheetIndex: 1,
    headerRow: 2,
    columns: { position: 0, name: 1, unit: 2, quantity: 3 },
  })
  expect(findM15Template([...sheets, sheets[1]!])).toBeNull()
  expect(
    findM15Template([{ name: 'Лист', rows: [['Материал', 'Количество']] }]),
  ).toBeNull()
})
