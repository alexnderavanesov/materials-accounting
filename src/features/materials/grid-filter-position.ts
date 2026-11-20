import type { PostProcessPopupParams } from 'ag-grid-community'
import { filterResizeStart } from './filter-resize-handle'

/** Keep viewport coordinates separate from AG Grid's document-space anchoring. */
export function trackGridFilterPosition({
  ePopup: popup,
  eventSource: anchor,
  mouseEvent,
}: Pick<PostProcessPopupParams, 'ePopup' | 'eventSource' | 'mouseEvent'>) {
  const fallback = popup.getBoundingClientRect()
  const viewport = window.visualViewport
  const margin = 12
  const gap = 6
  let frame = 0
  let resizedOffset: { left: number; top: number } | undefined
  let movedPosition: { left: number; top: number } | undefined
  let movedHeightLimit: number | undefined
  let drag:
    | {
        pointer: number
        target: HTMLElement
        x: number
        y: number
        left: number
        top: number
        height: number
      }
    | undefined
  const sourceRect = () =>
    anchor?.getBoundingClientRect() ?? {
      left: mouseEvent?.clientX ?? fallback.left,
      top: mouseEvent?.clientY ?? fallback.top,
      bottom: mouseEvent?.clientY ?? fallback.top,
    }
  const place = () => {
    cancelAnimationFrame(frame)
    frame = 0
    if (!popup.isConnected) return
    const leftEdge = (viewport?.offsetLeft ?? 0) + margin
    const topEdge = (viewport?.offsetTop ?? 0) + margin
    const rightEdge =
      leftEdge + (viewport?.width ?? window.innerWidth) - margin * 2
    const bottomEdge =
      topEdge + (viewport?.height ?? window.innerHeight) - margin * 2
    const source = sourceRect()
    const fullHeight = Math.max(0, bottomEdge - topEdge)
    popup.style.setProperty(
      '--materials-filter-max-width',
      `${rightEdge - leftEdge}px`,
    )
    if (movedPosition) {
      // A moved filter belongs to the viewport, no longer to the column header.
      popup.style.setProperty(
        '--materials-filter-max-height',
        `${Math.min(fullHeight, movedHeightLimit ?? fullHeight)}px`,
      )
      const { width, height } = popup.getBoundingClientRect()
      const left = Math.max(
        leftEdge,
        Math.min(movedPosition.left, rightEdge - width),
      )
      const top = Math.max(
        topEdge,
        Math.min(movedPosition.top, bottomEdge - height),
      )
      movedPosition = { left, top }
      popup.style.setProperty('--materials-filter-left', `${left}px`)
      popup.style.setProperty('--materials-filter-top', `${top}px`)
      popup.style.setProperty(
        '--materials-filter-max-height',
        `${Math.min(bottomEdge - top, movedHeightLimit ?? fullHeight)}px`,
      )
      return
    }
    if (resizedOffset) {
      // Keep the top corner steady while dragging, even for a popup opened above
      // its header. Otherwise each height change would move the resize handle.
      const top = Math.max(
        topEdge,
        Math.min(
          source.top + resizedOffset.top,
          bottomEdge - Math.min(300, fullHeight),
        ),
      )
      popup.style.setProperty(
        '--materials-filter-max-height',
        `${bottomEdge - top}px`,
      )
      const { width } = popup.getBoundingClientRect()
      const left = Math.max(
        leftEdge,
        Math.min(source.left + resizedOffset.left, rightEdge - width),
      )
      popup.style.setProperty('--materials-filter-left', `${left}px`)
      popup.style.setProperty('--materials-filter-top', `${top}px`)
      return
    }
    // Measure the natural popup before limiting it to one side of the button.
    popup.style.setProperty('--materials-filter-max-height', `${fullHeight}px`)
    const naturalHeight = popup.getBoundingClientRect().height
    const below = Math.max(0, bottomEdge - source.bottom - gap)
    const above = Math.max(0, source.top - topEdge - gap)
    const under = naturalHeight <= below || below >= above
    const maxHeight = Math.min(fullHeight, under ? below : above)
    popup.style.setProperty('--materials-filter-max-height', `${maxHeight}px`)
    const { width, height } = popup.getBoundingClientRect()
    const left = Math.max(leftEdge, Math.min(source.left, rightEdge - width))
    const top = Math.max(
      topEdge,
      Math.min(
        under ? source.bottom + gap : source.top - height - gap,
        bottomEdge - height,
      ),
    )
    popup.style.setProperty('--materials-filter-left', `${left}px`)
    popup.style.setProperty('--materials-filter-top', `${top}px`)
  }
  const schedule = () => {
    if (frame) return
    // Sticky page headers also update in rAF; read their final position afterwards.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(place)
    })
  }
  const onScroll = (event: Event) => {
    if (event.target instanceof Node && popup.contains(event.target)) return
    schedule()
  }
  const onResizeStart = () => {
    if (movedPosition) {
      // The React resize handle fixes the current size before lifting this cap.
      movedHeightLimit = undefined
      const top = popup.getBoundingClientRect().top
      popup.style.setProperty(
        '--materials-filter-max-height',
        `${(viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) - margin - top}px`,
      )
      return
    }
    if (!resizedOffset) {
      const rect = popup.getBoundingClientRect()
      const source = sourceRect()
      resizedOffset = {
        left: rect.left - source.left,
        top: rect.top - source.top,
      }
    }
    place()
  }
  const moveTo = (left: number, top: number, height: number) => {
    if (!movedPosition) movedHeightLimit = height
    movedPosition = { left, top }
    place()
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || drag || !(event.target instanceof Element)) return
    const heading = event.target.closest<HTMLElement>(
      '.materials-filter-heading',
    )
    if (
      !heading ||
      !popup.contains(heading) ||
      event.target.closest('button, input, a')
    )
      return
    event.preventDefault()
    event.stopPropagation()
    const rect = popup.getBoundingClientRect()
    drag = {
      pointer: event.pointerId,
      target: heading,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
      height: rect.height,
    }
    heading.setPointerCapture(event.pointerId)
    popup.classList.add('materials-filter-dragging')
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y
    if (dx || dy) moveTo(drag.left + dx, drag.top + dy, drag.height)
  }
  const stopDrag = () => {
    const active = drag
    drag = undefined
    popup.classList.remove('materials-filter-dragging')
    if (active?.target.hasPointerCapture(active.pointer))
      active.target.releasePointerCapture(active.pointer)
  }
  const onPointerEnd = (event: PointerEvent) => {
    if (drag?.pointer === event.pointerId) stopDrag()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('.materials-filter-drag-handle')
    )
      return
    if (
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return
    event.preventDefault()
    event.stopPropagation()
    const rect = popup.getBoundingClientRect()
    const step = event.shiftKey ? 80 : 20
    moveTo(
      rect.left +
        (event.key === 'ArrowRight'
          ? step
          : event.key === 'ArrowLeft'
            ? -step
            : 0),
      rect.top +
        (event.key === 'ArrowDown'
          ? step
          : event.key === 'ArrowUp'
            ? -step
            : 0),
      rect.height,
    )
  }
  popup.classList.add('materials-filter-popup')
  place()
  schedule()
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  observer?.observe(popup)
  if (anchor) observer?.observe(anchor)
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('resize', schedule)
  popup.addEventListener(filterResizeStart, onResizeStart)
  popup.addEventListener('pointerdown', onPointerDown)
  popup.addEventListener('pointermove', onPointerMove)
  popup.addEventListener('pointerup', onPointerEnd)
  popup.addEventListener('pointercancel', onPointerEnd)
  popup.addEventListener('lostpointercapture', onPointerEnd)
  popup.addEventListener('keydown', onKeyDown)
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)
  return () => {
    stopDrag()
    cancelAnimationFrame(frame)
    observer?.disconnect()
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', schedule)
    popup.removeEventListener(filterResizeStart, onResizeStart)
    popup.removeEventListener('pointerdown', onPointerDown)
    popup.removeEventListener('pointermove', onPointerMove)
    popup.removeEventListener('pointerup', onPointerEnd)
    popup.removeEventListener('pointercancel', onPointerEnd)
    popup.removeEventListener('lostpointercapture', onPointerEnd)
    popup.removeEventListener('keydown', onKeyDown)
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
  }
}
