import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

type Kind = 'dialog' | 'popup' | 'filters'
type Entry = {
  id: symbol
  parent: symbol | null
  kind: Kind
  active: () => boolean
  close: () => void
}
const Scope = createContext<symbol | null>(null)
const entries = new Map<symbol, Entry>()

function isInside(entry: Entry, ancestor: symbol): boolean {
  let parent = entry.parent
  while (parent) {
    if (parent === ancestor) return true
    parent = entries.get(parent)?.parent ?? null
  }
  return false
}

function escape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented)
    return
  const active = [...entries.values()].filter((entry) => entry.active())
  const overlays = active.filter((entry) => entry.kind !== 'filters')
  // Child effects mount before parent effects. Scope ancestry, including portals,
  // takes precedence over registration order; independent layers use open order.
  const top = overlays
    .filter((entry) => !overlays.some((other) => isInside(other, entry.id)))
    .at(-1)
  const filters =
    top?.kind === 'popup'
      ? []
      : active.filter(
          (entry) =>
            entry.kind === 'filters' && entry.parent === (top?.id ?? null),
        )
  if (!top && !filters.length) return
  event.preventDefault()
  event.stopImmediatePropagation()
  // Holding Escape must not walk through the stack or discard several levels.
  if (event.repeat) return
  if (filters.length) filters.forEach((entry) => entry.close())
  else top?.close()
}

export function useEscapeAction({
  kind,
  enabled = true,
  active = () => true,
  onEscape,
}: {
  kind: Kind
  enabled?: boolean
  active?: () => boolean
  onEscape: () => void
}) {
  const parent = useContext(Scope)
  const [id] = useState(() => Symbol('escape-layer'))
  const latest = useRef({ active, onEscape })
  latest.current = { active, onEscape }
  useLayoutEffect(() => {
    if (!enabled) return
    if (!entries.size) window.addEventListener('keydown', escape, true)
    entries.set(id, {
      id,
      parent,
      kind,
      active: () => latest.current.active(),
      close: () => latest.current.onEscape(),
    })
    return () => {
      entries.delete(id)
      if (!entries.size) window.removeEventListener('keydown', escape, true)
    }
  }, [id, parent, kind, enabled])
  return id
}

/** A logical keyboard layer. React context keeps portal children in its scope. */
export function EscapeLayer({
  children,
  onEscape,
}: {
  children: ReactNode
  onEscape: () => void
}) {
  const id = useEscapeAction({ kind: 'dialog', onEscape })
  return <Scope.Provider value={id}>{children}</Scope.Provider>
}

/** Resets only the filters belonging to the currently exposed dialog/page. */
export function EscapeFilters({
  active,
  onReset,
}: {
  active: boolean
  onReset: () => void
}) {
  useEscapeAction({ kind: 'filters', enabled: active, onEscape: onReset })
  return null
}
