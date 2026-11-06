import { useEffect, useState } from 'react'
import type { CustomStatusPanelProps } from 'ag-grid-react'
import type { StatusBar } from 'ag-grid-community'
import { getGridSelectionSummary } from './grid-selection-summary'
import './grid-selection-status-panel.css'

const numberFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 12,
})
const formatNumber = (value: number) =>
  Number.isFinite(value) ? numberFormat.format(value) : '—'
const formatDate = (value: string) => value.split('-').reverse().join('.')

function GridSelectionStatusPanel({ api }: CustomStatusPanelProps) {
  const [summary, setSummary] = useState(() => getGridSelectionSummary(api))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      timer = undefined
      if (!api.isDestroyed()) setSummary(getGridSelectionSummary(api))
    }
    // Coalesce drag and model events; a large range is calculated once per tick.
    const schedule = () => {
      timer ??= setTimeout(refresh, 40)
    }
    const events = [
      'cellSelectionChanged',
      'modelUpdated',
      'cellValueChanged',
      'pinnedRowDataChanged',
      'displayedColumnsChanged',
      'paginationChanged',
    ] as const
    for (const event of events) api.addEventListener(event, schedule)
    schedule()
    return () => {
      clearTimeout(timer)
      if (!api.isDestroyed()) {
        for (const event of events) api.removeEventListener(event, schedule)
      }
    }
  }, [api])

  return (
    <div
      className="materials-selection-summary"
      role="status"
      aria-label="Сводка выделения"
      aria-atomic="true"
    >
      {summary.selectedCount === 0 ? (
        <span className="materials-selection-hint">
          Выделите ячейки для сводки
        </span>
      ) : (
        <>
          {summary.selectedCount !== summary.count && (
            <span title="Все выделенные ячейки, включая пустые">
              Выделено: <strong>{formatNumber(summary.selectedCount)}</strong>
            </span>
          )}
          <span title="Количество непустых ячеек в выделении">
            Количество: <strong>{formatNumber(summary.count)}</strong>
          </span>
          {summary.numericCount > 0 && (
            <>
              {summary.numericCount !== summary.count && (
                <span>
                  Чисел: <strong>{formatNumber(summary.numericCount)}</strong>
                </span>
              )}
              <span>
                Сумма: <strong>{formatNumber(summary.sum)}</strong>
              </span>
              <span>
                Среднее:{' '}
                <strong>
                  {formatNumber(summary.sum / summary.numericCount)}
                </strong>
              </span>
              <span>
                Мин: <strong>{formatNumber(summary.min)}</strong>
              </span>
              <span>
                Макс: <strong>{formatNumber(summary.max)}</strong>
              </span>
            </>
          )}
          {summary.dateCount > 0 && (
            <>
              {summary.dateCount !== summary.count && (
                <span>
                  Дат: <strong>{formatNumber(summary.dateCount)}</strong>
                </span>
              )}
              <span title="Самая ранняя и самая поздняя даты в выделении">
                Даты:{' '}
                <strong>
                  {formatDate(summary.earliest)} — {formatDate(summary.latest)}
                </strong>
              </span>
            </>
          )}
        </>
      )}
    </div>
  )
}

export const materialsSelectionStatusBar: StatusBar = {
  statusPanels: [
    {
      key: 'selection-summary',
      statusPanel: GridSelectionStatusPanel,
      align: 'right',
    },
  ],
}
