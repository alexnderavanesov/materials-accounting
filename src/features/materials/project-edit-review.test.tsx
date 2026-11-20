import { changeField } from './workflow-test-support'
// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectEditReview } from './project-edit-review'
import { projectChangeFixture } from './project-changes.fixtures'
import type { ProjectEditDraft } from './project-edit-draft'

function fixture(): ProjectEditDraft {
  const baseline = projectChangeFixture()
  return {
    baseline,
    lines: baseline.lines.map((line) => ({ ...line, plannedQuantity: 76 })),
  }
}
function mount(draft = fixture()) {
  const onApply = vi.fn(async () => {}),
    onRefresh = vi.fn()
  const result = render(
    <ProjectEditReview
      draft={draft}
      author="Тест"
      onApply={onApply}
      onClose={vi.fn()}
      onRefresh={onRefresh}
      onSourceQuantity={vi.fn()}
    />,
  )
  return { ...result, draft, onApply, onRefresh }
}
function reason(value = 'Новая спецификация') {
  changeField(screen.getByLabelText('Основание / причина'), {
    target: { value },
  })
}
function revision(cipher = 'ТКМ5') {
  fireEvent.click(screen.getByRole('radio', { name: 'ИЗМ' }))
  changeField(screen.getByLabelText(`Номер ИЗМ ${cipher}`), {
    target: { value: '2' },
  })
}
function preview() {
  fireEvent.click(screen.getByRole('button', { name: 'Показать последствия' }))
}
afterEach(cleanup)

describe('compact project edit review', () => {
  it('shows a field error for an empty basis and previews successfully after fixing it', async () => {
    const f = mount()
    revision()
    preview()
    expect(screen.getByRole('alert').textContent).toBe(
      'Укажите основание изменения.',
    )
    expect(
      screen.getByLabelText('Основание / причина').getAttribute('aria-invalid'),
    ).toBe('true')
    expect(screen.queryByText(/too_small|origin|expected string/)).toBeNull()
    expect(
      screen.queryByRole('region', { name: 'Последствия изменений' }),
    ).toBeNull()
    expect(f.onApply).not.toHaveBeenCalled()
    reason()
    expect(screen.queryByRole('alert')).toBeNull()
    preview()
    expect(
      screen.getByRole('region', { name: 'Последствия изменений' }).textContent,
    ).toContain('Требуется заявить 66')
    fireEvent.click(
      screen.getByRole('button', { name: 'Подтвердить и сохранить' }),
    )
    await waitFor(() => expect(f.onApply).toHaveBeenCalledOnce())
    expect(f.onApply.mock.calls[0]?.length).toBe(2)
  })

  it('shows a quantity-only edit with one material name and two table columns', () => {
    const f = mount()
    const table = screen.getByRole('table', {
      name: 'Предпросмотр изменений проекта',
    })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Материал', 'Количество'])
    expect(
      within(table).getAllByText(f.draft.lines[0]!.projectMaterialName!),
    ).toHaveLength(1)
    expect(table.textContent).toContain('10 → 76 шт')
    expect(
      screen.queryByRole('button', { name: 'Обновить предпросмотр' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Подтвердить и сохранить' }),
    ).toBeNull()
  })

  it('validates the selected reason, date and each cipher’s number without displaying raw schema errors', () => {
    const draft = fixture()
    draft.baseline.lines.push({
      ...draft.baseline.lines[0]!,
      id: 'second',
      cipher: 'ТКМ6',
    })
    draft.lines.push({ ...draft.lines[0]!, id: 'second', cipher: 'ТКМ6' })
    mount(draft)
    preview()
    expect(screen.getByText('Выберите «Ошибка» или «ИЗМ».')).toBeTruthy()
    revision()
    reason()
    changeField(screen.getByLabelText('Дата'), { target: { value: '' } })
    preview()
    expect(screen.getByText('Укажите корректную дату.')).toBeTruthy()
    expect(
      screen.getByLabelText('Номер ИЗМ ТКМ6').getAttribute('aria-invalid'),
    ).toBe('true')
    expect(screen.getByText('Укажите номер ИЗМ.')).toBeTruthy()
  })

  it('keeps replacement information for name or unit changes and invalidates a preview after metadata edits', () => {
    const draft = fixture()
    draft.lines[0]!.unit = 'м'
    mount(draft)
    revision()
    reason()
    expect(
      screen.getByText('Будет создана связанная новая позиция'),
    ).toBeTruthy()
    expect(screen.getByRole('table').textContent).toContain('10 шт → 76 м')
    preview()
    expect(
      screen.getByRole('region', { name: 'Последствия изменений' }),
    ).toBeTruthy()
    reason('Другое основание')
    expect(
      screen.queryByRole('region', { name: 'Последствия изменений' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Показать последствия' }),
    ).toBeTruthy()
  })

  it('offers refresh after a save conflict and retains the draft metadata', async () => {
    const f = mount()
    f.onApply.mockRejectedValue(
      new Error('Данные изменились. Обновите предпросмотр.'),
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Ошибка' }))
    reason('Опечатка')
    preview()
    fireEvent.click(
      screen.getByRole('button', { name: 'Подтвердить и сохранить' }),
    )
    const refresh = await screen.findByRole('button', {
      name: 'Обновить предпросмотр',
    })
    fireEvent.click(refresh)
    expect(f.onRefresh).toHaveBeenCalledOnce()
    expect(
      screen.getByLabelText<HTMLInputElement>('Основание / причина').value,
    ).toBe('Опечатка')
    expect(
      screen.queryByRole('region', { name: 'Последствия изменений' }),
    ).toBeNull()
  })
})
