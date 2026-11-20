// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { trackGridFilterPosition } from './grid-filter-position'
import { filterResizeStart } from './filter-resize-handle'

const cleanups: Array<() => void> = []
let resizePopup = () => {}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('innerWidth', 1200)
  vi.stubGlobal('innerHeight', 800)
  vi.stubGlobal('visualViewport', undefined)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 1),
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizePopup = callback
      }
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop())
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function fixture(top: number, left = 200, height = 400) {
  const anchor = document.createElement('button')
  const popup = document.createElement('div')
  const heading = document.createElement('header')
  heading.className = 'materials-filter-heading'
  const handle = document.createElement('div')
  handle.className = 'materials-filter-drag-handle'
  heading.append(handle)
  const close = document.createElement('button')
  heading.append(close)
  const input = document.createElement('input')
  popup.append(heading, input)
  const captures = new Set<number>()
  heading.setPointerCapture = vi.fn((pointerId) => {
    captures.add(pointerId)
  })
  heading.hasPointerCapture = vi.fn((pointerId) => captures.has(pointerId))
  heading.releasePointerCapture = vi.fn((pointerId) => {
    captures.delete(pointerId)
  })
  document.body.append(anchor, popup)
  const layout = { top, left, height, width: 440 }
  vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() =>
    DOMRect.fromRect({ x: layout.left, y: layout.top, width: 24, height: 24 }),
  )
  vi.spyOn(popup, 'getBoundingClientRect').mockImplementation(() => {
    const limit = Number.parseFloat(
      popup.style.getPropertyValue('--materials-filter-max-height'),
    )
    return DOMRect.fromRect({
      x:
        Number.parseFloat(
          popup.style.getPropertyValue('--materials-filter-left'),
        ) || 0,
      y:
        Number.parseFloat(
          popup.style.getPropertyValue('--materials-filter-top'),
        ) || 0,
      width: Math.min(layout.width, window.innerWidth - 24),
      height: Math.min(layout.height, Number.isNaN(limit) ? Infinity : limit),
    })
  })
  const stop = trackGridFilterPosition({ ePopup: popup, eventSource: anchor })
  cleanups.push(stop)
  const position = () => ({
    top: Number.parseFloat(
      popup.style.getPropertyValue('--materials-filter-top'),
    ),
    left: Number.parseFloat(
      popup.style.getPropertyValue('--materials-filter-left'),
    ),
    height: popup.getBoundingClientRect().height,
    width: popup.getBoundingClientRect().width,
  })
  return {
    anchor,
    popup,
    heading,
    handle,
    close,
    input,
    layout,
    position,
    stop,
  }
}

function pointer(
  target: HTMLElement,
  type: string,
  x: number,
  y: number,
  pointerId = 1,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  target.dispatchEvent(event)
}

it('opens beside the filter button below when possible and above near the viewport bottom', () => {
  const upper = fixture(100)
  expect(upper.position().top).toBeGreaterThan(
    upper.anchor.getBoundingClientRect().bottom,
  )
  expect(
    upper.position().top - upper.anchor.getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(8)
  expect(upper.position().left).toBe(200)
  const lower = fixture(650)
  expect(lower.position().top + lower.position().height).toBeLessThan(
    lower.anchor.getBoundingClientRect().top,
  )
  expect(
    lower.anchor.getBoundingClientRect().top -
      lower.position().top -
      lower.position().height,
  ).toBeLessThanOrEqual(8)
})

it('limits a tall popup to available space and keeps right-edge and narrow-screen filters visible', () => {
  const view = fixture(500, 1160, 800)
  const pos = view.position()
  expect(pos.top).toBeGreaterThanOrEqual(12)
  expect(pos.left + pos.width).toBeLessThanOrEqual(1188)
  expect(pos.top + pos.height).toBeLessThan(500)
  vi.stubGlobal('innerWidth', 360)
  vi.stubGlobal('innerHeight', 600)
  window.dispatchEvent(new Event('resize'))
  vi.runAllTimers()
  expect(view.position().left).toBe(12)
  expect(view.position().left + view.position().width).toBeLessThanOrEqual(348)
  expect(view.position().top + view.position().height).toBeLessThanOrEqual(588)
})

it('follows scrolling headers and search-result resizing, then releases listeners when closed', () => {
  const view = fixture(650)
  view.layout.height = 250
  resizePopup()
  vi.runAllTimers()
  expect(view.position().top + view.position().height).toBe(644)
  view.layout.top = 100
  window.dispatchEvent(new Event('scroll'))
  vi.runAllTimers()
  expect(view.position().top).toBe(130)
  view.stop()
  view.layout.top = 300
  window.dispatchEvent(new Event('scroll'))
  window.dispatchEvent(new Event('resize'))
  vi.runAllTimers()
  expect(view.position().top).toBe(130)
})

it('keeps the popup inside the visual viewport when the on-screen keyboard reduces it', () => {
  vi.stubGlobal('visualViewport', {
    offsetTop: 40,
    offsetLeft: 0,
    width: 1200,
    height: 400,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  const view = fixture(150, 200, 500)
  expect(view.position().top).toBeGreaterThanOrEqual(52)
  expect(view.position().top + view.position().height).toBeLessThanOrEqual(428)
})

it('keeps a manually resized popup steady above its anchor and clamps it after viewport changes', () => {
  const view = fixture(650, 900)
  const original = view.position()
  view.popup.dispatchEvent(new Event(filterResizeStart, { bubbles: true }))
  view.layout.height = 500
  view.layout.width = 650
  resizePopup()
  vi.runAllTimers()
  expect(view.position().top).toBe(original.top)
  expect(view.position().height).toBe(500)
  expect(view.position().left + view.position().width).toBe(1188)
  vi.stubGlobal('innerWidth', 390)
  vi.stubGlobal('innerHeight', 500)
  window.dispatchEvent(new Event('resize'))
  vi.runAllTimers()
  const resized = view.position()
  expect(resized.left).toBe(12)
  expect(resized.top).toBeGreaterThanOrEqual(12)
  expect(resized.top + resized.height).toBeLessThanOrEqual(488)
})

it('drags by the header without resizing, stays independent of scrolling headers and supports later resizing', () => {
  const view = fixture(100)
  const original = view.position()
  pointer(view.handle, 'pointerdown', 230, 150)
  expect(view.heading.setPointerCapture).toHaveBeenCalledWith(1)
  pointer(view.heading, 'pointermove', 410, 220)
  pointer(view.heading, 'pointerup', 410, 220)
  const moved = view.position()
  expect(moved).toEqual({
    ...original,
    left: original.left + 180,
    top: original.top + 70,
  })
  expect(view.heading.releasePointerCapture).toHaveBeenCalledWith(1)
  view.layout.top = 500
  window.dispatchEvent(new Event('scroll'))
  resizePopup()
  vi.runAllTimers()
  expect(view.position()).toEqual(moved)
  // Search can shrink the content without moving its top corner.
  view.layout.height = 240
  resizePopup()
  vi.runAllTimers()
  expect(view.position()).toEqual({ ...moved, height: 240 })
  view.popup.dispatchEvent(new Event(filterResizeStart, { bubbles: true }))
  view.layout.height = 500
  resizePopup()
  vi.runAllTimers()
  expect(view.position()).toEqual({ ...moved, height: 500 })
})

it('clamps dragging and keyboard movement to the viewport, including a smaller screen', () => {
  const view = fixture(100)
  pointer(view.handle, 'pointerdown', 230, 150)
  pointer(view.heading, 'pointermove', 3000, 2000)
  pointer(view.heading, 'pointerup', 3000, 2000)
  expect(view.position()).toEqual({
    left: 748,
    top: 388,
    width: 440,
    height: 400,
  })
  view.handle.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      shiftKey: true,
      bubbles: true,
    }),
  )
  expect(view.position().left).toBe(668)
  view.handle.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
  )
  expect(view.position().top).toBe(368)
  vi.stubGlobal('innerWidth', 390)
  vi.stubGlobal('innerHeight', 500)
  window.dispatchEvent(new Event('resize'))
  vi.runAllTimers()
  expect(view.position()).toEqual({
    left: 12,
    top: 88,
    width: 366,
    height: 400,
  })
})

it('does not drag controls, releases cancelled pointers and restores anchoring when reopened', () => {
  const view = fixture(100)
  const original = view.position()
  for (const control of [view.close, view.input]) {
    pointer(control, 'pointerdown', 230, 150)
    pointer(control, 'pointermove', 400, 200)
    expect(view.position()).toEqual(original)
  }
  pointer(view.handle, 'pointerdown', 230, 150)
  pointer(view.heading, 'pointermove', 400, 200, 2)
  expect(view.position()).toEqual(original)
  pointer(view.heading, 'pointercancel', 230, 150)
  pointer(view.heading, 'pointermove', 400, 200)
  expect(view.position()).toEqual(original)
  pointer(view.handle, 'pointerdown', 230, 150)
  pointer(view.heading, 'pointermove', 400, 200)
  const moved = view.position()
  view.stop()
  expect(view.heading.hasPointerCapture(1)).toBe(false)
  pointer(view.heading, 'pointermove', 700, 300)
  expect(view.position()).toEqual(moved)
  cleanups.push(
    trackGridFilterPosition({ ePopup: view.popup, eventSource: view.anchor }),
  )
  expect(view.position()).toEqual(original)
})
