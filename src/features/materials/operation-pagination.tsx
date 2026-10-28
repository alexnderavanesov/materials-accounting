import { useEffect, useRef } from 'react'
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { useWorkspaceViewState } from './workspace-view'

export const operationPageSizes = [10, 25, 50, 100]
export const defaultOperationPageSize = 25

type PageState = { page: number; pageSize: number; filterKey: string }

function isPageState(value: unknown): value is PageState {
  if (!value || typeof value !== 'object') return false
  const state = value as PageState
  return (
    Number.isSafeInteger(state.page) &&
    state.page >= 0 &&
    operationPageSizes.includes(state.pageSize) &&
    typeof state.filterKey === 'string'
  )
}

/** Paginate the filtered list only; source records and totals stay intact. */
export function useOperationPagination<T>(
  id: string,
  rows: Array<T>,
  filterKey: string,
  focus?: { key?: string | null; index: number },
) {
  const [state, setState] = useWorkspaceViewState<PageState>(
    `${id}.pagination`,
    { page: 0, pageSize: defaultOperationPageSize, filterKey },
    isPageState,
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<string | null | undefined>(undefined)
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize))
  const page = Math.min(
    state.filterKey === filterKey ? state.page : 0,
    pageCount - 1,
  )

  useEffect(() => {
    setState((current) =>
      current.page === page && current.filterKey === filterKey
        ? current
        : { ...current, page, filterKey },
    )
  }, [page, filterKey, setState])

  const focusKey = focus?.key
  const focusIndex = focus?.index ?? -1
  useEffect(() => {
    if (!focusKey) lastFocus.current = undefined
    if (!focusKey || lastFocus.current === focusKey || focusIndex < 0) return
    lastFocus.current = focusKey
    setState((current) => ({
      ...current,
      filterKey,
      page: Math.floor(focusIndex / current.pageSize),
    }))
  }, [focusKey, focusIndex, filterKey, setState])

  const navigate = (nextPage: number, nextSize = state.pageSize) => {
    setState({ page: nextPage, pageSize: nextSize, filterKey })
    window.requestAnimationFrame(() =>
      containerRef.current?.scrollIntoView({ block: 'start' }),
    )
  }
  const start = page * state.pageSize
  return {
    containerRef,
    items: rows.slice(start, start + state.pageSize),
    total: rows.length,
    page,
    pageCount,
    pageSize: state.pageSize,
    start: rows.length ? start + 1 : 0,
    end: Math.min(start + state.pageSize, rows.length),
    setPage: (next: number) =>
      navigate(Math.max(0, Math.min(pageCount - 1, next))),
    // Preserve the first visible record when changing the page size.
    setPageSize: (size: number) => {
      if (operationPageSizes.includes(size))
        navigate(Math.floor(start / size), size)
    },
  }
}

export function OperationPagination({
  pagination: p,
  label,
}: {
  pagination: ReturnType<typeof useOperationPagination>
  label: string
}) {
  return (
    <nav
      aria-label={`Страницы: ${label}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
    >
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          На странице
          <select
            aria-label={`На странице: ${label}`}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-900"
            value={p.pageSize}
            onChange={(event) => p.setPageSize(Number(event.target.value))}
          >
            {operationPageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span aria-live="polite">
          {p.start}–{p.end} из {p.total}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Первая страница"
          disabled={p.page === 0}
          onClick={() => p.setPage(0)}
        >
          <ChevronFirst size={16} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Предыдущая страница"
          disabled={p.page === 0}
          onClick={() => p.setPage(p.page - 1)}
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="px-2">
          Страница {p.page + 1} из {p.pageCount}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Следующая страница"
          disabled={p.page === p.pageCount - 1}
          onClick={() => p.setPage(p.page + 1)}
        >
          <ChevronRight size={16} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Последняя страница"
          disabled={p.page === p.pageCount - 1}
          onClick={() => p.setPage(p.pageCount - 1)}
        >
          <ChevronLast size={16} />
        </Button>
      </div>
    </nav>
  )
}
