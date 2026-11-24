// @vitest-environment jsdom
import { useState } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  act,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { M15Section } from './m15-section'
import { linkedM15Fixture } from './m15-reconciliation.fixtures'
import { independentM15 } from './m15-independent'
import { changeField } from './workflow-test-support'
import { operationGridApi } from './project-grid-test-support'
import { withoutM15Composition } from './m15-composition-removal'
import { withM15Document } from './m15-document'

beforeEach(() => {
  sessionStorage.clear()
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function fixture() {
  const { workspace, value } = linkedM15Fixture()
  workspace.m15Reconciliations = [
    independentM15(value.id, value),
    { ...independentM15('second', value), id: 'second' },
  ]
  workspace.qualityWorkflow.receiptDocuments!.push({
    id: 'second',
    kind: 'm15',
    number: '15-2',
    date: '2026-11-18',
  })
  workspace.materialReceipts.push({
    ...workspace.materialReceipts[0]!,
    id: 'second-receipt',
    quantity: 6,
  })
  return workspace
}
it('aggregates documents by material and cipher and searches without changing totals or saving', async () => {
  const save = vi.fn()
  render(<M15Section workspace={fixture()} save={save} />)
  const register = await operationGridApi('m15-register')
  expect(register.getDisplayedRowCount()).toBe(2)
  expect(
    register.getAllDisplayedColumns().map((column) => column.getColId()),
  ).toEqual(['document', 'cipher', 'materials', 'actions'])
  expect(
    register.getCellValue({
      rowNode: register.getDisplayedRowAtIndex(0)!,
      colKey: 'materials',
    }),
  ).toBe(1)
  expect(screen.queryByText('Состав заполнен')).toBeNull()
  expect(screen.queryByText('Состав не заполнен')).toBeNull()
  expect(screen.queryByRole('button', { name: /^М-15 №15-2/ })).toBeNull()
  changeField(screen.getByLabelText('Поиск М-15'), {
    target: { value: '15-2' },
  })
  expect((await operationGridApi('m15-register')).getDisplayedRowCount()).toBe(
    1,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Сверка по материалам' }))
  const grid = await operationGridApi('m15-accounting:table')
  expect(grid.getDisplayedRowCount()).toBe(1)
  expect(grid.getDisplayedRowAtIndex(0)!.data).toMatchObject({
    app: 16,
    documented: 20,
    shortage: 0,
    excess: 4,
  })
  expect(grid.getDisplayedRowAtIndex(0)!.data.documents).toHaveLength(2)
  expect(save).not.toHaveBeenCalled()
})
it('shows the last added invoice first regardless of its date and keeps that order after composition edits', async () => {
  const workspace = fixture()
  workspace.qualityWorkflow.receiptDocuments!.find(
    (doc) => doc.id === 'second',
  )!.date = '2026-10-01'
  const before = structuredClone(workspace)
  const save = vi.fn()
  const view = render(<M15Section workspace={workspace} save={save} />)
  const grid = await operationGridApi('m15-register')
  const ids = () =>
    Array.from(
      { length: grid.getDisplayedRowCount() },
      (_, i) => grid.getDisplayedRowAtIndex(i)!.id,
    )
  expect(ids()).toEqual(['second', 'm15'])
  const added = withM15Document(workspace, {
    id: 'last',
    kind: 'm15',
    number: '15-LAST',
    date: '2026-09-01',
  })
  view.rerender(<M15Section workspace={added} save={save} />)
  expect(ids()).toEqual(['last', 'second', 'm15'])
  const edited = structuredClone(added)
  edited.m15Reconciliations![0]!.lines[0]!.quantity = 15
  view.rerender(<M15Section workspace={edited} save={save} />)
  expect(ids()).toEqual(['last', 'second', 'm15'])
  expect(workspace).toEqual(before)
  expect(save).not.toHaveBeenCalled()
})
it('shows missing M15 quantities by material after actual customer returns', async () => {
  const workspace = fixture()
  workspace.m15Reconciliations = workspace.m15Reconciliations!.slice(0, 1)
  workspace.qualityWorkflow.customerReturns = [
    {
      id: 'return',
      kind: 'surplus',
      source: 'uninspected',
      receiptId: 'second-receipt',
      quantity: 2,
      date: '2026-11-20',
      documentNumber: '1',
      note: '',
    },
  ]
  render(<M15Section workspace={workspace} save={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /Не хватает М-15/ }))
  const grid = await operationGridApi('m15-accounting')
  expect(grid.getDisplayedRowCount()).toBe(1)
  expect(grid.getDisplayedRowAtIndex(0)!.data).toMatchObject({
    app: 14,
    documented: 10,
    shortage: 4,
  })
})
it('keeps pending saves and remote feedback accessible in the independent editor', async () => {
  render(
    <M15Section
      workspace={fixture()}
      save={vi.fn()}
      hasPendingSave={(id) => id === 'second'}
      syncFeedback={<p>Сервер временно недоступен</p>}
    />,
  )
  expect(await screen.findByText('Сохранение не подтверждено')).toBeTruthy()
  changeField(screen.getByLabelText('Поиск М-15'), {
    target: { value: '15-2' },
  })
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: 'Редактировать М-15' }),
    ).toHaveLength(1),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать М-15' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Сервер временно недоступен')).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Далее' }))
  expect(
    await within(dialog).findByLabelText('Количество по М-15: Клапан, шт'),
  ).toBeTruthy()
  expect(within(dialog).queryByText('Выбрать получения')).toBeNull()
})
it('preserves column filters and sorting across views without filtering the document list', async () => {
  render(<M15Section workspace={fixture()} save={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Сверка по материалам' }))
  let grid = await operationGridApi('m15-accounting:table')
  await act(async () => {
    await grid.setColumnFilterModel('material', {
      filterType: 'set',
      values: ['Нет совпадений'],
    })
    grid.onFilterChanged()
    grid.applyColumnState({ state: [{ colId: 'quantity', sort: 'asc' }] })
  })
  fireEvent.click(screen.getByRole('button', { name: 'Накладные' }))
  expect((await operationGridApi('m15-register')).getDisplayedRowCount()).toBe(
    2,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Сверка по материалам' }))
  grid = await operationGridApi('m15-accounting:table')
  expect(
    grid.getColumnState().find((col) => col.colId === 'quantity')?.sort,
  ).toBe('asc')
  expect(grid.getFilterModel()).toHaveProperty('material')
})
it('virtualizes 50,000 distinct material positions and filters the aggregate table', async () => {
  const workspace = fixture(),
    record = workspace.m15Reconciliations![0]!,
    template = workspace.lines[0]!
  workspace.lines = Array.from({ length: 50000 }, (_, i) => ({
    ...template,
    id: `line-${i}`,
    projectMaterialName: `Материал ${i}`,
  }))
  record.lines = workspace.lines.map((line, i) => ({
    ...record.lines[0]!,
    id: `row-${i}`,
    projectLineId: String(line.id),
    name: String(line.projectMaterialName),
  }))
  workspace.m15Reconciliations = [record]
  workspace.materialReceipts = []
  render(<M15Section workspace={workspace} save={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Сверка по материалам' }))
  const grid = await operationGridApi('m15-accounting:table')
  expect(grid.getDisplayedRowCount()).toBe(50000)
  expect(
    document.querySelectorAll('.ag-center-cols-container .ag-row').length,
  ).toBeLessThan(100)
  await act(async () => {
    await grid.setColumnFilterModel('material', {
      filterType: 'set',
      values: ['Материал 49999'],
    })
    grid.onFilterChanged()
  })
  expect(grid.getDisplayedRowCount()).toBe(1)
  expect(grid.getDisplayedRowAtIndex(0)!.data.name).toBe('Материал 49999')
}, 60000)
it('opens a read-only document composition when its scan is not uploaded', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        manifest: { files: [], documents: [], revision: '1' },
        documents: [],
        materials: [],
        workspaceRevision: '1',
      }),
    ),
  )
  render(<M15Section workspace={fixture()} save={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Сверка по материалам' }))
  await operationGridApi('m15-accounting:table')
  fireEvent.click(await screen.findByRole('button', { name: /^М-15 №15-2/ }))
  expect(await screen.findByText('Скан не загружен')).toBeTruthy()
  expect(
    within(screen.getByRole('dialog')).getByRole('cell', { name: 'Клапан' }),
  ).toBeTruthy()
})
it('opens the selected invoice scan and edits its composition with a separate action', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:m15-scan'),
      revokeObjectURL: vi.fn(),
    }),
  )
  let releaseCatalog!: () => void
  const catalogReady = new Promise<void>((resolve) => {
    releaseCatalog = resolve
  })
  const fetch = vi.fn(async (url: string) => {
    if (url === '/api/documents?file=scan-second&preview=1')
      return new Response('scan', { headers: { 'Content-Type': 'image/png' } })
    await catalogReady
    return Response.json({
      manifest: {
        files: ['m15', 'second'].map((id) => ({
          id: `scan-${id}`,
          documentId: JSON.stringify(['receipt-document', id]),
          name: `${id}.png`,
          size: 4,
          uploadedAt: '',
        })),
      },
    })
  })
  vi.stubGlobal('fetch', fetch)
  const save = vi.fn()
  render(<M15Section workspace={fixture()} save={save} />)
  changeField(screen.getByLabelText('Поиск М-15'), {
    target: { value: '15-2' },
  })
  fireEvent.click(await screen.findByRole('button', { name: 'Открыть М-15' }))
  expect(screen.getByText('Загрузка документа…')).toBeTruthy()
  expect(within(screen.getByRole('dialog')).queryByRole('table')).toBeNull()
  expect(screen.queryByText('Скан не загружен')).toBeNull()
  await act(async () => releaseCatalog())
  expect(await screen.findByRole('img', { name: 'second.png' })).toBeTruthy()
  expect(screen.queryByLabelText('Номер М-15')).toBeNull()
  expect(fetch).toHaveBeenCalledWith(
    '/api/documents?file=scan-second&preview=1',
    expect.any(Object),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть предпросмотр' }))
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать М-15' }))
  expect(
    (await screen.findByLabelText<HTMLInputElement>('Номер М-15')).value,
  ).toBe('15-2')
  expect(save).not.toHaveBeenCalled()
})
it('removes the composition independently and retains the document and physical receipts', async () => {
  const workspace = fixture()
  workspace.m15Reconciliations = workspace.m15Reconciliations!.slice(0, 1)
  const before = structuredClone(workspace.materialReceipts)
  let current = workspace
  function Harness() {
    const [value, setValue] = useState(workspace)
    return (
      <M15Section
        workspace={value}
        save={vi.fn()}
        removeComposition={async (baseline) => {
          current = withoutM15Composition(current, baseline)
          setValue(current)
        }}
      />
    )
  }
  render(<Harness />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Удалить состав М-15' }),
  )
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Удалить состав',
    }),
  )
  await screen.findByText('Состав М-15 удалён.')
  expect(current.m15Reconciliations).toEqual([])
  expect(current.materialReceipts).toEqual(before)
  expect(screen.getByText('№15-1')).toBeTruthy()
})
