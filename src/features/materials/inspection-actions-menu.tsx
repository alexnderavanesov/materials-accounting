import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ellipsis } from 'lucide-react'
import { Button } from '#/components/ui/button'

export type InspectionAction = {
  label: string
  onSelect: () => void
  destructive?: boolean
}

export function InspectionActionsMenu({
  number,
  actions,
}: {
  number: string
  actions: Array<InspectionAction>
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  const close = (restoreFocus = true) => {
    setPosition(null)
    if (restoreFocus) trigger.current?.focus()
  }
  useEffect(() => {
    if (!position) return
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const outside = (event: PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setPosition(null)
    }
    const reposition = () => setPosition(null)
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', reposition)
    }
  }, [position])
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        aria-label={`Действия ЗНИ ${number}`}
        aria-haspopup="menu"
        aria-expanded={!!position}
        aria-controls={position ? id : undefined}
        onClick={() => {
          if (position) return close()
          const rect = trigger.current!.getBoundingClientRect()
          const height = Math.min(
            actions.length * 40 + 8,
            window.innerHeight - 24,
          )
          setPosition({
            top: Math.max(
              12,
              Math.min(rect.bottom + 4, window.innerHeight - height - 12),
            ),
            left: Math.max(
              12,
              Math.min(rect.right - 264, window.innerWidth - 276),
            ),
          })
        }}
      >
        <Ellipsis size={20} />
      </Button>
      {position &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={`Действия ЗНИ ${number}`}
            style={position}
            className="fixed z-[80] grid max-h-[calc(100dvh-1.5rem)] w-66 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== trigger.current
              )
                close(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                close()
              }
              const buttons = Array.from(
                menu.current?.querySelectorAll<HTMLButtonElement>('button') ??
                  [],
              )
              const current = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              )
              const next =
                event.key === 'ArrowDown'
                  ? (current + 1) % buttons.length
                  : event.key === 'ArrowUp'
                    ? (current - 1 + buttons.length) % buttons.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? buttons.length - 1
                        : null
              if (next !== null) {
                event.preventDefault()
                buttons[next]?.focus()
              }
            }}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className={`min-h-10 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-100 focus:outline-none ${action.destructive ? 'text-red-700' : 'text-slate-700'}`}
                onClick={() => {
                  close()
                  action.onSelect()
                }}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
