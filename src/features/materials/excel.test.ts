import { describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'

import {
  createMaterialRequestTemplateWorkbook,
  createMaterialReceiptTemplateWorkbook,
  createProjectMaterialsExportWorkbook,
  parseMaterialReceiptWorkbook,
  parseProjectMaterialsWorkbook,
} from './excel'
import { validateImportDraft } from './domain'

// ExcelJS omits the default locked=true protection when reading a workbook.
function isCellLocked(cell: { protection?: { locked?: boolean } }) {
  return cell.protection?.locked !== false
}

function workbookFromRows(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Проектная база')

  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer
}

describe('materials Excel import', () => {
  it('round-trips alternative units and factors separately for otherwise equal materials', async () => {
    const lines = [2.5, 4].map((alternativeUnitFactor) => ({
      project: 'Проект',
      cipher: 'ТК1',
      category: 'Трубы',
      material: 'Сталь',
      projectMaterialName: 'Труба',
      unit: 'м',
      alternativeUnit: 'кг',
      alternativeUnitFactor,
      plannedQuantity: 3,
      requested: 0,
      received: 0,
      qcPending: 0,
      accepted: 0,
      issued: 0,
      returned: 0,
      writtenOff: 0,
    }))
    const buffer = await createProjectMaterialsExportWorkbook(
      lines,
      ['ТК1'],
      [],
    )
    const imported = validateImportDraft(parseProjectMaterialsWorkbook(buffer))
    expect(imported.summary.errorRows).toBe(0)
    expect(
      imported.rows.map((row) => ({
        unit: row.alternativeUnit,
        factor: row.alternativeUnitFactor,
        quantity: row.quantity,
      })),
    ).toEqual([
      { unit: 'кг', factor: 2.5, quantity: 3 },
      { unit: 'кг', factor: 4, quantity: 3 },
    ])
  })
  it('generates request formulas from the material conversion', async () => {
    const buffer = await createMaterialRequestTemplateWorkbook({
      cipher: 'ТК1',
      materialType: 'Трубы',
      lines: [
        {
          lineId: 'line-0',
          unit: 'м',
          alternativeUnit: 'кг',
          alternativeUnitFactor: 2.5,
          plannedQuantity: 10,
          requestBalance: 10,
        },
        { lineId: 'line-1', unit: 'м', plannedQuantity: 5, requestBalance: 5 },
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Заявка')!
    expect(sheet.getCell('J6').value).toMatchObject({
      formula: 'IF(H6="","",H6*2.5)',
    })
    expect(sheet.getCell('K6').value).toBe('кг')
    expect(sheet.getCell('J7').value).toBe('')
    expect(isCellLocked(sheet.getCell('J6'))).toBe(true)
    expect(isCellLocked(sheet.getCell('K6'))).toBe(true)
    expect(sheet.getCell('H6').protection.locked).toBe(false)
  })
  it('keeps every type in a mixed request template without changing quantity input columns', async () => {
    const buffer = await createMaterialRequestTemplateWorkbook({
      cipher: 'ТК1',
      materialType: 'Трубы, Детали',
      lines: [
        {
          lineId: 'pipe',
          materialType: 'Трубы',
          projectMaterialName: 'Труба',
          unit: 'м',
          plannedQuantity: 10,
          requestBalance: 10,
        },
        {
          lineId: 'bend',
          materialType: 'Детали',
          projectMaterialName: 'Отвод',
          unit: 'шт',
          plannedQuantity: 5,
          requestBalance: 5,
        },
      ],
    })
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(buffer)
    const sheet = book.getWorksheet('Заявка')!
    expect([sheet.getCell('M6').value, sheet.getCell('M7').value]).toEqual([
      'Трубы',
      'Детали',
    ])
    expect(sheet.getCell('H6').protection.locked).toBe(false)
    expect(sheet.getCell('H7').protection.locked).toBe(false)
  })
  it('makes receipt alternatives calculated, protected columns while leaving receipt inputs editable', async () => {
    const line = {
      projectLineId: 'line-0',
      requestId: 'request-0',
      projectMaterialName: 'Труба',
      unit: 'м',
      requestQuantity: 10,
      receivedQuantity: 2,
      requestRest: 8,
    }
    const buffer = await createMaterialReceiptTemplateWorkbook({
      requestNumber: 'TEST',
      lines: [{ ...line, altUnit: 'кг', altUnitFactor: 2.5 }, line],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Получение')!
    expect(sheet.getCell('K6').value).toMatchObject({
      formula: 'IF(J6="","",J6*2.5)',
    })
    expect(sheet.getCell('L6').value).toBe('кг')
    expect(sheet.getCell('K7').value).toBe('')
    expect(isCellLocked(sheet.getCell('K6'))).toBe(true)
    expect(isCellLocked(sheet.getCell('L6'))).toBe(true)
    expect(sheet.getCell('J6').protection.locked).toBe(false)
    expect(sheet.getCell('N6').protection.locked).toBe(false)
  })
  it('recognizes short dotted headers and skips rows without cipher quantities', () => {
    const rows = parseProjectMaterialsWorkbook(
      workbookFromRows([
        {
          'Тип материала': 'Оборудование',
          'ID материала': 'EQ-1',
          'Наименование по проекту': 'Элементы этажерки 5.3.0',
          Документ: 'СП-1',
          'Ед. изм.': 'шт',
          Материал: '09Г2С',
          'Масса единицы': 12.5,
          '300-ТХ-1': '',
          '400-КМ-2': 1,
        },
        {
          'Тип материала': 'Трубопровод',
          'ID материала': 'PIPE-1',
          'Наименование по проекту': 'Труба 57',
          Документ: 'ГОСТ',
          'Ед. изм.': 'м',
          Материал: '20',
          '300-ТХ-1': '',
          '400-КМ-2': '',
        },
      ]),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      cipher: '400-КМ-2',
      projectMaterialName: 'Элементы этажерки 5.3.0',
      unit: 'шт',
      quantity: 1,
    })
  })
})

describe('receipt Excel dates', () => {
  const line = {
    projectLineId: 'line-0',
    requestId: 'request-0',
    projectMaterialName: 'Труба',
    unit: 'м',
    requestQuantity: 10,
    receivedQuantity: 0,
    requestRest: 10,
  }

  it('prefills an editable local calendar date and preserves a date selected in the form', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // Local midnight must not turn into the previous UTC day.
    vi.setSystemTime(new Date(2026, 9, 20, 0, 15))
    try {
      const buffer = await createMaterialReceiptTemplateWorkbook({
        requestNumber: 'TEST',
        lines: [line, { ...line, date: '2026-07-13' }],
      })
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)
      const sheet = workbook.getWorksheet('Получение')!
      expect(sheet.getCell('M6').value).toEqual(
        new Date('2026-10-20T00:00:00Z'),
      )
      expect(sheet.getCell('M6').numFmt).toBe('dd.mm.yyyy')
      expect(sheet.getCell('M6').protection.locked).toBe(false)
      expect(
        parseMaterialReceiptWorkbook(buffer).map((row) => row.date),
      ).toEqual(['2026-10-20', '2026-07-13'])
      expect(
        parseMaterialReceiptWorkbook(buffer).every(
          (row) => row.quantity === null,
        ),
      ).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([false, true])(
    'reads native Excel dates with date1904=%s',
    async (date1904) => {
      const workbook = new ExcelJS.Workbook()
      workbook.properties.date1904 = date1904
      const sheet = workbook.addWorksheet('Получение')
      sheet.getRow(5).values = ['ID заявки', 'Дата поступления']
      sheet.getRow(6).values = ['request-0', new Date('2026-07-13T23:00:00Z')]
      sheet.getCell('B6').numFmt = 'dd.mm.yyyy'
      const rows = parseMaterialReceiptWorkbook(
        await workbook.xlsx.writeBuffer(),
      )
      expect(rows[0]!.date).toBe('2026-07-13')
    },
  )

  it.each([
    ['20.10.2026', '2026-10-20'],
    [' 1.2.2026 ', '2026-02-01'],
    ['2026-07-13', '2026-07-13'],
    ['29.02.2024', '2024-02-29'],
    [42785.75, '2017-02-19'],
    ['', ''],
    ['31.02.2026', '31.02.2026'],
    ['29.02.2026', '29.02.2026'],
    ['2026-13-01', '2026-13-01'],
    [60, '60'], // Excel's fictitious 29 February 1900 is not a real date.
    [-1, '-1'],
  ])(
    'normalizes %s while preserving invalid input for validation',
    async (input, expected) => {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Получение')
      sheet.getRow(5).values = ['ID заявки', 'Дата поступления']
      sheet.getRow(6).values = ['request-0', input]
      expect(
        parseMaterialReceiptWorkbook(await workbook.xlsx.writeBuffer())[0]!
          .date,
      ).toBe(expected)
    },
  )
})
