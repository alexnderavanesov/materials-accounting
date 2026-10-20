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

function expectGridReady() {
  if (!getGridApi('project-materials')) throw new Error('Grid is not ready')
  const container = screen.getByRole('grid').closest('.materials-project-grid')!
  const button = within(container as HTMLElement).getByRole<HTMLButtonElement>(
    'button',
    { name: 'Excel' },
  )
  if (button.disabled) throw new Error('Waiting for gridReady')
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
