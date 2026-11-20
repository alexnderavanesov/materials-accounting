// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { OperationsGrid } from './operations-grid'
import { operationGridApi } from './project-grid-test-support'

afterEach(cleanup)
it('formats dates for cells and exports while keeping full-year sorting and filter values', async () => {
  render(
    <OperationsGrid
      id="date-format-check"
      label="Даты"
      rowId={(row) => row.id}
      rows={[
        { id: 'new', date: '2027-01-01' },
        { id: 'old', date: '2026-12-31' },
      ]}
      columns={[
        { id: 'date', date: true, title: 'Дата', value: (row) => row.date },
      ]}
    />,
  )
  const api = await operationGridApi('date-format-check')
  await act(async () => {
    api.applyColumnState({ state: [{ colId: 'date', sort: 'asc' }] })
  })
  const first = api.getDisplayedRowAtIndex(0)!
  expect(first.data.id).toBe('old')
  expect(api.getCellValue({ rowNode: first, colKey: 'date' })).toBe(
    '2026-12-31',
  )
  expect(
    api.getCellValue({ rowNode: first, colKey: 'date', useFormatter: true }),
  ).toBe('31-12-26')
  expect(api.getDataAsCsv()).toContain('31-12-26')
  await act(async () => {
    await api.setColumnFilterModel('date', {
      filterType: 'set',
      values: ['2027-01-01'],
    })
    api.onFilterChanged()
  })
  expect(api.getDisplayedRowCount()).toBe(1)
  expect(api.getDisplayedRowAtIndex(0)!.data.id).toBe('new')
})
