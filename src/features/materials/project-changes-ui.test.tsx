import { changeField, reviewWorkflow } from './workflow-test-support'
// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  editGridQuantity,
  editGridField,
  projectGridApi,
} from './project-grid-test-support'
import { ProjectWorkspace } from './project-workspace'
import { projectChangeFixture } from './project-changes.fixtures'
import { toWorkspaceSnapshot } from './workspace-snapshot'
import type { WorkspaceSnapshot } from './workspace-snapshot'
import {
  validateProjectAccounting,
  prepareProjectChange,
  projectPosition,
  prepareStockTransfer,
} from './project-changes'
import { validateQualityWorkspace, localToday } from './quality-workflow'
import {
  requestCancellationSchema,
  effectiveRequestQuantity,
} from './project-change-types'
import { saveProjectWorkspaceSnapshot } from './functions'

vi.setConfig({ testTimeout: 20000 })
vi.mock('./functions', () => ({
  saveProjectWorkspaceSnapshot: vi.fn(),
  saveProjectWorkspaceChanges: vi.fn(),
  loadProjectWorkspaceChanges: vi.fn(),
}))
let saved: WorkspaceSnapshot
function fixture(received = 10) {
  const source = projectChangeFixture()
  if (received !== 10) {
    source.qualityWorkflow!.cases = []
    source.materialReceipts[0]!.quantity = received
  }
  Object.assign(source.materialRequests[0]!, {
    cipher: 'ТКМ5',
    projectMaterialName: 'Клапан',
    projectUnit: 'шт',
    materialType: 'Арматура',
    materialId: '',
    note: '',
    requester: 'Иван',
    altQuantity: null,
    altUnit: '',
  })
  Object.assign(source.materialReceipts[0]!, {
    manufacturer: '',
    qualityDocument: '',
    technicalDecision: '',
    customerArvk: '',
    note: '',
  })
  return source
}
function mount(source = fixture()) {
  saved = toWorkspaceSnapshot(source)
  vi.mocked(saveProjectWorkspaceSnapshot).mockImplementation(
    async ({ data }) => {
      validateQualityWorkspace(data.workspace, saved)
      validateProjectAccounting(data.workspace, saved)
      saved = structuredClone(data.workspace)
      return { status: 'saved', revision: crypto.randomUUID() }
    },
  )
  const mounted = render(
    <ProjectWorkspace
      initialStoredData={{ workspace: saved, revision: 'initial' }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
  return mounted
}
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
async function review(mode = 'ИЗМ') {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Сохранить изменения' }),
  )
  const dialog = await screen.findByRole('dialog', {
    name: 'Сохранить изменения проекта',
  })
  fireEvent.click(within(dialog).getByRole('radio', { name: mode }))
  if (mode === 'ИЗМ')
    changeField(within(dialog).getByLabelText('Номер ИЗМ ТКМ5'), {
      target: { value: '2' },
    })
  changeField(within(dialog).getByLabelText('Основание / причина'), {
    target: { value: 'Изменение спецификации' },
  })
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Показать последствия' }),
  )
  await within(dialog).findByRole('region', { name: 'Последствия изменений' })
  return dialog
}
async function change(quantity: string, mode = 'ИЗМ') {
  await editGridQuantity('Клапан', 'ТКМ5', quantity)
  return review(mode)
}
describe('project revisions in the real workspace', () => {
  it('opens without saving, previews 10 → 8 and persists cancellation and history together', async () => {
    const source = fixture(6)
    source.lines.push({
      ...source.lines[0]!,
      id: 'unchanged',
      projectMaterialName: 'Посторонняя потребность',
      plannedQuantity: 5,
    })
    mount(source)
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    const dialog = await change('8')
    expect(within(dialog).getByText(/отменить ожидание 2/)).toBeTruthy()
    expect(
      within(
        within(dialog).getByRole('region', { name: 'Последствия изменений' }),
      ).queryByText(/Посторонняя потребность/),
    ).toBeNull()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Подтвердить и сохранить' }),
    )
    await waitFor(() => expect(saved.projectChanges).toHaveLength(2))
    expect(saved.materialRequests[0]?.quantity).toBe(10)
    expect(
      effectiveRequestQuantity({
        quantity: Number(saved.materialRequests[0]!.quantity),
        projectCancellations: requestCancellationSchema
          .array()
          .parse(saved.materialRequests[0]!.projectCancellations),
      }),
    ).toBe(8)
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Сохранить изменения проекта' }),
      ).toBeNull(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'История изменений' }))
    const history = await screen.findByRole('dialog', {
      name: 'История изменений',
    })
    expect(within(history).getByText(/Исходный состав/)).toBeTruthy()
    expect(within(history).getByText(/ИЗМ 2 ·/)).toBeTruthy()
  })
  it('records a correction without an IZМ number and cancels a dismissed draft', async () => {
    mount(fixture(6))
    const dialog = await change('8', 'Ошибка')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Вернуться к таблице' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Отменить правки' }))
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    const correction = await change('7', 'Ошибка')
    fireEvent.click(
      within(correction).getByRole('button', {
        name: 'Подтвердить и сохранить',
      }),
    )
    await waitFor(() =>
      expect(saved.projectChanges?.at(-1)?.kind).toBe('correction'),
    )
    expect(saved.projectChanges!.at(-1)!.number).toBe('')
  })
  it('batches several grid cells and keeps accounting unchanged until confirmation', async () => {
    const source = fixture(6)
    source.lines.push({
      ...source.lines[0]!,
      id: 'second',
      projectMaterialName: 'Отвод',
      plannedQuantity: 5,
    })
    mount(source)
    expect(screen.queryByRole('button', { name: 'Оформить ИЗМ' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Исправить ошибку' }),
    ).toBeNull()
    await editGridQuantity('Клапан', 'ТКМ5', '8')
    await editGridQuantity('Отвод', 'ТКМ5', '3')
    await screen.findByRole('region', { name: 'Несохранённые правки проекта' })
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    expect(saved.lines.map((line) => line.plannedQuantity)).toEqual([10, 5])
    const dialog = await review()
    expect(within(dialog).getByText(/Позиций: 2/)).toBeTruthy()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Подтвердить и сохранить' }),
    )
    await waitFor(() => expect(saved.projectChanges).toHaveLength(2))
    expect(saved.projectChanges!.at(-1)!.items).toHaveLength(2)
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1)
  })
  it('stages pasted quantities as one batch and cancels the whole draft without a write', async () => {
    const source = fixture(6)
    source.lines.push({
      ...source.lines[0]!,
      id: 'second',
      projectMaterialName: 'Отвод',
      plannedQuantity: 5,
    })
    mount(source)
    const api = await projectGridApi()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn().mockResolvedValue('8\n3') },
    })
    await act(async () => {
      api.setFocusedCell(0, 'cipher:ТКМ5')
      api.pasteFromClipboard()
    })
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'Несохранённые правки проекта' })
          .textContent,
      ).toContain('2 позиций'),
    )
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Отменить правки' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Несохранённые правки проекта' }),
      ).toBeNull(),
    )
    expect(saved.lines.map((line) => line.plannedQuantity)).toEqual([10, 5])
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })
  it('asks which cipher owns a shared characteristic edit and keeps the old receipt position', async () => {
    const source = fixture()
    source.lines.push({
      ...source.lines[0]!,
      id: 'second',
      cipher: 'ТКМ6',
      plannedQuantity: 4,
    })
    mount(source)
    await editGridField('Клапан', 'projectMaterialName', 'Новый клапан')
    const scope = await screen.findByRole('dialog', {
      name: 'Какие шифры изменить?',
    })
    changeField(within(scope).getByLabelText('Шифр для изменения'), {
      target: { value: 'line' },
    })
    fireEvent.click(
      within(scope).getByRole('button', { name: 'Добавить в правки' }),
    )
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    const api = await projectGridApi()
    await waitFor(() => expect(api.getDisplayedRowCount()).toBe(2))
    const dialog = await review()
    expect(
      within(dialog).getByText('Будет создана связанная новая позиция'),
    ).toBeTruthy()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Подтвердить и сохранить' }),
    )
    await waitFor(() => expect(saved.projectChanges).toHaveLength(2))
    expect(
      saved.lines.find((line) => line.id === 'second')?.projectMaterialName,
    ).toBe('Клапан')
    expect(
      saved.lines.find((line) => line.id === 'line')?.plannedQuantity,
    ).toBe(0)
    expect(
      saved.lines.find((line) => line.projectMaterialName === 'Новый клапан')
        ?.cipher,
    ).toBe('ТКМ5')
    expect(saved.materialReceipts[0]?.projectLineId).toBe('line')
  })
  it('retries the same confirmed batch without duplicating history after a transport failure', async () => {
    mount(fixture(6))
    const persist = vi
      .mocked(saveProjectWorkspaceSnapshot)
      .getMockImplementation()!
    vi.mocked(saveProjectWorkspaceSnapshot)
      .mockRejectedValueOnce(new Error('Связь прервана'))
      .mockImplementation(persist)
    const dialog = await change('8')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Подтвердить и сохранить' }),
    )
    await within(dialog).findByRole('alert')
    expect(saved.projectChanges ?? []).toHaveLength(0)
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Подтвердить и сохранить' }),
    )
    await waitFor(() => expect(saved.projectChanges).toHaveLength(2))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Сохранить изменения проекта' }),
      ).toBeNull(),
    )
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(2)
  })
  it('transfers a surplus to another cipher and issues from that cipher', async () => {
    const source = fixture()
    source.lines.push({
      ...source.lines[0]!,
      id: 'target',
      cipher: 'ТКМ6',
      plannedQuantity: 4,
    })
    source.materialRequests.push({
      ...source.materialRequests[0]!,
      id: 'target-request',
      projectLineId: 'target',
      quantity: 4,
    })
    const revised = prepareProjectChange(source, {
      project: 'Объект',
      cipher: 'ТКМ5',
      kind: 'revision',
      number: '2',
      date: localToday(),
      reason: 'ИЗМ',
      author: 'Тест',
      positions: [{ ...projectPosition(source.lines[0]!), plannedQuantity: 8 }],
    })
    mount(revised)
    fireEvent.click(screen.getByText('Требует решения · 1'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Перенести на другой шифр' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Перенести на другой шифр',
    })
    changeField(within(dialog).getByLabelText('Партия переноса'), {
      target: { value: 'receipt' },
    })
    changeField(within(dialog).getByLabelText('Принимающий шифр'), {
      target: { value: 'target' },
    })
    changeField(within(dialog).getByLabelText('Количество'), {
      target: { value: '2' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Проверить перенос' }),
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить перенос' }),
    )
    await waitFor(() => expect(saved.stockTransfers).toHaveLength(1))
    expect(saved.materialReceipts).toHaveLength(1)
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Перенести на другой шифр' }),
      ).toBeNull(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Обзор операций' }))
    fireEvent.click(screen.getByRole('button', { name: /^Выдача/ }))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Выдать в монтаж' })[0]!,
    )
    const issue = await screen.findByRole('dialog', { name: 'Выдача в монтаж' })
    await waitFor(() =>
      expect(within(issue).getAllByText('ТКМ6').length).toBeGreaterThan(0),
    )
    const targetRow = within(issue)
      .getAllByText('ТКМ6')[0]!
      .closest('[role="row"]')!
    const pinnedRow = Array.from(
      issue.querySelectorAll<HTMLElement>('[role="row"]'),
    ).find(
      (row) =>
        row.getAttribute('row-id') === targetRow.getAttribute('row-id') &&
        within(row).queryByRole('button', { name: /Весь остаток/ }),
    )!
    fireEvent.click(
      within(pinnedRow).getByRole('button', { name: /Весь остаток/ }),
    )
    changeField(within(issue).getByLabelText('Получатель'), {
      target: { value: 'Бригада 1' },
    })
    reviewWorkflow(issue)
    fireEvent.click(
      within(issue).getByRole('button', { name: /Сохранить выдачу/ }),
    )
    await waitFor(() => expect(saved.materialIssues).toHaveLength(1))
    expect(saved.materialIssues[0]).toMatchObject({
      receiptId: 'receipt',
      projectLineId: 'target',
      quantity: 2,
    })
  })
  it('opens the existing return list with the change basis and selected cipher', async () => {
    const source = fixture(),
      revised = prepareProjectChange(source, {
        project: 'Объект',
        cipher: 'ТКМ5',
        kind: 'revision',
        number: '2',
        date: localToday(),
        reason: 'ИЗМ',
        author: 'Тест',
        positions: [
          { ...projectPosition(source.lines[0]!), plannedQuantity: 8 },
        ],
      })
    mount(revised)
    fireEvent.click(screen.getByText('Требует решения · 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Перейти к возврату' }))
    expect(await screen.findByText(/Возврат излишка по ИЗМ · 2/)).toBeTruthy()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Вернуть лишнее' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Возврат лишнего материала',
    })
    changeField(within(dialog).getByLabelText('Возвращаемое количество'), {
      target: { value: '1' },
    })
    reviewWorkflow(dialog)
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Сохранить фактический возврат',
      }),
    )
    await waitFor(() =>
      expect(saved.qualityWorkflow?.customerReturns).toHaveLength(1),
    )
    expect(saved.qualityWorkflow!.customerReturns![0]).toMatchObject({
      quantity: 1,
      projectLineId: 'line',
      projectChangeId: revised.projectChanges!.at(-1)!.id,
    })
    expect(saved.materialReceipts[0]!.quantity).toBe(10)
  })
  it('loads a transferred position after persistence without a new receipt', async () => {
    const source = fixture()
    source.lines.push({
      ...source.lines[0]!,
      id: 'target',
      cipher: 'ТКМ6',
      plannedQuantity: 2,
    })
    const revised = prepareProjectChange(source, {
      project: 'Объект',
      cipher: 'ТКМ5',
      kind: 'revision',
      number: '2',
      date: localToday(),
      reason: 'ИЗМ',
      author: 'Тест',
      positions: [{ ...projectPosition(source.lines[0]!), plannedQuantity: 8 }],
    })
    const transferred = prepareStockTransfer(revised, {
      receiptId: 'receipt',
      fromProjectLineId: 'line',
      toProjectLineId: 'target',
      quantity: 2,
      date: localToday(),
      projectChangeId: revised.projectChanges!.at(-1)!.id,
      author: 'Тест',
      note: '',
    })
    mount(transferred)
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    expect(
      screen.getByText('История по шифрам · Требует решения: 0'),
    ).toBeTruthy()
  })
})
