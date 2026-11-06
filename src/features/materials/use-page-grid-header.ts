import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

/** Keep the real AG Grid header interactive, including inside clipping card ancestors. */
export function usePageGridHeader(
  container: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    if (!enabled) return
    const root = container.current?.querySelector<HTMLElement>('.ag-root')
    const header = root?.querySelector<HTMLElement>('.ag-header')
    if (!root || !header) return
    const tabs = document.querySelector<HTMLElement>('[data-operation-tabs]')
    let offset = 0
    let frame = 0
    const update = () => {
      frame = 0
      const rect = header.getBoundingClientRect()
      const naturalTop = rect.top - offset
      const bottom = root.getBoundingClientRect().bottom
      const top = Math.max(0, tabs?.getBoundingClientRect().bottom ?? 0)
      const next = Math.max(
        0,
        Math.min(top - naturalTop, bottom - naturalTop - rect.height),
      )
      if (next !== offset) {
        offset = next
        header.style.setProperty('--page-header-offset', `${offset}px`)
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedule)
    observer?.observe(root)
    observer?.observe(header)
    observer?.observe(document.body)
    if (tabs) observer?.observe(tabs)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      header.style.removeProperty('--page-header-offset')
    }
  }, [container, enabled])
}
