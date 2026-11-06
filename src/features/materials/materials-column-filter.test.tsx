// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { operationGridApi } from './project-grid-test-support'
import { OperationsGrid } from './operations-grid'
import type { DataColumn } from './operations-grid'
import { readDataGridState } from './project-grid-state'

vi.setConfig({ testTimeout: 15000 })
type Row = { id: string; name: string; group: string; quantity: number | null }
const rows: Array<Row> = [
  { id: 'a', name: 'Труба 10', group: 'А', quantity: 10 },
  { id: 'b', name: 'Труба 2', group: 'А', quantity: 2.5 },
  { id: 'c', name: 'Отвод', group: 'Б', quantity: 2.5 },
  { id: 'd', name: '', group: 'Б', quantity: 0 },
  { id: 'e', name: '—', group: 'А', quantity: null },
]
const columns: Array<DataColumn<Row>> = [
  { id: 'name', title: 'Материал', value: (row) => row.name },
  { id: 'group', title: 'Группа', value: (row) => row.group },
  {
    id: 'quantity',
    title: 'Количество',
    value: (row) => row.quantity,
    numeric: true,
  },
]
const rowId = (row: Row) => row.id
function Harness({ data = rows }: { data?: Array<Row> }) {
  return (
    <OperationsGrid
      id="filter-test"
      label="Фильтры"
      rows={data}
      columns={columns}
      rowId={rowId}
      pagination
    />
  )
}
beforeEach(() => {
  sessionStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)
async function open(title = 'Материал') {
  await operationGridApi('filter-test')
  fireEvent.click(
    screen
      .getByRole('columnheader', { name: new RegExp(`^${title}`) })
      .querySelector('.ag-header-cell-filter-button')!,
  )
  return within(
    await screen.findByRole('region', {
      name: `${title}: сортировка и фильтры`,
    }),
  )
}
const apply = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }))

it('discards drafts on Cancel, Escape and close, then restores only applied filters after remount', async () => {
  const view = render(<Harness />)
  const api = await operationGridApi('filter-test')
  for (const close of ['Отмена', 'Закрыть фильтр', 'Escape']) {
    const popup = await open()
    fireEvent.click(popup.getByRole('checkbox', { name: 'Труба 2' }))
    fireEvent.click(popup.getByRole('button', { name: 'По убыванию' }))
    fireEvent.change(popup.getByRole('textbox', { name: 'Поиск значений' }), {
      target: { value: 'нет совпадений' },
    })
    expect(api.getDisplayedRowCount()).toBe(5)
    expect(api.getState().sort).toBeUndefined()
    if (close === 'Escape') {
      const input = popup.getByRole('textbox', { name: 'Поиск значений' })
      act(() => input.focus())
      fireEvent.keyDown(input, { key: 'Escape' })
    } else fireEvent.click(popup.getByRole('button', { name: close }))
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: /сортировка и фильтры/ }),
      ).toBeNull(),
    )
    expect(api.getFilterModel()).toEqual({})
  }
  const popup = await open()
  expect(
    popup.getByRole<HTMLInputElement>('checkbox', { name: 'Труба 2' }).checked,
  ).toBe(true)
  fireEvent.click(popup.getByRole('checkbox', { name: 'Выбрать все' }))
  fireEvent.click(popup.getByRole('checkbox', { name: 'Труба 2' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  view.unmount()
  expect(readDataGridState('filter-test').filter?.filterModel?.name).toEqual({
    filterType: 'set',
    values: ['Труба 2'],
  })
  render(<Harness />)
  const restored = await operationGridApi('filter-test')
  await waitFor(() => expect(restored.getDisplayedRowAtIndex(0)?.id).toBe('b'))
  expect(restored.getDisplayedRowCount()).toBe(1)
})

it('adds, reorders, removes and resets sort levels only on Apply', async () => {
  render(<Harness />)
  const api = await operationGridApi('filter-test')
  let popup = await open()
  fireEvent.click(popup.getByRole('button', { name: 'Добавить уровень' }))
  fireEvent.change(popup.getByLabelText('Столбец уровня 1'), {
    target: { value: 'group' },
  })
  fireEvent.click(popup.getByRole('button', { name: 'Добавить уровень' }))
  fireEvent.change(popup.getByLabelText('Столбец уровня 2'), {
    target: { value: 'quantity' },
  })
  fireEvent.change(popup.getByLabelText('Направление уровня 2'), {
    target: { value: 'desc' },
  })
  expect(api.getState().sort).toBeUndefined()
  apply()
  await waitFor(() =>
    expect(api.getState().sort?.sortModel).toMatchObject([
      { colId: 'group', sort: 'asc' },
      { colId: 'quantity', sort: 'desc' },
    ]),
  )
  expect(
    Array.from({ length: 5 }, (_, i) => api.getDisplayedRowAtIndex(i)?.id),
  ).toEqual(['a', 'b', 'e', 'c', 'd'])
  popup = await open()
  fireEvent.click(popup.getByRole('button', { name: 'Поднять уровень 2' }))
  apply()
  expect(
    Array.from({ length: 5 }, (_, i) => api.getDisplayedRowAtIndex(i)?.id),
  ).toEqual(['a', 'b', 'c', 'd', 'e'])
  popup = await open()
  fireEvent.click(popup.getByRole('button', { name: 'Удалить уровень 1' }))
  apply()
  expect(api.getState().sort?.sortModel).toMatchObject([
    { colId: 'group', sort: 'asc' },
  ])
  popup = await open()
  fireEvent.change(popup.getByLabelText('Порядок строк'), {
    target: { value: 'single' },
  })
  fireEvent.click(popup.getByRole('button', { name: 'По возрастанию' }))
  apply()
  expect(api.getState().sort?.sortModel).toMatchObject([
    { colId: 'name', sort: 'asc' },
  ])
  popup = await open()
  fireEvent.click(popup.getByRole('button', { name: 'Сбросить сортировку' }))
  apply()
  expect(api.getState().sort).toBeUndefined()
})

it.each(['button', 'Enter'])(
  'applies a numeric search with %s without checkbox clicks and restores the resulting filter',
  async (trigger) => {
    const data = rows.map((row, index) => ({
      ...row,
      quantity: [10, 20, 30, 20, null][index]!,
    }))
    const view = render(<Harness data={data} />)
    const api = await operationGridApi('filter-test')
    const popup = await open('Количество')
    fireEvent.change(popup.getByRole('textbox'), { target: { value: ' 20 ' } })
    expect(popup.getByText('Найдено: 1 из 4')).toBeTruthy()
    expect(api.getDisplayedRowCount()).toBe(5)
    if (trigger === 'Enter') {
      const input = popup.getByRole('textbox')
      act(() => input.focus())
      fireEvent.keyDown(input, {
        key: 'Enter',
        code: 'Enter',
        isComposing: true,
      })
      expect(api.getDisplayedRowCount()).toBe(5)
      expect(fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })).toBe(
        false,
      )
    } else apply()
    await waitFor(() => expect(api.getDisplayedRowCount()).toBe(2))
    expect(
      screen.queryByRole('region', {
        name: 'Количество: сортировка и фильтры',
      }),
    ).toBeNull()
    expect([
      api.getDisplayedRowAtIndex(0)?.id,
      api.getDisplayedRowAtIndex(1)?.id,
    ]).toEqual(['b', 'd'])
    expect(api.getFilterModel().quantity).toEqual({
      filterType: 'set',
      values: ['20'],
    })
    view.unmount()
    render(<Harness data={data} />)
    const restored = await operationGridApi('filter-test')
    await waitFor(() => expect(restored.getDisplayedRowCount()).toBe(2))
  },
)

it('applies only checked search matches, preserves other filters and returns no rows for an empty result', async () => {
  render(<Harness />)
  const api = await operationGridApi('filter-test')
  await act(async () => {
    api.setFilterModel({ group: { filterType: 'set', values: ['А'] } })
  })
  let popup = await open()
  fireEvent.change(popup.getByRole('textbox'), { target: { value: 'ТРУБА' } })
  fireEvent.click(popup.getByRole('checkbox', { name: 'Труба 10' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  expect(api.getDisplayedRowAtIndex(0)?.id).toBe('b')
  expect(api.getFilterModel().name).toEqual({
    filterType: 'set',
    values: ['Труба 2'],
  })
  expect(api.getFilterModel().group).toEqual({
    filterType: 'set',
    values: ['А'],
  })
  popup = await open()
  fireEvent.change(popup.getByRole('textbox'), {
    target: { value: 'нет совпадений' },
  })
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(0))
  expect(api.getFilterModel().name).toEqual({ filterType: 'set', values: [] })
  popup = await open()
  fireEvent.click(popup.getByRole('button', { name: 'Очистить' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(3))
})

it('keeps checkbox selections when search is cleared and combines numeric/blank values with other column filters', async () => {
  render(<Harness />)
  const api = await operationGridApi('filter-test')
  await act(async () => {
    api.setFilterModel({ group: { filterType: 'set', values: ['А'] } })
  })
  let popup = await open('Количество')
  expect(
    popup
      .getAllByRole('checkbox')
      .map((input) => input.closest('label')?.textContent),
  ).toEqual(['Выбрать все', '(Пустые)', '0', '2,5', '10'])
  fireEvent.click(popup.getByRole('checkbox', { name: 'Выбрать все' }))
  fireEvent.change(popup.getByRole('textbox'), { target: { value: '2,5' } })
  fireEvent.click(popup.getByRole('checkbox', { name: 'Выбрать найденные' }))
  fireEvent.change(popup.getByRole('textbox'), {
    target: { value: 'нет совпадений' },
  })
  expect(popup.getByText('Ничего не найдено')).toBeTruthy()
  fireEvent.change(popup.getByRole('textbox'), { target: { value: '' } })
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  expect(api.getDisplayedRowAtIndex(0)?.id).toBe('b')
  expect(api.getFilterModel().group).toEqual({
    filterType: 'set',
    values: ['А'],
  })
  popup = await open('Количество')
  fireEvent.click(popup.getByRole('button', { name: 'Очистить' }))
  expect(api.getDisplayedRowCount()).toBe(1)
  fireEvent.click(popup.getByRole('checkbox', { name: 'Выбрать все' }))
  fireEvent.click(popup.getByRole('checkbox', { name: '(Пустые)' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowAtIndex(0)?.id).toBe('e'))
  popup = await open('Количество')
  fireEvent.click(popup.getByRole('checkbox', { name: '(Пустые)' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(0))
  popup = await open('Количество')
  fireEvent.click(popup.getByRole('button', { name: 'Очистить' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(3))
})

it('preserves saved text/number conditions when applying sorting and when new rows arrive', async () => {
  const view = render(<Harness />)
  const api = await operationGridApi('filter-test')
  const filters = {
    name: {
      filterType: 'text',
      operator: 'OR',
      conditions: [
        { filterType: 'text', type: 'startsWith', filter: 'Труба' },
        { filterType: 'text', type: 'equals', filter: 'Отвод' },
      ],
    },
    quantity: { filterType: 'number', type: 'greaterThan', filter: 1 },
  }
  await act(async () => {
    api.setFilterModel(filters)
  })
  const popup = await open()
  fireEvent.click(popup.getByRole('button', { name: 'По возрастанию' }))
  apply()
  expect(api.getFilterModel()).toEqual(filters)
  view.rerender(
    <Harness
      data={[...rows, { id: 'f', name: 'Труба 3', group: 'Б', quantity: 3 }]}
    />,
  )
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(4))
})

it('virtualizes 10,000 distinct values and keeps selections across search and row refresh', async () => {
  const data = Array.from(
    { length: 10000 },
    (_, i): Row => ({
      id: String(i),
      name: `Материал ${i}`,
      group: 'А',
      quantity: i,
    }),
  )
  const view = render(<Harness data={data} />)
  const api = await operationGridApi('filter-test')
  const popup = await open()
  expect(popup.getByText('Значений: 10000')).toBeTruthy()
  expect(popup.getAllByRole('checkbox').length).toBeLessThan(20)
  fireEvent.click(popup.getByRole('checkbox', { name: 'Выбрать все' }))
  fireEvent.change(popup.getByRole('textbox'), {
    target: { value: 'Материал 9999' },
  })
  fireEvent.click(popup.getByRole('checkbox', { name: 'Материал 9999' }))
  fireEvent.change(popup.getByRole('textbox'), {
    target: { value: 'Материал 5000' },
  })
  fireEvent.click(popup.getByRole('checkbox', { name: 'Материал 5000' }))
  fireEvent.change(popup.getByRole('textbox'), { target: { value: '' } })
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(2))
  view.rerender(
    <Harness
      data={[
        ...data,
        { id: 'new', name: 'Новый материал', group: 'А', quantity: 0 },
      ]}
    />,
  )
  const reopened = await open()
  expect(reopened.getByText('Значений: 10001')).toBeTruthy()
  fireEvent.change(reopened.getByRole('textbox'), {
    target: { value: 'Новый материал' },
  })
  expect(
    reopened.getByRole<HTMLInputElement>('checkbox', { name: 'Новый материал' })
      .checked,
  ).toBe(false)
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(2))
  expect([
    api.getDisplayedRowAtIndex(0)?.id,
    api.getDisplayedRowAtIndex(1)?.id,
  ]).toEqual(['5000', '9999'])
})
