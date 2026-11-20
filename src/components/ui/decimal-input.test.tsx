// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { DecimalInput } from './decimal-input'

afterEach(cleanup)
it('preserves a comma during fractional typing and reports invalid input for validation', () => {
  function Form() {
    const [value, setValue] = useState(0)
    return (
      <>
        <DecimalInput
          aria-label="Количество"
          value={value}
          onValue={setValue}
        />
        <output>{String(value)}</output>
      </>
    )
  }
  render(<Form />)
  const input = screen.getByLabelText<HTMLInputElement>('Количество')
  for (const text of ['1', '1,', '1,5']) {
    fireEvent.change(input, { target: { value: text } })
    expect(input.value).toBe(text)
  }
  expect(screen.getByRole('status').textContent).toBe('1.5')
  fireEvent.change(input, { target: { value: 'ошибка' } })
  expect(input.value).toBe('ошибка')
  expect(screen.getByRole('status').textContent).toBe('NaN')
})
