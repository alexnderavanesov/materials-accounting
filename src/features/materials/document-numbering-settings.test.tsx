// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DocumentNumberingSettings } from './document-numbering-settings'
import { emptyNumberHistory, initialNumbering } from './document-numbering'

afterEach(cleanup)
it('edits and resets AVK numbering only after Save, allows discarding drafts', () => {
  const history = emptyNumberHistory(),
    value = initialNumbering(history),
    onSave = vi.fn()
  value.avk.lastValue = 25
  render(
    <DocumentNumberingSettings
      value={value}
      history={history}
      onSave={onSave}
    />,
  )
  fireEvent.change(screen.getByLabelText('Документ'), {
    target: { value: 'avk' },
  })
  fireEvent.change(screen.getByLabelText('Шаблон номера'), {
    target: { value: 'АВК/{шифр}/{номер}' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Обнулить' }))
  expect(screen.getByRole('status').textContent).toBe('АВК/ТК1/0001')
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }))
  expect(
    screen.getByLabelText<HTMLInputElement>('Текущее значение счётчика').value,
  ).toBe('25')
  fireEvent.change(screen.getByLabelText('Шаблон номера'), {
    target: { value: 'АКТ-{номер}' },
  })
  fireEvent.change(screen.getByLabelText('Текущее значение счётчика'), {
    target: { value: '10' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
  expect(onSave.mock.calls[0]![0].avk).toEqual({
    pattern: 'АКТ-{номер}',
    padding: 4,
    lastValue: 10,
  })
  expect(value.avk.lastValue).toBe(25)
})
