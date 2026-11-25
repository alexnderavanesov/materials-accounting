// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { getGridApi } from 'ag-grid-community'
import './project-grid-test-support'
import { M15MaterialsGrid } from './m15-materials-grid'
import type { M15MaterialRow } from './m15-materials-grid'

afterEach(cleanup)
it('virtualizes 50,000 materials and edits a filtered distant position with its own identity', async () => {
  const quantity = vi.fn(),
    open = vi.fn()
  const rows: M15MaterialRow[] = Array.from({ length: 50_000 }, (_, i) => ({
    id: `project:${i}`,
    projectLineId: String(i),
    inRequest: false,
    requested: [],
    received: [],
    projectQuantity: 0,
    documentedQuantity: 0,
    cipherQuantity: 0,
    cipherExcess: 0,
    projectUnit: 'шт',
    name: `Материал ${i}`,
    invoiceName: `Материал ${i}`,
    unit: 'шт',
    composition: 'Сталь',
    normativeDocument: 'ГОСТ',
    materialType: 'Детали',
    quantity: '',
    linked: 0,
    remaining: 0,
    needsMatch: false,
  }))
  render(
    <M15MaterialsGrid
      rows={rows}
      emptyMessage="Нет материалов"
      onQuantity={quantity}
      onOpen={open}
      initialFilterModel={null}
      onFilterChange={() => {}}
    />,
  )
  const grid = await waitFor(() => {
    const api = getGridApi('m15-material-picker')
    if (!api?.getColumns()?.length) throw new Error('Not ready')
    return api
  })
  expect(grid.getDisplayedRowCount()).toBe(50_000)
  expect(grid.getDisplayedRowAtIndex(0)!.data.projectLineId).toBe('0')
  expect(document.querySelectorAll('.ag-row').length).toBeLessThan(100)
  await act(async () =>
    grid.setFilterModel({
      name: { filterType: 'text', type: 'equals', filter: 'Материал 49000' },
    }),
  )
  fireEvent.change(
    await screen.findByLabelText('Количество по М-15: Материал 49000, шт'),
    { target: { value: '2,5' } },
  )
  expect(quantity).toHaveBeenCalledWith(
    expect.objectContaining({ projectLineId: '49000' }),
    '2,5',
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Настроить материал: Материал 49000' }),
  )
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({ projectLineId: '49000' }),
  )
})
