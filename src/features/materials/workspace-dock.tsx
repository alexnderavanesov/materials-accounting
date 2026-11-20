import { useEffect, useId, useRef, useState } from 'react'
import {
  ChevronDown,
  Database,
  FileInput,
  Files,
  Layers3,
  LayoutDashboard,
  Menu,
  PackageCheck,
  Pin,
  PinOff,
  Send,
  Settings,
  Undo2,
  Workflow,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { WorkspaceLocation, WorkspaceSearch } from './workspace-navigation'
import { isViewBoolean, useWorkspaceViewState } from './workspace-view'
import './workspace-dock.css'

const operationItems = [
  {
    tab: 'requests',
    label: 'Заявки',
    icon: <FileInput size={19} />,
  },
  {
    tab: 'receipts',
    label: 'Получение',
    icon: <PackageCheck size={19} />,
  },
  {
    tab: 'm15',
    label: 'М-15',
    icon: 'М15',
  },
  {
    tab: 'quality',
    inspection: 'zni',
    label: 'ЗНИ',
    icon: 'ЗНИ',
  },
  {
    tab: 'quality',
    inspection: 'avk',
    label: 'АВК',
    icon: 'АВК',
  },
  { tab: 'issues', label: 'Выдача', icon: <Send size={18} /> },
  {
    tab: 'returns',
    label: 'Возвраты',
    icon: <Undo2 size={19} />,
  },
] as const

export function WorkspaceDock({
  view,
  onNavigate,
}: {
  view: WorkspaceLocation
  onNavigate: (next: WorkspaceSearch) => void
}) {
  const [pinned, setPinned] = useWorkspaceViewState(
    'dock.pinned',
    false,
    isViewBoolean,
  )
  const [operationsExpanded, setOperationsExpanded] = useWorkspaceViewState(
    'dock.operationsExpanded',
    true,
    isViewBoolean,
  )
  const [hovered, setHovered] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [narrowScreen, setNarrowScreen] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const navigationId = useId()
  const operationsId = useId()
  const expanded = narrowScreen ? mobileOpen : pinned || hovered || keyboardOpen
  const inOperations = view.section === 'operations' || view.section === 'm15'

  useEffect(() => {
    const update = () => {
      setNarrowScreen(window.innerWidth < 768)
      setMobileOpen(false)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (mobileOpen)
      panelRef.current?.querySelector<HTMLButtonElement>('nav button')?.focus()
  }, [mobileOpen])

  function closeMobile() {
    setMobileOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  function select(next: WorkspaceSearch) {
    onNavigate(next)
    if (narrowScreen) closeMobile()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="workspace-dock-trigger"
        aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={mobileOpen}
        aria-controls={navigationId}
        onClick={() => setMobileOpen((value) => !value)}
      >
        {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        <span>Меню</span>
      </button>
      {narrowScreen && mobileOpen && (
        <button
          type="button"
          className="workspace-dock-backdrop"
          aria-label="Закрыть меню снаружи"
          tabIndex={-1}
          onClick={closeMobile}
        />
      )}
      <aside
        ref={panelRef}
        id={navigationId}
        aria-label="Меню разделов"
        className="workspace-dock"
        data-expanded={expanded}
        data-pinned={pinned}
        data-mobile-open={mobileOpen}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setHovered(true)
        }}
        onPointerLeave={() => setHovered(false)}
        onFocusCapture={(event) => {
          if (event.target.matches(':focus-visible')) setKeyboardOpen(true)
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setKeyboardOpen(false)
            if (narrowScreen && event.relatedTarget !== triggerRef.current)
              setMobileOpen(false)
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return
          event.preventDefault()
          event.stopPropagation()
          if (narrowScreen) closeMobile()
          else {
            setHovered(false)
            setKeyboardOpen(false)
          }
        }}
      >
        <div className="workspace-dock-header">
          <span className="workspace-dock-brand" aria-hidden="true">
            <Layers3 size={21} />
          </span>
          <div className="workspace-dock-copy workspace-dock-heading">
            <strong>Материалы</strong>
          </div>
          <button
            type="button"
            className="workspace-dock-pin workspace-dock-copy"
            aria-label={pinned ? 'Открепить меню' : 'Закрепить меню'}
            aria-pressed={pinned}
            title={pinned ? 'Открепить меню' : 'Закрепить меню открытым'}
            onClick={() => setPinned((value) => !value)}
          >
            {pinned ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
        </div>
        <nav aria-label="Разделы приложения" className="workspace-dock-nav">
          <div className="workspace-dock-links">
            <div
              className="workspace-dock-operation-row"
              data-current-group={inOperations}
              data-collapsed={!operationsExpanded}
            >
              <button
                type="button"
                className="workspace-dock-item"
                aria-label="Операции"
                aria-expanded={operationsExpanded}
                aria-controls={operationsId}
                title={
                  operationsExpanded
                    ? 'Свернуть операции'
                    : 'Развернуть операции'
                }
                onClick={() => setOperationsExpanded((value) => !value)}
              >
                <span className="workspace-dock-icon" aria-hidden="true">
                  <Workflow size={20} />
                </span>
                <span className="workspace-dock-copy workspace-dock-label">
                  Операции
                </span>
                <span
                  className="workspace-dock-disclosure workspace-dock-copy"
                  aria-hidden="true"
                >
                  <ChevronDown size={17} />
                </span>
              </button>
            </div>
            <div
              id={operationsId}
              className="workspace-dock-operations"
              hidden={!operationsExpanded}
            >
              <DockButton
                label="Обзор"
                accessibleLabel="Обзор операций"
                icon={<LayoutDashboard size={19} />}
                active={
                  view.section === 'operations' && view.tab === 'overview'
                }
                onClick={() =>
                  select({ section: 'operations', tab: 'overview' })
                }
              />
              {operationItems.map((item) => (
                <DockButton
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  active={
                    item.tab === 'm15'
                      ? view.section === 'm15'
                      : view.section === 'operations' &&
                        view.tab === item.tab &&
                        (!('inspection' in item) ||
                          (view.inspection ?? 'zni') === item.inspection)
                  }
                  onClick={() =>
                    select(
                      item.tab === 'm15'
                        ? { section: 'm15', focus: undefined }
                        : {
                            section: 'operations',
                            tab: item.tab,
                            inspection:
                              'inspection' in item
                                ? item.inspection
                                : undefined,
                          },
                    )
                  }
                />
              ))}
            </div>
            <div className="workspace-dock-divider" />
            <DockButton
              label="Проектная база"
              icon={<Database size={19} />}
              active={view.section === 'database'}
              onClick={() => select({ section: 'database' })}
            />
            <DockButton
              label="Документы"
              icon={<Files size={19} />}
              active={view.section === 'documents'}
              onClick={() => select({ section: 'documents' })}
            />
          </div>
          <div className="workspace-dock-settings">
            <DockButton
              label="Настройки"
              icon={<Settings size={19} />}
              active={view.section === 'settings'}
              onClick={() => select({ section: 'settings' })}
            />
          </div>
        </nav>
      </aside>
    </>
  )
}

function DockButton({
  label,
  accessibleLabel,
  icon,
  active,
  onClick,
}: {
  label: string
  accessibleLabel?: string
  icon: ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="workspace-dock-item"
      aria-label={accessibleLabel ?? label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span className="workspace-dock-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="workspace-dock-copy workspace-dock-label">
        <span>{label}</span>
      </span>
      {active && <span className="workspace-dock-current" aria-hidden="true" />}
    </button>
  )
}
