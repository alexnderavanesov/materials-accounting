import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export function RequestMaterialTypeSelect({
  options,
  value,
  error,
  onToggle,
}: {
  options: Array<string>
  value: Array<string>
  error?: string
  onToggle: (type: string, checked: boolean) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 320,
  })
  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const maxHeight = Math.min(320, Math.max(below, above))
      const height = Math.min(panel.current?.scrollHeight ?? 320, maxHeight)
      setPosition({
        top: below >= height ? rect.bottom + 4 : rect.top - height - 4,
        left: rect.left,
        width: rect.width,
        maxHeight,
      })
    }
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    place()
    panel.current?.querySelector<HTMLInputElement>('input')?.focus()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Типы материала"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={value.join(', ')}
        className="flex h-10 min-w-0 w-full items-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-slate-500"
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate">
          {value.length === 0
            ? 'Выберите типы'
            : value.length === 1
              ? value[0]
              : `Выбрано типов: ${value.length}`}
        </span>
        <ChevronDown size={16} className="shrink-0 text-stone-500" />
      </button>
      {error && !open && (
        <p role="alert" className="text-sm text-amber-800">
          {error}
        </p>
      )}
      {open &&
        createPortal(
          <div
            id={id}
            ref={panel}
            role="group"
            aria-label="Выбор типов материала"
            style={position}
            className="fixed z-[80] flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
            onBlur={(event) => {
              // A label click briefly clears focus before activating its checkbox.
              // Pointer clicks outside are handled separately above.
              if (
                event.relatedTarget &&
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== trigger.current
              )
                close()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                close(true)
              }
            }}
          >
            <div className="min-h-0 overflow-y-auto overscroll-contain p-1">
              {options.map((type) => (
                <label
                  key={type}
                  className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm hover:bg-slate-50 focus-within:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(type)}
                    onChange={(event) => onToggle(type, event.target.checked)}
                  />
                  <span>{type}</span>
                </label>
              ))}
            </div>
            {error && (
              <p
                role="alert"
                className="shrink-0 border-t border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                {error}
              </p>
            )}
            {!options.length && (
              <p className="p-3 text-sm text-slate-500">Нет типов материала</p>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
