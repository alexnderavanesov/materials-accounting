// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppSelect } from './app-select'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)
const options = ['Все шифры', 'ТКМ-1', 'ТКМ-2', 'ШИФР-Б'].map((value) => ({
  value,
  label: value,
}))

it('searches and selects by keyboard without submitting its form, then restores focus', () => {
  const submit = vi.fn((event) => event.preventDefault())
  const change = vi.fn()
  function Harness() {
    const [value, setValue] = useState('ТКМ-1')
    return (
      <form onSubmit={submit}>
        <AppSelect
          label="Шифр"
          options={options}
          value={value}
          onChange={(next) => {
            change(next)
            setValue(next)
          }}
        />
      </form>
    )
  }
  const { container } = render(<Harness />)
  const trigger = screen.getByRole('combobox', { name: 'Шифр' })
  expect(container.querySelector('select')).toBeNull()
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  const search = screen.getByRole('combobox', { name: 'Поиск: Шифр' })
  expect(document.activeElement).toBe(search)
  expect(screen.getByRole('listbox').parentElement?.parentElement).toBe(
    document.body,
  )
  fireEvent.change(search, { target: { value: 'ткм' } })
  expect(screen.getAllByRole('option')).toHaveLength(2)
  fireEvent.keyDown(search, { key: 'ArrowDown' })
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(change).toHaveBeenCalledExactlyOnceWith('ТКМ-2')
  expect(trigger.textContent).toBe('ТКМ-2')
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(submit).not.toHaveBeenCalled()
})

it('keeps the selection on Escape, outside click and an empty search; supports mouse selection', () => {
  const change = vi.fn()
  render(
    <AppSelect
      label="Шифр"
      options={options}
      value="ТКМ-1"
      onChange={change}
    />,
  )
  const trigger = screen.getByRole('combobox', { name: 'Шифр' })
  fireEvent.click(trigger)
  const search = screen.getByRole('combobox', { name: 'Поиск: Шифр' })
  fireEvent.change(search, { target: { value: 'нет совпадений' } })
  expect(screen.getByText('Ничего не найдено')).toBeTruthy()
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(change).not.toHaveBeenCalled()
  fireEvent.keyDown(search, { key: 'Escape' })
  expect(document.activeElement).toBe(trigger)
  fireEvent.click(trigger)
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(change).not.toHaveBeenCalled()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('option', { name: 'ШИФР-Б' }))
  expect(change).toHaveBeenCalledExactlyOnceWith('ШИФР-Б')
})

it('prevents changes when disabled and closes a menu if its document becomes read-only', () => {
  const change = vi.fn()
  const props = {
    label: 'Результат',
    options,
    value: 'ТКМ-1',
    onChange: change,
  }
  const view = render(<AppSelect {...props} disabled />)
  const trigger = screen.getByRole<HTMLButtonElement>('combobox', {
    name: 'Результат',
  })
  expect(trigger.disabled).toBe(true)
  fireEvent.click(trigger)
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  expect(screen.queryByRole('listbox')).toBeNull()
  view.rerender(<AppSelect {...props} />)
  fireEvent.click(trigger)
  expect(screen.getByRole('listbox')).toBeTruthy()
  view.rerender(<AppSelect {...props} disabled />)
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(change).not.toHaveBeenCalled()
})

it('windows 50,000 options while searching the complete set', () => {
  const change = vi.fn()
  render(
    <AppSelect
      label="Материал"
      options={Array.from({ length: 50000 }, (_, index) => ({
        value: String(index),
        label: `Материал ${index}`,
      }))}
      value="0"
      onChange={change}
    />,
  )
  fireEvent.click(screen.getByRole('combobox', { name: 'Материал' }))
  expect(screen.getAllByRole('option')).toHaveLength(100)
  const search = screen.getByRole('combobox', { name: 'Поиск: Материал' })
  fireEvent.keyDown(search, { key: 'End' })
  expect(screen.getByRole('option', { name: 'Материал 49999' })).toBeTruthy()
  fireEvent.change(search, { target: { value: 'Материал 49999' } })
  expect(screen.getAllByRole('option')).toHaveLength(1)
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(change).toHaveBeenCalledExactlyOnceWith('49999')
})
it('keeps multi-selection across searches and closes on Escape', () => {
  const toggle = vi.fn()
  render(
    <AppSelect
      label="Типы"
      options={options}
      value=""
      onChange={() => {}}
      multiple={['ТКМ-1']}
      onToggle={toggle}
    />,
  )
  const trigger = screen.getByRole('combobox', { name: 'Типы' })
  fireEvent.click(trigger)
  expect(
    screen.getByRole('option', { name: 'ТКМ-1' }).getAttribute('aria-selected'),
  ).toBe('true')
  fireEvent.click(screen.getByRole('option', { name: 'ТКМ-2' }))
  expect(toggle).toHaveBeenCalledExactlyOnceWith('ТКМ-2', true)
  expect(screen.getByRole('listbox')).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Поиск: Типы' }), {
    key: 'Escape',
  })
  expect(document.activeElement).toBe(trigger)
})
