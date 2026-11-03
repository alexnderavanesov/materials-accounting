import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { getGridApi } from 'ag-grid-community'
import type { GridApi } from 'ag-grid-community'
import type { AgGridReactProps } from 'ag-grid-react'
import type * as AgGridReactModule from 'ag-grid-react'
import { vi } from 'vitest'
import type { MaterialMatrixRow } from './project-grid-state'

// AG Grid uses innerText; jsdom does not implement its DOM text semantics.
Object.defineProperty(HTMLElement.prototype, 'innerText', {
  configurable: true,
  get() {
    return this.textContent ?? ''
  },
  set(value: string) {
    this.textContent = value
  },
})
// Native column chooser dialogs need a positioned parent to compute their centre.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get() {
    return this.matches('.ag-dialog') ? this.parentElement : null
  },
})
for (const property of ['clientHeight', 'offsetHeight']) {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true,
    get() {
      if (!this.closest('.ag-dialog')) return 0
      return Number.parseFloat(this.style.height) || 300
    },
  })
}

// jsdom has no layout: keep the real grid/editors, but render all test cells.
vi.mock('ag-grid-react', async (importOriginal) => {
  const actual = await importOriginal<typeof AgGridReactModule>()
  const styles = document.createElement('div')
  return {
    ...actual,
    AgGridReact: (props: AgGridReactProps) => (
      <actual.AgGridReact
        {...props}
        // jsdom cannot reliably compute AG theme CSS (:where/:has selectors).
        // Browser visual checks cover the real theme; grid behaviour stays real here.
        themeStyleContainer={styles}
        suppressColumnVirtualisation
        suppressRowVirtualisation
        suppressAnimationFrame
      />
    ),
  }
})

export async function projectGridApi() {
  await waitFor(() => expectGridReady(), { timeout: 5000 })
  return getGridApi('project-materials')! as GridApi<MaterialMatrixRow>
}

export async function openProjectColumnChooser() {
  await projectGridApi()
  fireEvent.contextMenu(screen.getAllByRole('columnheader')[0]!)
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Выбрать столбцы' }),
  )
  return screen.findByRole('dialog', { name: 'Выбрать столбцы' })
}

export async function toggleProjectColumn(dialog: HTMLElement, name: string) {
  fireEvent.click(await within(dialog).findByText(name, { exact: true }))
}

export async function closeProjectColumnChooser(dialog: HTMLElement) {
  const input = within(dialog).getByRole('textbox', { name: 'Поиск столбцов' })
  act(() => input.focus())
  fireEvent.keyDown(input, { key: 'Escape' })
  await waitFor(() => {
    if (screen.queryByRole('dialog', { name: 'Выбрать столбцы' })) {
      throw new Error('Column chooser did not close')
    }
  })
}

function expectGridReady() {
  const api = getGridApi('project-materials')
  if (!api?.getColumns()?.length) throw new Error('Grid is not ready')
}

export async function gridCell(materialName: string, columnId: string) {
  const api = await projectGridApi()
  const index = Array.from(
    { length: api.getDisplayedRowCount() },
    (_, i) => i,
  ).find(
    (i) =>
      api.getDisplayedRowAtIndex(i)?.data?.projectMaterialName === materialName,
  )
  if (index === undefined)
    throw new Error(`Material not found: ${materialName}`)
  return waitFor(() => {
    const cell = screen
      .getByRole('grid')
      .querySelector(`.ag-row[row-index="${index}"] [col-id="${columnId}"]`)
    if (!(cell instanceof HTMLElement))
      throw new Error(`Cell not found: ${columnId}`)
    return cell
  })
}

export async function editGridQuantity(
  materialName: string,
  cipher: string,
  value: string,
  cancel = false,
) {
  const cell = await gridCell(materialName, `cipher:${cipher}`)
  const api = await projectGridApi()
  act(() =>
    api.startEditingCell({
      rowIndex: Number(cell.closest('[row-index]')!.getAttribute('row-index')),
      colKey: `cipher:${cipher}`,
    }),
  )
  let input: HTMLInputElement | null = null
  await waitFor(() => {
    input = cell.querySelector('input')
    if (!input) throw new Error('Editor did not open')
  })
  fireEvent.input(input!, { target: { value } })
  fireEvent.keyDown(input!, {
    key: cancel ? 'Escape' : 'Enter',
    code: cancel ? 'Escape' : 'Enter',
    keyCode: cancel ? 27 : 13,
  })
}

export async function editGridMaterial(materialName: string) {
  fireEvent.click(
    (await gridCell(materialName, 'actions')).querySelector(
      '[aria-label="Редактировать материал"]',
    )!,
  )
}

export async function filterGridName(value: string) {
  const api = await projectGridApi()
  await act(async () => {
    api.setFilterModel(
      value
        ? {
            projectMaterialName: {
              filterType: 'text',
              type: 'contains',
              filter: value,
            },
          }
        : null,
    )
  })
  await waitFor(() => {
    if (value && api.getDisplayedRowCount() !== 1)
      throw new Error('Filter not applied')
  })
}

export async function operationGridApi(id: string) {
  await waitFor(
    () => {
      const grid = getGridApi(id)
      const root = Array.from(document.querySelectorAll('[grid-id]')).find(
        (element) => element.getAttribute('grid-id') === id,
      )
      const button = root
        ?.closest('.operations-grid')
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label^="Экспорт Excel:"]',
        )
      if (!grid || !button || button.disabled)
        throw new Error(`Grid is not ready: ${id}`)
    },
    { timeout: 5000 },
  )
  return getGridApi(id)!
}

/** Pinned actions live in a separate row container in AG Grid. */
export function operationRowAction(row: HTMLElement, name: string) {
  const root = row.closest('.operations-grid')!
  const peers = Array.from(
    root.querySelectorAll<HTMLElement>('.ag-row'),
  ).filter((item) => item.getAttribute('row-id') === row.getAttribute('row-id'))
  const button = peers.flatMap((item) =>
    within(item).queryAllByRole('button', { name }),
  )[0]
  if (!button) throw new Error(`Row action not found: ${name}`)
  return button
}
