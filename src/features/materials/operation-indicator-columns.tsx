import {
  overviewIndicatorKeys,
  overviewIndicatorLabels,
} from './operation-overview-indicators'
import type {
  OverviewIndicator,
  OverviewIndicators,
} from './operation-overview-indicators'
import type { DataColumn } from './operations-grid'

export type OperationGridIndicators<T> = {
  values: (row: T) => OverviewIndicators | undefined
  unit: (row: T) => string
  /** Existing columns keep their values, renderers and saved layout IDs. */
  existing?: Partial<Record<OverviewIndicator, string>>
}

const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 12 })

export function withOperationIndicatorColumns<T>(
  columns: Array<DataColumn<T>>,
  indicators?: OperationGridIndicators<T>,
): Array<DataColumn<T>> {
  if (!indicators) return columns
  const missing = overviewIndicatorKeys.filter(
    (key) =>
      !columns.some((column) => column.id === indicators.existing?.[key]),
  )
  return [
    ...columns,
    ...missing.map(
      (key): DataColumn<T> => ({
        id: `indicator:${key}`,
        title: overviewIndicatorLabels[key],
        value: (row) => indicators.values(row)?.[key],
        numeric: true,
        centered: true,
        width: 180,
        render: (row) => {
          const quantity = indicators.values(row)?.[key]
          return quantity == null
            ? '—'
            : `${format.format(quantity)} ${indicators.unit(row)}`.trim()
        },
      }),
    ),
  ]
}
