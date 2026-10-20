import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {
  cellPosition,
  cellRange,
  columnName,
  defaultPrintConfig,
  maxTemplateBytes,
  printConfigSchema,
} from './request-print'
import type {
  PrintConfig,
  PrintData,
  PrintHeaderField,
  PrintLineField,
  TemplateSheet,
} from './request-print'

type PictureRange = {
  tl: { col: number; row: number }
  br?: { col: number; row: number }
  ext?: { width: number; height: number }
  editAs?: string
}

export function copyPrintImageRange(
  image: ExcelJS.ImageRange,
  move: (row: number) => number,
): ExcelJS.ImageRange {
  const range = image as unknown as PictureRange
  // Fractional .col/.row getters clamp native EMU offsets; this can erase a logo's width.
  const anchor = (value: { col: number; row: number }) => {
    const native = value as unknown as {
      nativeCol: number
      nativeColOff: number
      nativeRow: number
      nativeRowOff: number
    }
    return {
      nativeCol: native.nativeCol,
      nativeColOff: native.nativeColOff,
      nativeRow: move(native.nativeRow + 1) - 1,
      nativeRowOff: native.nativeRowOff,
    }
  }
  return {
    tl: anchor(range.tl),
    ...(range.br ? { br: anchor(range.br) } : { ext: range.ext }),
    editAs: range.editAs,
  } as unknown as ExcelJS.ImageRange
}

export async function createDefaultPrintWorkbook() {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Заявка', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printArea: defaultPrintConfig.printArea,
      printTitlesRow: defaultPrintConfig.headerRows,
      margins: {
        left: 0.433,
        right: 0.1,
        top: 0.1,
        bottom: 0.2,
        header: 0,
        footer: 0.1,
      },
    },
    headerFooter: { oddFooter: 'Страница &P из &N' },
  })
  // Layout of the user's approved request form: paired units/quantities and signatures below.
  const widths = [7.16, 75.83, 6.66, 6.16, 8.16, 8.16, 12.5, 26.5, 38.83]
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
  const heights = [25, 25, 23, 16.75, 75.5, 25, 30.5, 33, 46, 46, 46, 46, 46]
  for (let r = 1; r <= 13; r++) {
    sheet.getRow(r).height = heights[r - 1]!
    for (let c = 1; c <= 9; c++) {
      const cell = sheet.getCell(r, c)
      cell.font = {
        name: 'Times New Roman',
        size: r < 7 ? 14 : r === 8 ? 11 : 12,
      }
      cell.alignment = {
        vertical: 'middle',
        wrapText: true,
        horizontal: 'left',
      }
      if (r === 7 || r === 8) {
        cell.border = Object.fromEntries(
          ['top', 'bottom', 'left', 'right'].map((key) => [
            key,
            { style: 'thin', color: { argb: 'FF000000' } },
          ]),
        )
        cell.alignment.horizontal = r === 8 && c === 2 ? 'left' : 'center'
        cell.font.bold = r === 7
      }
    }
  }
  for (const range of ['A5:I5', 'A6:I6', 'C7:D7', 'E7:F7'])
    sheet.mergeCells(range)
  for (const [address, text] of Object.entries({
    B1: 'Подрядная организация:',
    B2: 'ООО "Югмонтажстрой"',
    B3: '(наименование)',
    A5: 'Заявка на ПОЛУЧЕНИЕ материалов / оборудования (ТМЦ)\nпо проекту "Комбинированная установка по производству автомобильных бензинов III-я очередь строительства АО "Новошахтинский завод нефтепродуктов""\nДоговор № 25/НИ260 от 19.08.2025г.',
    A6: '№ __________ от __________ г.',
    A7: '№ п/п',
    B7: 'Наименование ТМЦ по проекту',
    C7: 'Ед. изм.',
    E7: 'Кол-во',
    G7: 'Номер\nпартии',
    H7: 'Шифр проекта / Титул',
    I7: 'Примечание',
  }))
    sheet.getCell(address).value = text
  for (const address of ['B1', 'B2', 'A5', 'A6'])
    sheet.getCell(address).font.bold = true
  for (const address of ['B2', 'B3', 'A5', 'A6'])
    sheet.getCell(address).alignment.horizontal = 'center'
  sheet.getCell('B2').border = { bottom: { style: 'medium' } }
  // Keep static roles/company text editable in Excel; the requester is filled in H9.
  const signatures = [
    ['Заявитель:', 'Мастер СМР ООО "Югмонтажстрой"'],
    ['Проверил:', 'Начальника строительства ООО "Югмонтажстрой"'],
    ['Согласовано:', 'Представитель ООС ООО "НЗНП Инжиниринг"'],
    ['Согласовано:', 'Представитель складской логистики ООО "НЗНП Инжиниринг"'],
    ['Принял:', 'Представитель ООО "Югмонтажстрой"'],
  ]
  signatures.forEach(([label, role], index) => {
    const row = index + 9
    sheet.mergeCells(`B${row}:G${row}`)
    sheet.getCell(`B${row}`).value = {
      richText: [
        {
          text: label!,
          font: {
            name: 'Times New Roman',
            size: 12,
            bold: true,
            underline: true,
          },
        },
        { text: `\n${role}`, font: { name: 'Times New Roman', size: 12 } },
      ],
    }
    for (const col of ['B', 'H'])
      sheet.getCell(`${col}${row}`).border = { bottom: { style: 'thin' } }
    sheet.getCell(`H${row}`).alignment = {
      horizontal: 'right',
      vertical: 'bottom',
      wrapText: true,
    }
  })
  sheet.getCell('H10').value = 'Филенко М.А.'
  // Match the sample's minimum precision without rounding away extra fractional digits.
  sheet.getCell('E8').numFmt = '0.000############'
  sheet.getCell('F8').numFmt = '0.00#############'
  return Buffer.from(await book.xlsx.writeBuffer())
}

/** Inspect the OOXML before ExcelJS can silently discard unsupported objects. */
export async function readPrintWorkbook(bytes: Buffer) {
  if (!bytes.length || bytes.length > maxTemplateBytes)
    throw new Error('Загрузите файл .xlsx размером до 5 МБ.')
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Error(
      'Не удалось прочитать Excel. Нужен исправный файл .xlsx без пароля.',
    )
  }
  const files = Object.values(zip.files)
  if (files.length > 500) throw new Error('В шаблоне слишком много объектов.')
  let uncompressed = 0
  for (const file of files) {
    if (file.dir) continue
    const size =
      (file as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize ?? 0
    uncompressed += size
    if (uncompressed > 30 * 1024 * 1024)
      throw new Error('Распакованный шаблон слишком большой.')
    if (
      /vbaProject|externalLinks|embeddings|activeX|charts\/|pivot|slicer|tables\/|comments|vmlDrawing|connections\.xml|queryTables/i.test(
        file.name,
      )
    )
      throw new Error(
        'Шаблон содержит макросы, ссылки или сложные объекты. Оставьте обычные ячейки и изображения PNG/JPEG.',
      )
    if (
      file.name.endsWith('.rels') &&
      /TargetMode=["']External["']/.test(await file.async('string'))
    )
      throw new Error('Внешние ссылки в шаблоне не поддерживаются.')
    if (file.name.endsWith('.xml')) {
      const xml = await file.async('string')
      if (file.name.startsWith('xl/worksheets/')) {
        for (const match of xml.matchAll(
          /<(?:\w+:)?(?:c|dimension|mergeCell)\b[^>]*\b(?:r|ref)="([^"]+)"/g,
        )) {
          const range = cellRange(match[1]!)
          if (range.bottom > 200 || range.right > 40)
            throw new Error(
              'Шаблон должен занимать не более 200 строк и 40 столбцов.',
            )
        }
      }
      if (
        file.name.startsWith('xl/drawings/') &&
        /<(?:\w+:)?(?:srcRect|tile|absoluteAnchor)\b|\b(?:rot|flipH|flipV)="(?!0")/.test(
          xml,
        )
      )
        throw new Error(
          'Обрезка, поворот и сложное размещение изображений не поддерживаются. Используйте обычное изображение PNG/JPEG.',
        )
      if (/<(?:\w+:)?(?:f|formula|formula1|formula2)(?:\s|\/?>)/.test(xml))
        throw new Error(
          'Формулы в печатном шаблоне не поддерживаются. Количества рассчитывает приложение.',
        )
      if (
        /<(?:\w+:)?(?:sp|grpSp|cxnSp|graphicFrame|oleObject|control|picture|conditionalFormatting|dataValidation|hyperlink)(?:\s|\/?>)/.test(
          xml,
        )
      )
        throw new Error(
          'В шаблоне есть неподдерживаемые объекты или правила. Используйте обычное оформление и PNG/JPEG.',
        )
    }
    if (file.name.startsWith('xl/media/') && !/\.(png|jpe?g)$/i.test(file.name))
      throw new Error('В шаблоне поддерживаются только изображения PNG/JPEG.')
  }
  const book = new ExcelJS.Workbook()
  try {
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  } catch {
    throw new Error('Excel-файл повреждён или имеет неподдерживаемый формат.')
  }
  if (book.worksheets.length !== 1)
    throw new Error(
      'В шаблоне должен быть один лист. Удалите остальные листы, включая скрытые.',
    )
  const sheet = book.worksheets[0]!
  // ExcelJS reads row breaks from XML but drops them when assigning the worksheet model.
  // Restore them explicitly so expanding a printed table can move them faithfully.
  const worksheetFile = files.find((file) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name),
  )
  if (worksheetFile) {
    const xml = await worksheetFile.async('string')
    const breaks = xml.match(/<rowBreaks\b[\s\S]*?<\/rowBreaks>/)?.[0] ?? ''
    for (const match of breaks.matchAll(/<brk\b([^>]*)\/?\s*>/g)) {
      const attributes = Object.fromEntries(
        [...match[1]!.matchAll(/(id|min|max)="(\d+)"/g)].map((attr) => [
          attr[1],
          Number(attr[2]),
        ]),
      )
      if (attributes.id && attributes.id <= 200)
        sheet
          .getRow(attributes.id)
          .addPageBreak((attributes.min ?? 0) + 1, (attributes.max ?? 39) + 1)
    }
  }
  if (
    sheet.state !== 'visible' ||
    sheet.rowCount > 200 ||
    sheet.columnCount > 40
  )
    throw new Error('Нужен видимый лист не более 200 строк и 40 столбцов.')
  return book
}

export function describePrintSheet(book: ExcelJS.Workbook): TemplateSheet {
  const sheet = book.worksheets[0]!
  const cells: TemplateSheet['cells'] = []
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      if (!cell.isMerged || cell.master.address === cell.address)
        cells.push({ address: cell.address, text: cell.text })
    }),
  )
  return {
    name: sheet.name,
    rows: Math.max(sheet.rowCount, 15),
    columns: Math.max(sheet.columnCount, 9),
    cells,
    merges: [...sheet.model.merges],
  }
}

export function validatePrintConfig(
  book: ExcelJS.Workbook,
  input: unknown,
): PrintConfig {
  const parsed = printConfigSchema.safeParse(input)
  if (!parsed.success)
    throw new Error(
      'Проверьте адреса ячеек, область печати и номер строки материалов.',
    )
  const config = parsed.data,
    sheet = book.worksheets[0]!
  if (sheet.name !== config.sheetName)
    throw new Error('Выбранный лист отсутствует в файле.')
  const area = cellRange(config.printArea)
  if (
    area.bottom > 200 ||
    area.right > 40 ||
    config.repeatRow < area.top ||
    config.repeatRow > area.bottom
  )
    throw new Error(
      'Строка материалов должна входить в область печати (до 200 строк и 40 столбцов).',
    )
  if (
    ((!config.fields.number || !config.fields.date) &&
      !config.fields.numberAndDate) ||
    (!config.columns.name && !config.columns.nameWithDetails) ||
    !config.columns.quantity ||
    !config.columns.unit
  )
    throw new Error(
      'Укажите ячейки номера и даты (или одно общее поле), столбцы наименования, единицы и количества.',
    )
  const occupied = new Set<string>()
  for (const address of [
    ...Object.values(config.fields).filter(Boolean),
    ...Object.values(config.columns)
      .filter(Boolean)
      .map((c) => `${c}${config.repeatRow}`),
  ]) {
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
      throw new Error(
        `Ячейка ${address} скрыта или находится вне области печати.`,
      )
    if (cell.isMerged && cell.master.address !== address)
      throw new Error(
        `Для объединённой ячейки выберите ${cell.master.address} вместо ${address}.`,
      )
    if (occupied.has(address))
      throw new Error(`Ячейка ${address} связана с несколькими полями.`)
    occupied.add(address)
  }
  if (
    Object.values(config.fields).some(
      (a) => a && cellPosition(a).row === config.repeatRow,
    )
  )
    throw new Error(
      'Реквизиты заявки нельзя размещать в повторяемой строке материалов.',
    )
  for (const merge of sheet.model.merges) {
    const range = cellRange(merge)
    if (
      range.top <= config.repeatRow &&
      range.bottom >= config.repeatRow &&
      range.top !== range.bottom
    )
      throw new Error(
        'Строка материалов не должна объединяться с другими строками.',
      )
  }
  if (config.headerRows) {
    const [start, end] = config.headerRows.split(':').map(Number)
    if (
      !start ||
      !end ||
      start < area.top ||
      end < start ||
      end >= config.repeatRow
    )
      throw new Error(
        'Повторяемые заголовки должны находиться выше строки материалов и внутри области печати.',
      )
  }
  for (const image of sheet.getImages()) {
    const range = image.range as unknown as PictureRange
    const rowPixels = (row: number) =>
      ((sheet.getRow(row + 1).height ||
        sheet.properties.defaultRowHeight ||
        15) *
        96) /
      72
    const topPixels = (row: number) => {
      if (!Number.isFinite(row) || row < 0 || row > 200)
        throw new Error('Изображение находится за пределами шаблона.')
      let top = 0
      for (let i = 0; i < Math.floor(row); i++) top += rowPixels(i)
      return top + (row % 1) * rowPixels(Math.floor(row))
    }
    const start = topPixels(range.tl.row)
    const end = range.br
      ? topPixels(range.br.row)
      : start + (range.ext?.height ?? 0)
    if (
      start < topPixels(config.repeatRow) &&
      end > topPixels(config.repeatRow - 1)
    )
      throw new Error(
        'Изображение пересекает строку материалов. Перенесите его выше или ниже таблицы.',
      )
  }
  return config
}

export async function fillPrintWorkbook(
  bytes: Buffer,
  input: PrintConfig,
  data: PrintData,
) {
  if (!data.rows.length || data.rows.length > 2000)
    throw new Error('Печатать можно заявку от 1 до 2000 позиций.')
  const source = await readPrintWorkbook(bytes)
  const config = validatePrintConfig(source, input),
    original = source.worksheets[0]!
  const book = new ExcelJS.Workbook()
  const offset = data.rows.length - 1
  const move = (row: number) => (row > config.repeatRow ? row + offset : row)
  const sheet = book.addWorksheet(original.name, {
    properties: structuredClone(original.properties),
    pageSetup: {
      ...structuredClone(original.pageSetup),
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: config.headerRows || undefined,
    },
    headerFooter: structuredClone(original.headerFooter),
  })
  original.columns.forEach((col, i) => {
    const next = sheet.getColumn(i + 1)
    next.width = col.width
    next.hidden = col.hidden ?? false
    next.style = structuredClone(col.style ?? {})
  })
  function copyRow(from: number, to: number) {
    const row = original.getRow(from),
      target = sheet.getRow(to)
    target.height = row.height
    target.hidden = row.hidden
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const next = target.getCell(col)
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
  data.rows.forEach((_, index) =>
    copyRow(config.repeatRow, config.repeatRow + index),
  )
  for (const merge of original.model.merges) {
    const r = cellRange(merge)
    if (r.top === config.repeatRow)
      for (let i = 0; i < data.rows.length; i++)
        sheet.mergeCellsWithoutStyle(r.top + i, r.left, r.bottom + i, r.right)
    else
      sheet.mergeCellsWithoutStyle(move(r.top), r.left, move(r.bottom), r.right)
  }
  for (const [key, address] of Object.entries(config.fields)) {
    if (!address) continue
    const pos = cellPosition(address)
    sheet.getCell(move(pos.row), pos.column).value =
      key === 'numberAndDate'
        ? `№${data.headers.number} от ${data.headers.date}г.`
        : data.headers[key as Exclude<PrintHeaderField, 'numberAndDate'>]
  }
  data.rows.forEach((values, index) => {
    for (const [key, col] of Object.entries(config.columns))
      if (col)
        sheet.getCell(`${col}${config.repeatRow + index}`).value =
          key === 'nameWithDetails'
            ? [values.name, values.document, values.alloy]
                .filter(Boolean)
                .join(' ')
            : values[key as Exclude<PrintLineField, 'nameWithDetails'>]
  })
  for (const image of original.getImages()) {
    const id = book.addImage(source.getImage(Number(image.imageId)))
    sheet.addImage(id, copyPrintImageRange(image.range, move))
  }
  for (const rowBreak of original.model.rowBreaks)
    sheet
      .getRow(move(rowBreak.id))
      .addPageBreak((rowBreak.min || 0) + 1, rowBreak.max + 1)
  // Excel does not auto-fit explicitly sized template rows during PDF conversion.
  // Expand wrapped text conservatively; never shrink the author's row heights.
  const merges = sheet.model.merges.map(cellRange)
  sheet.eachRow((row) => {
    let height = row.height || 15
    row.eachCell((cell) => {
      if ((cell.isMerged && cell.master.address !== cell.address) || !cell.text)
        return
      const merge = merges.find(
        (r) => r.top === row.number && r.left === Number(cell.col),
      )
      if (merge && merge.bottom !== merge.top) return
      const last = merge?.right ?? Number(cell.col)
      let width = 0
      for (let c = Number(cell.col); c <= last; c++)
        width += sheet.getColumn(c).width ?? 8.43
      const font = cell.style.font?.size ?? 10
      const chars = Math.max(1, Math.floor((width * 0.85 * 10) / font))
      const lines = cell.text
        .split('\n')
        .reduce(
          (sum, line) => sum + Math.max(1, Math.ceil(line.length / chars)),
          0,
        )
      if (cell.style.alignment?.wrapText)
        height = Math.max(height, lines * font * 1.45 + 7)
    })
    if (height > 400)
      throw new Error(
        `Текст в строке ${row.number} не помещается на страницу. Увеличьте ширину столбца или сократите текст.`,
      )
    row.height = height
  })
  const area = cellRange(config.printArea)
  sheet.pageSetup.printArea = `${columnName(area.left)}${area.top}:${columnName(area.right)}${area.bottom + offset}`
  return Buffer.from(await book.xlsx.writeBuffer())
}
