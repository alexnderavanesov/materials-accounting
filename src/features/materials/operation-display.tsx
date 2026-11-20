import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { List, Table2 } from 'lucide-react'
import { useWorkspaceViewState } from './workspace-view'

export type OperationDisplay = 'list' | 'table'
const Context = createContext<{
  mode: OperationDisplay
  setMode: (mode: OperationDisplay) => void
}>({ mode: 'list', setMode: () => {} })
export function OperationDisplayProvider({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  const [views, setViews] = useWorkspaceViewState<
    Record<string, OperationDisplay>
  >(
    'operations.displays',
    {},
    (value): value is Record<string, OperationDisplay> =>
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.values(value).every((mode) => mode === 'list' || mode === 'table'),
  )
  const mode = views[id] ?? 'list'
  const setMode = (next: OperationDisplay) =>
    setViews((current) => ({ ...current, [id]: next }))
  return <Context value={{ mode, setMode }}>{children}</Context>
}
export const useOperationDisplay = () => useContext(Context)
export function OperationDisplayToggle() {
  const { mode, setMode } = useOperationDisplay()
  return (
    <div
      className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white p-0.5"
      role="group"
      aria-label="Вид раздела"
    >
      {(['list', 'table'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => setMode(value)}
          className={`inline-flex h-9 items-center gap-1.5 rounded px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600 ${mode === value ? 'bg-slate-100 font-medium text-slate-950' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          {value === 'list' ? <List size={16} /> : <Table2 size={16} />}
          {value === 'list' ? 'Список' : 'Таблица'}
        </button>
      ))}
    </div>
  )
}
