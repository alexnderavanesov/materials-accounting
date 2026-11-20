import { useMemo, useRef, useState } from 'react'
import type { GridApi, ColDef, ICellRendererParams } from 'ag-grid-community'
import { Input } from '#/components/ui/input'
import { MaterialsGridView, materialsGridTheme } from './materials-grid'
import { materialsColumnFilter } from './materials-column-filter'
import { projectGridLocale } from './project-grid-locale'
import { readDataGridState, saveDataGridState } from './project-grid-state'
import './customer-return-grid.css'

export type CustomerReturnGridRow = {
  id: string
  name: string
  requestNumber: string
  cipher: string
  unit: string
  available: number
  quantity: string
  amount: number | null
  alternativeQuantity: number | null
  alternativeUnit: string
  error: string
}

type Actions = { onUpdate: (id: string, value: string) => void }
const numberFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 12,
})
const format = (value: number | null | undefined) =>
  value == null ? '—' : numberFormat.format(value)

function QuantityCell({
  data,
  actions,
  api,
  node,
  eGridCell,
}: ICellRendererParams<CustomerReturnGridRow> & {
  actions: React.RefObject<Actions>
}) {
  if (!data) return null
  return (
    <Input
      className="customer-return-input"
      aria-label={`Возвратить: ${data.name}`}
      aria-invalid={Boolean(data.error) || undefined}
      title={data.error || undefined}
      inputMode="decimal"
      placeholder="0"
      value={data.quantity}
      tabIndex={-1}
      onChange={(event) =>
        actions.current.onUpdate(data.id, event.target.value)
      }
      onKeyDown={(event) => {
        if (event.key !== 'Tab' && event.key !== 'Enter') return
        if (node.rowIndex === null) return
        const next = node.rowIndex + (event.shiftKey ? -1 : 1)
        if (!api.getDisplayedRowAtIndex(next)) return
        event.preventDefault()
        event.stopPropagation()
        const root = eGridCell.closest('.ag-root')
        api.ensureIndexVisible(next)
        api.ensureColumnVisible('quantity')
        api.setFocusedCell(next, 'quantity')
        requestAnimationFrame(() => {
          if (api.isDestroyed() || !root?.isConnected) return
          root
            .querySelector<HTMLInputElement>(
              `.ag-row[row-index="${next}"] [col-id="quantity"] input`,
            )
            ?.focus({ preventScroll: true })
        })
      }}
    />
  )
}

export function CustomerReturnGrid({
  rows,
  readOnly = false,
  onUpdate,
}: Actions & { rows: CustomerReturnGridRow[]; readOnly?: boolean }) {
  const gridId = readOnly
    ? 'customer-return-review'
    : 'customer-return-materials'
  const actions = useRef({ onUpdate })
  actions.current = { onUpdate }
  const api = useRef<GridApi<CustomerReturnGridRow> | null>(null)
  const [filtered, setFiltered] = useState(false)
  const [initialState] = useState(() => ({
    ...readDataGridState(gridId),
    filter: undefined,
    partialColumnState: true,
  }))
  const hasAlternative = rows.some((row) => row.alternativeUnit)
  const columns = useMemo<ColDef<CustomerReturnGridRow>[]>(
    () => [
      {
        field: 'name',
        headerName: 'Материал',
        initialWidth: 320,
        minWidth: 260,
        initialFlex: 1,
        wrapText: true,
        cellRenderer: ({
          value,
        }: ICellRendererParams<CustomerReturnGridRow>) => (
          <span className="customer-return-text">{value}</span>
        ),
      },
      {
        colId: 'quantity',
        headerName: readOnly ? 'Возвращаем' : 'Вернуть',
        initialWidth: 145,
        minWidth: 130,
        valueGetter: ({ data }) => data?.amount ?? null,
        valueFormatter: ({ value }) => format(value),
        cellRenderer: readOnly ? undefined : QuantityCell,
        cellRendererParams: {
          actions,
          suppressMouseEventHandling: () => true,
        },
        cellClass: readOnly
          ? 'customer-return-number'
          : 'customer-return-editable',
      },
      { field: 'unit', headerName: 'Ед.', initialWidth: 70, minWidth: 65 },
      {
        field: 'available',
        headerName: 'К возврату',
        initialWidth: 130,
        cellClass: 'customer-return-number',
        valueFormatter: ({ value }) => format(value),
      },
      ...(hasAlternative
        ? [
            {
              field: 'alternativeQuantity' as const,
              headerName: 'В альтернативной единице',
              initialWidth: 170,
              cellClass: 'customer-return-number',
              valueFormatter: ({
                value,
                data,
              }: {
                value: number | null
                data?: CustomerReturnGridRow
              }) =>
                value == null
                  ? '—'
                  : `${format(value)} ${data?.alternativeUnit ?? ''}`,
            },
          ]
        : []),
      {
        field: 'requestNumber',
        headerName: 'Заявка',
        initialWidth: 280,
        wrapText: true,
        cellRenderer: ({
          value,
        }: ICellRendererParams<CustomerReturnGridRow>) => (
          <span className="customer-return-text">{value || '—'}</span>
        ),
      },
      { field: 'cipher', headerName: 'Шифр', initialWidth: 220 },
    ],
    [hasAlternative, readOnly],
  )
  return (
    <section
      className="customer-return-grid"
      aria-label={readOnly ? 'Проверка возврата' : 'Материалы к возврату'}
    >
      {filtered && (
        <div className="customer-return-filter-bar">
          <button
            type="button"
            onClick={() => api.current?.setFilterModel(null)}
          >
            Сбросить фильтры таблицы
          </button>
        </div>
      )}
      <div className="customer-return-grid-body">
        <MaterialsGridView<CustomerReturnGridRow>
          gridId={gridId}
          theme={materialsGridTheme}
          localeText={{
            ...projectGridLocale,
            noRowsToShow: 'Нет материалов к возврату',
          }}
          rowData={rows}
          columnDefs={columns}
          maintainColumnOrder
          defaultColDef={{
            sortable: true,
            resizable: true,
            filter: materialsColumnFilter,
            minWidth: 110,
            wrapHeaderText: true,
            autoHeaderHeight: true,
            cellDataType: false,
            suppressHeaderMenuButton: true,
            tooltipValueGetter: ({ value }) =>
              value == null ? '' : String(value),
            suppressKeyboardEvent: ({ event }) => {
              if (event.target instanceof HTMLInputElement) return true
              if (event.key === 'Enter' || event.key === 'F2') {
                const input =
                  event.target instanceof Element
                    ? event.target.closest('.ag-cell')?.querySelector('input')
                    : null
                if (input) {
                  event.preventDefault()
                  input.focus()
                  return true
                }
              }
              return false
            },
          }}
          initialState={initialState}
          getRowId={({ data }) => data.id}
          rowHeight={64}
          headerHeight={48}
          rowBuffer={5}
          pagination={false}
          cellSelection
          readOnlyEdit
          suppressScrollOnNewData
          suppressRowVirtualisation={false}
          onGridReady={({ api: grid }) => {
            api.current = grid
          }}
          onFilterChanged={({ api: grid }) =>
            setFiltered(grid.isAnyFilterPresent())
          }
          onStateUpdated={({ state }) => saveDataGridState(gridId, state)}
          onGridPreDestroyed={({ state }) => saveDataGridState(gridId, state)}
        />
      </div>
    </section>
  )
}
