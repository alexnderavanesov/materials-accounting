// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import {
  editGridQuantity,
  gridCell,
  projectGridApi,
} from './project-grid-test-support'
import { ProjectMaterialGrid } from './project-material-grid'
import {
  parseProjectQuantity,
  readProjectGridState,
  saveProjectGridState,
} from './project-grid-state'
import type { MaterialMatrixRow } from './project-grid-state'

const ciphers = ['ТЕСТ', 'ТЕСТ2']
const fixture = (): MaterialMatrixRow[] =>
  ['Альфа', 'Бета'].map((name, i) => ({
    key: name,
    firstLineId: `line-${i}`,
    lineIds: [`line-${i}`],
    material: 'Сталь',
    materialId: '',
    projectMaterialName: name,
    changeNumber: '',
    materialType: 'Труба',
    normativeDocument: 'ГОСТ',
    unit: 'м',
    unitWeight: 1.5,
    alternativeUnit: 'кг',
    alternativeUnitFactor: 2.5,
    totalQuantity: 10,
    cipherQuantities: { ТЕСТ: 10 },
    cipherLineIds: { ТЕСТ: `line-${i}` },
  }))
const updated = vi.fn()
function Harness() {
  const [rows, setRows] = useState(fixture)
  const [hidden, setHidden] = useState<string[]>([])
  return (
    <ProjectMaterialGrid
      ciphers={ciphers}
      hiddenColumns={hidden}
      onChangeHiddenColumns={setHidden}
      highlight={null}
      rows={rows}
      selectedLineId=""
      tableFilterResetVersion={0}
      onEditLine={vi.fn()}
      onRequestDelete={vi.fn()}
      onSelectLine={vi.fn()}
      onUpdateQuantity={(row, cipher, value) => {
        updated(row.key, cipher, Number(value))
        setRows((current) =>
          current.map((item) =>
            item.key === row.key
              ? {
                  ...item,
                  cipherQuantities: {
                    ...item.cipherQuantities,
                    [cipher]: Number(value),
                  },
                }
              : item,
          ),
        )
      }}
    />
  )
}
beforeEach(() => {
  sessionStorage.clear()
  updated.mockClear()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe('project quantity input', () => {
  it('accepts decimal commas and copied thousand separators, rejecting malformed or negative quantities', () => {
    for (const [value, expected] of [
      ['', 0],
      ['  ', 0],
      ['1\u202f234,56', 1234.56],
      ['.25', 0.25],
      [0, 0],
      [7.5, 7.5],
    ] as const) {
      expect(parseProjectQuantity(value)).toBe(expected)
    }
    for (const value of [
      '-2',
      'abc',
      'NaN',
      'Infinity',
      '1,2,3',
      '2e3',
      '9'.repeat(400),
    ]) {
      expect(parseProjectQuantity(value)).toBeNull()
    }
  })
  it('migrates old filters and persists grid layout, excluding material data', () => {
    sessionStorage.setItem(
      'materials.workspaceView.v1:database.filters',
      JSON.stringify({ projectMaterialName: 'Альфа', unit: '' }),
    )
    expect(
      readProjectGridState().filter?.filterModel?.projectMaterialName,
    ).toMatchObject({ filter: 'Альфа', type: 'contains' })
    const state = {
      columnOrder: { orderedColIds: ['cipher:ТЕСТ', 'projectMaterialName'] },
      scroll: { top: 200, left: 100 },
      rowData: fixture(),
    }
    saveProjectGridState(state)
    expect(readProjectGridState()).toEqual({
      columnOrder: state.columnOrder,
      scroll: state.scroll,
    })
    sessionStorage.setItem(
      'materials.workspaceView.v1:database.agGrid.v1',
      '{broken',
    )
    expect(readProjectGridState()).toEqual({})
  })
})

describe('project AG Grid integration', () => {
  it('commits a decimal once, cancels with Escape, blocks invalid values and lets blank clear the quantity', async () => {
    render(<Harness />)
    await editGridQuantity('Альфа', 'ТЕСТ', '2,75')
    await waitFor(() =>
      expect(updated).toHaveBeenLastCalledWith('Альфа', 'ТЕСТ', 2.75),
    )
    expect(updated).toHaveBeenCalledTimes(1)
    await editGridQuantity('Альфа', 'ТЕСТ', '9', true)
    expect(updated).toHaveBeenCalledTimes(1)
    await editGridQuantity('Альфа', 'ТЕСТ', '-1')
    expect(updated).toHaveBeenCalledTimes(1)
    const api = await projectGridApi()
    expect(api.getEditingCells()).toHaveLength(1)
    act(() => api.stopEditing(true))
    await editGridQuantity('Альфа', 'ТЕСТ', '')
    await waitFor(() =>
      expect(updated).toHaveBeenLastCalledWith('Альфа', 'ТЕСТ', 0),
    )
    expect((await gridCell('Альфа', 'cipher:ТЕСТ')).textContent).toBe('—')
  })
  it('pastes multiple quantities through application callbacks and rejects an invalid paste in full', async () => {
    render(<Harness />)
    const api = await projectGridApi()
    const readText = vi.fn().mockResolvedValue('2,5\t3\n4\t5\n')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText },
    })
    await act(async () => {
      api.setFocusedCell(0, 'cipher:ТЕСТ')
      api.pasteFromClipboard()
    })
    await waitFor(() => expect(updated).toHaveBeenCalledTimes(4))
    expect(updated.mock.calls).toEqual([
      ['Альфа', 'ТЕСТ', 2.5],
      ['Альфа', 'ТЕСТ2', 3],
      ['Бета', 'ТЕСТ', 4],
      ['Бета', 'ТЕСТ2', 5],
    ])
    updated.mockClear()
    readText.mockResolvedValue('8\t9\n2\tошибка')
    await act(async () => api.pasteFromClipboard())
    expect(updated).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Вставка отменена')
    expect(api.getDisplayedRowAtIndex(0)?.data?.cipherQuantities.ТЕСТ).toBe(2.5)
  })
  it('restores sorting, pinning, order and widths across unmount without editing materials', async () => {
    let view = render(<Harness />)
    const api = await projectGridApi()
    act(() =>
      api.applyColumnState({
        state: [
          { colId: 'cipher:ТЕСТ', width: 210, pinned: 'left', sort: 'desc' },
          { colId: 'projectMaterialName', width: 300 },
        ],
        applyOrder: true,
      }),
    )
    view.unmount()
    view = render(<Harness />)
    const restored = await projectGridApi()
    expect(restored.getColumnState()[0]).toMatchObject({
      colId: 'cipher:ТЕСТ',
      width: 210,
      pinned: 'left',
      sort: 'desc',
    })
    expect(updated).not.toHaveBeenCalled()
    view.unmount()
  })
  it('exports real numeric quantities to Excel and preserves readonly material metadata', async () => {
    render(<Harness />)
    const api = await projectGridApi()
    const blob = api.getDataAsExcel({
      columnKeys: [
        'projectMaterialName',
        'unitWeight',
        'alternativeUnitFactor',
        'cipher:ТЕСТ',
      ],
    })!
    if (typeof blob === 'string') throw new Error('Expected an XLSX Blob')
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(blob)
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    expect(workbook.worksheets[0]!.getRow(2).values).toEqual([
      undefined,
      'Альфа',
      1.5,
      2.5,
      10,
    ])
    expect(
      api
        .getColumn('projectMaterialName')!
        .isCellEditable(api.getDisplayedRowAtIndex(0)!),
    ).toBe(false)
    expect(updated).not.toHaveBeenCalled()
  })
})
