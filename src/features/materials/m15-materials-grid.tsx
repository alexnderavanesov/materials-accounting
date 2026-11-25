import { useMemo, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type {
  ColDef,
  FilterModel,
  GridApi,
  ICellRendererParams,
  PostSortRowsParams,
} from 'ag-grid-community'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import { MaterialsGridView, materialsGridTheme } from './materials-grid'
import { materialsColumnFilter } from './materials-column-filter'
import { projectGridLocale } from './project-grid-locale'
import {
  parseProjectQuantity,
  readDataGridState,
  saveDataGridState,
} from './project-grid-state'
import './request-materials-grid.css'

export type M15MaterialRow = {
  id: string
  lineId?: string
  projectLineId?: string
  inRequest: boolean
  requested: { quantity: number; unit: string }[]
  received: { quantity: number; unit: string }[]
  projectQuantity: number | null
  documentedQuantity: number | null
  cipherQuantity: number | null
  cipherExcess: number | null
  projectUnit: string
  name: string
  invoiceName: string
  unit: string
  composition: string
  normativeDocument: string
  materialType: string
  quantity: string
  needsMatch: boolean
}
type Actions = {
  onQuantity: (row: M15MaterialRow, text: string) => void
  onOpen: (row: M15MaterialRow) => void
}
type Cell = ICellRendererParams<M15MaterialRow> & {
  actions: React.RefObject<Actions>
}
const gridId = 'm15-material-picker'
const fmt = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 9 }).format(value)
const requestedLabel = (data?: M15MaterialRow) =>
  data?.requested
    .map(({ quantity, unit }) => `${fmt(quantity)} ${unit}`)
    .join(' · ') || '—'
const receivedLabel = (data?: M15MaterialRow) =>
  data?.received
    .map(
      ({ quantity, unit }) =>
        `${fmt(quantity)}${unit === data.unit ? '' : ` ${unit}`}`,
    )
    .join(' · ') || (data?.projectLineId ? '0' : '—')
const projectQuantityLabel = (data?: M15MaterialRow) =>
  data?.projectQuantity == null
    ? '—'
    : `${fmt(data.projectQuantity)}${data.projectUnit === data.unit ? '' : ` ${data.projectUnit}`}`

function prioritizeRequestRows({ nodes }: PostSortRowsParams<M15MaterialRow>) {
  if (!nodes.some((node) => node.data?.inRequest)) return
  // Keep the chosen column sort within each group, including restored sorts.
  const ordered = [
    ...nodes.filter((node) => node.data?.inRequest),
    ...nodes.filter((node) => !node.data?.inRequest),
  ]
  ordered.forEach((node, index) => {
    nodes[index] = node
  })
}

function QuantityCell({ data, actions, api, node, eGridCell }: Cell) {
  if (!data) return null
  return (
    <div className="grid gap-1">
      <Input
        className="request-material-input"
        aria-label={`Количество по М-15: ${data.invoiceName}, ${data.unit}`}
        aria-invalid={parseProjectQuantity(data.quantity) === null || undefined}
        inputMode="decimal"
        placeholder="0"
        value={data.quantity}
        tabIndex={-1}
        onChange={(event) =>
          actions.current.onQuantity(data, event.target.value)
        }
        onKeyDown={(event) => {
          if (event.key !== 'Tab' && event.key !== 'Enter') return
          if (node.rowIndex === null) return
          const next = node.rowIndex + (event.shiftKey ? -1 : 1)
          if (!api.getDisplayedRowAtIndex(next)) return
          event.preventDefault()
          event.stopPropagation()
          api.ensureIndexVisible(next)
          api.ensureColumnVisible('quantity')
          api.setFocusedCell(next, 'quantity')
          const root = eGridCell.closest('.ag-root')
          requestAnimationFrame(() => {
            if (!root?.isConnected || api.isDestroyed()) return
            root
              .querySelector<HTMLInputElement>(
                `.ag-row[row-index="${next}"] [col-id="quantity"] input`,
              )
              ?.focus({ preventScroll: true })
          })
        }}
      />
      {(data.cipherExcess ?? 0) > 0 && (
        <span
          className="truncate text-[11px] leading-3 text-amber-800"
          title={`Превышение по шифру: ${fmt(data.cipherExcess!)} ${data.projectUnit}`}
        >
          Превышение: {fmt(data.cipherExcess!)} {data.projectUnit}
        </span>
      )}
    </div>
  )
}
function MaterialCell({ data }: ICellRendererParams<M15MaterialRow>) {
  if (!data) return null
  return (
    <div className="min-w-0">
      <span className="request-material-name">{data.name}</span>
      {data.needsMatch ? (
        <span className="text-xs text-amber-700">Укажите материал проекта</span>
      ) : (
        data.invoiceName !== data.name && (
          <span className="block truncate text-xs text-slate-500">
            По М-15: {data.invoiceName}
          </span>
        )
      )}
    </div>
  )
}
function ActionsCell({ data, actions }: Cell) {
  return data ? (
    <Button
      size="icon"
      variant="ghost"
      className="h-8 w-8"
      aria-label={`Настроить материал: ${data.name}`}
      title="Название по накладной и единица"
      onClick={() => actions.current.onOpen(data)}
    >
      <SlidersHorizontal size={16} />
    </Button>
  ) : null
}

export function M15MaterialsGrid({
  rows,
  showRequested = false,
  emptyMessage,
  onQuantity,
  onOpen,
  initialFilterModel,
  onFilterChange,
}: Actions & {
  rows: M15MaterialRow[]
  showRequested?: boolean
  emptyMessage: string
  initialFilterModel: FilterModel | null
  onFilterChange: (model: FilterModel | null) => void
}) {
  const actions = useRef({ onQuantity, onOpen })
  actions.current = { onQuantity, onOpen }
  const api = useRef<GridApi<M15MaterialRow> | null>(null)
  const [filtered, setFiltered] = useState(false)
  const [initialState] = useState(() => {
    const saved = readDataGridState(gridId)
    const orderedColIds = saved.columnOrder?.orderedColIds
    // Keep new reference columns beside the quantity in saved layouts too.
    if (orderedColIds) {
      let previous = 'quantity'
      for (const id of [
        ...(showRequested ? ['requested'] : []),
        'documentedQuantity',
        'cipherQuantity',
        'received',
        'projectQuantity',
      ]) {
        if (!orderedColIds.includes(id))
          orderedColIds.splice(orderedColIds.indexOf(previous) + 1, 0, id)
        previous = id
      }
    }
    return {
      ...saved,
      filter: initialFilterModel
        ? { filterModel: initialFilterModel }
        : undefined,
      partialColumnState: true,
    }
  })
  const columns = useMemo<ColDef<M15MaterialRow>[]>(
    () => [
      {
        field: 'name',
        headerName: 'Материал',
        initialWidth: 340,
        minWidth: 280,
        initialFlex: 1,
        cellRenderer: MaterialCell,
      },
      {
        colId: 'quantity',
        headerName: 'Количество по М-15',
        initialWidth: 155,
        minWidth: 130,
        valueGetter: ({ data }) =>
          data?.quantity ? parseProjectQuantity(data.quantity) : null,
        cellRenderer: QuantityCell,
        cellRendererParams: { actions, suppressMouseEventHandling: () => true },
        cellClass: 'request-material-editable',
      },
      ...(showRequested
        ? [
            {
              colId: 'requested',
              headerName: 'По заявке',
              initialWidth: 125,
              minWidth: 110,
              cellClass: 'request-material-number',
              valueGetter: ({ data }) =>
                data?.requested.length === 1
                  ? data.requested[0]!.quantity
                  : null,
              valueFormatter: ({ data }) => requestedLabel(data),
              tooltipValueGetter: ({ data }) => requestedLabel(data),
            } satisfies ColDef<M15MaterialRow>,
          ]
        : []),
      {
        field: 'documentedQuantity',
        headerName: 'Уже получено по М-15',
        headerTooltip:
          'Сумма других М-15 по материалу выбранного шифра. Текущая накладная не включена.',
        initialWidth: 165,
        cellClass: 'request-material-number',
        valueFormatter: ({ data }) =>
          data?.documentedQuantity == null
            ? '—'
            : `${fmt(data.documentedQuantity)}${data.projectUnit === data.unit ? '' : ` ${data.projectUnit}`}`,
      },
      {
        field: 'cipherQuantity',
        headerName: 'По шифру',
        headerTooltip:
          'Текущее проектное количество материала по выбранному шифру',
        initialWidth: 130,
        cellClass: 'request-material-number',
        valueFormatter: ({ data }) =>
          data?.cipherQuantity == null
            ? '—'
            : `${fmt(data.cipherQuantity)}${data.projectUnit === data.unit ? '' : ` ${data.projectUnit}`}`,
      },
      {
        colId: 'received',
        headerName: 'По АПП с учётом возвратов',
        headerTooltip:
          'Получения материала выбранного шифра за вычетом возвратов заказчику',
        initialWidth: 125,
        cellClass: 'request-material-number',
        valueGetter: ({ data }) =>
          data?.received.length === 1
            ? data.received[0]!.quantity
            : data?.received.length === 0 && data.projectLineId
              ? 0
              : null,
        valueFormatter: ({ data }) => receivedLabel(data),
        tooltipValueGetter: ({ data }) =>
          data?.received
            .map(({ quantity, unit }) => `${fmt(quantity)} ${unit}`)
            .join(' · ') || receivedLabel(data),
      },
      {
        field: 'projectQuantity',
        headerName: 'Всего по проекту',
        headerTooltip: 'Текущий план материала по всем шифрам проекта',
        initialWidth: 150,
        cellClass: 'request-material-number',
        valueFormatter: ({ data }) => projectQuantityLabel(data),
        tooltipValueGetter: ({ data }) =>
          data?.projectQuantity == null
            ? '—'
            : `${fmt(data.projectQuantity)} ${data.projectUnit}`,
      },
      { field: 'unit', headerName: 'Ед.', initialWidth: 75, minWidth: 65 },
      { field: 'composition', headerName: 'Состав', initialWidth: 160 },
      {
        field: 'normativeDocument',
        headerName: 'Нормативный документ',
        initialWidth: 220,
      },
      { field: 'materialType', headerName: 'Тип материала', initialWidth: 200 },
      {
        colId: 'actions',
        headerName: '',
        pinned: 'right',
        lockPinned: true,
        width: 52,
        minWidth: 52,
        maxWidth: 52,
        sortable: false,
        filter: false,
        resizable: false,
        suppressColumnsToolPanel: true,
        cellRenderer: ActionsCell,
        cellRendererParams: { actions, suppressMouseEventHandling: () => true },
      },
    ],
    [showRequested],
  )
  return (
    <div
      className="request-materials-grid"
      role="region"
      aria-label="Список материалов М-15"
    >
      {filtered && (
        <div className="request-materials-grid-filter-bar">
          <button
            type="button"
            onClick={() => api.current?.setFilterModel(null)}
          >
            Сбросить фильтры таблицы
          </button>
        </div>
      )}
      <div className="request-materials-grid-body">
        <MaterialsGridView<M15MaterialRow>
          gridId={gridId}
          theme={materialsGridTheme}
          localeText={{ ...projectGridLocale, noRowsToShow: emptyMessage }}
          rowData={rows}
          columnDefs={columns}
          maintainColumnOrder
          initialState={initialState}
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
              if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLButtonElement
              )
                return true
              if (event.key === 'Enter' || event.key === 'F2') {
                const input =
                  event.target instanceof Element
                    ? event.target
                        .closest('.ag-cell')
                        ?.querySelector<HTMLInputElement>('input')
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
          getRowId={({ data }) => data.id}
          postSortRows={prioritizeRequestRows}
          rowHeight={60}
          headerHeight={48}
          rowBuffer={5}
          pagination={false}
          cellSelection
          readOnlyEdit
          suppressScrollOnNewData
          suppressRowVirtualisation={false}
          rowClassRules={{
            'request-material-warning': ({ data }) =>
              Boolean(
                data?.needsMatch ||
                (data && parseProjectQuantity(data.quantity) === null),
              ),
          }}
          onGridReady={({ api: grid }) => {
            api.current = grid
          }}
          onFilterChanged={({ api: grid }) => {
            setFiltered(grid.isAnyFilterPresent())
            onFilterChange(grid.getFilterModel())
          }}
          onFirstDataRendered={({ api: grid }) =>
            setFiltered(grid.isAnyFilterPresent())
          }
          onStateUpdated={({ state }) => saveDataGridState(gridId, state)}
          onGridPreDestroyed={({ state }) => saveDataGridState(gridId, state)}
        />
      </div>
    </div>
  )
}
