// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { getGridApi } from 'ag-grid-community'
import { M15ReconciliationEditor } from './m15-reconciliation-ui'
import M15ImportPanel from './m15-import-ui'
import { linkedM15Fixture, m15Fixture } from './m15-reconciliation.fixtures'
import { changeField, reviewWorkflow } from './workflow-test-support'
import { operationGridApi } from './project-grid-test-support'
import * as m15Import from './m15-import'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        documents: [],
        manifest: {
          files: ['m15', 'new'].map((id) => ({
            id: `scan-${id}`,
            documentId: JSON.stringify(['receipt-document', id]),
            name: 'Скан.pdf',
            size: 100,
            uploadedAt: '2026-11-24',
          })),
        },
      }),
    ),
  )
  sessionStorage.clear()
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole('button', { name }))
const fill = (label: string | RegExp, value: string) =>
  changeField(screen.getByLabelText(label), { target: { value } })
const quantityLabel = 'Количество по М-15: Клапан, шт'
const templateHeaders = [
  '№ позиции',
  'Наименование',
  'Единица',
  'Количество по М-15',
]
function mount(
  isNew = false,
  onSave = vi.fn(async (..._args: unknown[]) => {}),
) {
  const { workspace, value } = linkedM15Fixture()
  workspace.lines[0]!.plannedQuantity = 100
  const onClose = vi.fn()
  const props = {
    documentId: isNew ? 'new' : 'm15',
    workspace,
    onSave,
    onClose,
    ...(isNew
      ? {
          newDocument: {
            id: 'new',
            kind: 'm15' as const,
            number: '',
            date: '2026-11-18',
          },
        }
      : {}),
  }
  const view = render(<M15ReconciliationEditor {...props} />)
  return { workspace, value, onSave, onClose, view, props }
}
it('creates composition before receipts with explicit cipher and project position, keeping input across steps', async () => {
  const app = mount(true)
  expect(screen.queryByLabelText('Заявка для М-15')).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Заполнить по заявке' }),
  ).toBeNull()
  fill('Номер М-15', '15-NEW')
  fill('Шифр М-15', 'ТКМ5')
  click('Далее')
  await screen.findByLabelText(quantityLabel)
  fill(quantityLabel, '12,5')
  expect(screen.queryByLabelText('Наименование по М-15')).toBeNull()
  expect(screen.queryByLabelText(/^Проектный материал:/)).toBeNull()
  click('Настроить материал: Клапан')
  click('Другое название в накладной')
  fill('Наименование по М-15', 'Клапан по накладной')
  expect(
    within(screen.getByTestId('m15-material')).getByText('Клапан'),
  ).toBeTruthy()
  click('Готово')
  click('Назад')
  expect(screen.getByLabelText<HTMLInputElement>('Номер М-15').value).toBe(
    '15-NEW',
  )
  click('Далее')
  expect(
    (
      await screen.findByLabelText<HTMLInputElement>(
        'Количество по М-15: Клапан по накладной, шт',
      )
    ).value,
  ).toBe('12,5')
  click('Поиск материалов')
  fill('Поиск материалов М-15', 'нет совпадений')
  click('Далее')
  expect(app.onSave).not.toHaveBeenCalled()
  click('Сохранить М-15')
  await screen.findByText('М-15 сохранена.')
  expect(app.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: 'independent',
      cipher: 'ТКМ5',
      allocations: [],
      lines: [
        expect.objectContaining({
          projectLineId: 'line',
          name: 'Клапан по накладной',
          quantity: 12.5,
        }),
      ],
    }),
    undefined,
    expect.objectContaining({ number: '15-NEW' }),
  )
})
it('blocks an empty composition and invalid quantities without writing', async () => {
  const app = mount(true)
  expect(screen.queryByRole('alert')).toBeNull()
  click('Далее')
  expect(screen.getByRole('alert').textContent).toContain('номер')
  fill('Номер М-15', '15')
  fill('Шифр М-15', 'ТКМ5')
  click('Далее')
  click('Далее')
  expect(screen.getByRole('alert').textContent).toContain('материал')
  await screen.findByLabelText(quantityLabel)
  fill(quantityLabel, '-1')
  click('Далее')
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(app.onSave).not.toHaveBeenCalled()
})
it('shows excess while typing and confirms the latest quantities only when saving', async () => {
  const app = mount(true)
  const workspace = structuredClone(app.workspace)
  workspace.lines[0]!.plannedQuantity = 10
  app.view.rerender(
    <M15ReconciliationEditor {...app.props} workspace={workspace} />,
  )
  fill('Номер М-15', 'OVER')
  fill('Шифр М-15', 'ТКМ5')
  click('Далее')
  await screen.findByLabelText(quantityLabel)
  const grid = getGridApi('m15-material-picker')!
  const node = grid.getRowNode('project:line')!
  expect(
    grid.getCellValue({ rowNode: node, colKey: 'documentedQuantity' }),
  ).toBe(10)
  expect(grid.getCellValue({ rowNode: node, colKey: 'cipherQuantity' })).toBe(
    10,
  )
  fill(quantityLabel, '2')
  expect(await screen.findByText('Превышение: 2 шт')).toBeTruthy()
  click(/3\s*Проверка и сохранение/)
  expect(
    screen.queryByRole('dialog', { name: 'Превышение по шифру' }),
  ).toBeNull()
  click('Сохранить М-15')
  let warning = screen.getByRole('dialog', { name: 'Превышение по шифру' })
  expect(within(warning).getByText('12 шт')).toBeTruthy()
  expect(within(warning).getAllByText('2 шт')).toHaveLength(2)
  expect(app.onSave).not.toHaveBeenCalled()
  click('Вернуться к количествам')
  expect(
    screen.queryByRole('dialog', { name: 'Превышение по шифру' }),
  ).toBeNull()
  click('Далее')
  expect(screen.getByRole('region', { name: 'Сканы М-15' })).toBeTruthy()
  click('Назад')
  await screen.findByLabelText(quantityLabel)
  fill(quantityLabel, '3')
  click('Далее')
  expect(
    screen.queryByRole('dialog', { name: 'Превышение по шифру' }),
  ).toBeNull()
  const changed = structuredClone(workspace)
  changed.m15Reconciliations![0]!.lines[0]!.quantity = 15
  app.view.rerender(
    <M15ReconciliationEditor {...app.props} workspace={changed} />,
  )
  click('Сохранить М-15')
  warning = screen.getByRole('dialog', { name: 'Превышение по шифру' })
  expect(within(warning).getByText('18 шт')).toBeTruthy()
  expect(within(warning).getByText('8 шт')).toBeTruthy()
  expect(app.onSave).not.toHaveBeenCalled()
  click('Продолжить с превышением')
  await screen.findByText('М-15 сохранена.')
  expect(app.onSave).toHaveBeenCalledOnce()
  expect(app.onSave.mock.calls[0]![0]).toMatchObject({
    lines: [{ quantity: 3 }],
  })
})
it.each(['10', '9', '11'])(
  'only asks again for an existing excess when the saved quantity increases (new quantity %s)',
  async (quantity) => {
    const app = mount()
    const workspace = structuredClone(app.workspace)
    workspace.lines[0]!.plannedQuantity = 6
    app.view.rerender(
      <M15ReconciliationEditor {...app.props} workspace={workspace} />,
    )
    click(/3\s*Проверка и сохранение/)
    const scans = screen.getByRole('region', { name: 'Сканы М-15' })
    expect(await within(scans).findByLabelText('Файлы оригиналов')).toBeTruthy()
    click('Назад')
    await screen.findByLabelText(quantityLabel)
    if (quantity !== '10') fill(quantityLabel, quantity)
    click('Далее')
    expect(
      screen.queryByRole('dialog', { name: 'Превышение по шифру' }),
    ).toBeNull()
    click('Сохранить М-15')
    if (quantity === '11') {
      expect(app.onSave).not.toHaveBeenCalled()
      click('Продолжить с превышением')
    }
    await screen.findByText('М-15 сохранена.')
    expect(app.onSave).toHaveBeenCalledOnce()
  },
)
it('excludes the current invoice from already received and accepts the exact cipher limit without a warning', async () => {
  const { workspace } = linkedM15Fixture()
  const save = vi.fn(async () => {})
  render(
    <M15ReconciliationEditor
      documentId="m15"
      workspace={workspace}
      onSave={save}
      onClose={() => {}}
    />,
  )
  click('Далее')
  await screen.findByLabelText(quantityLabel)
  const grid = getGridApi('m15-material-picker')!
  expect(
    grid.getCellValue({
      rowNode: grid.getRowNode('project:line')!,
      colKey: 'documentedQuantity',
    }),
  ).toBe(0)
  click('Далее')
  expect(
    screen.queryByRole('dialog', { name: 'Превышение по шифру' }),
  ).toBeNull()
  click('Сохранить М-15')
  await screen.findByText('М-15 сохранена.')
  expect(save).toHaveBeenCalledOnce()
})
it('shows receipts for the selected position and the project total across matching ciphers, preserving units and old layouts', async () => {
  sessionStorage.setItem(
    'materials.workspaceView.v1:grid:m15-material-picker',
    JSON.stringify({
      columnOrder: {
        orderedColIds: ['name', 'quantity', 'unit', 'composition', 'actions'],
      },
    }),
  )
  const { workspace, value } = linkedM15Fixture()
  workspace.lines.push(
    {
      ...workspace.lines[0]!,
      id: 'other-cipher',
      cipher: 'ТК2',
      plannedQuantity: 7.5,
    },
    {
      ...workspace.lines[0]!,
      id: 'other-spec',
      normativeDocument: 'Другой ГОСТ',
      plannedQuantity: 100,
    },
  )
  workspace.materialReceipts.push(
    { ...workspace.materialReceipts[0]!, id: 'another-receipt', quantity: 2.5 },
    {
      ...workspace.materialReceipts[0]!,
      id: 'other-unit',
      quantity: 2,
      projectUnit: 'кг',
    },
    {
      ...workspace.materialReceipts[0]!,
      id: 'other-cipher-receipt',
      projectLineId: 'other-cipher',
      quantity: 40,
    },
  )
  value.lines[0]!.unit = 'т'
  value.lines.push({
    id: 'unmatched',
    name: 'Неизвестный материал',
    position: '',
    unit: 'шт',
    quantity: 1,
  })
  const before = structuredClone(workspace)
  const save = vi.fn()
  render(
    <M15ReconciliationEditor
      documentId="m15"
      workspace={workspace}
      onSave={save}
      onClose={() => {}}
    />,
  )
  click('Далее')
  await screen.findByLabelText('Количество по М-15: Клапан, т')
  const grid = getGridApi('m15-material-picker')!
  expect(
    grid
      .getAllDisplayedColumns()
      .map((column) => column.getColId())
      .slice(0, 7),
  ).toEqual([
    'name',
    'quantity',
    'documentedQuantity',
    'cipherQuantity',
    'received',
    'projectQuantity',
    'unit',
  ])
  const node = grid.getRowNode('project:line')!
  expect(
    grid.getCellValue({
      rowNode: node,
      colKey: 'received',
      useFormatter: true,
    }),
  ).toBe('12,5 шт · 2 кг')
  expect(
    grid.getCellValue({
      rowNode: node,
      colKey: 'projectQuantity',
      useFormatter: true,
    }),
  ).toBe('17,5 шт')
  const empty = grid.getRowNode('project:other-spec')!
  expect(
    grid.getCellValue({
      rowNode: empty,
      colKey: 'received',
      useFormatter: true,
    }),
  ).toBe('0')
  expect(
    grid.getCellValue({
      rowNode: empty,
      colKey: 'projectQuantity',
      useFormatter: true,
    }),
  ).toBe('100')
  const unmatched = grid.getRowNode('line:unmatched')!
  expect(
    grid.getCellValue({
      rowNode: unmatched,
      colKey: 'received',
      useFormatter: true,
    }),
  ).toBe('—')
  expect(
    grid.getCellValue({
      rowNode: unmatched,
      colKey: 'projectQuantity',
      useFormatter: true,
    }),
  ).toBe('—')
  expect(save).not.toHaveBeenCalled()
  expect(workspace).toEqual(before)
})
it('keeps quantities and filters across steps, includes only filled rows and resets filters for the next form', async () => {
  const app = mount(true)
  const workspace = structuredClone(app.workspace)
  workspace.lines.push({
    ...workspace.lines[0]!,
    id: 'line2',
    projectMaterialName: 'Фланец',
  })
  app.view.rerender(
    <M15ReconciliationEditor {...app.props} workspace={workspace} />,
  )
  fill('Номер М-15', '15-NEW')
  fill('Шифр М-15', 'ТКМ5')
  click('Далее')
  const quantity = await screen.findByLabelText<HTMLInputElement>(quantityLabel)
  act(() => quantity.focus())
  fill(quantityLabel, '1,')
  expect(document.activeElement).toBe(quantity)
  expect(quantity.value).toBe('1,')
  fill(quantityLabel, '1,25')
  fireEvent.keyDown(quantity, { key: 'Tab' })
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByLabelText('Количество по М-15: Фланец, шт'),
    ),
  )
  fill('Количество по М-15: Фланец, шт', '4')
  await act(async () =>
    getGridApi('m15-material-picker')!.setFilterModel({
      name: { filterType: 'text', type: 'equals', filter: 'Фланец' },
    }),
  )
  await waitFor(() => expect(screen.queryByLabelText(quantityLabel)).toBeNull())
  click('Далее')
  expect((await operationGridApi('m15-review')).getDisplayedRowCount()).toBe(2)
  click('Назад')
  await screen.findByLabelText('Количество по М-15: Фланец, шт')
  await waitFor(() => expect(screen.queryByLabelText(quantityLabel)).toBeNull())
  click('Сбросить фильтры таблицы')
  expect(
    (await screen.findByLabelText<HTMLInputElement>(quantityLabel)).value,
  ).toBe('1,25')
  fill(quantityLabel, '')
  click(/^Заполненные/)
  await waitFor(() => expect(screen.queryByLabelText(quantityLabel)).toBeNull())
  click('Далее')
  expect((await operationGridApi('m15-review')).getDisplayedRowCount()).toBe(1)
  click('Сохранить М-15')
  await screen.findByText('М-15 сохранена.')
  expect(app.onSave.mock.calls[0]![0]).toMatchObject({
    lines: [{ projectLineId: 'line2', quantity: 4 }],
  })
  click('Назад')
  await screen.findByLabelText('Количество по М-15: Фланец, шт')
  await act(async () =>
    getGridApi('m15-material-picker')!.setFilterModel({
      name: { filterType: 'text', type: 'equals', filter: 'Фланец' },
    }),
  )
  app.view.unmount()
  mount(true)
  fill('Номер М-15', 'NEXT')
  fill('Шифр М-15', 'ТКМ5')
  click('Далее')
  expect(
    (await screen.findByLabelText<HTMLInputElement>(quantityLabel)).value,
  ).toBe('')
  expect(getGridApi('m15-material-picker')!.getFilterModel()).toEqual({})
})
it('allows independent quantity corrections and preserves a rejected save for retry', async () => {
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(new Error('Конфликт редактирования'))
    .mockResolvedValue(undefined)
  const app = mount(false, onSave)
  click('Далее')
  await screen.findByLabelText(quantityLabel)
  fill(quantityLabel, '')
  click('Далее')
  expect(screen.getByRole('alert')).toBeTruthy()
  fill(quantityLabel, '9')
  click('Далее')
  click('Сохранить М-15')
  await screen.findByText('Конфликт редактирования')
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(app.onClose).not.toHaveBeenCalled()
  expect(
    screen.getByRole('contentinfo').contains(screen.getByRole('alert')),
  ).toBe(true)
  click('Сохранить М-15')
  await screen.findByText('М-15 сохранена.')
  expect(app.onClose).toHaveBeenCalledOnce()
  expect(app.onSave).toHaveBeenCalledTimes(2)
  expect(app.workspace.materialReceipts[0]!.quantity).toBe(10)
})
it('saves without selecting receipts and leaves stock and inspections unchanged', async () => {
  const app = mount()
  const before = structuredClone(app.workspace)
  click('Далее')
  await screen.findByLabelText(quantityLabel)
  fill(quantityLabel, '6')
  click('Настроить материал: Клапан')
  expect(screen.queryByRole('button', { name: 'Выбрать получения' })).toBeNull()
  click('Готово')
  click('Далее')
  click('Сохранить М-15')
  await screen.findByText('М-15 сохранена.')
  expect(app.onSave.mock.calls[0]![0]).toMatchObject({
    mode: 'independent',
    allocations: [],
    lines: [{ quantity: 6 }],
  })
  expect(app.workspace).toEqual(before)
})
it('requires explicit conversion and keeps quantities in both units', async () => {
  const { workspace, value } = linkedM15Fixture()
  value.allocations = []
  value.lines[0]!.unit = 'т'
  value.lines[0]!.quantity = 2
  const save = vi.fn(async (..._args: unknown[]) => {})
  render(
    <M15ReconciliationEditor
      documentId="m15"
      workspace={workspace}
      onSave={save}
      onClose={() => {}}
    />,
  )
  click('Далее')
  await screen.findByLabelText(/^Количество по М-15:/)
  click('Настроить материал: Клапан')
  fill('Пересчёт единицы М-15 в единицу проекта', '10')
  click('Готово')
  click('Далее')
  click('Сохранить М-15')
  click('Продолжить с превышением')
  await screen.findByText('М-15 сохранена.')
  expect(save.mock.calls[0]![0]).toMatchObject({
    allocations: [],
    lines: [
      expect.objectContaining({
        quantity: 2,
        projectConversion: { fromUnit: 'т', toUnit: 'шт', factor: 10 },
      }),
    ],
  })
})
it('does not confirm closing an unchanged saved document; confirms discarding a draft', () => {
  const app = mount()
  click(/^Закрыть:/)
  expect(app.onClose).toHaveBeenCalledOnce()
  app.view.unmount()
  const draft = mount(true)
  fill('Номер М-15', 'draft')
  click('Отмена')
  expect(draft.onClose).not.toHaveBeenCalled()
  click('Продолжить редактирование')
  expect(screen.getByLabelText<HTMLInputElement>('Номер М-15').value).toBe(
    'draft',
  )
  click('Отмена')
  click('Выйти без сохранения')
  expect(draft.onClose).toHaveBeenCalledOnce()
  expect(draft.onSave).not.toHaveBeenCalled()
})
it('retains the local draft after a concurrent edit until explicit reload', async () => {
  const app = mount()
  click('Далее')
  await screen.findByLabelText(quantityLabel)
  fill(quantityLabel, '12')
  const workspace = structuredClone(app.workspace)
  workspace.m15Reconciliations![0]!.lines[0]!.quantity = 14
  app.view.rerender(
    <M15ReconciliationEditor {...app.props} workspace={workspace} />,
  )
  expect(screen.getByLabelText<HTMLInputElement>(quantityLabel).value).toBe(
    '12',
  )
  expect(screen.getByText(/изменена в другой вкладке/)).toBeTruthy()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  click('Загрузить актуальную М-15')
  expect(screen.getByLabelText<HTMLInputElement>(quantityLabel).value).toBe(
    '14',
  )
  vi.restoreAllMocks()
})
it('reviews a flat numeric composition without duplicate quantities', async () => {
  mount()
  reviewWorkflow()
  const grid = await operationGridApi('m15-review')
  expect(grid.getDisplayedRowCount()).toBe(1)
  expect(
    grid.getCellValue({
      rowNode: grid.getDisplayedRowAtIndex(0)!,
      colKey: 'quantity',
    }),
  ).toBe(10)
})
it('preserves separate invoice rows for one project material and unmatched historical rows', async () => {
  const { workspace, value } = linkedM15Fixture()
  value.lines.push(
    {
      ...value.lines[0]!,
      id: 'batch2',
      name: 'Клапан из партии 2',
      quantity: 5,
    },
    {
      id: 'old',
      position: '3',
      projectLineId: 'removed',
      name: 'Старая позиция',
      unit: 'шт',
      quantity: 3,
    },
  )
  const save = vi.fn(async (..._args: unknown[]) => {})
  render(
    <M15ReconciliationEditor
      documentId="m15"
      workspace={workspace}
      onSave={save}
      onClose={() => {}}
    />,
  )
  click('Далее')
  await screen.findByLabelText('Количество по М-15: Старая позиция, шт')
  fill('Количество по М-15: Клапан из партии 2, шт', '7,5')
  click('Далее')
  expect(screen.getByRole('alert')).toBeTruthy()
  click('Настроить материал: Старая позиция')
  fill('Проектный материал: Старая позиция', 'line')
  click('Готово')
  expect(
    (
      await screen.findByLabelText<HTMLInputElement>(
        'Количество по М-15: Клапан из партии 2, шт',
      )
    ).value,
  ).toBe('7,5')
  expect(
    screen.getByLabelText<HTMLInputElement>(
      'Количество по М-15: Старая позиция, шт',
    ).value,
  ).toBe('3')
  click('Далее')
  click('Сохранить М-15')
  click('Продолжить с превышением')
  await screen.findByText('М-15 сохранена.')
  expect(save.mock.calls[0]![0]).toMatchObject({
    lines: [
      { id: 'row1', projectLineId: 'line', quantity: 10 },
      {
        id: 'batch2',
        projectLineId: 'line',
        name: 'Клапан из партии 2',
        quantity: 7.5,
      },
      { id: 'old', projectLineId: 'line', name: 'Старая позиция', quantity: 3 },
    ],
    allocations: [],
  })
})
function uploadWorkbookRows(rows: Array<Array<string | number>>) {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Накладная')
  const file = new File(['fixture'], 'm15.xlsx')
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => XLSX.write(book, { bookType: 'xlsx', type: 'array' }),
  })
  fireEvent.change(screen.getByLabelText<HTMLInputElement>('Файл Excel М-15'), {
    target: { files: [file] },
  })
}
async function uploadRows(rows: Array<Array<string | number>>) {
  uploadWorkbookRows(rows)
  await screen.findByRole('button', { name: 'Предпросмотр импорта' })
}
it('downloads the selected cipher template directly from the composition', async () => {
  const download = vi
    .spyOn(m15Import, 'downloadM15ImportTemplate')
    .mockImplementation(() => {})
  const app = mount(true)
  const workspace = structuredClone(app.workspace)
  workspace.lines.push({ ...workspace.lines[0]!, id: 'other', cipher: 'OTHER' })
  app.view.rerender(
    <M15ReconciliationEditor {...app.props} workspace={workspace} />,
  )
  fill('Номер М-15', '15-NEW')
  fill('Шифр М-15', 'ТКМ5')
  click('Далее')
  click('Скачать шаблон Excel')
  await waitFor(() => expect(download).toHaveBeenCalledOnce())
  expect(download.mock.calls[0]![0]).toEqual([
    expect.objectContaining({
      id: 'line',
      name: 'Клапан',
      unit: 'шт',
      cipher: 'ТКМ5',
    }),
  ])
  expect(app.onSave).not.toHaveBeenCalled()
})
it('imports only filled template rows, matches the project and keeps the draft until explicit save', async () => {
  const app = mount(true)
  fill('Номер М-15', '15-NEW')
  fill('Шифр М-15', 'ТКМ5')
  click('Далее')
  click('Импорт Excel')
  await screen.findByLabelText('Файл Excel М-15')
  uploadWorkbookRows([
    templateHeaders,
    ['1', 'Клапан', 'шт', 3],
    ['2', 'Незаполненная позиция', 'м', ''],
  ])
  await screen.findByLabelText(quantityLabel)
  const grid = await waitFor(() => {
    const api = getGridApi('m15-material-picker')
    if (!api?.getColumns()?.length) throw new Error('Grid not ready')
    return api
  })
  expect(grid.getDisplayedRowCount()).toBe(1)
  expect(screen.queryByLabelText(/^Проектный материал:/)).toBeNull()
  expect(screen.queryByLabelText('Наименование по М-15')).toBeNull()
  expect(app.onSave).not.toHaveBeenCalled()
  click('Далее')
  click('Сохранить М-15')
  await screen.findByText('М-15 сохранена.')
  expect(app.onSave.mock.calls[0]![0]).toMatchObject({
    lines: [{ name: 'Клапан', projectLineId: 'line', quantity: 3 }],
    allocations: [],
  })
})
it('requires selection for unmatched imports and keeps the invoice name separate from the project', async () => {
  const app = mount(true)
  fill('Номер М-15', '15-NEW')
  fill('Шифр М-15', 'ТКМ5')
  click('Далее')
  click('Импорт Excel')
  await screen.findByLabelText('Файл Excel М-15')
  uploadWorkbookRows([templateHeaders, ['1', 'Клапан по накладной', 'шт', 3]])
  await screen.findByRole('button', {
    name: 'Настроить материал: Клапан по накладной',
  })
  click('Далее')
  expect(screen.getByRole('alert')).toBeTruthy()
  click('Настроить материал: Клапан по накладной')
  fill('Проектный материал: Клапан по накладной', 'line')
  expect(screen.queryByLabelText(/^Проектный материал:/)).toBeNull()
  expect(
    within(screen.getByTestId('m15-material')).getByText('Клапан'),
  ).toBeTruthy()
  expect(
    screen.getByLabelText<HTMLInputElement>('Наименование по М-15').value,
  ).toBe('Клапан по накладной')
  click('Готово')
  click('Далее')
  click('Сохранить М-15')
  await screen.findByText('М-15 сохранена.')
  expect(app.onSave.mock.calls[0]![0]).toMatchObject({
    lines: [
      { name: 'Клапан по накладной', projectLineId: 'line', quantity: 3 },
    ],
  })
})
it('does not erase the composition when an unfilled template is uploaded', async () => {
  const { value } = linkedM15Fixture()
  const apply = vi.fn()
  render(<M15ImportPanel value={value} onApply={apply} onCancel={() => {}} />)
  uploadWorkbookRows([templateHeaders, ['1', 'Клапан', 'шт', '']])
  await screen.findByText(
    'Заполните количество хотя бы для одного материала в шаблоне.',
  )
  expect(apply).not.toHaveBeenCalled()
  expect(value.lines).toHaveLength(1)
})
it('honors the import result when changed quantities invalidate old receipt links', async () => {
  const app = mount()
  const workspace = structuredClone(app.workspace)
  workspace.lines[0]!.plannedQuantity = 10
  app.view.rerender(
    <M15ReconciliationEditor {...app.props} workspace={workspace} />,
  )
  click('Далее')
  click('Импорт Excel')
  await screen.findByLabelText('Файл Excel М-15')
  uploadWorkbookRows([templateHeaders, ['1', 'Клапан', 'шт', 12]])
  await screen.findByLabelText(quantityLabel)
  const grid = await waitFor(() => {
    const api = getGridApi('m15-material-picker')
    if (!api?.getColumns()?.length) throw new Error('Grid not ready')
    return api
  })
  expect(grid.getDisplayedRowAtIndex(0)!.data.linked).toBeUndefined()
  click('Далее')
  click('Сохранить М-15')
  expect(
    screen.getByRole('dialog', { name: 'Превышение по шифру' }),
  ).toBeTruthy()
  expect(app.onSave).not.toHaveBeenCalled()
  click('Продолжить с превышением')
  await screen.findByText('М-15 сохранена.')
  expect(app.onSave.mock.calls[0]![0]).toMatchObject({
    lines: [{ projectLineId: 'line', quantity: 12 }],
    allocations: [],
  })
  expect(app.workspace.m15Reconciliations![0]!.allocations).toHaveLength(1)
})
it('previews editable Excel changes and confirms replacing documentary quantities', async () => {
  const { value } = m15Fixture(),
    apply = vi.fn(),
    cancel = vi.fn()
  render(<M15ImportPanel value={value} onApply={apply} onCancel={cancel} />)
  await uploadRows([
    ['Название файла'],
    ['№', 'Наименование', 'Единица', 'Количество'],
    ['1', 'Клапан', 'шт', 12],
  ])
  fill('Строка заголовков', '2')
  click('Предпросмотр импорта')
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'Применить количества',
    }).disabled,
  ).toBe(true)
  fill('quantity строки Excel 3', '10')
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Применить количества',
      }).disabled,
    ).toBe(false),
  )
  fill('quantity строки Excel 3', '12')
  fireEvent.click(screen.getByRole('checkbox', { name: /Подтверждаю замену/ }))
  click('Применить количества')
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({
      lines: [expect.objectContaining({ id: 'row1', quantity: 12 })],
      allocations: [],
    }),
  )
  expect(value.allocations).toHaveLength(1)
})
it('cancels an Excel preview without applying any edits', async () => {
  const { value } = m15Fixture(),
    apply = vi.fn(),
    cancel = vi.fn()
  render(<M15ImportPanel value={value} onApply={apply} onCancel={cancel} />)
  await uploadRows([
    ['№', 'Наименование', 'Единица', 'Количество'],
    ['1', 'Клапан', 'шт', 10],
  ])
  click('Предпросмотр импорта')
  click('Отменить импорт')
  expect(cancel).toHaveBeenCalledOnce()
  expect(apply).not.toHaveBeenCalled()
})

it('can retry loading the scan catalog for a new invoice without closing its draft', async () => {
  let offline = true
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      offline
        ? Response.json({ error: 'Нет связи со сканами' }, { status: 503 })
        : Response.json({ manifest: { files: [] } }),
    ),
  )
  mount(true)
  fill('Номер М-15', 'RETRY')
  fill('Шифр М-15', 'ТКМ5')
  click('Далее')
  await screen.findByLabelText(quantityLabel)
  fill(quantityLabel, '1')
  click('Далее')
  await screen.findByText('Нет связи со сканами')
  expect(screen.getByLabelText('Файлы оригиналов')).toHaveProperty(
    'disabled',
    true,
  )
  offline = false
  click('Обновить список файлов')
  await waitFor(() =>
    expect(screen.getByLabelText('Файлы оригиналов')).toHaveProperty(
      'disabled',
      false,
    ),
  )
  expect(screen.queryByText('Нет связи со сканами')).toBeNull()
})
