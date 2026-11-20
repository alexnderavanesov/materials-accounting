import { useOperationDisplay } from './operation-display'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type {
  ColDef,
  FilterModel,
  GridApi,
  ICellRendererParams,
  ICellEditorParams,
  PostSortRowsParams,
} from 'ag-grid-community'
import { Download } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { MaterialsGridView, materialsGridTheme } from './materials-grid'
import { projectGridLocale } from './project-grid-locale'
import { readDataGridState, saveDataGridState } from './project-grid-state'
import {
  defaultOperationPageSize,
  operationPageSizes,
} from './operation-pagination'
import { isViewString, useWorkspaceViewState } from './workspace-view'
import './operations-grid.css'
import { materialsColumnFilter } from './materials-column-filter'
import { withOperationIndicatorColumns } from './operation-indicator-columns'
import type { OperationGridIndicators } from './operation-indicator-columns'
import { usePageGridHeader } from './use-page-grid-header'
import { formatCalendarDate, normalizeCalendarDate } from './calendar-date'

export type DataColumn<T> = {
  id: string
  title: string
  value: (row: T) => string | number | null | undefined
  render?: (row: T) => ReactNode
  /** Preserve meaningful status labels when switching to the plain table view. */
  renderInTable?: boolean
  width?: number
  minWidth?: number
  flex?: number
  multiline?: boolean
  numeric?: boolean
  date?: boolean
  centered?: boolean
  actions?: boolean
  onEdit?: (row: T, value: string) => void
  validateEdit?: (value: string) => string | null
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
  floatingFilter: false,
  suppressHeaderMenuButton: true,
  cellDataType: false,
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

/** Read-only by default; draft forms can opt specific columns into editing. */
export function OperationsGrid<T>({
  id: baseId,
  label,
  rows,
  columns: baseColumns,
  rowId,
  totals,
  isDeleted,
  focusRowId,
  pagination: requestedPagination = false,
  paginationFilterKey = '',
  priorityRow,
  onReady,
  firstColumnId,
  initialColumnOrder,
  initialFilterModel,
  onFilterModelChange,
  indicators,
  pageScroll = false,
  fillHeight = false,
  centerHeaders = false,
}: {
  id: string
  label: string
  rows: Array<T>
  columns: Array<DataColumn<T>>
  rowId: (row: T) => string
  totals?: Array<T>
  isDeleted?: (row: T) => boolean
  focusRowId?: string
  pagination?: boolean
  paginationFilterKey?: string
  priorityRow?: (row: T) => boolean
  onReady?: (api: GridApi<T>) => void
  /** Keep this column first when restoring an older saved layout. */
  firstColumnId?: string
  /** Use this order instead of the saved order, preserving other view settings. */
  initialColumnOrder?: Array<string>
  /** Override stored filters; null starts without filters. */
  initialFilterModel?: FilterModel | null
  onFilterModelChange?: (model: FilterModel) => void
  indicators?: OperationGridIndicators<T>
  /** Expanded tables use page scrolling; large documents retain pagination. */
  pageScroll?: boolean
  /** Main section table fills the available viewport with virtual row scrolling. */
  fillHeight?: boolean
  centerHeaders?: boolean
}) {
  const { mode } = useOperationDisplay()
  const plain = mode === 'table' && !baseColumns.some((column) => column.onEdit)
  const id = plain ? `${baseId}:table` : baseId
  const pagination =
    !plain &&
    !fillHeight &&
    (requestedPagination || (pageScroll && rows.length > 100))
  const scrollWithPage = pageScroll && !plain && !fillHeight
  const columns = useMemo(
    () =>
      plain
        ? baseColumns.map((column) =>
            column.actions || column.renderInTable
              ? column
              : { ...column, render: undefined },
          )
        : withOperationIndicatorColumns(baseColumns, indicators),
    [baseColumns, indicators, plain],
  )
  const api = useRef<GridApi<T> | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  usePageGridHeader(container, scrollWithPage && ready)
  const [filtered, setFiltered] = useState(false)
  const postSortRows = useCallback(
    ({ nodes }: PostSortRowsParams<T>) => {
      if (!priorityRow) return
      const first = nodes.filter((node) => node.data && priorityRow(node.data))
      const rest = nodes.filter((node) => !node.data || !priorityRow(node.data))
      nodes.splice(0, nodes.length, ...first, ...rest)
    },
    [priorityRow],
  )
  const hasEditableColumns = columns.some((column) => column.onEdit)
  const [savedFilterKey, setSavedFilterKey] = useWorkspaceViewState(
    `${id}.paginationFilter`,
    paginationFilterKey,
    isViewString,
  )
  const [initialState] = useState(() => {
    const saved = readDataGridState(id)
    const orderedColIds = initialColumnOrder ?? saved.columnOrder?.orderedColIds
    return {
      ...saved,
      filter:
        initialFilterModel === undefined
          ? saved.filter
          : { filterModel: initialFilterModel ?? {} },
      columnOrder: orderedColIds
        ? {
            orderedColIds: firstColumnId
              ? [
                  firstColumnId,
                  ...orderedColIds.filter((colId) => colId !== firstColumnId),
                ]
              : orderedColIds,
          }
        : undefined,
      columnVisibility:
        firstColumnId && saved.columnVisibility
          ? {
              hiddenColIds: saved.columnVisibility.hiddenColIds.filter(
                (colId) => colId !== firstColumnId,
              ),
            }
          : saved.columnVisibility,
      pagination: pagination
        ? {
            page:
              savedFilterKey === paginationFilterKey
                ? (saved.pagination?.page ?? 0)
                : 0,
            pageSize: saved.pagination?.pageSize ?? defaultOperationPageSize,
          }
        : undefined,
      partialColumnState: true,
    }
  })
  const definitions = useMemo<Array<ColDef<T>>>(
    () =>
      columns.map((column) => ({
        colId: column.id,
        headerName: column.title,
        headerClass: centerHeaders
          ? 'operations-grid-header-centered'
          : undefined,
        initialWidth: column.width ?? (column.numeric ? 165 : 210),
        minWidth: column.actions
          ? (column.width ?? 210)
          : (column.minWidth ?? defaults.minWidth),
        maxWidth: column.actions ? (column.width ?? 210) : undefined,
        resizable: !column.actions,
        suppressSizeToFit: column.actions,
        initialFlex: column.actions ? undefined : column.flex,
        initialPinned: column.actions ? 'right' : undefined,
        filter: column.actions ? false : materialsColumnFilter,
        sortable: !column.actions,
        comparator: column.date
          ? (a, b) =>
              (
                normalizeCalendarDate(String(a ?? '')) ?? String(a ?? '')
              ).localeCompare(
                normalizeCalendarDate(String(b ?? '')) ?? String(b ?? ''),
              )
          : undefined,
        suppressColumnsToolPanel: column.actions,
        lockVisible: column.actions,
        editable: Boolean(column.onEdit && !column.actions),
        cellEditor: column.multiline
          ? 'agLargeTextCellEditor'
          : 'agTextCellEditor',
        cellEditorPopup: column.multiline,
        cellEditorParams: {
          useFormatter: Boolean(column.date),
          getValidationErrors: ({ value }) => {
            const error = column.validateEdit?.(String(value ?? ''))
            return error ? [error] : null
          },
        } satisfies Partial<ICellEditorParams<T>> & { useFormatter: boolean },
        useValueFormatterForExport: Boolean(column.date),
        valueGetter: ({ data }) => (data ? (column.value(data) ?? null) : null),
        valueSetter: ({ data, newValue }) => {
          const text = String(newValue ?? '')
          const value = column.date
            ? (normalizeCalendarDate(text) ?? text)
            : text
          if (!column.validateEdit?.(value)) column.onEdit?.(data, value)
          // Keep row data immutable; React supplies the validated draft.
          // A setter is synchronous, unlike cellEditRequest, so Apply sees
          // the final edit immediately after stopEditing().
          return false
        },
        valueFormatter: ({ value }) =>
          value == null || value === ''
            ? '—'
            : column.date
              ? formatCalendarDate(String(value))
              : typeof value === 'number'
                ? numberFormat.format(value)
                : String(value),
        // Keep the renderer type stable when workspace data refreshes, so local
        // UI state (for example an open document dialog) is not remounted.
        cellRenderer: column.render ? OperationCellRenderer : undefined,
        cellRendererParams: column.render
          ? { render: column.render }
          : undefined,
        cellClass: [
          ...(column.numeric ? ['operations-grid-number'] : []),
          ...(column.centered ? ['operations-grid-centered'] : []),
          ...(hasEditableColumns && !column.onEdit
            ? ['operations-grid-readonly']
            : []),
        ],
        tooltipValueGetter: column.render
          ? undefined
          : ({ value }) =>
              value == null
                ? ''
                : column.date
                  ? formatCalendarDate(String(value))
                  : String(value),
      })),
    [columns, hasEditableColumns, centerHeaders],
  )
  useLayoutEffect(
    () => () => {
      const grid = api.current
      if (grid && !grid.isDestroyed()) saveDataGridState(id, grid.getState())
    },
    [id],
  )
  useEffect(() => {
    if (!pagination || !ready || savedFilterKey === paginationFilterKey) return
    api.current?.paginationGoToFirstPage()
    setSavedFilterKey(paginationFilterKey)
  }, [
    pagination,
    ready,
    savedFilterKey,
    paginationFilterKey,
    setSavedFilterKey,
  ])
  useEffect(() => {
    const grid = api.current
    if (!ready || !grid || grid.isDestroyed() || !focusRowId) return
    const row = grid.getRowNode(focusRowId)
    if (!row) return
    // A document link must remain reachable even after a saved column filter.
    grid.setFilterModel(null)
    if (pagination && row.rowIndex !== null) {
      grid.paginationGoToPage(
        Math.floor(row.rowIndex / grid.paginationGetPageSize()),
      )
    }
    grid.ensureNodeVisible(row, 'middle')
    container.current?.scrollIntoView({ block: 'nearest' })
  }, [ready, focusRowId, pagination])

  return (
    <div
      ref={container}
      className={`operations-grid min-w-0 max-w-full${scrollWithPage ? ' operations-grid-page-scroll' : ''}${fillHeight ? ' operations-grid-fill' : ''}`}
      aria-label={label}
    >
      <div className="flex flex-wrap items-center justify-end gap-2 bg-white px-3 py-1">
        {filtered && (
          <Button
            size="sm"
            variant="ghost"
            disabled={!ready}
            onClick={() => api.current?.setFilterModel(null)}
          >
            Сбросить фильтры
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
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
        className={fillHeight ? 'min-h-0 flex-1' : undefined}
        style={
          scrollWithPage || fillHeight
            ? undefined
            : {
                height: Math.min(
                  520,
                  Math.max(
                    260,
                    168 + (rows.length + (totals?.length ?? 0)) * 78,
                  ),
                ),
              }
        }
      >
        <MaterialsGridView<T>
          gridId={id}
          domLayout={scrollWithPage ? 'autoHeight' : 'normal'}
          theme={materialsGridTheme}
          localeText={projectGridLocale}
          rowData={rows}
          postSortRows={postSortRows}
          pinnedBottomRowData={totals}
          getRowId={({ data }) => rowId(data)}
          columnDefs={definitions}
          maintainColumnOrder={initialColumnOrder !== undefined}
          defaultColDef={defaults}
          initialState={initialState}
          pagination={pagination}
          paginationPageSize={defaultOperationPageSize}
          paginationPageSizeSelector={operationPageSizes}
          cellSelection
          readOnlyEdit={!hasEditableColumns}
          invalidEditValueMode="block"
          stopEditingWhenCellsLoseFocus
          rowHeight={64}
          suppressScrollOnNewData
          suppressRowVirtualisation={fillHeight ? false : undefined}
          rowClassRules={{
            'operations-grid-deleted': ({ data }) =>
              Boolean(data && isDeleted?.(data)),
            'operations-grid-focused': ({ data }) =>
              Boolean(data && focusRowId && rowId(data) === focusRowId),
          }}
          onGridReady={({ api: grid }) => {
            api.current = grid
            setReady(true)
            onReady?.(grid)
          }}
          onStateUpdated={({ state }) => saveDataGridState(id, state)}
          onFirstDataRendered={({ api: grid }) =>
            setFiltered(grid.isAnyFilterPresent())
          }
          onFilterChanged={({ api: grid }) => {
            setFiltered(grid.isAnyFilterPresent())
            onFilterModelChange?.(grid.getFilterModel())
          }}
          onGridPreDestroyed={({ state }) => saveDataGridState(id, state)}
        />
      </div>
    </div>
  )
}
