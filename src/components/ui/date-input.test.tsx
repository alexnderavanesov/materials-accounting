// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DateInput } from './date-input'

afterEach(cleanup)
function Form({ changed = vi.fn(), disabled = false }) {
  const [value, setValue] = useState('2026-11-20')
  return (
    <DateInput
      aria-label="Дата"
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        setValue(next)
        changed(next)
      }}
    />
  )
}

it('edits the displayed date while publishing full ISO dates and preserving invalid drafts', () => {
  const changed = vi.fn()
  render(<Form changed={changed} />)
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Дата' })
  expect(input.value).toBe('20-11-26')
  for (const text of ['', '2', '29-', '29-02-', '29-02-2', '29-02-24'])
    fireEvent.change(input, { target: { value: text } })
  expect(input.value).toBe('29-02-24')
  expect(changed).toHaveBeenLastCalledWith('2024-02-29')
  fireEvent.change(input, { target: { value: '31-02-26' } })
  expect(input.value).toBe('31-02-26')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(changed).toHaveBeenLastCalledWith('31-02-26')
  fireEvent.change(input, { target: { value: '2026-12-01' } })
  expect(input.value).toBe('01-12-26')
  expect(changed).toHaveBeenLastCalledWith('2026-12-01')
  fireEvent.change(input, { target: { value: '1-1-26' } })
  expect(input.value).toBe('1-1-26')
  expect(changed).toHaveBeenLastCalledWith('2026-01-01')
  fireEvent.blur(input)
  expect(input.value).toBe('01-01-26')
})

it('opens the calendar, accepts its ISO selection and disables both editing controls', () => {
  const changed = vi.fn()
  const view = render(<Form changed={changed} />)
  const native =
    view.container.querySelector<HTMLInputElement>('input[type="date"]')!
  native.showPicker = vi.fn()
  fireEvent.click(
    screen.getByRole('button', { name: 'Выбрать дату в календаре: Дата' }),
  )
  expect(native.showPicker).toHaveBeenCalledOnce()
  fireEvent.change(native, { target: { value: '2027-01-02' } })
  expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('02-01-27')
  expect(changed).toHaveBeenLastCalledWith('2027-01-02')
  view.rerender(<Form changed={changed} disabled />)
  expect(screen.getByRole<HTMLInputElement>('textbox').disabled).toBe(true)
  expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(true)
  expect(native.disabled).toBe(true)
})
