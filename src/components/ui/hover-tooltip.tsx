import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/** Uses a portal so cards with overflow:hidden cannot cut off the text. */
export function HoverTooltip({
  text,
  className,
  children,
}: {
  text?: string
  className?: string
  children: ReactNode
}) {
  const id = useId()
  const anchor = useRef<HTMLSpanElement>(null)
  const tooltip = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const visible = open && Boolean(text)

  useLayoutEffect(() => {
    if (!visible || !anchor.current || !tooltip.current) return
    const target = anchor.current.getBoundingClientRect()
    const box = tooltip.current.getBoundingClientRect()
    const top =
      target.top >= box.height + 16
        ? target.top - box.height - 8
        : target.bottom + 8
    setPosition({
      left: Math.max(
        8,
        Math.min(target.left, window.innerWidth - box.width - 8),
      ),
      top: Math.max(8, Math.min(top, window.innerHeight - box.height - 8)),
    })
  }, [visible, text])

  useEffect(() => {
    if (!visible) return
    const close = () => setOpen(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [visible])

  return (
    <>
      <span
        ref={anchor}
        className={className}
        tabIndex={text ? 0 : undefined}
        aria-describedby={visible ? id : undefined}
        onPointerEnter={() => setOpen(Boolean(text))}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(Boolean(text))}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div
            ref={tooltip}
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[100] w-max whitespace-pre-wrap rounded-md bg-slate-900 px-3 py-2 text-sm leading-5 text-white shadow-lg [overflow-wrap:anywhere] print:hidden"
            style={{ ...position, maxWidth: 'min(28rem, calc(100vw - 16px))' }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
