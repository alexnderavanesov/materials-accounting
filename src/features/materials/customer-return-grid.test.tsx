// @vitest-environment jsdom
import { useState } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { getGridApi } from 'ag-grid-community'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import './project-grid-test-support'
import { CustomerReturnGrid } from './customer-return-grid'
import type { CustomerReturnGridRow } from './customer-return-grid'

const row = (id: string): CustomerReturnGridRow => ({
  id,
  name: `Материал ${id}`,
  requestNumber: `ЗП-${id}`,
  cipher: 'ТК-1',
  unit: 'шт',
  available: 10,
  quantity: '',
  amount: null,
  alternativeQuantity: null,
  alternativeUnit: '',
  error: '',
})
beforeEach(() => sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
async function grid() {
  return waitFor(() => {
    const api = getGridApi('customer-return-materials')
    if (!api?.getColumns()?.length) throw new Error('Grid is not ready')
    return api
  })
}
function Editable() {
  const [rows, setRows] = useState([row('1'), row('2')])
  return (
    <CustomerReturnGrid
      rows={rows}
      onUpdate={(id, quantity) =>
        setRows((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  quantity,
                  amount: Number(quantity.replace(',', '.')),
                }
              : item,
          ),
        )
      }
    />
  )
}
it('keeps fractional drafts by receipt through sorting and filtering and navigates the visible rows', async () => {
  render(<Editable />)
  const api = await grid()
  const input = await screen.findByLabelText<HTMLInputElement>(
    'Возвратить: Материал 1',
  )
  act(() => input.focus())
  fireEvent.change(input, { target: { value: '1,' } })
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('1,')
  fireEvent.change(input, { target: { value: '1,25' } })
  act(() => api.applyColumnState({ state: [{ colId: 'name', sort: 'desc' }] }))
  const second = screen.getByLabelText('Возвратить: Материал 2')
  act(() => second.focus())
  fireEvent.keyDown(second, { key: 'Enter' })
  await waitFor(() => expect(document.activeElement).toBe(input))
  act(() => api.setGridOption('quickFilterText', 'ЗП-2'))
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  await waitFor(() =>
    expect(screen.queryByLabelText('Возвратить: Материал 1')).toBeNull(),
  )
  fireEvent.change(screen.getByLabelText('Возвратить: Материал 2'), {
    target: { value: '2,5' },
  })
  act(() => api.setGridOption('quickFilterText', ''))
  expect(
    (await screen.findByLabelText<HTMLInputElement>('Возвратить: Материал 1'))
      .value,
  ).toBe('1,25')
  expect(api.getRowNode('2')?.data?.amount).toBe(2.5)
})
it('virtualizes large returns and renders review quantities without editable inputs', async () => {
  const rows = Array.from({ length: 50000 }, (_, i) => row(String(i)))
  const view = render(<CustomerReturnGrid rows={rows} onUpdate={() => {}} />)
  const api = await grid()
  expect(api.getDisplayedRowCount()).toBe(50000)
  expect(screen.getAllByRole('row').length).toBeLessThan(100)
  view.unmount()
  render(
    <CustomerReturnGrid
      rows={[
        {
          ...row('1'),
          quantity: '0,4',
          amount: 0.4,
          alternativeQuantity: 1,
          alternativeUnit: 'кг',
        },
      ]}
      readOnly
      onUpdate={() => {
        throw new Error('Review must not edit')
      }}
    />,
  )
  expect(await screen.findByRole('gridcell', { name: '0,4' })).toBeTruthy()
  expect(screen.getByRole('gridcell', { name: '1 кг' })).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
})
