import { RowActionButton } from '#/components/ui/row-action'
import { projectFieldValue } from './project-edit-draft'
import type { ProjectEditableField } from './project-edit-draft'
import { useProjectAccounting } from './project-accounting-context'
import { MaterialsGridView, materialsGridTheme } from './materials-grid'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  ColDef,
  GridApi,
  GridState,
  ICellRendererParams,
} from 'ag-grid-community'
import { projectGridLocale } from './project-grid-locale'
import { Pencil, Trash2 } from 'lucide-react'
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
import { materialsColumnFilter } from './materials-column-filter'

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
  filter: materialsColumnFilter,
  floatingFilter: false,
  suppressHeaderMenuButton: true,
  wrapHeaderText: true,
  autoHeaderHeight: true,
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
  onUpdateField,
  draftCells,
  onReady,
  onFilterChanged,
}: {
  onUpdateField?: (
    row: MaterialMatrixRow,
    field: ProjectEditableField,
    value: unknown,
  ) => void
  draftCells?: Map<string, Set<string>>
  ciphers: Array<string>
  hiddenColumns: Array<string>
  onChangeHiddenColumns: (keys: Array<string>) => void
  highlight: MaterialHighlight | null
  rows: Array<MaterialMatrixRow>
  selectedLineId: string
  tableFilterResetVersion: number
  onReady?: (api: GridApi<MaterialMatrixRow> | null) => void
  onFilterChanged?: (active: boolean, count: number) => void
  onEditLine: (id: string) => void
  onRequestDelete: (value: PendingDeleteMaterial) => void
  onSelectLine: (id: string) => void
  onUpdateQuantity: (
    row: MaterialMatrixRow,
    cipher: string,
    value: string,
  ) => void
}) {
  const accounting = useProjectAccounting()
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
          editable: !!onUpdateField,
          cellEditor: 'agTextCellEditor',
          cellEditorParams: {
            getValidationErrors: ({ value }: { value: unknown }) => {
              try {
                projectFieldValue(column.key, value)
                return null
              } catch (cause) {
                return [
                  cause instanceof Error
                    ? cause.message
                    : 'Проверьте значение.',
                ]
              }
            },
          },
          cellClassRules: {
            'materials-grid-draft': ({ data }) =>
              !!data?.lineIds.some((id) =>
                draftCells?.get(id)?.has(column.key),
              ),
          },
        }),
      ),
      ...ciphers.map(
        (cipher): ColDef<MaterialMatrixRow> => ({
          colId: `cipher:${cipher}`,
          headerName: (() => {
            const change = accounting.projectChanges
              ?.filter(
                (item) => item.cipher === cipher && item.kind === 'revision',
              )
              .at(-1)
            return change ? `${cipher} · ИЗМ ${change.number}` : cipher
          })(),
          initialWidth: 132,
          initialHide: hiddenRef.current.includes(`cipher:${cipher}`),
          editable: true,
          cellEditor: 'agTextCellEditor',
          cellEditorParams: {
            getValidationErrors: ({ value }: { value: unknown }) =>
              parseProjectQuantity(value) === null ? [quantityError] : null,
          },
          cellClass: 'materials-grid-quantity',
          cellClassRules: {
            'materials-grid-draft': ({ data }) =>
              !!data &&
              !!draftCells
                ?.get(data.cipherLineIds[cipher] ?? '')
                ?.has('plannedQuantity'),
          },
          headerClass: 'materials-grid-header-center',
          valueGetter: ({ data }) => data?.cipherQuantities[cipher] ?? 0,
          valueFormatter: ({ value }) =>
            value === 0 ? '—' : quantityText(value),
          useValueFormatterForExport: false,
        }),
      ),
      {
        colId: 'actions',
        headerName: 'Действия',
        initialWidth: 104,
        minWidth: 104,
        maxWidth: 104,
        resizable: false,
        suppressSizeToFit: true,
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
              <RowActionButton
                iconOnly
                aria-label="Редактировать материал"
                onClick={() => onEditLine(data.firstLineId)}
              >
                <Pencil size={16} />
              </RowActionButton>
              <RowActionButton
                iconOnly
                danger
                aria-label="Удалить материал"
                onClick={() =>
                  onRequestDelete({
                    lineIds: data.lineIds,
                    name: data.projectMaterialName,
                  })
                }
              >
                <Trash2 size={16} />
              </RowActionButton>
            </div>
          ),
        suppressKeyboardEvent: ({ event }) =>
          event.key === 'Enter' || event.key === ' ',
      },
    ],
    [
      ciphers,
      onEditLine,
      onRequestDelete,
      accounting.projectChanges,
      onUpdateField,
      draftCells,
    ],
  )

  useEffect(() => {
    const grid = api.current
    if (!grid || grid.isDestroyed()) return
    // The native chooser owns visibility; replaying React state here can undo
    // a newer checkbox click while AG Grid's visibility event is still queued.
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
    <div className="materials-project-grid flex min-h-0 flex-1 flex-col">
      {error && (
        <p role="alert" className="shrink-0 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {columns.every((column) => hiddenColumns.includes(column.colId!)) && (
        <div className="flex shrink-0 items-center gap-3 px-4 py-3 text-sm text-slate-500">
          Все столбцы скрыты.
          <Button
            variant="ghost"
            size="sm"
            onClick={() => api.current?.showColumnChooser()}
          >
            Выбрать столбцы
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <MaterialsGridView<MaterialMatrixRow>
          gridId="project-materials"
          theme={materialsGridTheme}
          localeText={projectGridLocale}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={defaultColDef}
          initialState={initialState}
          maintainColumnOrder
          getRowId={({ data }) => JSON.stringify([...data.lineIds].sort())}
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
            onReady?.(grid)
          }}
          onModelUpdated={({ api: grid }) =>
            onFilterChanged?.(
              grid.isAnyFilterPresent(),
              grid.getDisplayedRowCount(),
            )
          }
          onStateUpdated={({ state }) => saveProjectGridState(state)}
          onGridPreDestroyed={({ state }) => {
            saveProjectGridState(state)
            onReady?.(null)
          }}
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
            const field = projectMatrixColumns.find(
              (item) => item.key === column.getColId(),
            )?.key
            if (field) {
              try {
                const value = projectFieldValue(field, newValue)
                if (value !== data[field]) onUpdateField?.(data, field, value)
                setError('')
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Проверьте значение.',
                )
              }
              return
            }
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
            for (const [rowOffset, row] of cells.entries())
              for (const [index, value] of row.entries()) {
                const columnId = displayed[start + index]?.getColId()
                const field = projectMatrixColumns.find(
                  (item) => item.key === columnId,
                )?.key
                try {
                  if (
                    columnId?.startsWith('cipher:') &&
                    parseProjectQuantity(value) === null
                  )
                    throw new Error(quantityError)
                  if (field) {
                    projectFieldValue(field, value)
                    if (
                      (grid.getDisplayedRowAtIndex(focused.rowIndex + rowOffset)
                        ?.data?.lineIds.length ?? 0) > 1
                    )
                      throw new Error(
                        'Перед вставкой характеристик выберите один шифр в фильтре. Количества можно вставлять сразу по нескольким шифрам.',
                      )
                  }
                } catch (cause) {
                  setError(
                    `Вставка отменена: ${cause instanceof Error ? cause.message : 'проверьте значения'}`,
                  )
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
