import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ColDef, GridApi, ICellRendererParams } from 'ag-grid-community'
import { Download } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  MaterialsGridView,
  materialsGridSideBar,
  materialsGridTheme,
} from './materials-grid'
import { projectGridLocale } from './project-grid-locale'
import { readDataGridState, saveDataGridState } from './project-grid-state'
import './operations-grid.css'

export type DataColumn<T> = {
  id: string
  title: string
  value: (row: T) => string | number | null | undefined
  render?: (row: T) => ReactNode
  width?: number
  numeric?: boolean
  actions?: boolean
}

const defaults = {
  editable: false,
  sortable: true,
  resizable: true,
  minWidth: 100,
  wrapText: true,
  autoHeight: true,
  wrapHeaderText: true,
  autoHeaderHeight: true,
  floatingFilter: true,
  cellDataType: false,
  filterParams: { debounceMs: 150 },
  useValueFormatterForExport: false,
}
const numberFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 12,
})

function OperationCellRenderer<T>({
  data,
  render,
}: ICellRendererParams<T> & { render: (row: T) => ReactNode }) {
  return data ? render(data) : null
}

/** Read-only operation data. Mutations still go through the existing forms. */
export function OperationsGrid<T>({
  id,
  label,
  rows,
  columns,
  rowId,
  totals,
  isDeleted,
  focusRowId,
}: {
  id: string
  label: string
  rows: Array<T>
  columns: Array<DataColumn<T>>
  rowId: (row: T) => string
  totals?: Array<T>
  isDeleted?: (row: T) => boolean
  focusRowId?: string
}) {
  const api = useRef<GridApi<T> | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [initialState] = useState(() => ({
    ...readDataGridState(id),
    partialColumnState: true,
  }))
  const definitions = useMemo<Array<ColDef<T>>>(
    () =>
      columns.map((column) => ({
        colId: column.id,
        headerName: column.title,
        initialWidth: column.width ?? (column.numeric ? 165 : 210),
        initialPinned: column.actions ? 'right' : undefined,
        filter: column.actions
          ? false
          : column.numeric
            ? 'agNumberColumnFilter'
            : 'agTextColumnFilter',
        sortable: !column.actions,
        suppressColumnsToolPanel: column.actions,
        lockVisible: column.actions,
        valueGetter: ({ data }) => (data ? (column.value(data) ?? null) : null),
        valueFormatter: ({ value }) =>
          value == null || value === ''
            ? '—'
            : typeof value === 'number'
              ? numberFormat.format(value)
              : String(value),
        // Keep the renderer type stable when workspace data refreshes, so local
        // UI state (for example an open document dialog) is not remounted.
        cellRenderer: column.render ? OperationCellRenderer : undefined,
        cellRendererParams: column.render
          ? { render: column.render }
          : undefined,
        cellClass: column.numeric ? 'operations-grid-number' : undefined,
        tooltipValueGetter: column.render
          ? undefined
          : ({ value }) => (value == null ? '' : String(value)),
      })),
    [columns],
  )
  useLayoutEffect(
    () => () => {
      const grid = api.current
      if (grid && !grid.isDestroyed()) saveDataGridState(id, grid.getState())
    },
    [id],
  )
  useEffect(() => {
    const grid = api.current
    if (!ready || !grid || grid.isDestroyed() || !focusRowId) return
    const row = grid.getRowNode(focusRowId)
    if (!row) return
    // A document link must remain reachable even after a saved column filter.
    grid.setFilterModel(null)
    grid.ensureNodeVisible(row, 'middle')
    container.current?.scrollIntoView({ block: 'nearest' })
  }, [ready, focusRowId])

  return (
    <div
      ref={container}
      className="operations-grid min-w-0 max-w-full"
      aria-label={label}
    >
      <div className="flex flex-wrap items-center justify-end gap-2 border-b bg-white px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={!ready}
          onClick={() => api.current?.setFilterModel(null)}
        >
          Сбросить фильтры
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!ready}
          aria-label={`Экспорт Excel: ${label}`}
          onClick={() => {
            const grid = api.current
            if (!grid) return
            grid.exportDataAsExcel({
              fileName: `${label.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`,
              sheetName: 'Материалы',
              columnKeys: grid
                .getAllDisplayedColumns()
                .filter(
                  (column) =>
                    !columns.find((item) => item.id === column.getColId())
                      ?.actions,
                )
                .map((column) => column.getColId()),
            })
          }}
        >
          <Download size={14} /> Excel
        </Button>
      </div>
      <div
        style={{
          height: Math.min(
            520,
            Math.max(260, 168 + (rows.length + (totals?.length ?? 0)) * 78),
          ),
        }}
      >
        <MaterialsGridView<T>
          gridId={id}
          theme={materialsGridTheme}
          localeText={projectGridLocale}
          rowData={rows}
          pinnedBottomRowData={totals}
          getRowId={({ data }) => rowId(data)}
          columnDefs={definitions}
          defaultColDef={defaults}
          initialState={initialState}
          sideBar={materialsGridSideBar}
          cellSelection
          readOnlyEdit
          rowHeight={64}
          suppressScrollOnNewData
          rowClassRules={{
            'operations-grid-deleted': ({ data }) =>
              Boolean(data && isDeleted?.(data)),
            'operations-grid-focused': ({ data }) =>
              Boolean(data && focusRowId && rowId(data) === focusRowId),
          }}
          onGridReady={({ api: grid }) => {
            api.current = grid
            setReady(true)
          }}
          onStateUpdated={({ state }) => saveDataGridState(id, state)}
          onGridPreDestroyed={({ state }) => saveDataGridState(id, state)}
        />
      </div>
    </div>
  )
}
