// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { ProjectWorkspace } from './project-workspace'
import { saveProjectWorkspaceSnapshot } from './functions'
import { demoObjects } from './demo-data'
import { workspaceSnapshotSchema } from './workspace-snapshot'

vi.mock('./functions', () => ({
  getSubobjectMaterialPlan: vi.fn(),
  saveProjectWorkspaceSnapshot: vi.fn(),
}))
const plan = {
  object: demoObjects[0]!,
  subobject: demoObjects[0]!.subobjects[0],
  categories: [],
  documents: [],
}
const base = () =>
  workspaceSnapshotSchema.parse({
    configuredAlloys: [],
    configuredCiphers: ['ТЕСТ'],
    configuredDocuments: [],
    configuredUnits: ['м'],
    materialTypeSettings: [],
    materialIssues: [],
    materialReceipts: [],
    materialRequests: [],
    qualityControls: [],
    lines: ['Альфа', 'Бета'].map((name, i) => ({
      id: `line-${i}`,
      project: 'Тестовый проект',
      cipher: 'ТЕСТ',
      category: 'Трубопровод',
      materialType: 'Трубопровод',
      material: 'Сталь',
      materialId: `TEST-${i}`,
      projectMaterialName: name,
      unit: 'м',
      plannedQuantity: 10,
      requested: 0,
      received: 0,
      qcPending: 0,
      accepted: 0,
      issued: 0,
      returned: 0,
      writtenOff: 0,
    })),
  })
function mount(workspace = base(), restoreView = false) {
  // Most workflows start in a fresh tab; reload tests retain its view state.
  if (!restoreView) sessionStorage.clear()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectWorkspace
        initialData={plan}
        initialStoredData={{ workspace, revision: 'initial' }}
      />
    </QueryClientProvider>,
  )
}
function openRequest(materialType = 'Трубопровод') {
  fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Создать заявку' })[0]!)
  const dialog = screen.getByRole('dialog')
  const selects = within(dialog).getAllByRole('combobox')
  fireEvent.change(selects[0]!, { target: { value: 'ТЕСТ' } })
  fireEvent.change(selects[1]!, { target: { value: materialType } })
  return dialog
}
function conversionWorkspace() {
  const workspace = base()
  workspace.lines = [workspace.lines[0]!]
  workspace.configuredUnits.push('кг', 'т')
  workspace.lines[0]!.alternativeUnit = 'кг'
  workspace.lines[0]!.alternativeUnitFactor = 2.5
  workspace.materialRequests = [
    {
      id: 'request-conversion',
      projectLineId: 'line-0',
      projectMaterialName: 'Альфа',
      projectUnit: 'м',
      materialId: 'TEST-0',
      cipher: 'ТЕСТ',
      date: '2026-10-14',
      number: 'CONVERSION',
      quantity: 8,
      requester: '',
      note: '',
      altUnit: '',
      altQuantity: null,
    },
  ]
  return workspace
}
function legacyReceipt() {
  return {
    id: 'receipt-legacy',
    requestId: 'request-conversion',
    projectLineId: 'line-0',
    actualName: 'Альфа',
    date: '2026-10-14',
    quantity: 2,
    projectUnit: 'м',
    invoiceNumber: 'Н-1',
    certificate: '',
    qualityDocument: '',
    customerArvk: '',
    customerReceiptDocument: '',
    technicalDecision: '',
    manufacturer: '',
    heatBatch: '',
    factoryNumber: '',
    note: '',
    altUnit: 'кг',
    altQuantity: 111,
  }
}
function lastSaved() {
  return vi.mocked(saveProjectWorkspaceSnapshot).mock.calls.at(-1)![0].data
    .workspace
}
function openReceipt() {
  fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Оформить получение' })[0]!,
  )
  const dialog = screen.getByRole('dialog')
  fireEvent.focus(within(dialog).getByPlaceholderText('Без выбранной заявки'))
  fireEvent.mouseDown(
    within(dialog).getByRole('button', { name: /CONVERSION/ }),
  )
  return dialog
}
beforeEach(() => {
  localStorage.clear()
  vi.mocked(saveProjectWorkspaceSnapshot)
    .mockReset()
    .mockResolvedValue({ status: 'saved', revision: 'saved' })
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn()
})
afterEach(() => {
  cleanup()
})

describe('workspace user workflows', () => {
  it('calculates partial receipts and issues through quality control using only the material coefficient', async () => {
    mount(conversionWorkspace())
    let dialog = openReceipt()
    expect(
      within(dialog).queryByRole('textbox', { name: /альтернативн/i }),
    ).toBeNull()
    fireEvent.change(within(dialog).getByPlaceholderText('Поступило, м'), {
      target: { value: '2,4' },
    })
    expect(
      within(dialog).getByRole('status', {
        name: 'Поступило в альтернативной единице',
      }).textContent,
    ).toBe('6 кг')
    fireEvent.change(within(dialog).getByPlaceholderText('Номер накладной *'), {
      target: { value: 'Н-1' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить получение' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialReceipts[0]).toMatchObject({
      quantity: 2.4,
      altQuantity: 6,
      altUnit: 'кг',
      altUnitFactor: 2.5,
    })
    fireEvent.click(screen.getByRole('button', { name: /^Входной контроль/ }))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Создать ЗНИ / АРВК' })[0]!,
    )
    dialog = screen.getByRole('dialog')
    expect(
      within(dialog).queryByRole('textbox', { name: /альтернативн/i }),
    ).toBeNull()
    fireEvent.change(
      within(dialog)
        .getByText('Количество по АРВК, м')
        .parentElement!.querySelector('input')!,
      { target: { value: '2' } },
    )
    fireEvent.change(within(dialog).getByRole('combobox'), {
      target: { value: 'signed' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /Сохранить/ }))
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(2),
    )
    fireEvent.click(screen.getByRole('button', { name: /^Выдача/ }))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Выдать в монтаж' })[0]!,
    )
    dialog = screen.getByRole('dialog')
    expect(
      within(dialog).queryByRole('textbox', { name: /альтернативн/i }),
    ).toBeNull()
    fireEvent.change(
      within(dialog)
        .getByText('Количество выдано')
        .parentElement!.querySelector('input')!,
      { target: { value: '0,4' } },
    )
    expect(
      within(dialog).getByRole('status', {
        name: 'Выдано в альтернативной единице',
      }).textContent,
    ).toBe('1 кг')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить выдачу' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(3),
    )
    expect(lastSaved().materialIssues[0]).toMatchObject({
      quantity: 0.4,
      altQuantity: 1,
      altUnit: 'кг',
      altUnitFactor: 2.5,
      projectUnit: 'м',
    })

    const saved = structuredClone(lastSaved())
    saved.lines[0]!.alternativeUnit = 'т'
    saved.lines[0]!.alternativeUnitFactor = 0.1
    cleanup()
    mount(saved)
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    fireEvent.click(screen.getByRole('button', { name: /Редактировать/ }))
    dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByRole('status', {
        name: 'Поступило в альтернативной единице',
      }).textContent,
    ).toBe('0,24 т')
    fireEvent.change(within(dialog).getByPlaceholderText('Примечание'), {
      target: { value: 'Обновлено' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить изменения' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(4),
    )
    expect(lastSaved().materialRequests[0]).toMatchObject({
      quantity: 8,
      altQuantity: 0.8,
      altUnit: 'т',
    })
    expect(lastSaved().materialReceipts[0]).toMatchObject({
      quantity: 2.4,
      altQuantity: 0.24,
      altUnit: 'т',
      altUnitFactor: 0.1,
    })
    expect(lastSaved().materialIssues[0]).toMatchObject({
      quantity: 0.4,
      altQuantity: 0.04,
      altUnit: 'т',
      altUnitFactor: 0.1,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Редактировать материал' }),
    )
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('combobox'), {
      target: { value: 'Оборудование' },
    })
    fireEvent.change(
      within(dialog).getByRole('textbox', {
        name: 'Количество альтернативных единиц на одну основную',
      }),
      { target: { value: '0,2' } },
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(5),
    )
    expect(lastSaved().materialRequests[0]).toMatchObject({
      altQuantity: 1.6,
      altUnit: 'т',
    })
    expect(lastSaved().materialReceipts[0]).toMatchObject({
      altQuantity: 0.48,
      altUnit: 'т',
    })
    expect(lastSaved().materialIssues[0]).toMatchObject({
      altQuantity: 0.08,
      altUnit: 'т',
    })
  })
  it('preserves historical receipt values without manual fields and blocks quantity changes until conversion is configured', async () => {
    const workspace = conversionWorkspace()
    delete workspace.lines[0]!.alternativeUnitFactor
    workspace.materialReceipts = [legacyReceipt()]
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    fireEvent.click(screen.getByRole('button', { name: /Редактировать/ }))
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).queryByRole('textbox', { name: /альтернативн/i }),
    ).toBeNull()
    expect(
      within(dialog).getByRole('status', {
        name: 'Поступило в альтернативной единице',
      }).textContent,
    ).toBe('111 кг')
    const quantity = within(dialog).getByPlaceholderText('Поступило, м')
    const save = within(dialog).getByRole<HTMLButtonElement>('button', {
      name: 'Сохранить изменения',
    })
    fireEvent.change(quantity, { target: { value: '3' } })
    expect(save.disabled).toBe(true)
    fireEvent.change(quantity, { target: { value: '2' } })
    fireEvent.change(within(dialog).getByPlaceholderText('Примечание'), {
      target: { value: 'Уточнение' },
    })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialReceipts[0]).toMatchObject({
      quantity: 2,
      altQuantity: 111,
      altUnit: 'кг',
      note: 'Уточнение',
    })
  })
  it('keeps alternative receipt totals in different units separate', () => {
    const workspace = conversionWorkspace()
    delete workspace.lines[0]!.alternativeUnitFactor
    workspace.materialReceipts = [
      legacyReceipt(),
      { ...legacyReceipt(), id: 'receipt-2', altQuantity: 0.2, altUnit: 'т' },
    ]
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    expect(screen.getByText('111 кг · 0,2 т')).toBeTruthy()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })
  it('recalculates receipt Excel values and never accepts manual alternatives from the file', async () => {
    mount(conversionWorkspace())
    const dialog = openReceipt()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Импорт Excel' }),
    )
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        [],
        [],
        [],
        [],
        [
          'ID заявки',
          'Поступило',
          'Поступило в альтернативной единице',
          'Альтернативная единица измерения',
          'Номер накладной',
          'Наименование ТМЦ по факту поступления',
        ],
        ['request-conversion', 1.2, 999, 'уп', 'Н-Excel', 'Альфа'],
        ['request-conversion', '', '', 'кг', '', 'Альфа'],
      ]),
      'Получение',
    )
    const buffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    }) as ArrayBuffer
    const file = new File([buffer], 'receipt.xlsx')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer })
    fireEvent.change(dialog.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })
    await within(dialog).findByText('Позиций в файле')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Применить импорт' }),
    )
    expect(
      within(dialog).getByRole('status', {
        name: 'Поступило в альтернативной единице',
      }).textContent,
    ).toBe('3 кг')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить получение' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialReceipts[0]).toMatchObject({
      quantity: 1.2,
      altQuantity: 3,
      altUnit: 'кг',
    })
  })
  it('remembers visible project columns without saving materials or leaving hidden filters active', () => {
    const workspace = base()
    workspace.configuredCiphers.push('ТЕСТ2')
    workspace.lines.push({
      ...workspace.lines[0],
      id: 'line-second-cipher',
      cipher: 'ТЕСТ2',
      plannedQuantity: 3,
    })
    let view = mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
    let table = screen.getByRole('table')
    fireEvent.change(within(table).getAllByPlaceholderText('Фильтр')[1]!, {
      target: { value: 'Альфа' },
    })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Настроить столбцы' }))
    let settings = screen.getByRole('group', { name: 'Отображаемые столбцы' })
    expect(within(settings).getAllByRole('checkbox')).toHaveLength(11)
    for (const name of [
      'Тип материала',
      'Наименование по проекту',
      'ТЕСТ',
      'Действия',
    ]) {
      // A label click may blur the previous control before activating its input.
      fireEvent.blur(
        screen.getByRole('button', { name: 'Настроить столбцы' }),
        {
          relatedTarget: null,
        },
      )
      fireEvent.click(within(settings).getByText(name, { exact: true }))
      expect(screen.getByRole('group', { name: 'Отображаемые столбцы' })).toBe(
        settings,
      )
      expect(within(table).queryByRole('columnheader', { name })).toBeNull()
    }
    // Hiding the name also removes its filter; both materials remain available.
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(within(rows[2]!).getAllByRole('cell')).toHaveLength(7)
    expect(
      within(rows[2]!).getByPlaceholderText<HTMLInputElement>('-').value,
    ).toBe('3')
    expect(
      within(rows[3]!).getByPlaceholderText<HTMLInputElement>('-').value,
    ).toBe('')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.queryByRole('group', { name: 'Отображаемые столбцы' }),
    ).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Настроить столбцы' }),
    )
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()

    view.unmount()
    workspace.configuredCiphers.push('ТЕСТ3')
    view = mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
    table = screen.getByRole('table')
    expect(
      within(table).queryByRole('columnheader', { name: 'Тип материала' }),
    ).toBeNull()
    expect(
      within(table).queryByRole('columnheader', { name: 'ТЕСТ' }),
    ).toBeNull()
    expect(
      within(table).getByRole('columnheader', { name: 'ТЕСТ3' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Настроить столбцы' }))
    settings = screen.getByRole('group', { name: 'Отображаемые столбцы' })
    fireEvent.click(
      within(settings).getByRole('button', { name: 'Показать все' }),
    )
    expect(within(table).getByRole('row', { name: /Бета/ })).toBeTruthy()
    expect(
      within(within(table).getAllByRole('row')[0]!).getAllByRole(
        'columnheader',
      ),
    ).toHaveLength(12)
    for (const checkbox of within(settings).getAllByRole('checkbox')) {
      fireEvent.click(checkbox)
    }
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/Все столбцы скрыты/)).toBeTruthy()
    fireEvent.click(
      within(settings).getByRole('button', { name: 'Показать все' }),
    )
    expect(screen.getByRole('table')).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(
      screen.queryByRole('group', { name: 'Отображаемые столбцы' }),
    ).toBeNull()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    view.unmount()
  })
  it('restores the section, filters, operation tab and expanded requests after a reload without saving data', () => {
    const workspace = base()
    workspace.materialRequests = [
      {
        id: 'request-view',
        projectLineId: 'line-0',
        projectMaterialName: 'Альфа',
        projectUnit: 'м',
        materialId: 'TEST-0',
        cipher: 'ТЕСТ',
        date: '2026-10-15',
        number: 'VIEW-REQUEST',
        quantity: 2,
        requester: '',
        note: '',
        altUnit: '',
        altQuantity: null,
      },
    ]
    let view = mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть меню' }))
    fireEvent.change(
      screen.getByPlaceholderText(/Поиск по типу, наименованию/),
      {
        target: { value: 'Сталь' },
      },
    )
    fireEvent.change(
      within(screen.getByRole('table')).getAllByPlaceholderText('Фильтр')[1]!,
      {
        target: { value: 'Альфа' },
      },
    )
    view.unmount()
    view = mount(workspace, true)
    expect(
      screen.getByRole('heading', { name: 'Проектная база материалов' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Показать меню' })).toBeTruthy()
    expect(
      screen.getByPlaceholderText<HTMLInputElement>(
        /Поиск по типу, наименованию/,
      ).value,
    ).toBe('Сталь')
    expect(
      within(screen.getByRole('table')).getByRole('cell', { name: 'Альфа' }),
    ).toBeTruthy()
    expect(
      within(screen.getByRole('table')).queryByRole('row', { name: /Бета/ }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Операции' }))
    fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
    fireEvent.click(screen.getByRole('button', { name: /^VIEW-REQUEST/ }))
    expect(screen.getByRole('row', { name: /Альфа/ })).toBeTruthy()
    view.unmount()
    view = mount(workspace, true)
    expect(screen.getByRole('heading', { name: 'Заявки' })).toBeTruthy()
    expect(screen.getByRole('row', { name: /Альфа/ })).toBeTruthy()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    view.unmount()
  })
  it('refreshes project quantities and excess across requests while preserving the original plan and requested quantity', async () => {
    const workspace = base()
    workspace.configuredCiphers.push('ТЕСТ2')
    workspace.lines.push({
      ...workspace.lines[0],
      id: 'line-other-cipher',
      cipher: 'ТЕСТ2',
      plannedQuantity: 20,
    })
    workspace.materialRequests = [
      {
        id: 'previous-request',
        projectLineId: 'line-0',
        projectMaterialName: 'Альфа',
        projectUnit: 'м',
        materialId: 'TEST-0',
        cipher: 'ТЕСТ',
        date: '2026-01-01',
        number: 'PREVIOUS',
        quantity: 1,
        requester: '',
        note: '',
        altUnit: '',
        altQuantity: null,
      },
    ]
    let view = mount(workspace)
    let dialog = openRequest()
    expect(
      within(dialog).queryByPlaceholderText(
        'Количество в альтернативной единице',
      ),
    ).toBeNull()
    expect(
      within(dialog).queryByRole('status', {
        name: 'Количество в альтернативной единице',
      }),
    ).toBeNull()
    fireEvent.change(
      within(
        within(dialog)
          .getByText('Альфа')
          .closest('div.relative') as HTMLElement,
      ).getByPlaceholderText('Количество по заявке, м'),
      { target: { value: '6' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить заявку' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    const created = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[0]![0]
      .data.workspace
    const number = String(created.materialRequests[0]!.number)
    expect(created.materialRequests[0]).toMatchObject({
      quantity: 6,
      projectQuantitiesAtCreation: {
        projectQuantity: 30,
        cipherQuantity: 10,
        unit: 'м',
      },
    })

    async function changePlan(quantity: string, saves: number) {
      fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
      const row = screen.getByRole('row', { name: /Альфа/ })
      fireEvent.change(within(row).getAllByPlaceholderText('-')[0]!, {
        target: { value: quantity },
      })
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(saves),
      )
      const saved = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[
        saves - 1
      ]![0].data.workspace
      expect(saved.materialRequests).toEqual(created.materialRequests)
      fireEvent.click(screen.getByRole('button', { name: 'Операции' }))
      fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
      const group = screen
        .getByText(number)
        .closest('div.overflow-hidden') as HTMLElement
      if (!within(group).queryByRole('table')) {
        fireEvent.click(screen.getByText(number).closest('button')!)
      }
      return screen.getByRole('row', { name: /Альфа/ })
    }
    let row = await changePlan('8', 2)
    let cells = within(row).getAllByRole('cell')
    expect(within(cells[1]!).getByText('28 м')).toBeTruthy()
    expect(within(cells[1]!).getByText('При создании: 30 м')).toBeTruthy()
    expect(within(cells[2]!).getByText('8 м')).toBeTruthy()
    expect(within(cells[2]!).getByText('При создании: 10 м')).toBeTruthy()
    expect(cells[3]!.textContent).toBe('6')
    expect(cells[7]!.textContent).toBe('1 м')
    expect(screen.queryByText(/Заявлено сверх проекта:/)).toBeNull()

    row = await changePlan('4', 3)
    cells = within(row).getAllByRole('cell')
    expect(within(cells[1]!).getByText('24 м')).toBeTruthy()
    expect(within(cells[2]!).getByText('4 м')).toBeTruthy()
    expect(cells[3]!.textContent).toBe('6')
    expect(
      within(cells[7]!).getByText(/Заявлено сверх проекта: 3 м/),
    ).toBeTruthy()
    expect(
      screen.getAllByText(/Позиций с превышением проекта: 1/),
    ).toHaveLength(2)

    function editCreatedRequest() {
      const card = screen
        .getByText(number)
        .closest('div.overflow-hidden') as HTMLElement
      fireEvent.click(
        within(card).getByRole('button', { name: 'Редактировать' }),
      )
      const modal = screen.getByRole('dialog')
      fireEvent.click(
        within(modal).getByRole('button', { name: /^Заполненные/ }),
      )
      return modal
    }
    dialog = editCreatedRequest()
    expect(within(dialog).getByText('24 м')).toBeTruthy()
    expect(within(dialog).getByText('4 м')).toBeTruthy()
    expect(
      within(dialog).getByText(
        /При создании заявки: по проекту 30 м, по шифру 10 м/,
      ),
    ).toBeTruthy()
    expect(within(dialog).getByText(/Заявлено сверх проекта: 3 м/)).toBeTruthy()
    fireEvent.change(within(dialog).getByPlaceholderText('Примечание'), {
      target: { value: 'Проверить проект' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить изменения' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(4),
    )
    const noted = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[3]![0].data
      .workspace
    expect(noted.materialRequests[0]).toEqual({
      ...created.materialRequests[0],
      note: 'Проверить проект',
    })
    expect(
      noted.lines.find((line) => line.id === 'line-0')!.plannedQuantity,
    ).toBe(4)

    dialog = editCreatedRequest()
    fireEvent.change(
      within(dialog).getByPlaceholderText('Количество по заявке, м'),
      { target: { value: '5' } },
    )
    expect(within(dialog).getByText(/Заявлено сверх проекта: 2 м/)).toBeTruthy()
    expect(screen.queryByText('Остаток по проекту превышен')).toBeNull()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить изменения' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(5),
    )
    const reduced = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[4]![0]
      .data.workspace
    expect(reduced.materialRequests[0]).toEqual({
      ...noted.materialRequests[0],
      quantity: 5,
    })
    view.unmount()
    view = mount(reduced)
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(5)
    fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
    dialog = editCreatedRequest()
    expect(
      within(dialog).getByText(
        /При создании заявки: по проекту 30 м, по шифру 10 м/,
      ),
    ).toBeTruthy()
    fireEvent.change(
      within(dialog).getByPlaceholderText('Количество по заявке, м'),
      { target: { value: '6' } },
    )
    expect(screen.getByText('Остаток по проекту превышен')).toBeTruthy()
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(5)
    view.unmount()
  })
  it.each([0, 4])(
    'does not invent an original plan or increase the current plan (%s) while saving legacy request notes',
    async (plannedQuantity) => {
      const workspace = base()
      workspace.lines[0]!.plannedQuantity = plannedQuantity
      workspace.materialRequests = [
        {
          id: 'legacy-request',
          projectLineId: 'line-0',
          projectMaterialName: 'Альфа',
          projectUnit: 'м',
          materialId: 'TEST-0',
          cipher: 'ТЕСТ',
          date: '2026-01-01',
          number: 'LEGACY',
          quantity: 6,
          requester: '',
          note: '',
          altUnit: '',
          altQuantity: null,
        },
      ]
      mount(workspace)
      expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
      const dialog = screen.getByRole('dialog')
      fireEvent.click(
        within(dialog).getByRole('button', { name: /^Заполненные/ }),
      )
      expect(
        within(dialog).getByText(
          'Проектное количество при создании этой заявки не сохранялось.',
        ),
      ).toBeTruthy()
      fireEvent.change(within(dialog).getByPlaceholderText('Примечание'), {
        target: { value: 'История' },
      })
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Сохранить изменения' }),
      )
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
      )
      const saved = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[0]![0]
        .data.workspace
      expect(saved.lines).toEqual(workspace.lines)
      expect(saved.materialRequests[0]).toEqual({
        ...workspace.materialRequests[0],
        note: 'История',
      })
    },
  )
  it('includes existing overage when explicitly adjusting the project for a new request', async () => {
    const workspace = base()
    workspace.lines[0]!.plannedQuantity = 4
    workspace.materialRequests = [
      {
        id: 'legacy-request',
        projectLineId: 'line-0',
        projectMaterialName: 'Альфа',
        projectUnit: 'м',
        materialId: 'TEST-0',
        cipher: 'ТЕСТ',
        date: '2026-01-01',
        number: 'LEGACY',
        quantity: 6,
        requester: '',
        note: '',
        altUnit: '',
        altQuantity: null,
      },
    ]
    mount(workspace)
    const dialog = openRequest()
    const card = within(dialog)
      .getByText('Альфа')
      .closest('div.relative') as HTMLElement
    fireEvent.change(
      within(card).getByPlaceholderText('Количество по заявке, м'),
      { target: { value: '1' } },
    )
    expect(screen.getByText('Остаток по проекту превышен')).toBeTruthy()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: /Изменить проектное количество/ }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    const adjusted = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[0]![0]
      .data.workspace
    expect(adjusted.lines[0]!.plannedQuantity).toBe(7)
    expect(adjusted.materialRequests).toEqual(workspace.materialRequests)
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить заявку' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(2),
    )
    const saved = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[1]![0].data
      .workspace
    expect(saved.materialRequests[0]).toMatchObject({
      quantity: 1,
      projectQuantitiesAtCreation: {
        projectQuantity: 7,
        cipherQuantity: 7,
        unit: 'м',
      },
    })
    expect(saved.materialRequests[1]).toEqual(workspace.materialRequests[0])
  })
  it('keeps the material conversion when adding quantity under another cipher', async () => {
    const workspace = base()
    workspace.configuredCiphers.push('ТЕСТ2')
    workspace.configuredUnits.push('кг')
    workspace.lines[0]!.alternativeUnit = 'кг'
    workspace.lines[0]!.alternativeUnitFactor = 2.5
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
    const row = screen.getByRole('row', { name: /Альфа/ })
    fireEvent.change(within(row).getAllByPlaceholderText('-')[1]!, {
      target: { value: '4' },
    })
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    const saved = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[0]![0].data
      .workspace
    expect(saved.lines.find((line) => line.cipher === 'ТЕСТ2')).toMatchObject({
      projectMaterialName: 'Альфа',
      plannedQuantity: 4,
      alternativeUnit: 'кг',
      alternativeUnitFactor: 2.5,
    })
    expect(saved.lines.find((line) => line.id === 'line-0')).toEqual(
      workspace.lines[0],
    )
  })
  it('stores a per-unit conversion and recalculates saved requests from the current material', async () => {
    const workspace = base()
    workspace.configuredUnits = ['м', 'кг']
    let view = mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
    fireEvent.click(
      within(screen.getByRole('row', { name: /Альфа/ })).getByRole('button', {
        name: 'Редактировать материал',
      }),
    )
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('combobox'), {
      target: { value: 'Оборудование' },
    })
    const unit = within(dialog).getByRole('textbox', {
      name: 'Альтернативная единица измерения',
    })
    fireEvent.change(unit, { target: { value: 'к' } })
    fireEvent.mouseDown(within(dialog).getByRole('button', { name: 'кг' }))
    const factor = within(dialog).getByRole('textbox', {
      name: 'Количество альтернативных единиц на одну основную',
    })
    const saveMaterial = within(dialog).getByRole<HTMLButtonElement>('button', {
      name: 'Сохранить',
    })
    for (const value of ['', '0', '-1', 'Infinity', 'abc']) {
      fireEvent.change(factor, { target: { value } })
      expect(saveMaterial.disabled).toBe(true)
    }
    fireEvent.change(factor, { target: { value: '2,5' } })
    expect(saveMaterial.disabled).toBe(false)
    fireEvent.click(saveMaterial)
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    const material = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[0]![0]
      .data.workspace
    expect(material.lines[0]).toMatchObject({
      id: 'line-0',
      alternativeUnit: 'кг',
      alternativeUnitFactor: 2.5,
    })
    view.unmount()
    view = mount(material)
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1)
    dialog = openRequest('Оборудование')
    const quantity = within(dialog).getByPlaceholderText(
      'Количество по заявке, м',
    )
    expect(
      within(dialog).queryByPlaceholderText(
        'Количество в альтернативной единице',
      ),
    ).toBeNull()
    expect(
      within(dialog).queryByRole('textbox', {
        name: 'Альтернативная единица измерения',
      }),
    ).toBeNull()
    fireEvent.change(quantity, { target: { value: '3' } })
    const alternative = within(dialog).getByRole('status', {
      name: 'Количество в альтернативной единице',
    })
    expect(alternative.textContent).toBe('7,5 кг')
    fireEvent.change(quantity, { target: { value: '1,2' } })
    expect(alternative.textContent).toBe('3 кг')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить заявку' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(2),
    )
    const saved = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[1]![0].data
      .workspace
    expect(saved.materialRequests[0]).toMatchObject({
      quantity: 1.2,
      altQuantity: 3,
      altUnit: 'кг',
      altUnitFactor: 2.5,
    })
    view.unmount()
    const changedMaterial = structuredClone(saved)
    changedMaterial.lines[0]!.alternativeUnitFactor = 99
    mount(changedMaterial)
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
    fireEvent.click(screen.getByRole('button', { name: /Редактировать/ }))
    dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByRole('status', {
        name: 'Количество в альтернативной единице',
      }).textContent,
    ).toBe('118,8 кг')
    fireEvent.change(
      within(dialog).getByPlaceholderText('Количество по заявке, м'),
      { target: { value: '2' } },
    )
    expect(
      within(dialog).getByRole('status', {
        name: 'Количество в альтернативной единице',
      }).textContent,
    ).toBe('198 кг')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить изменения' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(3),
    )
    expect(
      vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[2]![0].data.workspace
        .materialRequests,
    ).toEqual([
      {
        ...saved.materialRequests[0],
        quantity: 2,
        altQuantity: 198,
        altUnitFactor: 99,
      },
    ])
  })
  it.each([undefined, null, 99])(
    'updates historical requests with factor %s when editing the material, without opening the requests',
    async (altUnitFactor) => {
      const workspace = base()
      workspace.configuredUnits.push('кг', 'т')
      workspace.materialRequests = [1, 2].map((quantity) => ({
        id: `request-${quantity}`,
        projectLineId: 'line-0',
        projectMaterialName: 'Альфа',
        projectUnit: 'м',
        materialId: 'TEST-0',
        cipher: 'ТЕСТ',
        date: '2026-10-14',
        number: `OLD-${quantity}`,
        quantity,
        requester: 'Иван',
        note: 'Прежнее примечание',
        altUnit: 'кг',
        altQuantity: 111,
        ...(altUnitFactor !== undefined ? { altUnitFactor } : {}),
      }))
      mount(workspace)
      expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
      function editConversion(unit: string, factor: string) {
        fireEvent.click(
          within(screen.getByRole('row', { name: /Альфа/ })).getByRole(
            'button',
            {
              name: 'Редактировать материал',
            },
          ),
        )
        const dialog = screen.getByRole('dialog')
        fireEvent.change(within(dialog).getByRole('combobox'), {
          target: { value: 'Оборудование' },
        })
        fireEvent.change(
          within(dialog).getByRole('textbox', {
            name: 'Альтернативная единица измерения',
          }),
          { target: { value: unit } },
        )
        fireEvent.change(
          within(dialog).getByRole('textbox', {
            name: 'Количество альтернативных единиц на одну основную',
          }),
          { target: { value: factor } },
        )
        fireEvent.click(
          within(dialog).getByRole('button', { name: 'Сохранить' }),
        )
      }
      editConversion('кг', '2,5')
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
      )
      const saved = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[0]![0]
        .data.workspace
      expect(saved.materialRequests).toEqual(
        workspace.materialRequests.map((entry) => ({
          ...entry,
          altUnit: 'кг',
          altQuantity: Number(entry.quantity) * 2.5,
          altUnitFactor: 2.5,
        })),
      )
      editConversion('т', '0,1')
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(2),
      )
      const recalculated = vi.mocked(saveProjectWorkspaceSnapshot).mock
        .calls[1]![0].data.workspace
      expect(recalculated.materialRequests).toEqual(
        workspace.materialRequests.map((entry) => ({
          ...entry,
          altUnit: 'т',
          altQuantity: Number(entry.quantity) * 0.1,
          altUnitFactor: 0.1,
        })),
      )
      editConversion('', '')
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(3),
      )
      expect(
        vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[2]![0].data.workspace
          .materialRequests,
      ).toEqual(recalculated.materialRequests)
      fireEvent.click(screen.getByRole('button', { name: 'Операции' }))
      fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
      fireEvent.click(
        screen.getAllByRole('button', { name: /Редактировать/ })[0]!,
      )
      const dialog = screen.getByRole('dialog')
      expect(
        within(dialog).queryByRole('textbox', {
          name: 'Альтернативная единица измерения',
        }),
      ).toBeNull()
      expect(
        within(dialog).getByRole('status', {
          name: 'Количество в альтернативной единице',
        }).textContent,
      ).toMatch(/ т$/)
      cleanup()
      const loaded = structuredClone(workspace)
      loaded.lines[0]!.alternativeUnit = 'т'
      loaded.lines[0]!.alternativeUnitFactor = 0.25
      mount(loaded)
      fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
      fireEvent.click(screen.getByRole('button', { name: /^OLD-1/ }))
      expect(
        within(screen.getByRole('row', { name: /Альфа/ })).getByRole('cell', {
          name: '0,25',
        }),
      ).toBeTruthy()
      fireEvent.click(
        screen.getAllByRole('button', { name: /Редактировать/ })[0]!,
      )
      const loadedDialog = screen.getByRole('dialog')
      fireEvent.click(
        within(loadedDialog).getByRole('button', { name: /^Заполненные/ }),
      )
      const loadedQuantity = within(loadedDialog).getByRole('status', {
        name: 'Количество в альтернативной единице',
      })
      expect(loadedQuantity.textContent).toBe('0,25 т')
      fireEvent.click(
        within(loadedDialog).getByRole('button', { name: 'Отмена' }),
      )
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(3)
    },
  )
  it('keeps legacy alternatives read-only and requires a base coefficient only when changing quantity', async () => {
    const workspace = conversionWorkspace()
    delete workspace.lines[0]!.alternativeUnitFactor
    workspace.materialRequests[0]!.altQuantity = 111
    workspace.materialRequests[0]!.altUnit = 'уп'
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
    fireEvent.click(screen.getByRole('button', { name: /Редактировать/ }))
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).queryByRole('textbox', { name: /альтернативн/i }),
    ).toBeNull()
    expect(
      within(dialog).getByRole('status', {
        name: 'Количество в альтернативной единице',
      }).textContent,
    ).toBe('111 уп')
    const quantity = within(dialog).getByPlaceholderText(
      'Количество по заявке, м',
    )
    const save = within(dialog).getByRole<HTMLButtonElement>('button', {
      name: 'Сохранить изменения',
    })
    fireEvent.change(quantity, { target: { value: '3' } })
    expect(save.disabled).toBe(true)
    expect(
      within(dialog).getByText(/Для изменения количества настройте/),
    ).toBeTruthy()
    fireEvent.change(quantity, { target: { value: '8' } })
    fireEvent.change(within(dialog).getByPlaceholderText('Примечание'), {
      target: { value: 'Уточнение' },
    })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialRequests[0]).toMatchObject({
      quantity: 8,
      altQuantity: 111,
      altUnit: 'уп',
      note: 'Уточнение',
    })
  })
  it.each([
    { altUnit: 'уп', altQuantity: 111, valid: true },
    { altUnit: ' КГ ', altQuantity: 111, valid: true },
    { altUnit: '', altQuantity: '', valid: true },
    { altUnit: 'кг', altQuantity: 112, valid: true },
  ])(
    'recalculates Excel request alternatives regardless of cached values: $altQuantity $altUnit',
    async ({ altUnit, altQuantity, valid }) => {
      const workspace = base()
      workspace.configuredUnits = ['м', 'кг']
      workspace.lines[0]!.alternativeUnit = 'кг'
      workspace.lines[0]!.alternativeUnitFactor = 55.5
      mount(workspace)
      const dialog = openRequest()
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Импорт Excel' }),
      )
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          [],
          [],
          [],
          [],
          [
            'ID позиции',
            'Количество по заявке',
            'Количество в альтернативной единице',
            'Альтернативная единица измерения',
          ],
          ['line-0', 2, altQuantity, altUnit],
          ['line-1', '', '', 'кг'],
        ]),
        'Заявка',
      )
      const buffer = XLSX.write(workbook, {
        bookType: 'xlsx',
        type: 'array',
      }) as ArrayBuffer
      const file = new File([buffer], 'request.xlsx')
      Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer })
      fireEvent.change(dialog.querySelector('input[type="file"]')!, {
        target: { files: [file] },
      })
      await within(dialog).findByText('Позиций в файле')
      const apply = within(dialog).getByRole<HTMLButtonElement>('button', {
        name: 'Применить импорт',
      })
      expect(apply.disabled).toBe(!valid)
      expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
      fireEvent.click(apply)
      expect(
        within(dialog).getByRole('status', {
          name: 'Количество в альтернативной единице',
        }).textContent,
      ).toBe('111 кг')
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Сохранить заявку' }),
      )
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
      )
      expect(
        vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[0]![0].data.workspace
          .materialRequests[0],
      ).toMatchObject({
        altUnit: 'кг',
        altQuantity: 111,
        quantity: 2,
      })
    },
  )
  it.each([true, false])(
    'creates and renames materials with free-text project names (empty workspace: %s)',
    async (empty) => {
      const workspace = base()
      if (empty) workspace.lines = []
      const view = mount(workspace)
      fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
      fireEvent.click(screen.getByRole('button', { name: 'Материал' }))
      let dialog = screen.getByRole('dialog')
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Создать вручную' }),
      )
      fireEvent.change(within(dialog).getByRole('combobox'), {
        target: { value: 'Оборудование' },
      })
      const name = within(dialog).getByRole('textbox', {
        name: 'Наименование по проекту',
      })
      const create = within(dialog).getByRole<HTMLButtonElement>('button', {
        name: 'Создать комбинацию',
      })
      for (const value of ['', '   ']) {
        fireEvent.change(name, { target: { value } })
        expect(create.disabled).toBe(true)
      }
      expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
      fireEvent.change(name, { target: { value: '  Труба 666x9  ' } })
      expect(create.disabled).toBe(false)
      fireEvent.click(create)
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
      )
      const saved = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[0]![0]
        .data.workspace
      expect(saved.lines).toHaveLength(workspace.lines.length + 1)
      expect(saved.lines.slice(1)).toEqual(workspace.lines)
      expect(saved.lines[0]).toMatchObject({
        id: expect.stringMatching(/^line-/),
        projectMaterialName: 'Труба 666x9',
      })

      view.unmount()
      mount(saved)
      fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
      const row = screen.getByRole('row', { name: /Труба 666x9/ })
      fireEvent.click(
        within(row).getByRole('button', { name: 'Редактировать материал' }),
      )
      dialog = screen.getByRole('dialog')
      fireEvent.change(
        within(dialog).getByRole('textbox', {
          name: 'Наименование по проекту',
        }),
        { target: { value: 'Труба 777x10 — новое название' } },
      )
      const save = within(dialog).getByRole<HTMLButtonElement>('button', {
        name: 'Сохранить',
      })
      expect(save.disabled).toBe(false)
      fireEvent.click(save)
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(2),
      )
      const updated = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[1]![0]
        .data.workspace
      expect(updated.lines).toEqual([
        {
          ...saved.lines[0],
          projectMaterialName: 'Труба 777x10 — новое название',
        },
        ...workspace.lines,
      ])
    },
  )
  it('opens saved data without a write and filters filled requests by positive finite quantity', () => {
    mount()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    const dialog = openRequest()
    expect(
      within(dialog).getByRole('button', { name: /^Все\s*2$/ }),
    ).toBeTruthy()
    const quantities = within(dialog).getAllByPlaceholderText(
      'Количество по заявке, м',
    )
    for (const quantity of ['', '0', '-2', 'Infinity', 'abc']) {
      fireEvent.change(quantities[0]!, { target: { value: quantity } })
      expect(
        within(dialog).getByRole('button', { name: /^Заполненные\s*0$/ }),
      ).toBeTruthy()
    }
    fireEvent.change(quantities[0]!, { target: { value: '1,5' } })
    fireEvent.click(
      within(dialog).getByRole('button', { name: /^Заполненные\s*1$/ }),
    )
    expect(
      within(dialog).getAllByPlaceholderText('Количество по заявке, м'),
    ).toHaveLength(1)
    expect(within(dialog).queryByText('Бета')).toBeNull()
    const search = within(dialog).getByPlaceholderText(
      'Поиск по наименованию, нормативному документу, составу или массе',
    )
    fireEvent.change(search, { target: { value: 'Бета' } })
    expect(
      within(dialog).getByRole('button', { name: /^Заполненные\s*0$/ }),
    ).toBeTruthy()
    fireEvent.change(search, { target: { value: '' } })
    expect(
      within(dialog).getByRole('button', { name: /^Заполненные\s*1$/ }),
    ).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })
  it('creates a request, reloads it, cancels deletion, then confirms deletion without losing project lines', async () => {
    const view = mount()
    let dialog = openRequest()
    fireEvent.change(
      within(dialog).getAllByPlaceholderText('Количество по заявке, м')[0]!,
      { target: { value: '2' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить заявку' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    const saved = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[0]![0].data
      .workspace
    expect(saved.materialRequests).toHaveLength(1)
    expect(saved.materialRequests[0]).toMatchObject({
      projectLineId: 'line-0',
      quantity: 2,
    })
    view.unmount()
    mount(saved)
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
    fireEvent.click(screen.getByRole('button', { name: /Редактировать/ }))
    dialog = screen.getByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Удалить заявку' }),
    )
    const cancelButtons = within(dialog).getAllByRole('button', {
      name: 'Отмена',
    })
    fireEvent.click(cancelButtons[0]!)
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1)
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Удалить заявку' }),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(2),
    )
    const deleted = vi.mocked(saveProjectWorkspaceSnapshot).mock.calls[1]![0]
      .data.workspace
    expect(deleted.materialRequests).toHaveLength(0)
    expect(deleted.lines).toEqual(saved.lines)
  })
  it('reports a concurrent edit instead of silently overwriting it', async () => {
    vi.mocked(saveProjectWorkspaceSnapshot).mockResolvedValue({
      status: 'conflict',
    })
    mount()
    const dialog = openRequest()
    fireEvent.change(
      within(dialog).getAllByPlaceholderText('Количество по заявке, м')[0]!,
      { target: { value: '1' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить заявку' }),
    )
    await screen.findByText(/Данные изменены в другой вкладке/)
    expect(
      screen.getByRole('button', { name: 'Скачать текущую копию' }),
    ).toBeTruthy()
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1)
  })
})

it.each([
  {
    requested: 0,
    received: 0,
    signed: 0,
    deleted: false,
    tone: 'border-stone-200',
  },
  {
    requested: 1,
    received: 0,
    signed: 0,
    deleted: false,
    tone: 'border-blue-200',
  },
  {
    requested: 10,
    received: 10,
    signed: 0,
    deleted: false,
    tone: 'border-amber-200',
  },
  {
    requested: 10,
    received: 10,
    signed: 10,
    deleted: false,
    tone: 'border-emerald-200',
  },
  {
    requested: 11,
    received: 0,
    signed: 0,
    deleted: false,
    tone: 'border-rose-300',
  },
  {
    requested: 1,
    received: 0,
    signed: 0,
    deleted: true,
    tone: 'border-slate-300',
  },
])(
  'preserves overview status styling: $tone',
  ({ requested, received, signed, deleted, tone }) => {
    const workspace = base()
    if (requested)
      workspace.materialRequests = [
        {
          id: 'request-1',
          projectLineId: 'line-0',
          projectMaterialName: 'Альфа',
          projectUnit: 'м',
          materialId: 'TEST-0',
          cipher: 'ТЕСТ',
          date: '2026-10-14',
          number: 'TEST-REQUEST',
          quantity: requested,
          requester: '',
          note: '',
          altUnit: '',
          altQuantity: null,
        },
      ]
    if (received)
      workspace.materialReceipts = [
        {
          id: 'receipt-1',
          requestId: 'request-1',
          projectLineId: 'line-0',
          actualName: 'Альфа',
          date: '2026-10-14',
          quantity: received,
          projectUnit: 'м',
          invoiceNumber: '',
          certificate: '',
          qualityDocument: '',
          customerArvk: '',
          customerReceiptDocument: '',
          technicalDecision: '',
          manufacturer: '',
          heatBatch: '',
          factoryNumber: '',
          note: '',
          altUnit: '',
          altQuantity: null,
        },
      ]
    if (signed)
      workspace.qualityControls = [
        {
          id: 'qc-1',
          receiptId: 'receipt-1',
          projectLineId: 'line-0',
          date: '2026-10-14',
          quantity: signed,
          status: 'signed',
          arvkNumber: 'ARVK-TEST',
          arvkDate: '2026-10-14',
          zniNumber: '',
          author: '',
          comment: '',
        },
      ]
    if (deleted)
      workspace.lines = workspace.lines.filter((line) => line.id !== 'line-0')
    mount(workspace)
    const card = screen.getByText('Альфа').closest('div.border-2')
    expect(card?.classList.contains(tone)).toBe(true)
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  },
)
