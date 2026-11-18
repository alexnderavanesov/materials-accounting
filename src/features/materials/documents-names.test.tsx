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
import type { GridApi } from 'ag-grid-community'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import './project-grid-test-support'
import { DocumentsSection } from './documents-section'
import {
  buildDocumentRegistry,
  documentCategoryKeys,
} from './document-registry'
import type { DocumentMaterial } from './document-registry'
import { documentRegistryFixture } from './document-registry.fixtures'
import { saveDataGridState } from './project-grid-state'

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
})

const projectName =
  'Труба стальная бесшовная горячедеформированная 57x4 сталь 20 гарантия гидроиспытания, кроме изготовленных из слитков'
function fixture() {
  const workspace = documentRegistryFixture()
  for (const line of workspace.lines) line.projectMaterialName = projectName
  for (const request of workspace.materialRequests)
    request.projectMaterialName = projectName
  workspace.materialReceipts[0]!.actualName = 'Труба 57х4 09г2с'
  workspace.materialReceipts[1]!.actualName = projectName
  workspace.lines.push({
    ...workspace.lines[0],
    id: 'undelivered',
    projectMaterialName: 'Задвижка без поступлений',
  })
  return workspace
}
async function mount() {
  const workspace = fixture()
  const fetch = vi.fn(async () =>
    Response.json({
      ...buildDocumentRegistry(workspace),
      workspaceRevision: 'test',
      manifest: { revision: 'empty', files: [], documents: [] },
    }),
  )
  vi.stubGlobal('fetch', fetch)
  render(<DocumentsSection prepare={async () => 'test'} />)
  await waitFor(() =>
    expect(getGridApi('documents-registry')?.getDisplayedRowCount()).toBe(1),
  )
  return {
    workspace,
    fetch,
    api: getGridApi('documents-registry')! as GridApi<DocumentMaterial>,
  }
}

it('finds both project and actual receipt names, displays replacement per name and keeps the same document selection', async () => {
  const { api, fetch } = await mount()
  expect(
    screen.getByRole('columnheader', { name: /Наименование по проекту/ }),
  ).toBeTruthy()
  expect(
    screen.getByRole('columnheader', { name: /Наименование при получении/ }),
  ).toBeTruthy()
  const badge = screen.getByText('Замена')
  expect(badge.parentElement!.textContent).toContain('Труба 57х4 09г2с')
  expect(screen.getAllByText('Замена')).toHaveLength(1)
  const search = screen.getByRole('textbox', { name: 'Поиск документов' })
  for (const value of [
    'Труба 57х4 09г2с',
    '09Г2С',
    'горячедеформированная',
    'Замена',
    'ЗП-1',
  ]) {
    fireEvent.change(search, { target: { value } })
    await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
    expect(api.getDisplayedRowAtIndex(0)!.data!.name).toBe(projectName)
  }
  fireEvent.change(search, { target: { value: '09г2с' } })
  fireEvent.click(screen.getByRole('button', { name: `АПП: ${projectName}` }))
  const dialog = await screen.findByRole('dialog', { name: 'АПП' })
  expect(within(dialog).getByText(/^АПП №АПП-1 от/)).toBeTruthy()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('inserts the actual name next to the project name in an old layout and searches it even when hidden', async () => {
  saveDataGridState('documents-registry', {
    columnOrder: {
      orderedColIds: [
        'name',
        'cipher',
        'type',
        'standard',
        ...documentCategoryKeys,
      ],
    },
    columnSizing: { columnSizingModel: [{ colId: 'name', width: 300 }] },
    columnVisibility: { hiddenColIds: ['standard', 'type'] },
  })
  const { api, workspace } = await mount()
  const order = api.getAllGridColumns().map((column) => column.getColId())
  expect(order[order.indexOf('name') + 1]).toBe('receivedNames')
  expect(api.getColumn('name')!.getActualWidth()).toBe(300)
  expect(api.getColumn('standard')!.isVisible()).toBe(false)
  act(() => api.setColumnsVisible(['receivedNames'], false))
  const search = screen.getByRole('textbox', { name: 'Поиск документов' })
  fireEvent.change(search, { target: { value: '09г2с' } })
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  workspace.materialReceipts[0]!.actualName = 'Новая фактическая труба'
  fireEvent.click(screen.getByRole('button', { name: 'Обновить реестр' }))
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(0))
  fireEvent.change(search, { target: { value: 'Новая фактическая труба' } })
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  fireEvent.change(search, { target: { value: 'Задвижка без поступлений' } })
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(0))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Без документов' }))
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1))
  expect(api.getDisplayedRowAtIndex(0)!.data!.receivedNames).toEqual([])
})
