// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ReceiptDocumentInputs } from './receipt-document-inputs'
import {
  emptyReceiptDocumentFields,
  receiptDocumentError,
} from './receipt-documents'
import { localDateInputValue } from './calendar-date'

afterEach(cleanup)

it.each(['АПП', 'М-15'])(
  'cleans a pasted %s number, finds its saved date and allows spaces inside the number',
  (title) => {
    function Form() {
      const [fields, setFields] = useState(emptyReceiptDocumentFields)
      return (
        <>
          <ReceiptDocumentInputs
            fields={fields}
            onChange={setFields}
            documents={[
              { id: 'app', kind: 'app', number: '№221', date: '2026-10-22' },
              { id: 'm15', kind: 'm15', number: '№221', date: '2026-10-23' },
            ]}
          />
          <output aria-label="Ошибка документов">
            {receiptDocumentError(fields)}
          </output>
        </>
      )
    }
    render(<Form />)
    const input = screen.getByLabelText<HTMLInputElement>(`Номер ${title}`)
    expect(screen.getByLabelText<HTMLInputElement>(`Дата ${title}`).value).toBe(
      localDateInputValue(),
    )
    fireEvent.change(input, { target: { value: '5' } })
    expect(screen.getByLabelText<HTMLInputElement>(`Дата ${title}`).value).toBe(
      localDateInputValue(),
    )
    expect(screen.getByLabelText('Ошибка документов').textContent).toBe('')
    // Clearing a required date must still expose the error, not silently refill it.
    fireEvent.change(screen.getByLabelText(`Дата ${title}`), {
      target: { value: '' },
    })
    expect(screen.getByLabelText('Ошибка документов').textContent).toContain(
      'дату',
    )
    fireEvent.change(input, { target: { value: '№ №221' } })
    expect(input.value).toBe('221')
    expect(screen.getByLabelText<HTMLInputElement>(`Дата ${title}`).value).toBe(
      title === 'АПП' ? '2026-10-22' : '2026-10-23',
    )
    fireEvent.change(input, { target: { value: '221 ' } })
    expect(input.value).toBe('221 ')
    fireEvent.change(input, { target: { value: '221 A' } })
    expect(input.value).toBe('221 A')
  },
)
