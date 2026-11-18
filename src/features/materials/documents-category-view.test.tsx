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
import { getGridApi } from 'ag-grid-community'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import './project-grid-test-support'
import { DocumentsSection } from './documents-section'
import { documentCategoryKeys } from './document-registry'
import type { DocumentRegistry } from './document-registry'

vi.setConfig({ testTimeout: 15000 })
beforeEach(() => {
  sessionStorage.clear()
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function mount() {
  const registry: DocumentRegistry = {
    materials: [
      {
        id: 'a',
        name: 'Материал А',
        receivedNames: [{ name: 'Замена трубы 09г2с', replacement: true }],
        type: 'Труба',
        cipher: 'ТК1',
        standard: 'ГОСТ',
        unit: 'шт',
        lineIds: ['line-a'],
        documentIds: ['zni-1', 'zni-2', 'zni-3', 'shared', 'app'],
      },
      {
        id: 'b',
        name: 'Задвижка Б',
        receivedNames: [],
        type: 'Труба',
        cipher: 'ТК2',
        standard: 'ГОСТ',
        unit: 'шт',
        lineIds: ['line-b'],
        documentIds: ['zni-4', 'shared'],
      },
      {
        id: 'c',
        name: 'Без документов',
        receivedNames: [],
        type: 'Труба',
        cipher: 'ТК3',
        standard: 'ГОСТ',
        unit: 'шт',
        lineIds: ['line-c'],
        documentIds: [],
      },
    ],
    documents: [
      ...[1, 2, 3, 4].map((n) => ({
        id: `zni-${n}`,
        kind: 'zni' as const,
        label: `ЗНИ №${n}`,
        date: '2026-11-18',
        materialIds: [n === 4 ? 'b' : 'a'],
      })),
      {
        id: 'shared',
        kind: 'zni',
        label: 'ЗНИ №5 общая',
        date: '2026-11-18',
        materialIds: ['a', 'b'],
      },
      {
        id: 'app',
        kind: 'app',
        label: 'АПП №1',
        date: '2026-11-18',
        materialIds: ['a'],
      },
    ],
  }
  const fetch = vi.fn(async (_url: string, options?: RequestInit) =>
    options?.method === 'POST'
      ? new Response('archive')
      : Response.json({
          ...registry,
          workspaceRevision: 'saved',
          manifest: { revision: 'files', files: [], documents: [] },
        }),
  )
  vi.stubGlobal('fetch', fetch)
  render(<DocumentsSection prepare={async () => 'saved'} />)
  await waitFor(() =>
    expect(getGridApi('documents-registry')?.getDisplayedRowCount()).toBe(2),
  )
  return { fetch, registry }
}
async function choose(view: string, count: number) {
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Вид документов' })).getByRole(
      'button',
      { name: view },
    ),
  )
  const id =
    view === 'Все документы'
      ? 'documents-registry'
      : view === 'ЗНИ'
        ? 'documents-registry-zni'
        : view === 'АПП'
          ? 'documents-registry-app'
          : 'documents-registry-passport'
  await waitFor(() =>
    expect(getGridApi(id)?.getDisplayedRowCount()).toBe(count),
  )
  return getGridApi(id)!
}

it('shows one material/document pair per row and opens only the clicked document, keeping both names searchable', async () => {
  const { fetch } = await mount()
  const api = await choose('ЗНИ', 6)
  const rows = Array.from(
    { length: 6 },
    (_, i) => api.getDisplayedRowAtIndex(i)!.data,
  )
  expect(rows.map((row) => [row.materialId, row.document.id])).toEqual([
    ['a', 'zni-1'],
    ['a', 'zni-2'],
    ['a', 'zni-3'],
    ['a', 'shared'],
    ['b', 'zni-4'],
    ['b', 'shared'],
  ])
  expect(new Set(rows.map((row) => row.id)).size).toBe(6)
  expect(
    api.getAllDisplayedColumns().map((column) => column.getColId()),
  ).toContain('zni')
  expect(api.getColumn('app')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'ЗНИ №2: Материал А' }))
  const dialog = await screen.findByRole('dialog', { name: 'ЗНИ' })
  expect(within(dialog).getByText('ЗНИ №2', { exact: true })).toBeTruthy()
  expect(within(dialog).queryByText('ЗНИ №1', { exact: true })).toBeNull()
  expect(within(dialog).queryByText('АПП №1', { exact: true })).toBeNull()
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'Добавить документ к материалу',
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
  expect(within(dialog).getByText('ЗНИ №2', { exact: true })).toBeTruthy()
  expect(within(dialog).queryByText('ЗНИ №1', { exact: true })).toBeNull()
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Закрыть документы' }),
  )
  const search = screen.getByRole('textbox', { name: 'Поиск документов' })
  for (const [query, count] of [
    ['09г2с', 4],
    ['Задвижка Б', 2],
    ['ЗНИ №3', 1],
  ] as const) {
    fireEvent.change(search, { target: { value: query } })
    await waitFor(() => expect(api.getDisplayedRowCount()).toBe(count))
  }
  fireEvent.change(search, { target: { value: '' } })
  await choose('Паспорта', 0)
  await choose('АПП', 1)
  await choose('Все документы', 2)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('archives only selected documents and deduplicates a document shared by selected materials', async () => {
  const { fetch } = await mount()
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:archive'),
      revokeObjectURL: vi.fn(),
    }),
  )
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const api = await choose('ЗНИ', 6)
  act(() =>
    api.forEachNode((node) =>
      node.setSelected(node.data.document.id === 'shared'),
    ),
  )
  fireEvent.click(
    await screen.findByRole('button', { name: 'Скачать архив · 1' }),
  )
  const dialog = await screen.findByRole('dialog', { name: 'ЗНИ' })
  expect(
    within(dialog).getAllByText('ЗНИ №5 общая', { exact: true }),
  ).toHaveLength(1)
  expect(within(dialog).queryByText('ЗНИ №1', { exact: true })).toBeNull()
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Скачать выбранные (1)' }),
  )
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  const request = JSON.parse(fetch.mock.calls[1]![1]!.body as string)
  expect(request).toMatchObject({
    action: 'archive',
    materialIds: ['a', 'b'],
    documentIds: ['shared'],
  })
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Закрыть документы' }),
  )
  await choose('АПП', 1)
  expect(
    screen
      .getByRole('button', { name: 'Скачать архив' })
      .hasAttribute('disabled'),
  ).toBe(true)
})

it('preserves matrix column settings and filters separately from category settings', async () => {
  await mount()
  let matrix = getGridApi('documents-registry')!
  await act(async () => {
    matrix.setColumnWidths([{ key: 'name', newWidth: 270 }])
    matrix.setColumnsVisible(['cipher'], false)
    matrix.setFilterModel({
      name: { filterType: 'text', type: 'contains', filter: 'Материал А' },
    })
  })
  await waitFor(() => expect(matrix.getDisplayedRowCount()).toBe(1))
  // StateUpdated is batched by AG Grid; wait until the actual persisted state is ready.
  await waitFor(() =>
    expect(
      JSON.parse(
        sessionStorage.getItem(
          'materials.workspaceView.v1:grid:documents-registry',
        )!,
      ).filter,
    ).toBeTruthy(),
  )
  const zni = await choose('ЗНИ', 6)
  expect(zni.getFilterModel()).toEqual({})
  act(() => zni.setColumnWidths([{ key: 'name', newWidth: 240 }]))
  matrix = await choose('Все документы', 1)
  expect(matrix.getColumn('name')!.getActualWidth()).toBe(270)
  expect(matrix.getColumn('cipher')!.isVisible()).toBe(false)
  for (const kind of documentCategoryKeys)
    expect(matrix.getColumn(kind)).toBeTruthy()
})
