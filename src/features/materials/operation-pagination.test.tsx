// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  OperationPagination,
  useOperationPagination,
} from './operation-pagination'

const rows = Array.from({ length: 2566 }, (_, index) => `Материал ${index}`)
function List({
  id = 'overview',
  values = rows,
  search = '',
  focus,
}: {
  id?: string
  values?: Array<string>
  search?: string
  focus?: string
}) {
  const filtered = values.filter((value) => value.includes(search))
  const pagination = useOperationPagination(id, filtered, search, {
    key: focus,
    index: filtered.indexOf(focus ?? ''),
  })
  return (
    <div>
      <OperationPagination label={id} pagination={pagination} />
      <ul>
        {pagination.items.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  )
}
beforeEach(() => {
  sessionStorage.clear()
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

it('limits mounted items, changes size, preserves each list and restores after remount', () => {
  const view = render(<List />)
  expect(screen.getAllByRole('listitem')).toHaveLength(25)
  expect(screen.getByText('1–25 из 2566')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }))
  expect(screen.getByText('26–50 из 2566')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('На странице: overview'), {
    target: { value: '10' },
  })
  expect(screen.getByText('21–30 из 2566')).toBeTruthy()
  expect(screen.getAllByRole('listitem')).toHaveLength(10)
  view.unmount()
  const other = render(<List id="requests" />)
  expect(screen.getByText('1–25 из 2566')).toBeTruthy()
  other.unmount()
  render(<List />)
  expect(screen.getByText('21–30 из 2566')).toBeTruthy()
  expect(
    sessionStorage.getItem('materials.workspaceView.v1:overview.pagination'),
  ).not.toContain('Материал')
})

it('searches all rows, resets the page on search and clamps after deletion', () => {
  const view = render(<List />)
  fireEvent.click(screen.getByRole('button', { name: 'Последняя страница' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(16)
  view.rerender(<List search="Материал 1000" />)
  expect(screen.getByText('1–1 из 1')).toBeTruthy()
  expect(screen.getByText('Материал 1000')).toBeTruthy()
  view.rerender(<List />)
  fireEvent.click(screen.getByRole('button', { name: 'Последняя страница' }))
  view.rerender(<List values={rows.slice(0, 30)} />)
  expect(screen.getByText('26–30 из 30')).toBeTruthy()
  view.rerender(<List values={[]} />)
  expect(screen.getByText('0–0 из 0')).toBeTruthy()
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'Следующая страница',
    }).disabled,
  ).toBe(true)
})

it('opens an off-page linked record once without trapping later manual navigation', () => {
  const view = render(<List focus="Материал 2000" />)
  expect(screen.getByText('Материал 2000')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Первая страница' }))
  expect(screen.queryByText('Материал 2000')).toBeNull()
  view.rerender(<List focus="Материал 2500" />)
  expect(screen.getByText('Материал 2500')).toBeTruthy()
})

it('ignores malformed persisted page preferences', () => {
  sessionStorage.setItem(
    'materials.workspaceView.v1:overview.pagination',
    JSON.stringify({ page: -1, pageSize: 0, filterKey: '' }),
  )
  render(<List />)
  expect(screen.getByText('1–25 из 2566')).toBeTruthy()
})
