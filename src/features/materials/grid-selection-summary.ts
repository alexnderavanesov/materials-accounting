import type { Column, GridApi, RowPosition } from 'ag-grid-community'
import { localDateInputValue, normalizeCalendarDate } from './calendar-date'

export function getGridSelectionSummary(api: GridApi) {
  const summary = {
    selectedCount: 0,
    count: 0,
    numericCount: 0,
    sum: 0,
    min: Infinity,
    max: -Infinity,
    dateCount: 0,
    earliest: '',
    latest: '',
  }
  const ranges = api.getCellRanges()
  if (!ranges?.length) return summary

  const topCount = api.getPinnedTopRowCount()
  const bodyCount = api.getDisplayedRowCount()
  const totalCount = topCount + bodyCount + api.getPinnedBottomRowCount()
  const absoluteIndex = ({ rowIndex, rowPinned }: RowPosition) =>
    rowIndex +
    (rowPinned === 'top'
      ? 0
      : topCount + (rowPinned === 'bottom' ? bodyCount : 0))
  const rowAt = (index: number) =>
    index < topCount
      ? api.getPinnedTopRow(index)
      : index < topCount + bodyCount
        ? api.getDisplayedRowAtIndex(index - topCount)
        : api.getPinnedBottomRow(index - topCount - bodyCount)

  // Merge row intervals per column: overlapping Ctrl/Cmd selections count once,
  // without allocating a Set entry for every cell in a large selection.
  const intervals = new Map<Column, Array<[number, number]>>()
  for (const range of ranges) {
    const bounded = range.startRow && range.endRow
    const start = bounded ? absoluteIndex(range.startRow!) : 0
    const end = bounded ? absoluteIndex(range.endRow!) : totalCount - 1
    const first = Math.max(0, Math.min(start, end))
    const last = Math.min(totalCount - 1, Math.max(start, end))
    for (const column of range.columns) {
      if (!column.isVisible()) continue
      const spans = intervals.get(column) ?? []
      spans.push([first, last])
      intervals.set(column, spans)
    }
  }

  let compensation = 0
  for (const [column, spans] of intervals) {
    spans.sort((a, b) => a[0] - b[0])
    let visitedThrough = -1
    for (const [first, last] of spans) {
      for (
        let index = Math.max(first, visitedThrough + 1);
        index <= last;
        index++
      ) {
        const rowNode = rowAt(index)
        if (!rowNode) continue
        const value = api.getCellValue<unknown>({
          rowNode,
          colKey: column,
          useFormatter: false,
          from: 'data',
        })
        summary.selectedCount++
        if (value == null || (typeof value === 'string' && !value.trim()))
          continue
        summary.count++
        if (typeof value === 'number' && Number.isFinite(value)) {
          summary.numericCount++
          // Compensated summation avoids accumulated fractional rounding noise.
          const adjusted = value - compensation
          const next = summary.sum + adjusted
          compensation = next - summary.sum - adjusted
          summary.sum = next
          summary.min = Math.min(summary.min, value)
          summary.max = Math.max(summary.max, value)
        } else {
          // Read raw calendar dates, never timestamps or formatted quantities.
          // Text document numbers such as "0012" remain text, as in Excel.
          const date =
            value instanceof Date && Number.isFinite(value.getTime())
              ? localDateInputValue(value)
              : typeof value === 'string'
                ? normalizeCalendarDate(value)
                : null
          if (!date) continue
          summary.dateCount++
          if (!summary.earliest || date < summary.earliest)
            summary.earliest = date
          if (!summary.latest || date > summary.latest) summary.latest = date
        }
      }
      visitedThrough = Math.max(visitedThrough, last)
    }
  }
  return summary
}
