import { useMemo, useRef, useState } from 'react'
import type { ColDef, GridApi, ICellRendererParams } from 'ag-grid-community'
import { Input } from '#/components/ui/input'
import { MaterialsGridView, materialsGridTheme } from './materials-grid'
import { materialsColumnFilter } from './materials-column-filter'
import { projectGridLocale } from './project-grid-locale'
import {
  parseProjectQuantity,
  readDataGridState,
  saveDataGridState,
} from './project-grid-state'
import './request-materials-grid.css'

export type RequestMaterialRow = {
  id: string
  name: string
  cipher: string
  materialType: string
  normativeDocument: string
  composition: string
  unit: string
  quantity: string
  note: string
  projectQuantity: number | null
  cipherQuantity: number | null
  remainingQuantity: number
  inScope: boolean
  deleted: boolean
  alternativeQuantity: number | null
  alternativeUnit: string
  conversionDetails: string
  history: string
  source: string
  warnings: string[]
}

type DraftField = 'quantity' | 'note'
type Actions = {
  onUpdate: (id: string, field: DraftField, value: string) => void
  onChooseScope: (id: string) => void
}
type CellProps = ICellRendererParams<RequestMaterialRow> & {
  actions: React.RefObject<Actions>
  field: DraftField
}
const gridId = 'request-material-picker'
const numberFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 12,
})
const format = (value: number | null) =>
  value === null ? '—' : numberFormat.format(value)

function focusInput(
  api: GridApi<RequestMaterialRow>,
  root: Element | null,
  rowIndex: number,
  field: DraftField,
) {
  api.ensureIndexVisible(rowIndex)
  api.ensureColumnVisible(field)
  api.setFocusedCell(rowIndex, field)
  requestAnimationFrame(() => {
    if (!root?.isConnected || api.isDestroyed()) return
    root
      .querySelector<HTMLInputElement>(
        `.ag-row[row-index="${rowIndex}"] [col-id="${field}"] input`,
      )
      ?.focus({ preventScroll: true })
  })
}

function DraftCell({ data, field, actions, api, node, eGridCell }: CellProps) {
  if (!data?.inScope) return <span className="text-slate-400">—</span>
  return (
    <Input
      className="request-material-input"
      aria-label={
        field === 'quantity'
          ? `Количество по заявке, ${data.unit}`
          : 'Примечание'
      }
      aria-invalid={
        (field === 'quantity' &&
          parseProjectQuantity(data.quantity) === null) ||
        undefined
      }
      inputMode={field === 'quantity' ? 'decimal' : undefined}
      placeholder={field === 'quantity' ? '0' : 'Примечание'}
      value={data[field]}
      tabIndex={-1}
      onChange={(event) =>
        actions.current.onUpdate(data.id, field, event.target.value)
      }
      onKeyDown={(event) => {
        if (event.key !== 'Tab' && event.key !== 'Enter') return
        const index = node.rowIndex
        if (index === null) return
        const backwards = event.shiftKey
        const nextField =
          event.key === 'Enter' ? field : backwards ? 'quantity' : 'note'
        const sameRow =
          event.key === 'Tab' &&
          (backwards ? field === 'note' : field === 'quantity')
        const nextIndex = sameRow ? index : index + (backwards ? -1 : 1)
        if (!api.getDisplayedRowAtIndex(nextIndex)?.data?.inScope) return
        event.preventDefault()
        event.stopPropagation()
        focusInput(
          api,
          eGridCell.closest('.ag-root'),
          nextIndex,
          sameRow
            ? nextField
            : event.key === 'Enter'
              ? field
              : backwards
                ? 'note'
                : 'quantity',
        )
      }}
    />
  )
}

function MaterialCell({
  data,
  actions,
}: ICellRendererParams<RequestMaterialRow> & {
  actions: React.RefObject<Actions>
}) {
  if (!data) return null
  return data.inScope ? (
    <span className="request-material-name">{data.name}</span>
  ) : (
    <button
      type="button"
      className="request-material-name request-material-choose"
      onClick={() => actions.current.onChooseScope(data.id)}
    >
      {data.name}
    </button>
  )
}

function DetailsCell({ data }: ICellRendererParams<RequestMaterialRow>) {
  if (!data) return null
  return (
    <div className="request-material-details">
      {data.deleted && <span>Удален из проектной базы</span>}
      {data.warnings.map((warning) => (
        <span key={warning} className="text-amber-800">
          {warning}
        </span>
      ))}
      {data.history && <span>{data.history}</span>}
      {data.source && <span>{data.source}</span>}
      {data.conversionDetails && <span>{data.conversionDetails}</span>}
    </div>
  )
}

export function RequestMaterialsGrid({
  rows,
  emptyMessage,
  onUpdate,
  onChooseScope,
}: Actions & {
  rows: RequestMaterialRow[]
  emptyMessage: string
}) {
  const actions = useRef({ onUpdate, onChooseScope })
  actions.current = { onUpdate, onChooseScope }
  const [initialState] = useState(() => ({
    ...readDataGridState(gridId),
    // The picker stays mounted between steps, but starts fresh for each form.
    filter: undefined,
    partialColumnState: true,
  }))
  const [filtered, setFiltered] = useState(false)
  const api = useRef<GridApi<RequestMaterialRow> | null>(null)
  const hasAlternative = rows.some(
    (row) => row.alternativeQuantity !== null || row.alternativeUnit,
  )
  const hasDetails = rows.some(
    (row) =>
      row.deleted ||
      row.history ||
      row.source ||
      row.warnings.length ||
      row.conversionDetails,
  )
  const columns = useMemo<ColDef<RequestMaterialRow>[]>(
    () => [
      {
        field: 'name',
        headerName: 'Материал',
        minWidth: 340,
        initialWidth: 340,
        initialFlex: 1,
        wrapText: true,
        cellRenderer: MaterialCell,
        cellRendererParams: { actions },
      },
      {
        colId: 'quantity',
        headerName: 'Количество по заявке',
        initialWidth: 150,
        minWidth: 130,
        valueGetter: ({ data }) =>
          data?.quantity ? parseProjectQuantity(data.quantity) : null,
        cellRenderer: DraftCell,
        cellRendererParams: {
          actions,
          field: 'quantity',
          suppressMouseEventHandling: () => true,
        },
        cellClass: 'request-material-editable',
      },
      { field: 'unit', headerName: 'Ед.', initialWidth: 75, minWidth: 65 },
      { field: 'composition', headerName: 'Состав', initialWidth: 170 },
      {
        field: 'cipherQuantity',
        headerName: 'По шифру',
        initialWidth: 140,
        cellClass: 'request-material-number',
        valueFormatter: ({ value, data }) =>
          data?.deleted ? 'удален' : `${format(value)} ${data?.unit ?? ''}`,
      },
      {
        field: 'remainingQuantity',
        headerName: 'Остаток к заявке',
        initialWidth: 145,
        cellClass: 'request-material-number',
        valueFormatter: ({ value }) => format(value),
      },
      {
        field: 'normativeDocument',
        headerName: 'Нормативный документ',
        initialWidth: 220,
      },
      {
        field: 'note',
        headerName: 'Примечание',
        initialWidth: 230,
        minWidth: 180,
        cellRenderer: DraftCell,
        cellRendererParams: {
          actions,
          field: 'note',
          suppressMouseEventHandling: () => true,
        },
        cellClass: 'request-material-editable',
      },
      {
        field: 'projectQuantity',
        headerName: 'По проекту',
        initialWidth: 140,
        cellClass: 'request-material-number',
        valueFormatter: ({ value, data }) =>
          data?.deleted ? 'удален' : `${format(value)} ${data?.unit ?? ''}`,
      },
      ...(hasAlternative
        ? [
            {
              field: 'alternativeQuantity' as const,
              headerName: 'В альтернативной единице',
              initialWidth: 180,
              cellClass: 'request-material-number',
              cellRenderer: ({
                data,
              }: ICellRendererParams<RequestMaterialRow>) =>
                data?.alternativeQuantity == null ? (
                  '—'
                ) : (
                  <output aria-label="Количество в альтернативной единице">
                    {format(data.alternativeQuantity)} {data.alternativeUnit}
                  </output>
                ),
              valueFormatter: ({
                value,
                data,
              }: {
                value: number | null
                data?: RequestMaterialRow
              }) =>
                value == null
                  ? ''
                  : `${format(value)} ${data?.alternativeUnit ?? ''}`,
            },
          ]
        : []),
      ...(hasDetails
        ? [
            {
              colId: 'details',
              headerName: 'Состояние и история',
              initialWidth: 290,
              cellRenderer: DetailsCell,
              valueGetter: ({ data }: { data?: RequestMaterialRow }) =>
                data
                  ? [
                      data.deleted ? 'Удален из проектной базы' : '',
                      ...data.warnings,
                      data.history,
                      data.source,
                      data.conversionDetails,
                    ]
                      .filter(Boolean)
                      .join('\n')
                  : '',
            },
          ]
        : []),
      { field: 'cipher', headerName: 'Шифр', initialWidth: 220 },
      { field: 'materialType', headerName: 'Тип материала', initialWidth: 220 },
    ],
    [hasAlternative, hasDetails],
  )

  return (
    <div
      className="request-materials-grid"
      role="region"
      aria-label="Список материалов заявки"
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
        <MaterialsGridView<RequestMaterialRow>
          gridId={gridId}
          theme={materialsGridTheme}
          localeText={{ ...projectGridLocale, noRowsToShow: emptyMessage }}
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
              if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLButtonElement
              )
                return true
              if (event.key === 'Enter' || event.key === 'F2') {
                const target =
                  event.target instanceof Element
                    ? event.target
                        .closest('.ag-cell')
                        ?.querySelector<HTMLInputElement>('input')
                    : null
                if (target) {
                  event.preventDefault()
                  target.focus()
                  return true
                }
              }
              return false
            },
          }}
          initialState={initialState}
          getRowId={({ data }) => data.id}
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
              Boolean(data?.warnings.length),
            'request-material-deleted': ({ data }) => Boolean(data?.deleted),
          }}
          onGridReady={({ api: grid }) => {
            api.current = grid
          }}
          onFilterChanged={({ api: grid }) =>
            setFiltered(grid.isAnyFilterPresent())
          }
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
