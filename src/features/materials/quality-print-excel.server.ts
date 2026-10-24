import ExcelJS from 'exceljs'
import { cellPosition, cellRange, columnName } from './request-print'
import {
  readPrintWorkbook,
  copyPrintImageRange,
} from './request-print-excel.server'
import {
  qualityDocumentColumns,
  qualityMaterialColumns,
  qualityPrintConfigSchema,
  qualityPrintFields,
} from './quality-print'
import type { QualityPrintConfig, QualityPrintData } from './quality-print'

type PictureRange = {
  tl: { col: number; row: number }
  br?: { col: number; row: number }
  ext?: { width: number; height: number }
  editAs?: string
}

export function validateQualityPrintConfig(
  book: ExcelJS.Workbook,
  input: unknown,
): QualityPrintConfig {
  const config = qualityPrintConfigSchema.parse(input),
    sheet = book.worksheets[0]!
  const area = cellRange(config.printArea)
  if (config.sheetName !== sheet.name || area.bottom > 200 || area.right > 40)
    throw new Error(
      'Проверьте лист и область печати: не более 200 строк и 40 столбцов.',
    )
  if (
    !config.fields.number?.length ||
    !(
      config.fields.date?.length ||
      (config.fields.day?.length &&
        config.fields.month?.length &&
        config.fields.year?.length)
    )
  )
    throw new Error('Привяжите номер и дату документа (или день, месяц и год).')
  const occupied = new Set<string>(),
    rows = new Set<number>(),
    kinds = new Set<string>()
  function check(address: string) {
    const pos = cellPosition(address),
      cell = sheet.getCell(address)
    if (
      pos.row < area.top ||
      pos.row > area.bottom ||
      pos.column < area.left ||
      pos.column > area.right ||
      sheet.getRow(pos.row).hidden ||
      sheet.getColumn(pos.column).hidden
    )
      throw new Error(`Ячейка ${address} скрыта или вне области печати.`)
    if (cell.isMerged && cell.master.address !== address)
      throw new Error(
        `Выберите начало объединения ${cell.master.address} вместо ${address}.`,
      )
    if (occupied.has(address))
      throw new Error(`В ячейку ${address} назначены разные поля.`)
    occupied.add(address)
  }
  for (const table of config.tables) {
    if (rows.has(table.row) || kinds.has(table.kind))
      throw new Error(
        'Для каждого вида таблицы нужна отдельная строка образца.',
      )
    rows.add(table.row)
    kinds.add(table.kind)
    const columns =
      table.kind === 'materials'
        ? qualityMaterialColumns
        : qualityDocumentColumns
    if (
      !table.columns.name ||
      (table.kind === 'materials' &&
        (!table.columns.quantity || !table.columns.unit))
    )
      throw new Error(
        'Таблице нужны наименование, а материалам — также количество и единица.',
      )
    for (const [key, column] of Object.entries(table.columns)) {
      if (!(key in columns))
        throw new Error(`Неизвестное поле таблицы: ${key}.`)
      check(`${column}${table.row}`)
    }
    for (const merge of sheet.model.merges) {
      const range = cellRange(merge)
      if (
        range.top <= table.row &&
        range.bottom >= table.row &&
        range.top !== range.bottom
      )
        throw new Error(
          'Строка образца не должна объединяться с другими строками.',
        )
    }
    for (const image of sheet.getImages()) {
      const range = image.range as unknown as PictureRange
      let bottom = range.br?.row
      if (bottom === undefined) {
        let pixels = range.ext?.height ?? 0,
          row = Math.floor(range.tl.row)
        while (pixels > 0 && row < 201) {
          pixels -= ((sheet.getRow(row + 1).height || 15) * 96) / 72
          row++
        }
        bottom = row
      }
      if (range.tl.row < table.row && bottom > table.row - 1)
        throw new Error('Изображение пересекает строку образца таблицы.')
    }
  }
  for (const [key, addresses] of Object.entries(config.fields)) {
    if (!(key in qualityPrintFields))
      throw new Error(`Неизвестное поле документа: ${key}.`)
    for (const address of addresses) {
      check(address)
      if (rows.has(cellPosition(address).row))
        throw new Error(
          'Реквизиты документа нельзя размещать в строке образца.',
        )
    }
  }
  if (config.headerRows) {
    const [start, end] = config.headerRows.split(':').map(Number)
    if (
      !start ||
      !end ||
      start < area.top ||
      start > end ||
      end > area.bottom ||
      (rows.size && end >= Math.min(...rows))
    )
      throw new Error(
        'Повторяемые заголовки должны находиться выше таблиц и внутри области печати.',
      )
  }
  return config
}

export async function fillQualityPrintWorkbook(
  bytes: Buffer,
  input: QualityPrintConfig,
  data: QualityPrintData,
) {
  const source = await readPrintWorkbook(bytes),
    config = validateQualityPrintConfig(source, input),
    original = source.worksheets[0]!
  if (data.materials.length > 2000 || data.documents.length > 2000)
    throw new Error('Не более 2000 строк в одной печатной таблице.')
  const blocks = config.tables
    .map((table) => ({
      ...table,
      values: data[table.kind].length ? data[table.kind] : [{}],
    }))
    .sort((a, b) => a.row - b.row)
  const move = (row: number) =>
    row +
    blocks.reduce(
      (offset, block) =>
        offset + (row > block.row ? block.values.length - 1 : 0),
      0,
    )
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet(original.name, {
      properties: structuredClone(original.properties),
      pageSetup: {
        ...structuredClone(original.pageSetup),
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: config.tables.length ? 0 : original.pageSetup.fitToHeight,
        printTitlesRow: config.headerRows || undefined,
      },
      headerFooter: structuredClone(original.headerFooter),
    })
  original.columns.forEach((column, index) => {
    const next = sheet.getColumn(index + 1)
    next.width = column.width
    next.hidden = column.hidden ?? false
    next.style = structuredClone(column.style ?? {})
  })
  const copyRow = (from: number, to: number) => {
    const row = original.getRow(from),
      target = sheet.getRow(to)
    target.height = row.height
    target.hidden = row.hidden
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      const next = target.getCell(column)
      next.value =
        cell.isMerged && cell.master.address !== cell.address
          ? null
          : structuredClone(cell.value)
      next.style = structuredClone(cell.style)
    })
  }
  original.eachRow({ includeEmpty: true }, (row) =>
    copyRow(row.number, move(row.number)),
  )
  blocks.forEach((block) =>
    block.values.forEach((_, index) =>
      copyRow(block.row, move(block.row) + index),
    ),
  )
  for (const merge of original.model.merges) {
    const range = cellRange(merge),
      block = blocks.find((entry) => entry.row === range.top)
    if (block)
      block.values.forEach((_, index) =>
        sheet.mergeCellsWithoutStyle(
          move(range.top) + index,
          range.left,
          move(range.bottom) + index,
          range.right,
        ),
      )
    else
      sheet.mergeCellsWithoutStyle(
        move(range.top),
        range.left,
        move(range.bottom),
        range.right,
      )
  }
  const changedCells = new Set<string>()
  for (const [key, addresses] of Object.entries(config.fields))
    for (const address of addresses) {
      const pos = cellPosition(address)
      sheet.getCell(move(pos.row), pos.column).value = data.fields[key] ?? ''
      changedCells.add(sheet.getCell(move(pos.row), pos.column).address)
    }
  for (const block of blocks) {
    // Adapt only the standard reference form's generic delivery-document column
    // in the filled copy, leaving the saved template intact.
    const sourceColumn =
      block.kind === 'materials' ? block.columns.appNumber : undefined
    const sourceHeader = sourceColumn
      ? sheet.getCell(`${sourceColumn}${move(block.row) - 1}`).master
      : null
    const standardSource =
      !!sourceHeader &&
      /^(№\s*)?(ТТН\s*[/]\s*УПД|АПП)$/u.test(sourceHeader.text.trim())
    if (standardSource) {
      sourceHeader.value = 'Документ получения'
      sourceHeader.alignment = { ...sourceHeader.alignment, wrapText: true }
      changedCells.add(sourceHeader.address)
    }
    for (const [index, values] of block.values.entries())
      for (const [key, col] of Object.entries(block.columns)) {
        const cell = sheet.getCell(`${col}${move(block.row) + index}`)
        cell.value =
          standardSource && key === 'appNumber'
            ? (values.receiptDocument ?? values[key] ?? null)
            : standardSource && key === 'appDate'
              ? (values.receiptDocumentDate ?? values[key] ?? null)
              : (values[key] ?? null)
        changedCells.add(cell.address)
      }
  }
  for (const image of original.getImages()) {
    const imageId = book.addImage(source.getImage(Number(image.imageId)))
    sheet.addImage(imageId, copyPrintImageRange(image.range, move))
  }
  // Preserve manual page breaks and their positions relative to the expanded tables.
  for (const rowBreak of original.model.rowBreaks)
    sheet
      .getRow(move(rowBreak.id))
      .addPageBreak((rowBreak.min || 0) + 1, rowBreak.max + 1)
  const merges = sheet.model.merges.map(cellRange)
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      if (
        !changedCells.has(cell.address) ||
        (cell.isMerged && cell.master.address !== cell.address) ||
        !cell.text ||
        !cell.style.alignment?.wrapText
      )
        return
      const merge = merges.find(
        (range) => range.top === row.number && range.left === Number(cell.col),
      )
      let width = 0
      for (
        let col = Number(cell.col);
        col <= (merge?.right ?? Number(cell.col));
        col++
      )
        width += sheet.getColumn(col).width ?? 8.43
      const font = cell.style.font?.size ?? 10,
        chars = Math.max(1, Math.floor((width * 0.85 * 10) / font))
      const count = cell.text
        .split('\n')
        .reduce(
          (sum, line) => sum + Math.max(1, Math.ceil(line.length / chars)),
          0,
        )
      const required = count * font * 1.4 + 5,
        bottom = merge?.bottom ?? row.number
      let existing = 0
      for (let r = row.number; r <= bottom; r++)
        if (!sheet.getRow(r).hidden) existing += sheet.getRow(r).height || 15
      if (required > existing) {
        const height = (sheet.getRow(bottom).height || 15) + required - existing
        if (height > 400)
          throw new Error(
            `Текст в ${cell.address} слишком длинный для одной страницы. Расширьте поле в шаблоне.`,
          )
        sheet.getRow(bottom).height = height
      }
    }),
  )
  const area = cellRange(config.printArea)
  sheet.pageSetup.printArea = `${columnName(area.left)}${move(area.top)}:${columnName(area.right)}${move(area.bottom)}`
  return Buffer.from(await book.xlsx.writeBuffer())
}
