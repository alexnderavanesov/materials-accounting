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
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
async function open(title = 'Материал') {
  await operationGridApi('filter-test')
  fireEvent.click(
    screen
      .getByRole('columnheader', { name: new RegExp(`^${title}`) })
      .querySelector('.ag-header-cell-filter-button')!,
  )
  return within(
    await screen.findByRole('region', {
      name: `${title}: фильтр`,
    }),
  )
}
const apply = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }))

it('resizes with the keyboard without losing search, checked values or applying a draft', async () => {
  render(<Harness />)
  const api = await operationGridApi('filter-test')
  const popup = await open()
  const panel = screen.getByRole('region', { name: 'Материал: фильтр' })
  vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() =>
    DOMRect.fromRect({
      x: 20,
      y: 100,
      width: Number.parseFloat(panel.style.width) || 440,
      height: Number.parseFloat(panel.style.height) || 440,
    }),
  )
  fireEvent.change(popup.getByRole('textbox'), { target: { value: 'Труба' } })
  fireEvent.click(popup.getByRole('checkbox', { name: 'Труба 2' }))
  const handle = popup.getByRole('button', { name: 'Изменить размер фильтра' })
  fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true })
  fireEvent.keyDown(handle, { key: 'ArrowDown' })
  expect(panel.style.width).toBe('520px')
  expect(panel.style.height).toBe('460px')
  expect(popup.getByRole<HTMLInputElement>('textbox').value).toBe('Труба')
  expect(
    popup.getByRole<HTMLInputElement>('checkbox', { name: 'Труба 2' }).checked,
  ).toBe(false)
  expect(api.getFilterModel()).toEqual({})
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  expect(api.getDisplayedRowAtIndex(0)?.id).toBe('a')
})

it('discards drafts on Cancel, Escape and close, then restores only applied filters after remount', async () => {
  const view = render(<Harness />)
  const api = await operationGridApi('filter-test')
  for (const close of ['Отмена', 'Закрыть фильтр', 'Escape']) {
    const popup = await open()
    fireEvent.click(popup.getByRole('checkbox', { name: 'Труба 2' }))
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
      expect(screen.queryByRole('region', { name: /фильтр/ })).toBeNull(),
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

it('preserves existing column sorting when applying and clearing a filter', async () => {
  render(<Harness />)
  const api = await operationGridApi('filter-test')
  const sortModel = [
    { colId: 'group', sort: 'asc' as const },
    { colId: 'quantity', sort: 'desc' as const },
  ]
  act(() => {
    api.applyColumnState({
      state: sortModel.map((column, sortIndex) => ({ ...column, sortIndex })),
    })
  })
  let popup = await open()
  expect(popup.queryByRole('heading', { name: 'Сортировка' })).toBeNull()
  expect(popup.queryByRole('combobox')).toBeNull()
  fireEvent.change(popup.getByRole('textbox'), { target: { value: 'Труба' } })
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(2))
  expect(api.getState().sort?.sortModel).toMatchObject(sortModel)
  expect([
    api.getDisplayedRowAtIndex(0)?.id,
    api.getDisplayedRowAtIndex(1)?.id,
  ]).toEqual(['a', 'b'])
  popup = await open()
  fireEvent.click(popup.getByRole('button', { name: 'Очистить' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(5))
  expect(api.getState().sort?.sortModel).toMatchObject(sortModel)
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
        name: 'Количество: фильтр',
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
  ).toEqual(['Выбрать все', 'Пусто', '0', '2,5', '10'])
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
  fireEvent.click(popup.getByRole('checkbox', { name: 'Пусто' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowAtIndex(0)?.id).toBe('e'))
  popup = await open('Количество')
  fireEvent.click(popup.getByRole('checkbox', { name: 'Пусто' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(0))
  popup = await open('Количество')
  fireEvent.click(popup.getByRole('button', { name: 'Очистить' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(3))
})

it('preserves saved text/number conditions when applying unchanged filters and when new rows arrive', async () => {
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
  await open()
  apply()
  expect(api.getFilterModel()).toEqual(filters)
  view.rerender(
    <Harness
      data={[...rows, { id: 'f', name: 'Труба 3', group: 'Б', quantity: 3 }]}
    />,
  )
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(4))
})

it('offers Пусто without existing blanks and matches newly loaded empty cells', async () => {
  const view = render(<Harness />)
  const api = await operationGridApi('filter-test')
  const popup = await open('Группа')
  fireEvent.click(popup.getByRole('checkbox', { name: 'Выбрать все' }))
  fireEvent.click(popup.getByRole('checkbox', { name: 'Пусто' }))
  apply()
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(0))
  expect(api.getFilterModel().group).toEqual({
    filterType: 'set',
    values: [null],
  })
  view.rerender(
    <Harness
      data={[
        ...rows,
        { id: 'empty', name: 'Без документа', group: '', quantity: 0 },
      ]}
    />,
  )
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  expect(api.getDisplayedRowAtIndex(0)?.id).toBe('empty')
})

it('keeps an explicit empty-only filter when every current cell is empty', async () => {
  const data = [{ id: 'empty', name: 'Без документа', group: '', quantity: 0 }]
  const view = render(<Harness data={data} />)
  const api = await operationGridApi('filter-test')
  const popup = await open('Группа')
  fireEvent.click(popup.getByRole('checkbox', { name: 'Выбрать все' }))
  fireEvent.click(popup.getByRole('checkbox', { name: 'Пусто' }))
  apply()
  await waitFor(() =>
    expect(api.getFilterModel().group).toEqual({
      filterType: 'set',
      values: [null],
    }),
  )
  view.rerender(<Harness data={[...data, rows[0]!]} />)
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  expect(api.getDisplayedRowAtIndex(0)?.id).toBe('empty')
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
  expect(popup.getByText('Значений: 10001')).toBeTruthy()
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
  expect(reopened.getByText('Значений: 10002')).toBeTruthy()
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
