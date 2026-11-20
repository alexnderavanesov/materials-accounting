// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReceiptDocumentInputs } from './receipt-document-inputs'
import {
  emptyReceiptDocumentFields,
  receiptDocumentError,
} from './receipt-documents'
import { changeField } from './workflow-test-support'
import { localDateInputValue, formatCalendarDate } from './calendar-date'

afterEach(cleanup)
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
function Form() {
  const [fields, setFields] = useState(emptyReceiptDocumentFields)
  return (
    <>
      <ReceiptDocumentInputs
        fields={fields}
        onChange={setFields}
        documents={[
          { id: 'app', kind: 'app', number: '221', date: '2026-10-22' },
          { id: 'app-later', kind: 'app', number: '221', date: '2026-10-24' },
          { id: 'm15', kind: 'm15', number: '221', date: '2026-10-23' },
        ]}
      />
      <output aria-label="Ошибка документов">
        {receiptDocumentError(fields)}
      </output>
    </>
  )
}
it.each(['АПП'])(
  'selects an existing %s and its date, exposes a cleared date',
  (title) => {
    render(<Form />)
    changeField(
      screen.getByLabelText(
        title === 'АПП' ? 'Выбрать существующий АПП' : `Номер ${title}`,
      ),
      {
        target: { value: title === 'АПП' ? 'app' : 'm15' },
      },
    )
    expect(screen.getByLabelText<HTMLInputElement>(`Дата ${title}`).value).toBe(
      title === 'АПП' ? '22-10-26' : '23-10-26',
    )
    expect(screen.getByLabelText('Ошибка документов').textContent).toBe('')
    fireEvent.change(screen.getByLabelText(`Дата ${title}`), {
      target: { value: '' },
    })
    expect(screen.getByLabelText('Ошибка документов').textContent).toContain(
      'дату',
    )
  },
)
it('allows a new APP number and has no M15 controls', () => {
  render(<Form />)
  changeField(screen.getByLabelText('Номер АПП'), {
    target: { value: '221 A' },
  })
  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'Номер АПП' }).value,
  ).toBe('221 A')
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(screen.getByLabelText<HTMLInputElement>('Дата АПП').value).toBe(
    formatCalendarDate(localDateInputValue()),
  )
  expect(screen.getByLabelText('Ошибка документов').textContent).toBe('')
  expect(screen.queryByLabelText('Номер М-15')).toBeNull()
})

it('selects the correct date for duplicate APP numbers and clears unused APP details', () => {
  render(<Form />)
  changeField(screen.getByLabelText('Выбрать существующий АПП'), {
    target: { value: 'app-later' },
  })
  const number = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'Номер АПП',
  })
  expect(number.value).toBe('221')
  expect(screen.getByLabelText<HTMLInputElement>('Дата АПП').value).toBe(
    '24-10-26',
  )
  fireEvent.change(number, { target: { value: 'Новый ' } })
  expect(number.value).toBe('Новый ')
  expect(screen.getByLabelText<HTMLInputElement>('Дата АПП').value).toBe(
    '24-10-26',
  )
  fireEvent.change(number, { target: { value: '' } })
  expect(screen.getByLabelText('Ошибка документов').textContent).toContain(
    'АПП',
  )
  expect(screen.getByLabelText<HTMLInputElement>('Дата АПП').value).toBe(
    formatCalendarDate(localDateInputValue()),
  )
})
