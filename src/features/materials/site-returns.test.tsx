// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SiteReturnForm } from './site-returns'
import { changeField, reviewWorkflow } from './workflow-test-support'

const issue = {
  id: 'issue',
  receiptId: 'receipt',
  projectLineId: 'line',
  date: '2026-11-19',
  quantity: 10,
  document: 'ПМ-1',
  receiver: 'Прораб',
  altQuantity: null,
  siteReturns: [
    {
      id: 'old',
      date: '2026-11-19',
      quantity: 2,
      condition: 'good' as const,
      document: '',
      note: '',
    },
  ],
}
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
function mount(onSubmit = vi.fn(), onClose = vi.fn()) {
  render(
    <SiteReturnForm
      issue={issue}
      name="Отвод"
      unit="шт"
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  )
  return { onSubmit, onClose }
}
it('validates dates and remaining quantity before review and fills the actual remaining amount', () => {
  const { onSubmit } = mount()
  changeField(screen.getByLabelText('Дата возврата с площадки'), {
    target: { value: '18-11-26' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  expect(screen.getByRole('alert').textContent).toContain('раньше даты выдачи')
  changeField(screen.getByLabelText('Дата возврата с площадки'), {
    target: { value: '31-11-26' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  expect(screen.getByRole('alert').textContent).toContain('корректную дату')
  changeField(screen.getByLabelText('Дата возврата с площадки'), {
    target: { value: '20-11-26' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  changeField(screen.getByLabelText('Количество возврата с площадки'), {
    target: { value: '8,1' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: '3 Проверка и сохранение' }),
  )
  expect(screen.getByRole('alert').textContent).toContain('не больше 8 шт')
  expect(onSubmit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Всё' }))
  expect(
    screen.getByLabelText<HTMLInputElement>('Количество возврата с площадки')
      .value,
  ).toBe('8')
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  const review = screen.getByRole('region', {
    name: 'Проверка возврата с площадки',
  })
  expect(within(review).getByText('0')).toBeTruthy()
  expect(onSubmit).not.toHaveBeenCalled()
})
it('reviews all details, preserves fractional edits on back, and retries a rejected save without a double return', () => {
  const onSubmit = vi.fn().mockImplementationOnce(() => {
    throw new Error('Конфликт сохранения')
  })
  const { onClose } = mount(onSubmit)
  changeField(screen.getByLabelText('Дата возврата с площадки'), {
    target: { value: '20-11-26' },
  })
  changeField(screen.getByLabelText('Документ возврата (необязательно)'), {
    target: { value: ' ВП-5 ' },
  })
  changeField(screen.getByLabelText('Примечание'), {
    target: { value: ' Проверить покрытие ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  changeField(screen.getByLabelText('Количество возврата с площадки'), {
    target: { value: '0,4' },
  })
  changeField(screen.getByLabelText('Состояние материала'), {
    target: { value: 'quarantine' },
  })
  reviewWorkflow()
  const review = screen.getByRole('region', {
    name: 'Проверка возврата с площадки',
  })
  for (const text of [
    'ВП-5',
    '20-11-26',
    'Проверить покрытие',
    'Требует проверки / повреждён',
    '7,6',
  ])
    expect(within(review).getByText(text)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
  expect(
    screen.getByLabelText<HTMLInputElement>('Количество возврата с площадки')
      .value,
  ).toBe('0,4')
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Сохранить возврат с площадки' }),
  )
  expect(screen.getByRole('alert').textContent).toContain('Конфликт сохранения')
  expect(onClose).not.toHaveBeenCalled()
  const save = screen.getByRole('button', {
    name: 'Сохранить возврат с площадки',
  })
  fireEvent.click(save)
  fireEvent.click(save)
  expect(onSubmit).toHaveBeenCalledTimes(2)
  expect(onSubmit).toHaveBeenLastCalledWith(
    'issue',
    expect.objectContaining({
      date: '2026-11-20',
      quantity: 0.4,
      condition: 'quarantine',
      document: 'ВП-5',
      note: 'Проверить покрытие',
    }),
  )
  expect(onClose).toHaveBeenCalledTimes(1)
})
