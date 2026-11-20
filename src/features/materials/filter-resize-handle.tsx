import { useRef } from 'react'
import type { RefObject } from 'react'
import { Grip } from 'lucide-react'

export type FilterSize = { width: number; height: number }
export const filterResizeStart = 'materials-filter-resize-start'

/** Resize the shared custom AG Grid filter without changing its filter model. */
export function FilterResizeHandle({
  target,
  onResize,
}: {
  target: RefObject<HTMLElement | null>
  onResize: (size: FilterSize) => void
}) {
  const drag = useRef<{
    pointer: number
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const resize = (width: number, height: number) => {
    const element = target.current
    if (!element) return
    const viewport = window.visualViewport
    const rect = element.getBoundingClientRect()
    const availableWidth = Math.max(0, (viewport?.width ?? innerWidth) - 26)
    const availableHeight = Math.max(
      0,
      (viewport?.offsetTop ?? 0) +
        (viewport?.height ?? innerHeight) -
        rect.top -
        14,
    )
    onResize({
      width: Math.min(availableWidth, Math.max(300, width)),
      height: Math.min(availableHeight, Math.max(300, height)),
    })
  }
  const begin = () =>
    target.current?.dispatchEvent(
      new Event(filterResizeStart, { bubbles: true }),
    )
  return (
    <button
      type="button"
      className="materials-filter-resize"
      aria-label="Изменить размер фильтра"
      title="Потяните для изменения размера. Клавиши стрелок — изменить размер."
      onPointerDown={(event) => {
        if (event.button !== 0 || !target.current) return
        event.preventDefault()
        event.stopPropagation()
        const rect = target.current.getBoundingClientRect()
        onResize({ width: rect.width, height: rect.height })
        drag.current = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          width: rect.width,
          height: rect.height,
        }
        begin()
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const start = drag.current
        if (!start || start.pointer !== event.pointerId) return
        resize(
          start.width + event.clientX - start.x,
          start.height + event.clientY - start.y,
        )
      }}
      onPointerUp={(event) => {
        drag.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onLostPointerCapture={() => {
        drag.current = null
      }}
      onKeyDown={(event) => {
        if (
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
            event.key,
          )
        )
          return
        event.preventDefault()
        event.stopPropagation()
        if (!target.current) return
        const rect = target.current.getBoundingClientRect()
        begin()
        const step = event.shiftKey ? 80 : 20
        resize(
          rect.width +
            (event.key === 'ArrowRight'
              ? step
              : event.key === 'ArrowLeft'
                ? -step
                : 0),
          rect.height +
            (event.key === 'ArrowDown'
              ? step
              : event.key === 'ArrowUp'
                ? -step
                : 0),
        )
      }}
    >
      <Grip size={14} aria-hidden="true" />
    </button>
  )
}
