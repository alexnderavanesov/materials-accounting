// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { operationGridApi } from './project-grid-test-support'
import { OperationsGrid } from './operations-grid'
import type { DataColumn } from './operations-grid'
import { readDataGridState } from './project-grid-state'

const rows = [
  {
    id: 'a',
    name: 'Отвод',
    quantity: 2.5,
    altQuantity: 5,
    unit: 'шт',
    deleted: false,
  },
  {
    id: 'b',
    name: 'Труба с длинным русским наименованием',
    quantity: 10,
    altQuantity: 20,
    unit: 'м',
    deleted: false,
  },
  {
    id: 'c',
    name: 'Удалённый материал',
    quantity: 0.125,
    altQuantity: null,
    unit: 'шт',
    deleted: true,
  },
]
const remove = vi.fn()
const columns: Array<DataColumn<(typeof rows)[number]>> = [
  { id: 'name', title: 'Материал', value: (row) => row.name, width: 320 },
  {
    id: 'quantity',
    title: 'Количество',
    value: (row) => row.quantity,
    numeric: true,
  },
  {
    id: 'altQuantity',
    title: 'Альтернативно',
    value: (row) => row.altQuantity,
    numeric: true,
  },
  { id: 'unit', title: 'Единица', value: (row) => row.unit },
  {
    id: 'actions',
    title: 'Действия',
    value: () => null,
    actions: true,
    render: (row) => (
      <button onClick={() => remove(row.id)}>Удалить {row.name}</button>
    ),
  },
]
function Harness({
  id = 'test-requests',
  focus,
}: {
  id?: string
  focus?: string
}) {
  return (
    <OperationsGrid
      id={id}
      label={id}
      rows={rows}
      rowId={(row) => row.id}
      columns={columns}
      isDeleted={(row) => row.deleted}
      focusRowId={focus}
    />
  )
}
beforeEach(() => {
  sessionStorage.clear()
  remove.mockClear()
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

it('sorts and filters numeric quantities and calls the action for the displayed record', async () => {
  const before = structuredClone(rows)
  render(<Harness />)
  const api = await operationGridApi('test-requests')
  act(() =>
    api.applyColumnState({ state: [{ colId: 'quantity', sort: 'asc' }] }),
  )
  expect([0, 1, 2].map((i) => api.getDisplayedRowAtIndex(i)!.id)).toEqual([
    'c',
    'a',
    'b',
  ])
  act(() =>
    api.setFilterModel({
      quantity: { filterType: 'number', type: 'lessThan', filter: 1 },
    }),
  )
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Удалить Удалённый материал' }),
  )
  expect(remove).toHaveBeenCalledExactlyOnceWith('c')
  expect(
    api
      .getColumns()!
      .every(
        (column) => !column.isCellEditable(api.getDisplayedRowAtIndex(0)!),
      ),
  ).toBe(true)
  expect(rows).toEqual(before)
})

it('restores layout and filters for each table independently without storing records', async () => {
  const view = render(<Harness />)
  const api = await operationGridApi('test-requests')
  act(() => {
    api.applyColumnState({
      state: [
        { colId: 'quantity', width: 230, pinned: 'left', sort: 'desc' },
        { colId: 'unit', hide: true },
      ],
      applyOrder: true,
    })
    api.setFilterModel({
      name: { filterType: 'text', type: 'contains', filter: 'Отвод' },
    })
  })
  view.unmount()
  expect(JSON.stringify(readDataGridState('test-requests'))).not.toContain(
    'altQuantity":5',
  )
  expect(readDataGridState('test-receipts')).toEqual({})
  const restored = render(<Harness />)
  const api2 = await operationGridApi('test-requests')
  expect(api2.getColumnState()[0]).toMatchObject({
    colId: 'quantity',
    width: 230,
    pinned: 'left',
    sort: 'desc',
  })
  expect(
    api2.getColumnState().find((column) => column.colId === 'unit')!.hide,
  ).toBe(true)
  expect(api2.getDisplayedRowCount()).toBe(1)
  restored.unmount()
  render(<Harness id="test-receipts" />)
  expect((await operationGridApi('test-receipts')).getDisplayedRowCount()).toBe(
    3,
  )
})

it('exports fractional and alternative quantities as numbers, including deleted historical materials', async () => {
  render(<Harness />)
  const api = await operationGridApi('test-requests')
  const blob = api.getDataAsExcel({
    columnKeys: ['name', 'quantity', 'altQuantity', 'unit'],
  })!
  if (typeof blob === 'string') throw new Error('Expected workbook')
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]!
  expect(sheet.getCell('B2').value).toBe(2.5)
  expect(sheet.getCell('C2').value).toBe(5)
  expect(sheet.getCell('B4').value).toBe(0.125)
  expect(sheet.getCell('C4').value ?? '').toBe('')
  expect(remove).not.toHaveBeenCalled()
})

it('opens a linked document even when a saved filter hid its row', async () => {
  sessionStorage.setItem(
    'materials.workspaceView.v1:grid:test-requests',
    JSON.stringify({
      filter: {
        filterModel: {
          name: { filterType: 'text', type: 'contains', filter: 'Отвод' },
        },
      },
    }),
  )
  render(<Harness focus="b" />)
  const api = await operationGridApi('test-requests')
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(3))
  expect(
    document.querySelector('.operations-grid-focused')?.getAttribute('row-id'),
  ).toBe('b')
})
