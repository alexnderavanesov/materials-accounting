// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { operationGridApi } from './project-grid-test-support'
import { OperationsGrid } from './operations-grid'
import type { DataColumn } from './operations-grid'
import { getGridSelectionSummary } from './grid-selection-summary'

type Row = { id: string; quantity: number | null; date: string; note: string }
const rows: Row[] = [
  { id: 'a', quantity: 0, date: '2026-11-05', note: '0012' },
  { id: 'b', quantity: 0.1, date: '31.10.2026', note: '' },
  { id: 'c', quantity: 0.2, date: '2026-11-01', note: 'Труба' },
  { id: 'd', quantity: null, date: '31.02.2026', note: '  ' },
]
const columns: DataColumn<Row>[] = [
  {
    id: 'quantity',
    title: 'Количество',
    numeric: true,
    value: (row) => row.quantity,
  },
  { id: 'date', title: 'Дата', value: (row) => row.date },
  { id: 'note', title: 'Примечание', value: (row) => row.note },
]
const props = {
  id: 'selection-summary-test',
  label: 'Проверка сводки',
  rows,
  columns,
  rowId: (row: Row) => row.id,
}
const status = () => screen.getByRole('status', { name: 'Сводка выделения' })
const expectStatus = async (text: string) => {
  await waitFor(() => expect(status().textContent).toContain(text))
}

beforeEach(() => sessionStorage.clear())
afterEach(cleanup)

it('summarizes overlapping and reversed selections, includes zero and resets on clearing', async () => {
  const before = structuredClone(rows)
  render(<OperationsGrid {...props} />)
  const api = await operationGridApi(props.id)
  await expectStatus('Выделите ячейки для сводки')
  act(() => {
    api.addCellRange({
      rowStartIndex: 2,
      rowEndIndex: 0,
      columns: ['quantity'],
    })
    api.addCellRange({
      rowStartIndex: 1,
      rowEndIndex: 3,
      columns: ['quantity'],
    })
  })
  await expectStatus('Сумма: 0,3')
  for (const text of [
    'Выделено: 4',
    'Количество: 3',
    'Среднее: 0,1',
    'Мин: 0',
    'Макс: 0,2',
  ]) {
    expect(status().textContent).toContain(text)
  }
  expect(getGridSelectionSummary(api)).toMatchObject({
    selectedCount: 4,
    count: 3,
    numericCount: 3,
  })
  expect(rows).toEqual(before)
  act(() => api.clearCellSelection())
  await expectStatus('Выделите ячейки для сводки')
  expect(status().textContent).not.toContain('Сумма:')
})

it('uses calendar order for ISO and Russian dates and keeps numbers, dates and text separate', async () => {
  render(<OperationsGrid {...props} />)
  const api = await operationGridApi(props.id)
  act(() =>
    api.addCellRange({ rowStartIndex: 0, rowEndIndex: 3, columns: ['date'] }),
  )
  await expectStatus('Даты: 31.10.2026 — 05.11.2026')
  expect(status().textContent).toContain('Дат: 3')
  expect(status().textContent).not.toContain('Сумма:')
  act(() =>
    api.addCellRange({
      rowStartIndex: 0,
      rowEndIndex: 3,
      columns: ['quantity', 'note'],
    }),
  )
  await expectStatus('Количество: 9')
  for (const text of ['Выделено: 12', 'Чисел: 3', 'Сумма: 0,3', 'Дат: 3']) {
    expect(status().textContent).toContain(text)
  }
  act(() => {
    api.clearCellSelection()
    api.addCellRange({ rowStartIndex: 0, rowEndIndex: 3, columns: ['note'] })
  })
  await expectStatus('Количество: 2')
  expect(status().textContent).not.toContain('Сумма:')
  expect(status().textContent).not.toContain('Даты:')
})

it('recalculates the selected displayed cells after sorting, filtering and immutable data updates', async () => {
  const view = render(<OperationsGrid {...props} />)
  const api = await operationGridApi(props.id)
  act(() =>
    api.addCellRange({
      rowStartIndex: 0,
      rowEndIndex: 1,
      columns: ['quantity'],
    }),
  )
  await expectStatus('Сумма: 0,1')
  act(() =>
    api.applyColumnState({ state: [{ colId: 'quantity', sort: 'desc' }] }),
  )
  await expectStatus('Сумма: 0,3')
  act(() =>
    api.setFilterModel({
      quantity: { filterType: 'number', type: 'lessThan', filter: 0.2 },
    }),
  )
  await expectStatus('Сумма: 0,1')
  act(() => api.setFilterModel(null))
  view.rerender(
    <OperationsGrid
      {...props}
      rows={rows.map((row) =>
        row.id === 'c' ? { ...row, quantity: 2.5 } : row,
      )}
    />,
  )
  await expectStatus('Сумма: 2,6')
  act(() => api.setColumnsVisible(['quantity'], false))
  await expectStatus('Выделите ячейки для сводки')
})

it('includes only selected pinned cells and updates totals without double counting overlaps', async () => {
  render(
    <OperationsGrid
      {...props}
      totals={[{ ...rows[0]!, id: 'total', quantity: 10 }]}
    />,
  )
  const api = await operationGridApi(props.id)
  act(() => {
    api.setGridOption('pinnedTopRowData', [
      { ...rows[0]!, id: 'top', quantity: 5 },
    ])
    api.addCellRange({
      rowStartIndex: 0,
      rowStartPinned: 'bottom',
      rowEndIndex: 0,
      rowEndPinned: 'top',
      columns: ['quantity'],
    })
    api.addCellRange({
      rowStartIndex: 0,
      rowStartPinned: 'bottom',
      rowEndIndex: 0,
      rowEndPinned: 'bottom',
      columns: ['quantity'],
    })
  })
  await expectStatus('Сумма: 15,3')
  expect(getGridSelectionSummary(api)).toMatchObject({
    selectedCount: 6,
    count: 5,
  })
  act(() =>
    api.setGridOption('pinnedBottomRowData', [
      { ...rows[0]!, id: 'total', quantity: 20 },
    ]),
  )
  await expectStatus('Сумма: 25,3')
})

it('calculates a whole-column selection across pages with stable fractional sums', async () => {
  const many = Array.from({ length: 10_000 }, (_, index) => ({
    ...rows[0]!,
    id: `row-${index}`,
    quantity: 0.1,
  }))
  render(<OperationsGrid {...props} rows={many} pagination />)
  const api = await operationGridApi(props.id)
  act(() => {
    api.addCellRange({
      rowStartIndex: null,
      rowEndIndex: null,
      columns: ['quantity'],
    })
    api.addCellRange({
      rowStartIndex: 0,
      rowEndIndex: 9999,
      columns: ['quantity'],
    })
  })
  await expectStatus('Сумма: 1\u00a0000')
  expect(getGridSelectionSummary(api)).toMatchObject({
    count: 10_000,
    sum: 1000,
  })
  act(() => api.paginationGoToPage(1))
  await expectStatus('Сумма: 1\u00a0000')
})
