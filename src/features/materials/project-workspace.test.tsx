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
import * as XLSX from 'xlsx'
import { getGridApi } from 'ag-grid-community'
import { localDateInputValue } from './calendar-date'
import {
  gridCell,
  editGridQuantity,
  editGridMaterial,
  filterGridName,
  projectGridApi,
  operationRowAction,
  operationGridApi,
} from './project-grid-test-support'
import { ProjectWorkspace } from './project-workspace'
import { saveProjectWorkspaceSnapshot } from './functions'
import { workspaceSnapshotSchema } from './workspace-snapshot'
import {
  emptyQualityWorkflow,
  newInspection,
  currentInspection,
  signInspection,
  createAcceptedInspectionAct,
  localToday,
  validateQualityWorkspace,
  recordCustomerReturn,
} from './quality-workflow'
import { documentInspectionFixture } from './quality-workflow.fixtures'

// End-to-end workspace scenarios mount several real, unvirtualized grids in jsdom.
vi.setConfig({ testTimeout: 20000 })

vi.mock('./functions', () => ({
  saveProjectWorkspaceSnapshot: vi.fn(),
}))
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
  addReceiptDocuments(workspace)
  return render(
    <ProjectWorkspace initialStoredData={{ workspace, revision: 'initial' }} />,
  )
}
function openRequest(materialType = 'Трубопровод') {
  fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Создать заявку' })[0]!)
  const dialog = screen.getByRole('dialog')
  const selects = within(dialog).getAllByRole('combobox')
  fireEvent.change(selects[0]!, { target: { value: 'ТЕСТ' } })
  fireEvent.click(within(dialog).getByRole('checkbox', { name: materialType }))
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

function requestMetricValue(number: string, label: string) {
  const card = screen
    .getByText(number, { exact: true })
    .closest('[id^="operation-requests-"]') as HTMLElement
  return within(card).getByText(label, { exact: true }).nextElementSibling
    ?.textContent
}

it('shows receipt completion per request position and remaining quantities by unit without offsetting missing materials', async () => {
  const workspace = conversionWorkspace()
  const request = workspace.materialRequests[0]!
  workspace.lines = base().lines
  workspace.lines[0]!.unit = 'шт'
  workspace.materialRequests = [
    { ...request, number: 'MIXED', quantity: 4, projectUnit: 'шт' },
    {
      ...request,
      id: 'beta',
      number: 'MIXED',
      projectLineId: 'line-1',
      projectMaterialName: 'Бета',
      quantity: 8.5,
    },
    {
      ...request,
      id: 'gamma',
      number: 'MIXED',
      projectLineId: 'deleted-line',
      projectMaterialName: 'Гамма',
      quantity: 2,
      projectUnit: 'шт',
    },
    {
      ...request,
      id: 'delta',
      number: 'MIXED',
      projectLineId: 'delta-line',
      projectMaterialName: 'Дельта',
      quantity: 0.8,
    },
    {
      ...request,
      id: 'other-request',
      number: 'OTHER',
      projectLineId: 'deleted-line',
      projectMaterialName: 'Гамма',
      quantity: 2,
      projectUnit: 'шт',
    },
  ]
  workspace.materialReceipts = [
    { ...legacyReceipt(), quantity: 5, projectUnit: 'шт' },
    ...['beta', 'delta'].flatMap((requestId) =>
      [0.1, 0.7].map((quantity, index) => ({
        ...legacyReceipt(),
        id: `${requestId}-${index}`,
        requestId,
        quantity,
        projectLineId: requestId === 'beta' ? 'line-1' : 'delta-line',
        actualName: requestId === 'beta' ? 'Бета' : 'Дельта',
      })),
    ),
    {
      ...legacyReceipt(),
      id: 'other-receipt',
      requestId: 'other-request',
      projectLineId: 'deleted-line',
      actualName: 'Гамма',
      quantity: 2,
      projectUnit: 'шт',
    },
  ]
  mount(workspace)
  fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
  expect(requestMetricValue('MIXED', 'Получено позиций')).toBe('2 из 4')
  expect(requestMetricValue('MIXED', 'Заявлено')).toBe('6 шт · 9,3 м')
  expect(requestMetricValue('MIXED', 'Осталось получить')).toBe('2 шт · 7,7 м')
  expect(requestMetricValue('OTHER', 'Получено позиций')).toBe('1 из 1')
  expect(requestMetricValue('OTHER', 'Осталось получить')).toBe('0 шт')
  const mixedCard = screen
    .getByText('MIXED', { exact: true })
    .closest('[id^="operation-requests-"]') as HTMLElement
  const completedCard = screen
    .getByText('OTHER', { exact: true })
    .closest('[id^="operation-requests-"]') as HTMLElement
  expect(within(mixedCard).queryByText(/Получена полностью/)).toBeNull()
  expect(within(completedCard).getByText(/Получена полностью/)).toBeTruthy()
  expect(completedCard.classList.contains('border-emerald-200')).toBe(true)
  fireEvent.click(within(completedCard).getByRole('button', { name: /^OTHER/ }))
  expect(completedCard.classList.contains('border-emerald-200')).toBe(true)
  expect(completedCard.classList.contains('ring-emerald-200')).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: 'Поиск заявок' }), {
    target: { value: 'Альфа' },
  })
  expect(requestMetricValue('MIXED', 'Получено позиций')).toBe('2 из 4')
  fireEvent.click(screen.getByRole('button', { name: /^MIXED/ }))
  const grid = await operationGridApi('request:MIXED')
  const quantities = ['quantity', 'received', 'remaining']
  expect(
    quantities.map((colKey) => grid.getColumnDef(colKey)?.headerName),
  ).toEqual(['Заявлено', 'Получено', 'Осталось получить'])
  expect(
    Array.from({ length: grid.getDisplayedRowCount() }, (_, index) => {
      const row = grid.getDisplayedRowAtIndex(index)!
      return ['name', 'unit', ...quantities].map((colKey) =>
        grid.getCellValue({ rowNode: row, colKey }),
      )
    }),
  ).toEqual([
    ['Альфа', 'шт', 4, 5, 0],
    ['Бета', 'м', 8.5, 0.8, 7.7],
    ['Гамма', 'шт', 2, 0, 2],
    ['Дельта', 'м', 0.8, 0.8, 0],
  ])
  expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
})

it('saves and reopens a mixed request with its common note and protects populated type selections', async () => {
  const workspace = base()
  workspace.lines[1]!.materialType = 'Арматура'
  workspace.lines[1]!.category = 'Арматура'
  mount(workspace)
  let dialog = openRequest()
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Арматура' }))
  const quantities = within(dialog).getAllByPlaceholderText(
    'Количество по заявке, м',
  )
  fireEvent.change(quantities[0]!, { target: { value: '2' } })
  fireEvent.change(quantities[1]!, { target: { value: '3' } })
  fireEvent.change(within(dialog).getByLabelText('Примечание к заявке'), {
    target: { value: 'Доставить вместе.\nРазгрузка утром.' },
  })
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Арматура' }))
  expect(
    within(dialog).getByRole<HTMLInputElement>('checkbox', { name: 'Арматура' })
      .checked,
  ).toBe(true)
  expect(within(dialog).getByRole('alert').textContent).toContain(
    'очистите количества',
  )
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Сохранить заявку' }),
  )
  await waitFor(() =>
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
  )
  const requests = lastSaved().materialRequests
  expect(requests).toHaveLength(2)
  expect(new Set(requests.map((entry) => entry.number)).size).toBe(1)
  expect(requests[0]!.number).toMatch(/-Материалы$/)
  expect(
    requests.every(
      (entry) => entry.requestNote === 'Доставить вместе.\nРазгрузка утром.',
    ),
  ).toBe(true)
  expect(requests.map((entry) => entry.materialType).sort()).toEqual([
    'Арматура',
    'Трубопровод',
  ])
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
  dialog = screen.getByRole('dialog')
  expect(
    within(dialog)
      .getAllByRole<HTMLInputElement>('checkbox')
      .every((input) => input.checked),
  ).toBe(true)
  expect(
    within(dialog)
      .getAllByPlaceholderText<HTMLInputElement>('Количество по заявке, м')
      .map((input) => input.value)
      .sort(),
  ).toEqual(['2', '3'])
  expect(
    within(dialog).getByLabelText<HTMLTextAreaElement>('Примечание к заявке')
      .value,
  ).toContain('Разгрузка утром.')
})

it('adds M-15 to an existing receipt without another delivery and preserves its original APP', async () => {
  const workspace = conversionWorkspace()
  workspace.qualityWorkflow = {
    version: 1,
    defaults: emptyQualityWorkflow().defaults,
    cases: [],
    receiptDocuments: [
      { id: 'app', kind: 'app', number: 'АПП-1', date: '2026-10-20' },
    ],
  }
  workspace.materialReceipts = [{ ...legacyReceipt(), appDocumentId: 'app' }]
  mount(workspace)
  fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
  expandReceiptGroups()
  fireEvent.click(
    await screen.findByRole('button', { name: 'Редактировать получение' }),
  )
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Номер М-15'), {
    target: { value: 'М15-20' },
  })
  fireEvent.change(within(dialog).getByLabelText('Дата М-15'), {
    target: { value: '2026-10-22' },
  })
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Сохранить изменения' }),
  )
  await waitFor(() =>
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
  )
  expect(lastSaved().materialReceipts).toHaveLength(1)
  expect(lastSaved().materialReceipts[0]).toMatchObject({
    id: 'receipt-legacy',
    quantity: 2,
    appDocumentId: 'app',
    m15DocumentId: expect.any(String),
  })
  expect(lastSaved().qualityWorkflow!.receiptDocuments).toHaveLength(2)
})
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
function addReceiptDocuments(workspace: ReturnType<typeof base>) {
  if (!workspace.materialReceipts.length) return
  const workflow = (workspace.qualityWorkflow ??= emptyQualityWorkflow())
  workflow.receiptDocuments ??= []
  for (const receipt of workspace.materialReceipts) {
    if (receipt.appDocumentId || receipt.m15DocumentId) continue
    const document = {
      id: 'app-' + receipt.id,
      kind: 'app' as const,
      number: String(receipt.invoiceNumber || receipt.id),
      date: String(receipt.date),
    }
    const existing = workflow.receiptDocuments.find(
      (item) =>
        item.kind === document.kind &&
        item.number === document.number &&
        item.date === document.date,
    )
    if (!existing) workflow.receiptDocuments.push(document)
    receipt.appDocumentId = existing?.id ?? document.id
  }
}
function approveReceipts(
  workspace: ReturnType<typeof base>,
  accepted?: number,
) {
  addReceiptDocuments(workspace)
  const workflow = workspace.qualityWorkflow!
  for (const receipt of workspace.materialReceipts) {
    const entry = newInspection(
      workflow,
      [{ receiptId: String(receipt.id), quantity: Number(receipt.quantity) }],
      workspace.materialReceipts as unknown as Parameters<
        typeof newInspection
      >[2],
      workspace.lines as unknown as Parameters<typeof newInspection>[3],
      String(receipt.appDocumentId || receipt.m15DocumentId),
    )
    let rev = currentInspection(entry)
    for (const row of rev.zni.rows)
      Object.assign(row, {
        accepted: accepted ?? row.presented,
        result:
          accepted !== undefined && accepted < row.presented
            ? 'remarks'
            : 'accepted',
        remarks: 'Проверено',
      })
    entry.revisions[0] = signInspection(rev, 'zni', localToday())
    rev = currentInspection(entry)
    rev.avk = createAcceptedInspectionAct(entry)
    rev.avk.number = 'АВК-' + receipt.id
    rev.avk.checks.fill('Проверено')
    rev.avk.conclusion = 'Принято'
    entry.revisions[0] = signInspection(rev, 'avk', localToday())
    workflow.cases.push(entry)
  }
}
function qualityWorkspace() {
  const workspace = conversionWorkspace()
  workspace.materialReceipts = [legacyReceipt()]
  approveReceipts(workspace)
  return workspace
}
function openIssue() {
  fireEvent.click(screen.getByRole('button', { name: /^Выдача/ }))
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Выдать в монтаж' })[0]!,
  )
  return screen.getByRole('dialog')
}
async function editIssue(
  receiptId: string,
  field: string,
  value: string,
  key: 'Enter' | 'Escape' | null = 'Enter',
) {
  const api = await operationGridApi('issue-selection')
  const node = api.getRowNode(receiptId)!
  act(() => api.startEditingCell({ rowIndex: node.rowIndex!, colKey: field }))
  let input: HTMLInputElement | null = null
  await waitFor(() => {
    input = document.querySelector<HTMLInputElement>(
      `[grid-id="issue-selection"] [row-id="${receiptId}"] [col-id="${field}"] input`,
    )
    expect(input).toBeTruthy()
  })
  fireEvent.input(input!, { target: { value } })
  if (key)
    fireEvent.keyDown(input!, {
      key,
      code: key,
      keyCode: key === 'Escape' ? 27 : 13,
    })
  return input!
}

describe('compact issue selection', () => {
  it('selects across 1001 receipts, pages and searches, then saves one document with exact source receipts', async () => {
    const workspace = conversionWorkspace()
    workspace.lines[0]!.plannedQuantity = 2002
    workspace.materialRequests[0]!.quantity = 2002
    workspace.materialReceipts = Array.from({ length: 1001 }, (_, index) => ({
      ...legacyReceipt(),
      id: `lot-${index}`,
      invoiceNumber: `АПП-партия-${index}`,
      heatBatch: `Плавка ${String(index).padStart(4, '0')}`,
    }))
    approveReceipts(workspace)
    mount(workspace)
    const dialog = openIssue()
    // Flush AG Grid's asynchronous ready event after mounting the large fixture.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const api = await operationGridApi('issue-selection')
    expect(api.getDisplayedRowCount()).toBe(1001)
    expect(api.paginationGetPageSize()).toBe(25)
    const mountedRows = () =>
      dialog.querySelectorAll(
        '[grid-id="issue-selection"] .ag-center-cols-container .ag-row',
      ).length
    expect(mountedRows()).toBeLessThanOrEqual(25)
    expect(within(dialog).getAllByLabelText('Документ передачи')).toHaveLength(
      1,
    )
    fireEvent.change(within(dialog).getByLabelText('Документ передачи'), {
      target: { value: 'ПМ-общая' },
    })
    fireEvent.change(within(dialog).getByLabelText('Получатель'), {
      target: { value: 'Бригада 2' },
    })
    await editIssue('lot-0', 'quantity', '0,4')
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    act(() => api.paginationGoToLastPage())
    await editIssue('lot-1000', 'note', 'Для линии 2')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Весь остаток: Альфа' }),
    )
    fireEvent.change(
      within(dialog).getByLabelText('Поиск материалов для выдачи'),
      { target: { value: 'АПП-партия-0500' } },
    )
    expect(api.getDisplayedRowCount()).toBe(1)
    expect(api.getDisplayedRowAtIndex(0)!.id).toBe('lot-500')
    fireEvent.change(
      within(dialog).getByLabelText('Поиск материалов для выдачи'),
      { target: { value: 'Плавка 0500' } },
    )
    await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
    expect(api.getDisplayedRowAtIndex(0)!.id).toBe('lot-500')
    expect(api.paginationGetCurrentPage()).toBe(0)
    fireEvent.change(within(dialog).getByPlaceholderText('Шифр для выдачи'), {
      target: { value: 'ДРУГОЙ' },
    })
    expect(api.getDisplayedRowCount()).toBe(0)
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Только выбранные (2)' }),
    )
    expect(api.getDisplayedRowCount()).toBe(2)
    expect(
      within(dialog).getByRole('status', { name: 'Итог выдачи' }).textContent,
    ).toContain('2,4 м')
    const save = within(dialog).getByRole('button', {
      name: 'Сохранить выдачу',
    })
    fireEvent.click(save)
    fireEvent.click(save)
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialIssues).toEqual([
      expect.objectContaining({
        receiptId: 'lot-0',
        quantity: 0.4,
        altQuantity: 1,
        document: 'ПМ-общая',
        receiver: 'Бригада 2',
        date: localDateInputValue(),
      }),
      expect.objectContaining({
        receiptId: 'lot-1000',
        quantity: 2,
        altQuantity: 5,
        document: 'ПМ-общая',
        receiver: 'Бригада 2',
        note: 'Для линии 2',
        date: localDateInputValue(),
      }),
    ])
    expect(lastSaved().materialReceipts).toHaveLength(1001)
    validateQualityWorkspace(lastSaved(), workspace)
  })

  it('commits the active issue editor before saving, blocks invalid quantities hidden by search and clears a cancelled draft', async () => {
    mount(qualityWorkspace())
    let dialog = openIssue()
    let api = await operationGridApi('issue-selection')
    await editIssue('receipt-legacy', 'quantity', '3', null)
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить выдачу' }),
    )
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    expect(api.getRowNode('receipt-legacy')!.data.quantity).toBe('3')
    expect(
      within(dialog).getByText(/К выдаче доступно только 2 м/),
    ).toBeTruthy()
    fireEvent.change(
      within(dialog).getByLabelText('Поиск материалов для выдачи'),
      { target: { value: 'Нет совпадений' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить выдачу' }),
    )
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Только выбранные (1)' }),
    )
    for (const invalid of ['0', '-1', 'ошибка']) {
      await editIssue('receipt-legacy', 'quantity', invalid)
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Сохранить выдачу' }),
      )
      expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    }
    await editIssue('receipt-legacy', 'quantity', '0,5')
    await editIssue('receipt-legacy', 'quantity', '8', 'Escape')
    expect(api.getRowNode('receipt-legacy')!.data.quantity).toBe('0,5')
    fireEvent.change(within(dialog).getByLabelText('Дата выдачи'), {
      target: { value: '' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить выдачу' }),
    )
    expect(within(dialog).getByText(/корректную дату выдачи/)).toBeTruthy()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Убрать из выдачи: Альфа' }),
    )
    expect(api.getDisplayedRowCount()).toBe(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    dialog = openIssue()
    api = await operationGridApi('issue-selection')
    expect(api.getRowNode('receipt-legacy')!.data.quantity).toBe('')
    expect(
      within(dialog).getByLabelText<HTMLInputElement>('Дата выдачи').value,
    ).toBe(localDateInputValue())
    await editIssue('receipt-legacy', 'quantity', '1,2', null)
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить выдачу' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialIssues[0]).toMatchObject({
      quantity: 1.2,
      altQuantity: 3,
      receiptId: 'receipt-legacy',
    })
  })

  it('offers only the approved balance after rejected returns and previous issues, keeping unsigned receipts out', async () => {
    const workspace = returnScenarioWorkspace()
    workspace.qualityWorkflow = recordCustomerReturn(
      workspace.qualityWorkflow,
      workspace.qualityWorkflow.cases[0]!.id,
      [{ receiptId: 'receipt', quantity: 1 }],
      localToday(),
    )
    workspace.materialIssues = [
      {
        ...savedIssue('receipt'),
        projectLineId: 'line',
        projectUnit: 'шт',
        date: localToday(),
      },
    ]
    workspace.materialReceipts.push({
      ...workspace.materialReceipts[0]!,
      id: 'unsigned',
      quantity: 1,
    })
    mount(workspace)
    const dialog = openIssue()
    const api = await operationGridApi('issue-selection')
    expect(api.getDisplayedRowCount()).toBe(1)
    expect(api.getRowNode('unsigned')).toBeUndefined()
    expect(
      api.getCellValue({
        rowNode: api.getRowNode('receipt')!,
        colKey: 'available',
      }),
    ).toBe(2)
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Весь остаток: Отвод 23х7' }),
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить выдачу' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialIssues[0]).toMatchObject({
      receiptId: 'receipt',
      quantity: 2,
    })
    validateQualityWorkspace(lastSaved(), workspace)
  })
})

function savedIssue(receiptId = 'receipt-legacy') {
  return {
    id: `issue-${receiptId}`,
    receiptId,
    projectLineId: 'line-0',
    quantity: 1,
    date: '2026-10-15',
    document: 'ПМ-1',
    receiver: 'Получатель',
    note: '',
    altQuantity: null,
  }
}
function searchableOperationsWorkspace() {
  const workspace = qualityWorkspace()
  workspace.lines.push({
    ...base().lines[1],
    materialType: 'Оборудование',
    category: 'Оборудование',
    cipher: 'ШИФР-Б',
  })
  workspace.materialRequests.push({
    ...workspace.materialRequests[0],
    id: 'request-beta',
    projectLineId: 'line-1',
    projectMaterialName: 'Бета',
    cipher: 'ШИФР-Б',
    number: 'REQUEST-BETA',
  })
  workspace.materialReceipts.push({
    ...legacyReceipt(),
    id: 'receipt-beta',
    requestId: 'request-beta',
    projectLineId: 'line-1',
    actualName: 'Фактическая Бета',
    invoiceNumber: 'Н-Б',
  })
  workspace.qualityWorkflow!.cases = []
  approveReceipts(workspace)
  workspace.materialIssues = [
    {
      ...savedIssue(),
      document: 'ПМ-А',
      receiver: 'Иванов',
      note: 'На участок',
    },
    {
      ...savedIssue('receipt-beta'),
      projectLineId: 'line-1',
      document: 'ПМ-Б',
      receiver: 'Петров',
      date: '2026-10-12',
      note: 'Цех',
    },
  ]
  return workspace
}
function expandReceiptGroups() {
  for (const button of screen.queryAllByRole('button', { expanded: false })) {
    fireEvent.click(button)
  }
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

it('explains an empty material import and accepts a corrected file with cipher quantities', async () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
  fireEvent.click(screen.getAllByRole('button', { name: /^Excel/ })[0]!)
  fireEvent.click(screen.getByRole('button', { name: 'Импорт проектной базы' }))
  const dialog = screen.getByRole('dialog')
  const apply = within(dialog).getByRole<HTMLButtonElement>('button', {
    name: 'Применить',
  })
  function upload(quantities: Record<string, string | number>) {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          'Наименование по проекту': 'Гамма',
          'Ед. изм.': 'м',
          ...quantities,
        },
      ]),
      'Проектная база',
    )
    const buffer = XLSX.write(workbook, {
      type: 'array',
      bookType: 'xlsx',
    }) as ArrayBuffer
    const file = new File([buffer], 'materials.xlsx')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer })
    fireEvent.change(dialog.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })
  }
  upload({})
  expect((await within(dialog).findByRole('alert')).textContent).toContain(
    'Нет позиций с количеством',
  )
  expect(apply.disabled).toBe(true)
  expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()

  upload({ Шифр: 'ТЕСТ', Количество: 2.5 })
  await waitFor(() => expect(apply.disabled).toBe(false))
  expect(within(dialog).queryByRole('alert')).toBeNull()
  expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  fireEvent.click(apply)
  await waitFor(() =>
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
  )
  expect(
    lastSaved().lines.find((line) => line.projectMaterialName === 'Гамма'),
  ).toMatchObject({
    cipher: 'ТЕСТ',
    plannedQuantity: 2.5,
  })
})

describe('cipher reference removal', () => {
  function settings() {
    fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
    fireEvent.click(screen.getByRole('button', { name: 'Настройка' }))
    return screen.getByRole('dialog')
  }
  function remove(dialog: HTMLElement, cipher: string) {
    fireEvent.click(
      within(dialog).getByRole('button', { name: `Удалить ${cipher}` }),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }))
  }
  it('removes empty cipher columns, resets the selected filter and keeps removal after reload', async () => {
    const workspace = base()
    workspace.configuredCiphers.push('НОВЫЙ')
    workspace.lines.forEach((line) => {
      line.plannedQuantity = 0
    })
    let view = mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: 'Проектная база' }))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'ТЕСТ' },
    })
    const dialog = settings()
    remove(dialog, 'ТЕСТ')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().configuredCiphers).toEqual(['НОВЫЙ'])
    expect(lastSaved().lines).toEqual(workspace.lines)
    expect(screen.queryByRole('columnheader', { name: 'ТЕСТ' })).toBeNull()
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('all')
    const saved = lastSaved()
    view.unmount()
    view = mount(saved, true)
    expect(screen.queryByRole('columnheader', { name: 'ТЕСТ' })).toBeNull()
    expect(await screen.findByRole('row', { name: /Альфа/ })).toBeTruthy()
    expect(
      within(settings()).queryByRole('button', { name: 'Удалить ТЕСТ' }),
    ).toBeNull()
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1)
    view.unmount()
  })
  it('does not resurrect previously removed zero allocations or change their document history', async () => {
    const workspace = base()
    workspace.configuredCiphers = ['НОВЫЙ']
    workspace.lines.forEach((line) => {
      line.plannedQuantity = 0
    })
    workspace.materialRequests = conversionWorkspace().materialRequests
    workspace.materialReceipts = [
      { ...legacyReceipt(), altUnit: '', altQuantity: null },
    ]
    approveReceipts(workspace)
    workspace.materialIssues = [savedIssue()]
    const before = structuredClone(workspace)
    mount(workspace)
    const dialog = settings()
    expect(
      within(dialog).queryByRole('button', { name: 'Удалить ТЕСТ' }),
    ).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('columnheader', { name: 'ТЕСТ' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Операции' }))
    fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Создать заявку' }))
    const create = screen.getByRole('dialog')
    expect(within(create).queryByRole('option', { name: 'ТЕСТ' })).toBeNull()
    fireEvent.change(
      within(create).getByPlaceholderText(
        'Поиск по наименованию, нормативному документу, составу или массе',
      ),
      { target: { value: 'Альфа' } },
    )
    expect(within(create).queryByText('Альфа')).toBeNull()
    fireEvent.click(within(create).getByRole('button', { name: 'Отмена' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Редактировать' }),
    )
    const edit = screen.getByRole('dialog')
    expect(
      within(edit).getAllByRole<HTMLSelectElement>('combobox')[0]!.value,
    ).toBe('ТЕСТ')
    expect(within(edit).getByText('Альфа')).toBeTruthy()
    expect(workspace).toEqual(before)
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })
  it('explains why a cipher with planned quantities cannot be removed instead of silently restoring it', async () => {
    const workspace = base()
    workspace.configuredCiphers = [] // legacy quantities are still authoritative
    mount(workspace)
    const dialog = settings()
    remove(dialog, 'ТЕСТ')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Нельзя удалить шифры с заполненным проектным количеством: ТЕСТ',
    )
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(
      await screen.findByRole('columnheader', { name: 'ТЕСТ' }),
    ).toBeTruthy()
  })
  it('allows removing the last empty cipher without deleting the materials', async () => {
    const workspace = base()
    workspace.lines.forEach((line) => {
      line.plannedQuantity = 0
    })
    mount(workspace)
    const dialog = settings()
    remove(dialog, 'ТЕСТ')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().configuredCiphers).toEqual([])
    expect(lastSaved().lines).toEqual(workspace.lines)
    expect(await screen.findByRole('row', { name: /Альфа/ })).toBeTruthy()
    expect(await screen.findByRole('row', { name: /Бета/ })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: 'ТЕСТ' })).toBeNull()
  })
})

describe('receipts grouped by material', () => {
  it('offers only requests with an outstanding item in the new receipt picker, including search', () => {
    const workspace = conversionWorkspace()
    workspace.lines.push(base().lines[1]!)
    workspace.materialRequests[0]!.quantity = 0.8
    const request = workspace.materialRequests[0]!
    workspace.materialRequests.push(
      { ...request, id: 'partial-alpha', number: 'PARTIAL', quantity: 1 },
      {
        ...request,
        id: 'partial-beta',
        number: 'PARTIAL',
        quantity: 2,
        projectLineId: 'line-1',
        projectMaterialName: 'Бета',
      },
      { ...request, id: 'open-request', number: 'OPEN', quantity: 8 },
      { ...request, id: 'over-request', number: 'OVER', quantity: 1 },
    )
    workspace.materialReceipts = [
      { ...legacyReceipt(), quantity: 0.1 },
      { ...legacyReceipt(), id: 'receipt-rest', quantity: 0.7 },
      {
        ...legacyReceipt(),
        id: 'partial-alpha-receipt',
        requestId: 'partial-alpha',
        quantity: 3,
      },
      {
        ...legacyReceipt(),
        id: 'partial-beta-receipt',
        requestId: 'partial-beta',
        quantity: 1,
        projectLineId: 'line-1',
        actualName: 'Бета',
      },
      {
        ...legacyReceipt(),
        id: 'over-receipt',
        requestId: 'over-request',
        quantity: 2,
      },
    ]
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Оформить получение' }))
    const dialog = within(screen.getByRole('dialog'))
    const search = dialog.getByPlaceholderText('Без выбранной заявки')
    fireEvent.focus(search)
    expect(dialog.queryByRole('button', { name: /CONVERSION|OVER/ })).toBeNull()
    // Alpha is over-received, but Beta is short: totals cannot close the whole request.
    expect(dialog.getByRole('button', { name: /PARTIAL/ })).toBeTruthy()
    // The same project material in another request has its own remaining quantity.
    expect(dialog.getByRole('button', { name: /^OPEN/ })).toBeTruthy()
    expect(dialog.getByText(/Показано 2 из 2/)).toBeTruthy()
    fireEvent.change(search, { target: { value: 'CONVERSION' } })
    expect(dialog.getByText('Заявки не найдены')).toBeTruthy()
    expect(dialog.getByText(/Показано 0 из 2/)).toBeTruthy()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it('keeps a completed request available when editing its receipt and hides it when creating a new one', async () => {
    const workspace = conversionWorkspace()
    workspace.materialReceipts = [{ ...legacyReceipt(), quantity: 8 }]
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    expandReceiptGroups()
    fireEvent.click(
      await screen.findByRole('button', { name: /Редактировать/ }),
    )
    let dialog = within(screen.getByRole('dialog'))
    fireEvent.focus(dialog.getByPlaceholderText('CONVERSION'))
    expect(dialog.getByRole('button', { name: /CONVERSION/ })).toBeTruthy()
    fireEvent.change(dialog.getByPlaceholderText('Примечание'), {
      target: { value: 'Уточнение накладной' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Сохранить изменения' }))
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialReceipts[0]).toMatchObject({
      quantity: 8,
      note: 'Уточнение накладной',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Оформить получение' }))
    dialog = within(screen.getByRole('dialog'))
    fireEvent.focus(dialog.getByPlaceholderText('Без выбранной заявки'))
    expect(dialog.queryByRole('button', { name: /CONVERSION/ })).toBeNull()
    expect(dialog.getByText(/Показано 0 из 0/)).toBeTruthy()
    expect(dialog.getByText('Заявки не найдены')).toBeTruthy()
  })

  it('updates receipt totals and removes an empty card after deleting its last row', async () => {
    const workspace = conversionWorkspace()
    workspace.materialReceipts = [
      { ...legacyReceipt(), quantity: 0.1 },
      { ...legacyReceipt(), id: 'receipt-partial', quantity: 0.7 },
    ]
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    expect(screen.getByText('Найдено 1 из 1 материалов')).toBeTruthy()
    expect(screen.getAllByText('0,8 м').length).toBeGreaterThan(0)
    expandReceiptGroups()
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Удалить получение' }))[0]!,
    )
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Удалить',
      }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialReceipts.map((entry) => entry.id)).toEqual([
      'receipt-partial',
    ])
    const savedRequests = structuredClone(lastSaved().materialRequests)
    expect(screen.getAllByText('0,7 м').length).toBeGreaterThan(0)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Удалить получение' }),
    )
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Удалить',
      }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(2),
    )
    expect(lastSaved().materialReceipts).toEqual([])
    expect(lastSaved().materialRequests).toEqual(savedRequests)
    expect(screen.getByRole('button', { name: /^Получение\s*0$/ })).toBeTruthy()
    expect(screen.queryByRole('button', { expanded: true })).toBeNull()
  })

  function workspaceWithReceipts() {
    const workspace = conversionWorkspace()
    workspace.lines.push({ ...base().lines[1]!, unit: 'шт' })
    workspace.materialRequests.push(
      {
        ...workspace.materialRequests[0]!,
        id: 'request-beta',
        projectLineId: 'line-1',
        projectMaterialName: 'Бета',
        projectUnit: 'шт',
        quantity: 4,
      },
      {
        ...workspace.materialRequests[0]!,
        id: 'request-pending',
        projectLineId: 'line-pending',
        projectMaterialName: 'Гамма',
        quantity: 3,
      },
      {
        ...workspace.materialRequests[0]!,
        id: 'request-other',
        number: 'OTHER',
        projectMaterialName: 'Другая заявка',
      },
    )
    workspace.materialReceipts = [
      legacyReceipt(),
      {
        ...legacyReceipt(),
        id: 'receipt-partial',
        date: '2026-10-16',
        quantity: 1,
        invoiceNumber: 'Н-2',
        actualName: 'Замена Альфы',
      },
      {
        ...legacyReceipt(),
        id: 'receipt-beta',
        requestId: 'request-beta',
        projectLineId: 'line-1',
        projectUnit: 'шт',
        actualName: 'Бета',
        quantity: 2,
        altUnit: 'т',
        altQuantity: 0.2,
      },
    ]
    return workspace
  }

  it('groups the same material across dates, invoices, requests and ciphers while keeping every receipt row', async () => {
    const workspace = workspaceWithReceipts()
    workspace.materialReceipts.push({
      ...legacyReceipt(),
      id: 'receipt-same',
      quantity: 1,
    })
    workspace.lines.push({
      ...workspace.lines[0]!,
      id: 'line-other-cipher',
      cipher: 'ТК2',
    })
    workspace.materialRequests.push({
      ...workspace.materialRequests[0]!,
      id: 'request-other-cipher',
      projectLineId: 'line-other-cipher',
      cipher: 'ТК2',
      number: 'ANOTHER',
    })
    workspace.materialReceipts.push({
      ...legacyReceipt(),
      id: 'receipt-another',
      requestId: 'request-other-cipher',
      projectLineId: 'line-other-cipher',
      date: '2026-10-22',
      invoiceNumber: 'Н-3',
      quantity: 1,
    })
    addReceiptDocuments(workspace)
    const before = structuredClone(workspace)
    let view = mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    expect(screen.getByRole('button', { name: /^Получение\s*3$/ })).toBeTruthy()
    expect(screen.getByText('Найдено 3 из 3 материалов')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /^Альфа/, expanded: false }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /^Замена Альфы/, expanded: false }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /^Бета/, expanded: false }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /^CONVERSION|^OTHER/ }),
    ).toBeNull()
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.getByText('4 м')).toBeTruthy()
    expect(screen.getByText('10 кг')).toBeTruthy()
    expect(screen.getByText(/14.10.2026 — 22.10.2026/)).toBeTruthy()
    expect(screen.getByText('2 шт')).toBeTruthy()
    expect(screen.getByText('0,2 т')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: /^Альфа/, expanded: false }),
    )
    const table = within(await screen.findByRole('grid'))
    await waitFor(() =>
      expect(
        table.getAllByRole('button', { name: 'Удалить получение' }),
      ).toHaveLength(3),
    )
    expect(table.getAllByRole('row', { name: /CONVERSION/ })).toHaveLength(2)
    expect(table.getByRole('row', { name: /ANOTHER.*ТК2/ })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск получений' }), {
      target: { value: 'Н-3' },
    })
    expect(screen.getByText('Найдено 1 из 3 материалов')).toBeTruthy()
    expect(
      table.getAllByRole('button', { name: 'Удалить получение' }),
    ).toHaveLength(3)
    view.unmount()
    view = mount(workspace, true)
    expect(
      screen.getByRole('button', { name: /^Альфа/, expanded: true }),
    ).toBeTruthy()
    expect(await screen.findByRole('row', { name: /ANOTHER/ })).toBeTruthy()
    expect(screen.getAllByRole('row', { name: /CONVERSION/ })).toHaveLength(2)
    expect(
      screen.queryByRole('row', { name: /Бета|Гамма|Ещё не получено/ }),
    ).toBeNull()
    expect(workspace).toEqual(before)
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it('keeps equally named materials with different properties, units or unknown historical identities separate', () => {
    const workspace = conversionWorkspace()
    const variants: Array<Record<string, string>> = [
      {},
      { normativeDocument: 'Другой ГОСТ' },
      { material: 'Другая сталь' },
      { materialType: 'Другой тип' },
      { unit: 'шт' },
    ]
    workspace.lines = variants.map((variant, index) => ({
      ...workspace.lines[0]!,
      ...variant,
      id: `variant-${index}`,
    }))
    workspace.materialReceipts = [
      ...workspace.lines.map((line, index) => ({
        ...legacyReceipt(),
        id: `receipt-${index}`,
        projectLineId: String(line.id),
        projectUnit: String(line.unit),
      })),
      {
        ...legacyReceipt(),
        id: 'historical-1',
        projectLineId: 'deleted-line-1',
        requestId: 'deleted-request',
      },
      {
        ...legacyReceipt(),
        id: 'historical-2',
        projectLineId: 'deleted-line-2',
        requestId: 'deleted-request',
      },
    ]
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    expect(screen.getByText('Найдено 7 из 7 материалов')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Получение\s*7$/ })).toBeTruthy()
    expect(
      screen.getAllByRole('button', { name: /^Альфа/, expanded: false }),
    ).toHaveLength(7)
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it('searches receipt groups and restores their expansion and search after reload', async () => {
    const workspace = workspaceWithReceipts()
    let view = mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    const input = screen.getByRole('textbox', { name: 'Поиск получений' })
    for (const value of ['Н-2', '16.10.2026', 'замена']) {
      fireEvent.change(input, { target: { value } })
      expect(screen.getByText('Найдено 1 из 3 материалов')).toBeTruthy()
      expect(screen.getByRole('button', { name: /^Замена Альфы/ })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^Бета/ })).toBeNull()
    }
    fireEvent.change(input, { target: { value: 'Гамма' } })
    expect(screen.getByText('Найдено 0 из 3 материалов')).toBeTruthy()
    expect(
      screen.getByText('Получения по такому запросу не найдены.'),
    ).toBeTruthy()
    fireEvent.change(input, { target: { value: 'CONVERSION' } })
    expect(screen.getByText('Найдено 3 из 3 материалов')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Н-2' } })
    fireEvent.click(
      screen.getByRole('button', { name: /^Замена Альфы/, expanded: false }),
    )
    expect(
      await screen.findByRole('row', { name: /Замена Альфы/ }),
    ).toBeTruthy()
    view.unmount()
    view = mount(workspace, true)
    expect(
      screen.getByRole('button', { name: /^Замена Альфы/, expanded: true }),
    ).toBeTruthy()
    expect(
      await screen.findByRole('row', { name: /Замена Альфы/ }),
    ).toBeTruthy()
    expect(screen.queryByRole('row', { name: /Бета/ })).toBeNull()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    view.unmount()
  })

  it('edits one receipt without replacing another request receipt with the same material, date and invoice', async () => {
    const workspace = conversionWorkspace()
    workspace.materialRequests.push({
      ...workspace.materialRequests[0]!,
      id: 'request-other',
      number: 'OTHER',
    })
    workspace.materialReceipts = [
      legacyReceipt(),
      {
        ...legacyReceipt(),
        id: 'receipt-other',
        requestId: 'request-other',
        note: 'Чужое поступление',
      },
    ]
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    fireEvent.click(
      screen.getByRole('button', { name: /^Альфа/, expanded: false }),
    )
    fireEvent.click(
      operationRowAction(
        await screen.findByRole('row', { name: /CONVERSION/ }),
        'Редактировать получение',
      ),
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText('Примечание'), {
      target: { value: 'Изменено' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить изменения' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialReceipts).toHaveLength(2)
    expect(
      lastSaved().materialReceipts.find(
        (entry) => entry.id === 'receipt-other',
      ),
    ).toMatchObject({
      requestId: 'request-other',
      note: 'Чужое поступление',
      quantity: 2,
    })
    expect(
      lastSaved().materialReceipts.find(
        (entry) => entry.id === 'receipt-legacy',
      )!.note,
    ).toBe('Изменено')
  })

  it('keeps historical receipts without attaching them to a new request for the same material', async () => {
    const workspace = conversionWorkspace()
    workspace.materialReceipts = [
      { ...legacyReceipt(), requestId: 'deleted-request' },
      {
        ...legacyReceipt(),
        id: 'receipt-orphan-2',
        requestId: 'deleted-other-request',
      },
    ]
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    expect(screen.getByRole('button', { name: /^Получение\s*1$/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^CONVERSION/ })).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: /^Альфа/, expanded: false }),
    )
    expect(
      await screen.findAllByRole('button', { name: 'Удалить получение' }),
    ).toHaveLength(2)
    for (const button of screen.getAllByRole<HTMLButtonElement>('button', {
      name: 'Редактировать получение',
    })) {
      expect(button.disabled).toBe(true)
    }
    expect(screen.getAllByRole('row', { name: /Заявка удалена/ })).toHaveLength(
      2,
    )
    expect(screen.queryByRole('row', { name: /CONVERSION/ })).toBeNull()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })
})

describe('request deletion and receipt cards', () => {
  it.each([false, true])(
    'preserves actual receipt cards when a request is deleted and after reload (own receipt: %s)',
    async (hasReceipt) => {
      const workspace = conversionWorkspace()
      workspace.lines.push(base().lines[1]!)
      workspace.materialRequests.push(
        {
          ...workspace.materialRequests[0]!,
          id: 'request-unreceived',
          projectLineId: 'line-1',
          projectMaterialName: 'Бета',
          quantity: 4,
        },
        {
          ...workspace.materialRequests[0]!,
          id: 'request-other',
          number: 'OTHER',
          quantity: 2,
        },
      )
      // Another request for the same material must not affect the deletion.
      workspace.materialReceipts = [
        { ...legacyReceipt(), id: 'receipt-other', requestId: 'request-other' },
        ...(hasReceipt ? [legacyReceipt()] : []),
      ]
      const view = mount(workspace)
      fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
      expect(
        screen.getByRole('button', { name: /^Альфа/, expanded: false }),
      ).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Поиск заявок' }), {
        target: { value: 'CONVERSION' },
      })
      fireEvent.click(
        await screen.findByRole('button', { name: /Редактировать/ }),
      )
      const dialog = screen.getByRole('dialog')
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Удалить заявку' }),
      )
      expect(
        within(dialog).getByText(
          hasReceipt
            ? 'По заявке уже оформлены получения: 1. Они сохранятся во вкладке «Получение» как история удалённой заявки.'
            : 'Получений по заявке нет.',
        ),
      ).toBeTruthy()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }))
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
      )
      const saved = structuredClone(lastSaved())
      expect(saved.materialRequests.map((entry) => entry.id)).toEqual([
        'request-other',
      ])
      expect(saved.materialReceipts.map((entry) => entry.id)).toEqual(
        workspace.materialReceipts.map((entry) => entry.id),
      )
      expect(saved.lines).toEqual(workspace.lines)
      function expectReceiptCards() {
        fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
        expect(screen.queryByRole('button', { name: /^CONVERSION/ })).toBeNull()
        expect(
          screen.getByRole('button', { name: /^Альфа/, expanded: false }),
        ).toBeTruthy()
        expect(screen.getByText(/Заявки: OTHER/)).toBeTruthy()
        expect(screen.getByText('Найдено 1 из 1 материалов')).toBeTruthy()
      }
      expectReceiptCards()
      view.unmount()
      mount(saved)
      expectReceiptCards()
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1)
    },
  )
})

describe('receipt import dates and editing', () => {
  function receiptFile(
    date: string | number,
    invoice = 'Н-Дата',
    quantity = 1.2,
  ) {
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
          'Наименование ТМЦ по факту поступления',
          'Поступило',
          'Номер АПП',
          'Дата поступления',
          'Дата АПП',
        ],
        ['request-conversion', 'Альфа', quantity, invoice, date, '2026-10-20'],
        // Prefilled dates alone must not cause empty template rows to import.
        ['request-conversion', 'Альфа', '', '', '2026-10-20'],
      ]),
      'Получение',
    )
    const buffer = XLSX.write(workbook, {
      type: 'array',
      bookType: 'xlsx',
    }) as ArrayBuffer
    const file = new File([buffer], 'receipt-dates.xlsx')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer })
    return file
  }

  async function uploadReceiptFile(dialog: HTMLElement, file: File) {
    fireEvent.change(dialog.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })
    await waitFor(() =>
      expect(within(dialog).getByRole('status').textContent).toBe(file.name),
    )
  }

  async function importReceiptDate(
    dialog: HTMLElement,
    date: string | number,
    invoice = 'Н-Дата',
  ) {
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Импорт Excel' }),
    )
    await uploadReceiptFile(dialog, receiptFile(date, invoice))
    await within(dialog).findByText('Позиций в файле')
  }

  async function editPreview(
    field: string,
    value: string,
    key: 'Enter' | 'Escape' | null = 'Enter',
    rowNumber = 6,
  ) {
    const api = await operationGridApi('receipt-import')
    const node = api.getRowNode(`${rowNumber}-request-conversion`)!
    act(() => api.startEditingCell({ rowIndex: node.rowIndex!, colKey: field }))
    const cell = document.querySelector(
      `[grid-id="receipt-import"] [row-id="${node.id}"] [col-id="${field}"]`,
    )!
    let input: HTMLInputElement | null = null
    await waitFor(() => {
      input = cell.querySelector('input')
      expect(input).toBeTruthy()
    })
    fireEvent.input(input!, { target: { value } })
    if (key)
      fireEvent.keyDown(input!, {
        key,
        code: key,
        keyCode: key === 'Escape' ? 27 : 13,
      })
    return input!
  }

  it('corrects invalid imports in the grid, preserves service fields and calculates alternatives on save', async () => {
    mount(conversionWorkspace())
    const dialog = openReceipt()
    await importReceiptDate(dialog, '31.02.2026', '')
    const apply = within(dialog).getByRole<HTMLButtonElement>('button', {
      name: 'Применить импорт',
    })
    expect(apply.disabled).toBe(true)
    const api = await operationGridApi('receipt-import')
    for (const field of ['row', 'name', 'unit', 'status']) {
      expect(
        api
          .getColumn(field)!
          .isCellEditable(api.getRowNode('6-request-conversion')!),
      ).toBe(false)
    }
    await editPreview('appNumber', 'Н-Исправлено')
    await editPreview('date', '21.10.2026')
    expect(apply.disabled).toBe(false)
    await editPreview('quantity', '9')
    expect(
      await within(dialog).findByText(/Поступление превышает остаток/),
    ).toBeTruthy()
    expect(apply.disabled).toBe(true)
    await editPreview('quantity', '2,5')
    await editPreview('certificate', 'Паспорт-7')
    await editPreview('factoryNumber', 'Зав-8')
    await editPreview('qualityDocument', 'Качество-9')
    await editPreview('customerArvk', 'АРВК-10')
    await editPreview('technicalDecision', 'ТР-11')
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    fireEvent.click(apply)
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Сохранить получение' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().qualityWorkflow!.receiptDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'app', number: 'Н-Исправлено' }),
      ]),
    )
    expect(lastSaved().materialReceipts).toHaveLength(1)
    expect(lastSaved().materialReceipts[0]).toMatchObject({
      quantity: 2.5,
      altQuantity: 6.25,
      altUnit: 'кг',
      date: '2026-10-21',
      appDocumentId: expect.any(String),
      certificate: 'Паспорт-7',
      factoryNumber: 'Зав-8',
      qualityDocument: 'Качество-9',
      customerArvk: 'АРВК-10',
      technicalDecision: 'ТР-11',
    })
  })

  it('commits the active editor before Apply and does not apply a newly invalid value', async () => {
    mount(conversionWorkspace())
    const dialog = openReceipt()
    await importReceiptDate(dialog, '20.10.2026')
    const apply = within(dialog).getByRole<HTMLButtonElement>('button', {
      name: 'Применить импорт',
    })
    await editPreview('appNumber', '', null)
    fireEvent.click(apply)
    expect(
      await within(dialog).findByText(/Укажите номер и корректную дату АПП/),
    ).toBeTruthy()
    expect(apply.disabled).toBe(true)
    await editPreview('appNumber', 'Н-2')
    await editPreview('quantity', '3,5', null)
    fireEvent.click(apply)
    expect(within(dialog).queryByText('Импорт получения из Excel')).toBeNull()
    expect(
      within(dialog).getByPlaceholderText<HTMLInputElement>('Поступило, м'),
    ).toHaveProperty('value', '3,5')
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it('keeps invalid text in the editor and Escape cancels only the edit', async () => {
    mount(conversionWorkspace())
    const dialog = openReceipt()
    await importReceiptDate(dialog, '20.10.2026')
    const input = await editPreview('quantity', 'не число')
    const api = await operationGridApi('receipt-import')
    expect(api.getEditingCells()).toHaveLength(1)
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Применить импорт' }),
    )
    expect(within(dialog).getByText('Импорт получения из Excel')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape', keyCode: 27 })
    expect(api.getEditingCells()).toHaveLength(0)
    expect(within(dialog).getByText('Импорт получения из Excel')).toBeTruthy()
    expect(api.getRowNode('6-request-conversion')!.data.row.row.quantity).toBe(
      1.2,
    )
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it('allows uploading immediately and replaces the entire draft with a corrected file of the same name', async () => {
    mount(conversionWorkspace())
    const dialog = openReceipt()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Импорт Excel' }),
    )
    const fileInput =
      dialog.querySelector<HTMLInputElement>('input[type="file"]')!
    const choose = vi.spyOn(fileInput, 'click')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Загрузить файл',
      }),
    )
    expect(choose).toHaveBeenCalledTimes(1)
    await uploadReceiptFile(dialog, receiptFile('31.02.2026', ''))
    await editPreview('manufacturer', 'Правка в черновике')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Загрузить исправленный файл',
      }),
    )
    expect(choose).toHaveBeenCalledTimes(2)
    await uploadReceiptFile(dialog, receiptFile('23.10.2026', 'Н-Новая', 4))
    const api = await operationGridApi('receipt-import')
    expect(
      api.getRowNode('6-request-conversion')!.data.row.row.manufacturer,
    ).toBe('')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Применить импорт' }),
    )
    expect(
      within(dialog).getByLabelText<HTMLInputElement>('Номер АПП').value,
    ).toBe('Н-Новая')
    expect(
      dialog.querySelector<HTMLInputElement>('input[type="date"]')!.value,
    ).toBe('2026-10-23')
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it('reports a failed replacement and prevents accidentally applying the previous file', async () => {
    mount(conversionWorkspace())
    const dialog = openReceipt()
    await importReceiptDate(dialog, '20.10.2026')
    const badFile = new File([], 'broken.xlsx')
    Object.defineProperty(badFile, 'arrayBuffer', {
      value: async () => {
        throw new Error('Файл повреждён')
      },
    })
    fireEvent.change(dialog.querySelector('input[type="file"]')!, {
      target: { files: [badFile] },
    })
    expect(await within(dialog).findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Файл повреждён'),
    )
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', {
        name: 'Применить импорт',
      }).disabled,
    ).toBe(true)
    await uploadReceiptFile(dialog, receiptFile('24.10.2026'))
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', {
        name: 'Применить импорт',
      }).disabled,
    ).toBe(false)
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it('edits the correct sorted row and rejects duplicate filled request positions', async () => {
    mount(conversionWorkspace())
    const dialog = openReceipt()
    await importReceiptDate(dialog, '20.10.2026')
    const api = await operationGridApi('receipt-import')
    act(() => api.applyColumnState({ state: [{ colId: 'row', sort: 'desc' }] }))
    expect(api.getDisplayedRowAtIndex(0)!.id).toBe('7-request-conversion')
    await editPreview('appNumber', 'Н-Сортировка')
    expect(api.getRowNode('6-request-conversion')!.data.row.row.appNumber).toBe(
      'Н-Сортировка',
    )
    expect(api.getRowNode('7-request-conversion')!.data.row.row.appNumber).toBe(
      '',
    )
    await editPreview('quantity', '1', 'Enter', 7)
    expect(
      within(dialog).getAllByText(/Позиция заявки повторяется в файле/),
    ).toHaveLength(2)
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', {
        name: 'Применить импорт',
      }).disabled,
    ).toBe(true)
    await editPreview('quantity', '', 'Enter', 7)
    expect(
      within(dialog).queryByText(/Позиция заявки повторяется в файле/),
    ).toBeNull()
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', {
        name: 'Применить импорт',
      }).disabled,
    ).toBe(false)
  })

  it('keeps the latest uploaded file if an earlier read completes later', async () => {
    mount(conversionWorkspace())
    const dialog = openReceipt()
    await importReceiptDate(dialog, '20.10.2026')
    const earlier = receiptFile('21.10.2026', 'Н-Старый')
    const earlierBuffer = await earlier.arrayBuffer()
    const slowFile = new File([], 'slow.xlsx')
    let finishRead!: (value: ArrayBuffer) => void
    const pending = new Promise<ArrayBuffer>((resolve) => {
      finishRead = resolve
    })
    Object.defineProperty(slowFile, 'arrayBuffer', { value: () => pending })
    fireEvent.change(dialog.querySelector('input[type="file"]')!, {
      target: { files: [slowFile] },
    })
    await uploadReceiptFile(dialog, receiptFile('22.10.2026', 'Н-Последний'))
    await act(async () => {
      finishRead(earlierBuffer)
      await pending
    })
    const api = await operationGridApi('receipt-import')
    expect(api.getRowNode('6-request-conversion')!.data.row.row.appNumber).toBe(
      'Н-Последний',
    )
    expect(within(dialog).getByRole('status').textContent).toBe(
      'receipt-dates.xlsx',
    )
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it.each([
    ['20.10.2026', '2026-10-20'],
    [42785.75, '2017-02-19'],
    ['', ''],
  ])(
    'retains the imported receipt date %s in the form and saved data',
    async (input, expected) => {
      const view = mount(conversionWorkspace())
      const dialog = openReceipt()
      await importReceiptDate(dialog, input)
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Применить импорт' }),
      )
      const date = expected || localDateInputValue()
      expect(
        dialog.querySelector<HTMLInputElement>('input[type="date"]')!.value,
      ).toBe(date)
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Сохранить получение' }),
      )
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
      )
      const saved = structuredClone(lastSaved())
      expect(saved.materialReceipts).toHaveLength(1)
      expect(saved.materialReceipts[0]).toMatchObject({
        date,
        quantity: 1.2,
        appDocumentId: expect.any(String),
      })
      view.unmount()
      mount(saved)
      fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
      expandReceiptGroups()
      fireEvent.click(
        await screen.findByRole('button', { name: 'Редактировать получение' }),
      )
      expect(
        screen
          .getByRole('dialog')
          .querySelector<HTMLInputElement>('input[type="date"]')!.value,
      ).toBe(date)
    },
  )

  it('reports an invalid date and blocks applying the import without saving anything', async () => {
    mount(conversionWorkspace())
    const dialog = openReceipt()
    await importReceiptDate(dialog, '31.02.2026')
    expect(
      await within(dialog).findByText(/Некорректная дата поступления/),
    ).toBeTruthy()
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', {
        name: 'Применить импорт',
      }).disabled,
    ).toBe(true)
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it('keeps the selected form date when an older template has an empty date', async () => {
    mount(conversionWorkspace())
    const dialog = openReceipt()
    fireEvent.change(dialog.querySelector('input[type="date"]')!, {
      target: { value: '2026-07-13' },
    })
    await importReceiptDate(dialog, '')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Применить импорт' }),
    )
    expect(
      dialog.querySelector<HTMLInputElement>('input[type="date"]')!.value,
    ).toBe('2026-07-13')
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })
})

describe('operation deletion', () => {
  async function startDelete(tab: RegExp, label: string) {
    fireEvent.click(screen.getByRole('button', { name: tab }))
    if (label === 'Удалить получение') expandReceiptGroups()
    fireEvent.click((await screen.findAllByRole('button', { name: label }))[0]!)
    return screen.getByRole('dialog')
  }
  function confirm(dialog: HTMLElement) {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }))
  }
  function cancel(dialog: HTMLElement) {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
  }

  it('blocks receipt deletion when a draft ZNI uses it', async () => {
    const workspace = conversionWorkspace()
    const receipts = [legacyReceipt()]
    workspace.materialReceipts = receipts
    workspace.qualityWorkflow = emptyQualityWorkflow()
    addReceiptDocuments(workspace)
    workspace.qualityWorkflow.cases.push(
      newInspection(
        workspace.qualityWorkflow,
        [{ receiptId: receipts[0]!.id, quantity: 1 }],
        receipts,
        workspace.lines as unknown as Parameters<typeof newInspection>[3],
        String(workspace.materialReceipts[0]!.appDocumentId),
      ),
    )
    mount(workspace)
    const dialog = await startDelete(/^Получение/, 'Удалить получение')
    expect(within(dialog).getByRole('alert').textContent).toContain('ЗНИ')
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Удалить' })
        .disabled,
    ).toBe(true)
    confirm(dialog)
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it.each(['control', 'issue', 'both'] as const)(
    'blocks deleting a receipt with dependent %s records without a partial delete',
    async (dependent) => {
      const workspace = qualityWorkspace()
      workspace.materialReceipts.push({
        ...legacyReceipt(),
        id: 'receipt-second',
      })
      if (dependent === 'issue') workspace.qualityWorkflow!.cases = []
      if (dependent !== 'control') workspace.materialIssues = [savedIssue()]
      mount(workspace)
      const dialog = await startDelete(/^Получение/, 'Удалить получение')
      expect(within(dialog).getByText(/Позиций: 1/)).toBeTruthy()
      expect(within(dialog).getByRole('alert').textContent).toContain(
        dependent === 'issue'
          ? 'Нельзя удалить получение'
          : 'Получение связано с ЗНИ',
      )
      expect(
        within(dialog).getByRole<HTMLButtonElement>('button', {
          name: 'Удалить',
        }).disabled,
      ).toBe(true)
      confirm(dialog)
      cancel(dialog)
      expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
      expect(
        (
          await screen.findAllByRole('button', { name: 'Удалить получение' })
        )[0],
      ).toBeTruthy()
    },
  )

  it('deletes only the selected receipt under a search and preserves other receipts and requests', async () => {
    const workspace = conversionWorkspace()
    workspace.materialReceipts = [
      { ...legacyReceipt(), note: 'Найти эту позицию' },
      { ...legacyReceipt(), id: 'receipt-second', requestId: 'other-request' },
      { ...legacyReceipt(), id: 'receipt-other', invoiceNumber: 'Н-2' },
    ]
    workspace.materialRequests.push({
      ...workspace.materialRequests[0]!,
      id: 'other-request',
      number: 'OTHER',
    })
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    fireEvent.change(
      screen.getByPlaceholderText(
        'Поиск по дате, заявке, АПП, М-15, материалу или замене',
      ),
      {
        target: { value: 'Найти эту позицию' },
      },
    )
    expandReceiptGroups()
    fireEvent.click(
      operationRowAction(
        await screen.findByRole('row', { name: /Найти эту позицию/ }),
        'Удалить получение',
      ),
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Позиций: 1/)).toBeTruthy()
    confirm(dialog)
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
    )
    expect(lastSaved().materialReceipts.map((entry) => entry.id)).toEqual([
      'receipt-second',
      'receipt-other',
    ])
    expect(lastSaved().materialRequests.map((entry) => entry.id)).toEqual([
      'request-conversion',
      'other-request',
    ])
    expect(lastSaved().lines).toEqual(workspace.lines)
  })

  it('deletes only the selected historical issue under search and retries failed persistence', async () => {
    const workspace = searchableOperationsWorkspace()
    workspace.lines = []
    vi.mocked(saveProjectWorkspaceSnapshot).mockRejectedValueOnce(
      new Error('Offline'),
    )
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Выдача/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск выдач' }), {
      target: { value: 'ПМ-А' },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Удалить выдачу' }),
    )
    confirm(screen.getByRole('dialog'))
    await screen.findByText(/Не удалось сохранить на сервере/)
    expect(lastSaved().materialIssues.map((entry) => entry.document)).toEqual([
      'ПМ-Б',
    ])
    expect(lastSaved().qualityControls).toBeUndefined()
    expect(lastSaved().materialReceipts).toEqual(workspace.materialReceipts)
    fireEvent.click(
      screen.getByRole('button', { name: 'Повторить сохранение' }),
    )
    await waitFor(() =>
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(2),
    )
    await waitFor(() =>
      expect(screen.queryByText(/Не удалось сохранить на сервере/)).toBeNull(),
    )
    expect(lastSaved().materialIssues.map((entry) => entry.document)).toEqual([
      'ПМ-Б',
    ])
  })
})

describe('workspace user workflows', () => {
  it('searches issues including historical materials and restores independent searches after reload', async () => {
    const workspace = searchableOperationsWorkspace()
    // The historical receipt and request still identify a deleted project material.
    workspace.lines = workspace.lines.filter((line) => line.id !== 'line-1')
    let view = mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Входной контроль/ }))
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Поиск входного контроля' }),
      { target: { value: 'ШИФР-Б' } },
    )
    expect(screen.getAllByText(/Фактическая Бета/).length).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Выдача/ }))
    let input = screen.getByRole('textbox', { name: 'Поиск выдач' })
    for (const query of [
      '  иВаНоВ  ',
      'ПМ-А',
      '15.10.2026',
      'Альфа',
      'CONVERSION',
      'Н-1',
      'На участок',
    ]) {
      fireEvent.change(input, { target: { value: query } })
      expect(await screen.findByRole('row', { name: /ПМ-А/ })).toBeTruthy()
      expect(screen.queryByRole('row', { name: /ПМ-Б/ })).toBeNull()
      expect(screen.getByText('Найдено 1 из 2 выдач')).toBeTruthy()
    }
    fireEvent.change(input, { target: { value: 'ШИФР-Б' } })
    expect(await screen.findByRole('row', { name: /ПМ-Б/ })).toBeTruthy()
    fireEvent.change(input, { target: { value: 'не существует' } })
    expect(
      screen.getByText('Выдачи по такому запросу не найдены.'),
    ).toBeTruthy()
    expect(screen.getByText('Найдено 0 из 2 выдач')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Иванов' } })
    view.unmount()
    view = mount(workspace, true)
    input = screen.getByRole('textbox', { name: 'Поиск выдач' })
    expect((input as HTMLInputElement).value).toBe('Иванов')
    expect(await screen.findByRole('row', { name: /ПМ-А/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Входной контроль/ }))
    expect(
      screen.getByRole<HTMLInputElement>('textbox', {
        name: 'Поиск входного контроля',
      }).value,
    ).toBe('ШИФР-Б')
    expect((await screen.findAllByText(/Фактическая Бета/))[0]).toBeTruthy()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    view.unmount()
  })

  it.each([true, false])(
    'calculates partial receipts and issues through quality control using only the material coefficient (APP: %s)',
    async (withApp) => {
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
      fireEvent.change(
        within(dialog).getByLabelText(withApp ? 'Номер АПП' : 'Номер М-15'),
        {
          target: { value: 'Н-1' },
        },
      )
      fireEvent.change(
        within(dialog).getByLabelText(withApp ? 'Дата АПП' : 'Дата М-15'),
        { target: { value: '2026-10-22' } },
      )
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
      fireEvent.click(screen.getByRole('button', { name: 'Создать ЗНИ' }))
      fireEvent.change(screen.getByLabelText('Документ получения для ЗНИ'), {
        target: {
          value: lastSaved().qualityWorkflow!.receiptDocuments![0]!.id,
        },
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'Выбрать все позиции документа' }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Продолжить с выбранными материалами',
        }),
      )
      dialog = screen.getByRole('dialog')
      expect(
        within(dialog).queryByRole('textbox', { name: /альтернативн/i }),
      ).toBeNull()
      fireEvent.change(within(dialog).getByLabelText('Результат'), {
        target: { value: 'remarks' },
      })
      fireEvent.change(within(dialog).getByLabelText('Принято, м'), {
        target: { value: '2' },
      })
      fireEvent.change(within(dialog).getByLabelText('Замечания по позиции'), {
        target: { value: 'Остаток требует повторной проверки' },
      })
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Сохранить документы' }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Подписать ЗНИ' }))
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Подтвердить подписание',
        }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Создать АВК' }))
      dialog = screen.getByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText('Номер АВК'), {
        target: { value: 'АВК-1' },
      })
      for (const textarea of within(dialog)
        .getAllByRole('textbox')
        .filter((element) =>
          /^\d+\. /.test(element.parentElement?.textContent ?? ''),
        ))
        fireEvent.change(textarea, { target: { value: 'Проверено' } })
      fireEvent.change(within(dialog).getByLabelText('Заключение комиссии'), {
        target: { value: 'Частичная приёмка' },
      })
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Сохранить документы' }),
      )
      await waitFor(() =>
        expect(lastSaved().qualityWorkflow?.cases).toHaveLength(1),
      )
      for (const kind of ['АВК']) {
        fireEvent.click(
          await screen.findByRole('button', { name: `Подписать ${kind}` }),
        )
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'Подтвердить подписание',
          }),
        )
        await waitFor(() =>
          expect(
            lastSaved().qualityWorkflow!.cases[0]!.revisions[0]![
              kind === 'ЗНИ' ? 'zni' : 'avk'
            ]?.signedOn,
          ).toBeTruthy(),
        )
      }
      expect(lastSaved().qualityControls).toBeUndefined()
      const savesBeforeIssue = vi.mocked(saveProjectWorkspaceSnapshot).mock
        .calls.length
      dialog = openIssue()
      expect(
        within(dialog).queryByRole('textbox', { name: /альтернативн/i }),
      ).toBeNull()
      const issueGrid = await operationGridApi('issue-selection')
      const receiptId = String(lastSaved().materialReceipts[0]!.id)
      await editIssue(receiptId, 'quantity', '0,4')
      expect(
        issueGrid.getCellValue({
          rowNode: issueGrid.getRowNode(receiptId)!,
          colKey: 'alternative',
        }),
      ).toBe('1 кг')
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Сохранить выдачу' }),
      )
      await waitFor(() =>
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(
          savesBeforeIssue + 1,
        ),
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
      expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(
        savesBeforeIssue + 1,
      )
      fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
      expandReceiptGroups()
      fireEvent.click(
        await screen.findByRole('button', { name: /Редактировать/ }),
      )
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
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(
          savesBeforeIssue + 2,
        ),
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
      await editGridMaterial('Альфа')
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
        expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(
          savesBeforeIssue + 3,
        ),
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
    },
  )
  it('preserves historical receipt values without manual fields and blocks quantity changes until conversion is configured', async () => {
    const workspace = conversionWorkspace()
    delete workspace.lines[0]!.alternativeUnitFactor
    workspace.materialReceipts = [legacyReceipt()]
    mount(workspace)
    fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
    expandReceiptGroups()
    fireEvent.click(
      await screen.findByRole('button', { name: /Редактировать/ }),
    )
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
  it('keeps alternative receipt totals in different units separate', async () => {
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
          'Номер АПП',
          'Наименование ТМЦ по факту поступления',
          'Дата АПП',
        ],
        [
          'request-conversion',
          1.2,
          999,
          'уп',
          'Н-Excel',
          'Альфа',
          '2026-10-20',
        ],
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
  it('remembers visible project columns without saving materials or leaving hidden filters active', async () => {
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
    let table = screen.getByRole('grid')
    await filterGridName('Альфа')
    expect((await projectGridApi()).getDisplayedRowCount()).toBe(1)
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
    await waitFor(() =>
      expect(getGridApi('project-materials')!.getDisplayedRowCount()).toBe(2),
    )
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
    table = screen.getByRole('grid')
    await projectGridApi()
    expect(
      within(table).queryByRole('columnheader', { name: 'Тип материала' }),
    ).toBeNull()
    expect(
      within(table).queryByRole('columnheader', { name: 'ТЕСТ' }),
    ).toBeNull()
    expect(
      await within(table).findByRole('columnheader', { name: 'ТЕСТ3' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Настроить столбцы' }))
    settings = screen.getByRole('group', { name: 'Отображаемые столбцы' })
    fireEvent.click(
      within(settings).getByRole('button', { name: 'Показать все' }),
    )
    expect(within(table).getByRole('gridcell', { name: 'Бета' })).toBeTruthy()
    expect(
      getGridApi('project-materials')!.getAllDisplayedColumns(),
    ).toHaveLength(12)
    for (const checkbox of within(settings).getAllByRole('checkbox')) {
      fireEvent.click(checkbox)
    }
    expect(
      getGridApi('project-materials')!.getAllDisplayedColumns(),
    ).toHaveLength(0)
    expect(screen.getByText(/Все столбцы скрыты/)).toBeTruthy()
    fireEvent.click(
      within(settings).getByRole('button', { name: 'Показать все' }),
    )
    expect(screen.getByRole('grid')).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(
      screen.queryByRole('group', { name: 'Отображаемые столбцы' }),
    ).toBeNull()
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
    view.unmount()
  })
  it('restores the section, filters, operation tab and expanded requests after a reload without saving data', async () => {
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
    await filterGridName('Альфа')
    view.unmount()
    view = mount(workspace, true)
    await projectGridApi()
    expect(
      screen.getByRole('heading', { name: 'Проектная база материалов' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Показать меню' })).toBeTruthy()
    expect(
      screen.getByPlaceholderText<HTMLInputElement>(
        /Поиск по типу, наименованию/,
      ).value,
    ).toBe('Сталь')
    expect((await gridCell('Альфа', 'projectMaterialName')).textContent).toBe(
      'Альфа',
    )
    expect(
      within(screen.getByRole('grid')).queryByRole('row', { name: /Бета/ }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Операции' }))
    fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
    fireEvent.click(screen.getByRole('button', { name: /^VIEW-REQUEST/ }))
    expect(await screen.findByRole('row', { name: /Альфа/ })).toBeTruthy()
    view.unmount()
    view = mount(workspace, true)
    expect(screen.getByRole('heading', { name: 'Заявки' })).toBeTruthy()
    expect(await screen.findByRole('row', { name: /Альфа/ })).toBeTruthy()
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
      await editGridQuantity('Альфа', 'ТЕСТ', quantity)
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
      if (!within(group).queryByRole('grid')) {
        fireEvent.click(screen.getByText(number).closest('button')!)
      }
      return await screen.findByRole('row', { name: /Альфа/ })
    }
    let row = await changePlan('8', 2)
    const cell = (id: string) =>
      row.querySelector(`[col-id="${id}"]`) as HTMLElement
    expect(within(cell('projectQuantity')).getByText('28 м')).toBeTruthy()
    expect(
      within(cell('projectQuantity')).getByText('При создании: 30 м'),
    ).toBeTruthy()
    expect(within(cell('cipherQuantity')).getByText('8 м')).toBeTruthy()
    expect(
      within(cell('cipherQuantity')).getByText('При создании: 10 м'),
    ).toBeTruthy()
    expect(cell('quantity').textContent).toBe('6')
    expect(cell('balance').textContent).toBe('1 м')
    expect(cell('received').textContent).toBe('0')
    expect(cell('remaining').textContent).toBe('6')
    expect(screen.queryByText(/Заявлено сверх проекта:/)).toBeNull()

    row = await changePlan('4', 3)
    expect(within(cell('projectQuantity')).getByText('24 м')).toBeTruthy()
    expect(within(cell('cipherQuantity')).getByText('4 м')).toBeTruthy()
    expect(cell('quantity').textContent).toBe('6')
    expect(cell('remaining').textContent).toBe('6')
    expect(
      within(cell('balance')).getByText(/Заявлено сверх проекта: 3 м/),
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
      fireEvent.click(
        await screen.findByRole('button', { name: 'Редактировать' }),
      )
      const dialog = await screen.findByRole('dialog')
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
        requestNote: '',
        materialType: 'Трубопровод',
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
    await editGridQuantity('Альфа', 'ТЕСТ2', '4')
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
    await editGridMaterial('Альфа')
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
    fireEvent.click(
      await screen.findByRole('button', { name: /Редактировать/ }),
    )
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
      async function editConversion(unit: string, factor: string) {
        await editGridMaterial('Альфа')
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
      await editConversion('кг', '2,5')
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
      await editConversion('т', '0,1')
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
      await editConversion('', '')
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
        (await screen.findAllByRole('button', { name: /Редактировать/ }))[0]!,
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
        within(await screen.findByRole('row', { name: /Альфа/ })).getByRole(
          'gridcell',
          {
            name: '0,25',
          },
        ),
      ).toBeTruthy()
      fireEvent.click(
        (await screen.findAllByRole('button', { name: /Редактировать/ }))[0]!,
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
    fireEvent.click(
      await screen.findByRole('button', { name: /Редактировать/ }),
    )
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
      await editGridMaterial('Труба 666x9')
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
  it('opens saved data without a write and filters filled requests by positive finite quantity', async () => {
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
    fireEvent.click(
      await screen.findByRole('button', { name: /Редактировать/ }),
    )
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
  async ({ requested, received, signed, deleted, tone }) => {
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
    if (signed) approveReceipts(workspace, signed)
    if (deleted)
      workspace.lines = workspace.lines.filter((line) => line.id !== 'line-0')
    mount(workspace)
    const card = screen.getByText('Альфа').closest('div.border-2')
    expect(card?.classList.contains(tone)).toBe(true)
    expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  },
)

function returnScenarioWorkspace() {
  const workspace = documentInspectionFixture()
  workspace.materialRequests[0] = {
    ...conversionWorkspace().materialRequests[0]!,
    id: 'request',
    projectLineId: 'line',
    projectMaterialName: 'Отвод 23х7',
    projectUnit: 'шт',
    quantity: 4,
    number: 'ЗП-42-Материалы',
    cipher: 'ТКМ5',
    materialType: 'Арматура',
  }
  workspace.lines[0]!.projectMaterialName = 'Отвод 23х7'
  workspace.materialReceipts[0]!.actualName = 'Отвод 23х7'
  const entry = workspace.qualityWorkflow.cases[0]!
  const revision = currentInspection(entry)
  revision.zni.rows[0]!.name = 'Отвод 23х7'
  revision.avk!.checks.fill('Проверено')
  revision.avk!.conclusion = 'Принято 3 отвода'
  entry.revisions[0] = signInspection(revision, 'avk', localDateInputValue())
  return workspace
}

it('returns the rejected fourth elbow from the new tab, reopens one request unit, and preserves three approved units after reload', async () => {
  const workspace = returnScenarioWorkspace()
  mount(workspace)
  const tabs = screen.getAllByRole('button').map((button) => button.textContent)
  expect(tabs.findIndex((text) => text.startsWith('Возврат'))).toBe(
    tabs.findIndex((text) => text.startsWith('Выдача')) + 1,
  )
  fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
  expect(requestMetricValue('ЗП-42-Материалы', 'Получено позиций')).toBe(
    '1 из 1',
  )
  expect(requestMetricValue('ЗП-42-Материалы', 'Осталось получить')).toBe(
    '0 шт',
  )
  expect(screen.getByText(/Получена полностью/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^Возврат/ }))
  await operationGridApi('returns-pending')
  fireEvent.click(screen.getByRole('button', { name: 'Оформить возврат' }))
  const dialog = screen.getByRole('dialog', { name: 'Возврат заказчику' })
  expect(within(dialog).getByText(/к возврату 1 шт/)).toBeTruthy()
  fireEvent.change(within(dialog).getByLabelText('Возвратить: Отвод 23х7'), {
    target: { value: '1' },
  })
  const save = within(dialog).getByRole('button', {
    name: 'Сохранить фактический возврат',
  })
  fireEvent.click(save)
  fireEvent.click(save)
  await waitFor(() =>
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
  )
  expect(lastSaved().qualityWorkflow!.customerReturns).toHaveLength(1)
  expect(lastSaved().materialReceipts[0]!.quantity).toBe(4)
  validateQualityWorkspace(lastSaved(), workspace)
  fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
  expect(requestMetricValue('ЗП-42-Материалы', 'Получено позиций')).toBe(
    '0 из 1',
  )
  expect(requestMetricValue('ЗП-42-Материалы', 'Осталось получить')).toBe(
    '1 шт',
  )
  expect(screen.queryByText(/Получена полностью/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^ЗП-42-Материалы/ }))
  expect(screen.getByText(/Осталось получить: 1 шт/)).toBeTruthy()
  const requestsGrid = await operationGridApi('request:ЗП-42-Материалы')
  expect(
    ['quantity', 'received', 'remaining'].map((colKey) =>
      requestsGrid.getCellValue({
        rowNode: requestsGrid.getDisplayedRowAtIndex(0)!,
        colKey,
      }),
    ),
  ).toEqual([4, 3, 1])
  const saved = lastSaved()
  cleanup()
  mount(saved)
  fireEvent.click(screen.getByRole('button', { name: /^Возврат/ }))
  expect(screen.getByText(/Непринятых материалов к возврату нет/)).toBeTruthy()
  fireEvent.click(
    screen.getByRole('button', { name: /Все полученные материалы/ }),
  )
  const grid = await operationGridApi('returns-stock')
  const row = grid.getDisplayedRowAtIndex(0)!
  expect(grid.getCellValue({ rowNode: row, colKey: 'available' })).toBe(3)
  fireEvent.click(screen.getByRole('button', { name: /История возвратов/ }))
  const history = await operationGridApi('returns-history')
  expect(
    history.getCellValue({
      rowNode: history.getDisplayedRowAtIndex(0)!,
      colKey: 'restored',
    }),
  ).toBe(1)
})

it('returns excess from the stock tab, validates the remaining quantity and leaves the request fulfilled', async () => {
  const workspace = returnScenarioWorkspace()
  workspace.qualityWorkflow.cases = []
  mount(workspace)
  fireEvent.click(screen.getByRole('button', { name: /^Возврат/ }))
  fireEvent.click(
    screen.getByRole('button', { name: /Все полученные материалы/ }),
  )
  await operationGridApi('returns-stock')
  fireEvent.click(screen.getByRole('button', { name: 'Вернуть лишнее' }))
  let dialog = screen.getByRole('dialog', { name: 'Возврат лишнего материала' })
  fireEvent.change(within(dialog).getByLabelText('Возвращаемое количество'), {
    target: { value: '5' },
  })
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'Сохранить фактический возврат',
    }),
  )
  expect(within(dialog).getByRole('alert').textContent).toContain('превышает')
  expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  fireEvent.change(within(dialog).getByLabelText('Возвращаемое количество'), {
    target: { value: '1' },
  })
  expect(within(dialog).getByText('2,5 кг')).toBeTruthy()
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'Сохранить фактический возврат',
    }),
  )
  await waitFor(() =>
    expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1),
  )
  expect(lastSaved().qualityWorkflow!.customerReturns![0]).toMatchObject({
    kind: 'surplus',
    quantity: 1,
  })
  validateQualityWorkspace(lastSaved(), workspace)
  fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
  expect(requestMetricValue('ЗП-42-Материалы', 'Получено позиций')).toBe(
    '1 из 1',
  )
  expect(requestMetricValue('ЗП-42-Материалы', 'Осталось получить')).toBe(
    '0 шт',
  )
  expect(screen.getByText(/Получена полностью/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^ЗП-42-Материалы/ }))
  expect(screen.getByText(/Осталось получить: 0 шт/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^Возврат/ }))
  await operationGridApi('returns-stock')
  fireEvent.click(screen.getByRole('button', { name: 'Вернуть лишнее' }))
  dialog = screen.getByRole('dialog', { name: 'Возврат лишнего материала' })
  expect(within(dialog).getByText(/доступно 3 шт/)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
  expect(saveProjectWorkspaceSnapshot).toHaveBeenCalledTimes(1)
})

it('does not mark replacement delivery after a rejected return as excess', async () => {
  const workspace = returnScenarioWorkspace()
  workspace.lines[0]!.plannedQuantity = 4
  workspace.qualityWorkflow = recordCustomerReturn(
    workspace.qualityWorkflow,
    workspace.qualityWorkflow.cases[0]!.id,
    [{ receiptId: 'receipt', quantity: 1 }],
    localToday(),
  )
  workspace.materialReceipts.push({
    ...workspace.materialReceipts[0]!,
    id: 'replacement',
    quantity: 1,
  })
  validateQualityWorkspace(workspace)
  mount(workspace)
  const card = screen.getByText('Отвод 23х7').closest('div.border-2')
  expect(card?.classList.contains('border-amber-200')).toBe(true)
  expect(card?.classList.contains('border-rose-300')).toBe(false)
  expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
})

it('paginates 10000 overview materials without mounting off-page cards or saving workspace data', async () => {
  const workspace = base()
  workspace.lines = Array.from({ length: 10000 }, (_, i) => ({
    ...workspace.lines[0]!,
    id: `page-line-${i}`,
    materialId: `PAGE-${i}`,
    projectMaterialName: `Материал ${String(i).padStart(4, '0')}`,
  }))
  const before = structuredClone(workspace)
  let view = mount(workspace)
  fireEvent.click(screen.getByRole('button', { name: /^Общие данные/ }))
  const cards = () => document.querySelectorAll('[id^="operation-overview-"]')
  expect(cards()).toHaveLength(25)
  expect(screen.getByText('Найдено 10000 из 10000 позиций')).toBeTruthy()
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Последняя страница' })[0]!,
  )
  expect(cards()).toHaveLength(25)
  expect(screen.getByText('Материал 9999')).toBeTruthy()
  fireEvent.change(screen.getAllByLabelText('На странице: Общие данные')[0]!, {
    target: { value: '50' },
  })
  expect(cards()).toHaveLength(50)
  view.unmount()
  view = mount(workspace, true)
  expect(cards()).toHaveLength(50)
  expect(screen.getAllByText('Страница 200 из 200')).toHaveLength(2)
  fireEvent.change(
    screen.getByPlaceholderText(/Поиск по наименованию, шифру/),
    { target: { value: 'Материал 1000' } },
  )
  expect(cards()).toHaveLength(1)
  expect(screen.getByText('Материал 1000')).toBeTruthy()
  expect(screen.getByText('1–1 из 1')).toBeTruthy()
  expect(workspace).toEqual(before)
  expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
  view.unmount()
})

it('paginates request and receipt groups independently and searches beyond the current page', () => {
  const workspace = base()
  workspace.lines = Array.from({ length: 32 }, (_, i) => ({
    ...workspace.lines[0]!,
    id: `line-${i}`,
    materialId: `PAGE-${i}`,
    projectMaterialName: `Материал ${String(i).padStart(2, '0')}`,
  }))
  workspace.materialRequests = workspace.lines.map((line, i) => ({
    ...conversionWorkspace().materialRequests[0]!,
    id: `req-${i}`,
    number: `ЗАЯВКА-${String(i).padStart(2, '0')}`,
    projectLineId: line.id!,
    projectMaterialName: line.projectMaterialName!,
    materialId: line.materialId!,
    quantity: 2,
  }))
  const receipt = documentInspectionFixture().materialReceipts[0]!
  workspace.materialReceipts = workspace.lines.map((line, i) => ({
    ...receipt,
    id: `receipt-${i}`,
    requestId: `req-${i}`,
    projectLineId: line.id!,
    actualName: line.projectMaterialName!,
    quantity: 2,
    projectUnit: 'м',
  }))
  mount(workspace)
  fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
  expect(document.querySelectorAll('[id^="operation-requests-"]')).toHaveLength(
    25,
  )
  fireEvent.change(screen.getAllByLabelText('На странице: Заявки')[0]!, {
    target: { value: '10' },
  })
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Последняя страница' })[0]!,
  )
  expect(document.querySelectorAll('[id^="operation-requests-"]')).toHaveLength(
    2,
  )
  fireEvent.click(screen.getByRole('button', { name: /^Получение/ }))
  expect(document.querySelectorAll('[id^="operation-receipts-"]')).toHaveLength(
    25,
  )
  fireEvent.change(
    screen.getByPlaceholderText(
      'Поиск по дате, заявке, АПП, М-15, материалу или замене',
    ),
    { target: { value: 'Материал 31' } },
  )
  expect(document.querySelectorAll('[id^="operation-receipts-"]')).toHaveLength(
    1,
  )
  fireEvent.click(screen.getByRole('button', { name: /^Заявки/ }))
  expect(screen.getAllByText('Страница 4 из 4')).toHaveLength(2)
  expect(saveProjectWorkspaceSnapshot).not.toHaveBeenCalled()
})
