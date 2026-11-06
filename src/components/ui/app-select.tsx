import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'

export function AppSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ label: string; value: string }>
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 320,
  })
  const matches = options.filter((option) =>
    option.label
      .toLocaleLowerCase('ru')
      .includes(query.trim().toLocaleLowerCase('ru')),
  )
  const selected = options.find((option) => option.value === value)
  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }
  const show = () => {
    setQuery('')
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    )
    setOpen(true)
  }
  const choose = (next: string) => {
    onChange(next)
    close(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const maxHeight = Math.max(0, Math.min(320, Math.max(below, above)))
      const height = Math.min(panel.current?.scrollHeight ?? 320, maxHeight)
      const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24)
      setPosition({
        top:
          below >= height
            ? rect.bottom + 4
            : Math.max(12, rect.top - height - 4),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        width,
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
    search.current?.focus()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (open)
      panel.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: 'nearest' })
  }, [open, active, query])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        value={value}
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-left text-sm text-stone-900 outline-none focus-visible:border-stone-400 focus-visible:ring-2 focus-visible:ring-stone-100"
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            show()
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected?.label ?? value}
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-stone-500"
          aria-hidden="true"
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            style={position}
            className="fixed z-[90] flex flex-col overflow-hidden rounded-md border border-stone-200 bg-white text-sm text-stone-900 shadow-lg"
            onBlur={(event) => {
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
            <div className="flex shrink-0 items-center gap-2 border-b border-stone-200 px-3 py-2">
              <Search
                size={16}
                className="shrink-0 text-stone-400"
                aria-hidden="true"
              />
              <input
                ref={search}
                aria-label={`Поиск: ${label}`}
                role="combobox"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-controls={id}
                aria-activedescendant={
                  matches[active] ? `${id}-${active}` : undefined
                }
                autoComplete="off"
                placeholder="Поиск…"
                className="w-full min-w-0 bg-transparent py-1 outline-none"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActive(0)
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.stopPropagation()
                    if (matches[active]) choose(matches[active].value)
                  } else if (
                    ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
                  ) {
                    event.preventDefault()
                    setActive((current) =>
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? Math.max(0, matches.length - 1)
                          : Math.max(
                              0,
                              Math.min(
                                matches.length - 1,
                                current + (event.key === 'ArrowDown' ? 1 : -1),
                              ),
                            ),
                    )
                  }
                }}
              />
            </div>
            <div
              id={id}
              role="listbox"
              aria-label={label}
              className="min-h-0 overflow-y-auto overscroll-contain p-1"
            >
              {matches.map((option, index) => (
                <button
                  id={`${id}-${index}`}
                  key={option.value}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={option.value === value}
                  data-active={index === active}
                  className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-stone-100 ${index === active ? 'bg-stone-100' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option.value)}
                >
                  <span className="min-w-0 flex-1 break-words">
                    {option.label}
                  </span>
                  {option.value === value && (
                    <Check
                      size={16}
                      className="shrink-0 text-stone-600"
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
              {!matches.length && (
                <p className="px-3 py-2 text-stone-500">Ничего не найдено</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
