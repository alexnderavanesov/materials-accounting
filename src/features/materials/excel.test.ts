import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { parseProjectMaterialsWorkbook } from './excel'

function workbookFromRows(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Проектная база')

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

describe('materials Excel import', () => {
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
