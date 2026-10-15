import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const prefix = 'materials.workspaceView.v1:'

function readViewValue(key: string): unknown {
  try {
    return JSON.parse(window.sessionStorage.getItem(prefix + key) ?? 'null')
  } catch {
    return null
  }
}

function writeViewValue(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(prefix + key, JSON.stringify(value))
  } catch {
    // Navigation remains usable when the browser cannot remember preferences.
  }
}

export function useWorkspaceViewState<T>(
  key: string,
  initial: T,
  validate: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(() => {
    const saved = readViewValue(key)
    return validate(saved) ? saved : initial
  })
  useEffect(() => writeViewValue(key, value), [key, value])
  return [value, setValue] as const
}

export const isViewString = (value: unknown): value is string =>
  typeof value === 'string'
export const isViewBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const isViewFilters = (
  value: unknown,
): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(isViewString)

export const isViewExpanded = (
  value: unknown,
): value is Record<string, boolean> =>
  isRecord(value) && Object.values(value).every(isViewBoolean)

type ScrollPosition = { left: number; top: number }

function isScrollPosition(value: unknown): value is ScrollPosition {
  return (
    isRecord(value) &&
    typeof value.left === 'number' &&
    Number.isFinite(value.left) &&
    value.left >= 0 &&
    typeof value.top === 'number' &&
    Number.isFinite(value.top) &&
    value.top >= 0
  )
}

// Each section/tab keeps its own scroll positions; forms are deliberately not saved.
export function useWorkspaceViewScroll(view: string) {
  const containerRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const key = `scroll:${view}`
    const saved = readViewValue(key)
    const positions: Record<string, ScrollPosition> = {}
    if (isRecord(saved)) {
      for (const [name, position] of Object.entries(saved)) {
        if (isScrollPosition(position)) positions[name] = position
      }
    }
    const previousRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    let restoring = true
    let dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function restore() {
      const page = positions.page ?? { left: 0, top: 0 }
      window.scrollTo({ ...page, behavior: 'instant' })
      container
        ?.querySelectorAll<HTMLElement>('[data-workspace-scroll]')
        .forEach((element) => {
          const name = element.dataset.workspaceScroll
          const position = name ? positions[`table:${name}`] : undefined
          element.scrollLeft = position?.left ?? 0
          element.scrollTop = position?.top ?? 0
        })
    }
    function persist() {
      if (dirty) {
        writeViewValue(key, positions)
        dirty = false
      }
    }
    function onScroll(event: Event) {
      if (restoring) return
      if (event.target === document || event.target === window) {
        positions.page = { left: window.scrollX, top: window.scrollY }
      } else if (
        event.target instanceof HTMLElement &&
        container?.contains(event.target) &&
        event.target.dataset.workspaceScroll
      ) {
        positions[`table:${event.target.dataset.workspaceScroll}`] = {
          left: event.target.scrollLeft,
          top: event.target.scrollTop,
        }
      } else {
        return
      }
      dirty = true
      clearTimeout(timer)
      timer = setTimeout(persist, 150)
    }

    restore()
    const frame = window.requestAnimationFrame(() => {
      restore()
      restoring = false
    })
    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    })
    window.addEventListener('pagehide', persist)
    return () => {
      window.cancelAnimationFrame(frame)
      clearTimeout(timer)
      persist()
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('pagehide', persist)
      window.history.scrollRestoration = previousRestoration
    }
  }, [view])

  return containerRef
}
