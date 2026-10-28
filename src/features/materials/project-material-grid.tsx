import { MaterialsGridView, materialsGridTheme } from './materials-grid'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  ColDef,
  GridApi,
  GridState,
  ICellRendererParams,
} from 'ag-grid-community'
import { projectGridLocale } from './project-grid-locale'
import { Download, Pencil, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { projectMatrixColumns } from './project-matrix-columns'
import {
  parseProjectQuantity,
  readProjectGridState,
  saveProjectGridState,
} from './project-grid-state'
import type {
  MaterialHighlight,
  MaterialMatrixRow,
  PendingDeleteMaterial,
} from './project-grid-state'
import './project-material-grid.css'

const quantityText = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 12 }).format(
        value,
      )
const quantityError =
  'Введите количество не меньше нуля. Дробную часть можно отделить запятой или точкой.'
const defaultColDef: ColDef<MaterialMatrixRow> = {
  sortable: true,
  resizable: true,
  minWidth: 90,
  filter: 'agTextColumnFilter',
  floatingFilter: true,
  wrapHeaderText: true,
  autoHeaderHeight: true,
  filterParams: { debounceMs: 150 },
  cellDataType: false,
}
export function ProjectMaterialGrid({
  ciphers,
  hiddenColumns,
  onChangeHiddenColumns,
  highlight,
  rows,
  selectedLineId,
  tableFilterResetVersion,
  onEditLine,
  onRequestDelete,
  onSelectLine,
  onUpdateQuantity,
}: {
  ciphers: Array<string>
  hiddenColumns: Array<string>
  onChangeHiddenColumns: (keys: Array<string>) => void
  highlight: MaterialHighlight | null
  rows: Array<MaterialMatrixRow>
  selectedLineId: string
  tableFilterResetVersion: number
  onEditLine: (id: string) => void
  onRequestDelete: (value: PendingDeleteMaterial) => void
  onSelectLine: (id: string) => void
  onUpdateQuantity: (
    row: MaterialMatrixRow,
    cipher: string,
    value: string,
  ) => void
}) {
  const api = useRef<GridApi<MaterialMatrixRow> | null>(null)
  // Flush before React destroys the child grid, even if its state event is pending.
  useLayoutEffect(
    () => () => {
      const grid = api.current
      if (grid && !grid.isDestroyed()) saveProjectGridState(grid.getState())
    },
    [],
  )
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const hiddenRef = useRef(hiddenColumns)
  hiddenRef.current = hiddenColumns
  const changeHiddenRef = useRef(onChangeHiddenColumns)
  changeHiddenRef.current = onChangeHiddenColumns
  const [initialState] = useState<GridState>(() => {
    const saved = readProjectGridState()
    return {
      ...saved,
      partialColumnState: true,
      columnVisibility: { hiddenColIds: hiddenColumns },
      filter: {
        filterModel: Object.fromEntries(
          Object.entries(saved.filter?.filterModel ?? {}).filter(
            ([id]) => !hiddenColumns.includes(id),
          ),
        ),
      },
    }
  })
  const columns = useMemo<Array<ColDef<MaterialMatrixRow>>>(
    () => [
      ...projectMatrixColumns.map(
        (column): ColDef<MaterialMatrixRow> => ({
          colId: column.key,
          field: column.key,
          headerName: column.label,
          initialWidth: column.key === 'unit' ? 152 : column.width,
          initialPinned: column.key === 'materialType' ? 'left' : undefined,
          initialHide: hiddenRef.current.includes(column.key),
          wrapText: true,
          autoHeight:
            column.key === 'projectMaterialName' ||
            column.key === 'materialType',
          cellClass:
            column.align === 'center' ? 'materials-grid-center' : undefined,
          headerClass:
            column.align === 'center'
              ? 'materials-grid-header-center'
              : undefined,
          valueFormatter: ({ value }) =>
            typeof value === 'number'
              ? quantityText(value)
              : String(value || '—'),
          useValueFormatterForExport: false,
          tooltipField: column.key,
        }),
      ),
      ...ciphers.map(
        (cipher): ColDef<MaterialMatrixRow> => ({
          colId: `cipher:${cipher}`,
          headerName: cipher,
          initialWidth: 132,
          initialHide: hiddenRef.current.includes(`cipher:${cipher}`),
          editable: true,
          cellEditor: 'agTextCellEditor',
          cellEditorParams: {
            getValidationErrors: ({ value }: { value: unknown }) =>
              parseProjectQuantity(value) === null ? [quantityError] : null,
          },
          cellClass: 'materials-grid-quantity',
          headerClass: 'materials-grid-header-center',
          valueGetter: ({ data }) => data?.cipherQuantities[cipher] ?? 0,
          valueFormatter: ({ value }) =>
            value === 0 ? '—' : quantityText(value),
          useValueFormatterForExport: false,
          tooltipValueGetter: () =>
            'Двойной щелчок — изменить. Enter или Tab — сохранить, Escape — отменить.',
        }),
      ),
      {
        colId: 'actions',
        headerName: 'Действия',
        initialWidth: 112,
        minWidth: 100,
        initialPinned: 'right',
        initialHide: hiddenRef.current.includes('actions'),
        sortable: false,
        filter: false,
        editable: false,
        suppressMovable: false,
        suppressNavigable: true,
        suppressColumnsToolPanel: false,
        cellRenderer: ({ data }: ICellRendererParams<MaterialMatrixRow>) =>
          data && (
            <div className="flex h-full items-center justify-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Редактировать материал"
                onClick={() => onEditLine(data.firstLineId)}
              >
                <Pencil size={16} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Удалить материал"
                onClick={() =>
                  onRequestDelete({
                    lineIds: data.lineIds,
                    name: data.projectMaterialName,
                  })
                }
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ),
        suppressKeyboardEvent: ({ event }) =>
          event.key === 'Enter' || event.key === ' ',
      },
    ],
    [ciphers, onEditLine, onRequestDelete],
  )

  useEffect(() => {
    const grid = api.current
    if (!grid || grid.isDestroyed()) return
    grid.applyColumnState({
      state: columns.map(({ colId }) => ({
        colId: colId!,
        hide: hiddenColumns.includes(colId!),
      })),
    })
    const filters = grid.getFilterModel()
    const visibleFilters = Object.fromEntries(
      Object.entries(filters).filter(([id]) => !hiddenColumns.includes(id)),
    )
    if (Object.keys(filters).length !== Object.keys(visibleFilters).length)
      grid.setFilterModel(visibleFilters)
  }, [hiddenColumns, columns, ready])
  const reset = useRef(tableFilterResetVersion)
  useEffect(() => {
    if (reset.current === tableFilterResetVersion) return
    reset.current = tableFilterResetVersion
    api.current?.setFilterModel(null)
  }, [tableFilterResetVersion])

  return (
    <div className="materials-project-grid">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <span className="text-xs text-slate-500">
          Количество: двойной щелчок → Enter / Tab. Escape — отмена.
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => api.current?.setFilterModel(null)}
          >
            Сбросить фильтры
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!ready}
            onClick={() =>
              api.current?.exportDataAsExcel({
                fileName: 'Проектная база.xlsx',
                sheetName: 'Материалы',
                columnKeys: api.current
                  .getAllDisplayedColumns()
                  .filter((column) => column.getColId() !== 'actions')
                  .map((column) => column.getColId()),
              })
            }
          >
            <Download size={15} />
            Excel
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {columns.every((column) => hiddenColumns.includes(column.colId!)) && (
        <p className="px-4 py-3 text-sm text-slate-500">
          Все столбцы скрыты. Выберите нужные в настройках столбцов над
          таблицей.
        </p>
      )}
      <div style={{ height: 'min(65vh, 620px)', minHeight: 280 }}>
        <MaterialsGridView<MaterialMatrixRow>
          gridId="project-materials"
          theme={materialsGridTheme}
          localeText={projectGridLocale}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={defaultColDef}
          initialState={initialState}
          maintainColumnOrder
          getRowId={({ data }) => data.key}
          rowHeight={58}
          headerHeight={58}
          readOnlyEdit
          stopEditingWhenCellsLoseFocus
          invalidEditValueMode="block"
          cellSelection={true}
          suppressClipboardPaste={false}
          suppressScrollOnNewData
          getRowClass={({ data }) =>
            data &&
            highlight?.rowKey === data.key &&
            highlight.expiresAt > Date.now()
              ? 'materials-grid-changed'
              : data &&
                  Object.values(data.cipherLineIds).includes(selectedLineId)
                ? 'materials-grid-selected'
                : ''
          }
          onGridReady={({ api: grid }) => {
            api.current = grid
            setReady(true)
          }}
          onStateUpdated={({ state }) => saveProjectGridState(state)}
          onGridPreDestroyed={({ state }) => saveProjectGridState(state)}
          onColumnVisible={({ api: grid }) => {
            const known = new Set(
              (grid.getColumns() ?? []).map((column) => column.getColId()),
            )
            const next = [
              ...hiddenRef.current.filter((id) => !known.has(id)),
              ...(grid.getColumns() ?? [])
                .filter((column) => !column.isVisible())
                .map((column) => column.getColId()),
            ]
            if (
              next.length !== hiddenRef.current.length ||
              next.some((id) => !hiddenRef.current.includes(id))
            )
              changeHiddenRef.current(next)
          }}
          onCellClicked={({ data, column }) => {
            const cipher = column.getColId().startsWith('cipher:')
              ? column.getColId().slice(7)
              : ''
            if (data?.cipherLineIds[cipher])
              onSelectLine(data.cipherLineIds[cipher])
          }}
          onCellEditRequest={({ data, column, newValue }) => {
            if (!column.getColId().startsWith('cipher:')) return
            const quantity = parseProjectQuantity(newValue)
            if (quantity === null) {
              setError(quantityError)
              return
            }
            setError('')
            const cipher = column.getColId().slice(7)
            if (quantity !== (data.cipherQuantities[cipher] ?? 0))
              onUpdateQuantity(data, cipher, String(quantity))
          }}
          processDataFromClipboard={({ api: grid, data }) => {
            const focused = grid.getFocusedCell()
            if (!focused) return null
            const displayed = grid.getAllDisplayedColumns(),
              start = displayed.indexOf(focused.column)
            const cells =
              data.at(-1)?.length === 1 && data.at(-1)?.[0] === ''
                ? data.slice(0, -1)
                : data
            if (focused.rowIndex + cells.length > grid.getDisplayedRowCount()) {
              setError(
                'Вставка выходит за пределы существующих материалов. Добавьте материалы через форму или импорт Excel.',
              )
              return null
            }
            for (const row of cells)
              for (const [index, value] of row.entries()) {
                if (
                  displayed[start + index]?.getColId().startsWith('cipher:') &&
                  parseProjectQuantity(value) === null
                ) {
                  setError(`Вставка отменена: ${quantityError}`)
                  return null
                }
              }
            setError('')
            return cells
          }}
        />
      </div>
    </div>
  )
}
