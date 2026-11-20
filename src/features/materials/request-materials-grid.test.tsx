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
import { RequestMaterialsGrid } from './request-materials-grid'
import type { RequestMaterialRow } from './request-materials-grid'

const row = (
  id: string,
  patch: Partial<RequestMaterialRow> = {},
): RequestMaterialRow => ({
  id,
  name: `Материал ${id}`,
  cipher: 'ТК-1',
  materialType: 'Труба',
  normativeDocument: 'ГОСТ',
  composition: 'Сталь',
  unit: 'м',
  quantity: '',
  note: '',
  projectQuantity: 20,
  cipherQuantity: 10,
  remainingQuantity: 10,
  inScope: true,
  deleted: false,
  alternativeQuantity: null,
  alternativeUnit: '',
  conversionDetails: '',
  history: '',
  source: '',
  warnings: [],
  ...patch,
})

beforeEach(() => {
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function grid() {
  return waitFor(() => {
    const api = getGridApi('request-material-picker')
    if (!api?.getColumns()?.length) throw new Error('Grid is not ready')
    return api
  })
}

function Editable({ initial }: { initial: RequestMaterialRow[] }) {
  const [rows, setRows] = useState(initial)
  const [search, setSearch] = useState('')
  return (
    <>
      <input
        aria-label="Поиск"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <RequestMaterialsGrid
        rows={rows.filter((item) => item.name.includes(search))}
        emptyMessage="Нет материалов"
        onUpdate={(id, field, value) =>
          setRows((current) =>
            current.map((item) =>
              item.id === id ? { ...item, [field]: value } : item,
            ),
          )
        }
        onChooseScope={() => {}}
      />
    </>
  )
}

it('keeps decimal text and notes through filtering and restores the same input without remounting it', async () => {
  render(<Editable initial={[row('1'), row('2')]} />)
  const api = await grid()
  const quantity = (
    await screen.findAllByLabelText<HTMLInputElement>('Количество по заявке, м')
  )[0]!
  act(() => quantity.focus())
  fireEvent.change(quantity, { target: { value: '1,' } })
  expect(quantity.isConnected).toBe(true)
  expect(document.activeElement).toBe(quantity)
  expect(quantity.value).toBe('1,')
  fireEvent.change(quantity, { target: { value: '1,25' } })
  fireEvent.change(screen.getAllByPlaceholderText('Примечание')[0]!, {
    target: { value: 'Для участка 2' },
  })
  fireEvent.change(screen.getByLabelText('Поиск'), {
    target: { value: 'Материал 2' },
  })
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  fireEvent.change(screen.getByLabelText('Поиск'), {
    target: { value: 'Материал 1' },
  })
  await waitFor(() =>
    expect(
      screen.getByLabelText<HTMLInputElement>('Количество по заявке, м').value,
    ).toBe('1,25'),
  )
  expect(
    screen.getByPlaceholderText<HTMLInputElement>('Примечание').value,
  ).toBe('Для участка 2')
})

it('shows all 50,000 candidates through virtual rows and filters a material beyond the old limit', async () => {
  const update = vi.fn()
  render(
    <RequestMaterialsGrid
      rows={Array.from({ length: 50_000 }, (_, i) => row(String(i)))}
      emptyMessage="Нет материалов"
      onUpdate={update}
      onChooseScope={vi.fn()}
    />,
  )
  const api = await grid()
  expect(api.getDisplayedRowCount()).toBe(50_000)
  expect(document.querySelectorAll('.ag-row').length).toBeLessThan(100)
  await act(async () =>
    api.setFilterModel({
      name: { filterType: 'text', type: 'equals', filter: 'Материал 49000' },
    }),
  )
  const input = await screen.findByLabelText('Количество по заявке, м')
  fireEvent.change(input, { target: { value: '2,5' } })
  expect(update).toHaveBeenCalledWith('49000', 'quantity', '2,5')
  expect(
    screen.getByRole('button', { name: 'Сбросить фильтры таблицы' }),
  ).toBeTruthy()
})

it('moves between editable cells with Tab and Enter while keeping row values attached to their material', async () => {
  render(<Editable initial={[row('1'), row('2')]} />)
  const api = await grid()
  const quantities = await screen.findAllByLabelText('Количество по заявке, м')
  act(() => quantities[0]!.focus())
  fireEvent.change(quantities[0]!, { target: { value: '3' } })
  fireEvent.keyDown(quantities[0]!, { key: 'Tab' })
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getAllByLabelText('Примечание')[0],
    ),
  )
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
  await waitFor(() => expect(document.activeElement).toBe(quantities[1]))
  fireEvent.change(quantities[1]!, { target: { value: '1,5' } })
  fireEvent.keyDown(quantities[1]!, { key: 'Enter', shiftKey: true })
  await waitFor(() => expect(document.activeElement).toBe(quantities[0]))
  act(() =>
    api.applyColumnState({ state: [{ colId: 'quantity', sort: 'asc' }] }),
  )
  expect(api.getDisplayedRowAtIndex(0)?.data.id).toBe('2')
  expect(api.getDisplayedRowAtIndex(1)?.data.quantity).toBe('3')
})

it('selects the scope explicitly before enabling quantities and keeps deleted rows and warnings visible', async () => {
  const select = vi.fn()
  const rendered = render(
    <RequestMaterialsGrid
      rows={[row('3', { inScope: false })]}
      emptyMessage="Нет материалов"
      onUpdate={vi.fn()}
      onChooseScope={select}
    />,
  )
  await grid()
  fireEvent.click(await screen.findByRole('button', { name: 'Материал 3' }))
  expect(select).toHaveBeenCalledWith('3')
  expect(screen.queryByLabelText('Количество по заявке, м')).toBeNull()
  rendered.rerender(
    <RequestMaterialsGrid
      rows={[
        row('3', {
          deleted: true,
          projectQuantity: null,
          cipherQuantity: null,
          quantity: '5',
          history:
            'Проектное количество при создании этой заявки не сохранялось.',
          warnings: ['Для изменения количества настройте пересчёт.'],
        }),
      ]}
      emptyMessage="Нет материалов"
      onUpdate={vi.fn()}
      onChooseScope={select}
    />,
  )
  expect(await screen.findByText('Удален из проектной базы')).toBeTruthy()
  expect(
    screen.getByText('Для изменения количества настройте пересчёт.'),
  ).toBeTruthy()
  expect(
    screen.getByText(
      'Проектное количество при создании этой заявки не сохранялось.',
    ),
  ).toBeTruthy()
})
