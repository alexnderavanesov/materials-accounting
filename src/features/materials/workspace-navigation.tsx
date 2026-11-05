import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

const sections = ['operations', 'database', 'settings'] as const
const operationTabs = [
  'overview',
  'requests',
  'receipts',
  'quality',
  'issues',
  'returns',
] as const
const settingsTabs = [
  'numbering',
  'print',
  'quality',
  'materialTypes',
  'ciphers',
  'units',
  'documents',
  'alloys',
] as const
const templates = ['request', 'zni', 'avk'] as const

export type WorkspaceLocation = {
  section: (typeof sections)[number]
  tab: (typeof operationTabs)[number]
  settings: (typeof settingsTabs)[number]
  template: (typeof templates)[number]
  focus?: string
}
export type OperationDocumentTab = WorkspaceLocation['tab']
type WorkspaceSearch = Partial<WorkspaceLocation>
export type WorkspaceNavigation = {
  view: WorkspaceLocation
  onNavigate: (next: WorkspaceLocation) => void
}

function member<T extends string>(
  values: ReadonlyArray<T>,
  value: unknown,
): T | undefined {
  return values.find((item) => item === value)
}

export function validateWorkspaceSearch(
  search: Record<string, unknown>,
): WorkspaceSearch {
  return {
    section: member(sections, search.section),
    tab: member(operationTabs, search.tab),
    settings: member(settingsTabs, search.settings),
    template: member(templates, search.template),
    focus:
      typeof search.focus === 'string' && search.focus
        ? search.focus
        : undefined,
  }
}

function completeLocation(search: WorkspaceSearch): WorkspaceLocation {
  return {
    section: search.section ?? 'operations',
    tab: search.tab ?? 'overview',
    settings: search.settings ?? 'numbering',
    template: search.template ?? 'request',
    focus: search.focus,
  }
}

const storageKey = 'materials.workspaceView.v1:navigation'

function readLocation(): WorkspaceLocation {
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? 'null',
    )
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      return completeLocation(validateWorkspaceSearch({ ...saved }))
    }
    // Keep the last view when first opening an installation without URL navigation.
    return completeLocation(
      validateWorkspaceSearch({
        section: JSON.parse(
          sessionStorage.getItem('materials.workspaceView.v1:section') ??
            'null',
        ),
        tab: JSON.parse(
          sessionStorage.getItem('materials.workspaceView.v1:operations.tab') ??
            'null',
        ),
      }),
    )
  } catch {
    return completeLocation({})
  }
}

function sameLocation(left: WorkspaceSearch, right: WorkspaceLocation) {
  return (
    left.section === right.section &&
    left.tab === right.tab &&
    left.settings === right.settings &&
    left.template === right.template &&
    left.focus === right.focus
  )
}

type RouteNavigate = (options: {
  search: (previous: WorkspaceSearch) => WorkspaceSearch
  replace?: boolean
  resetScroll: false
}) => Promise<void>

// The URL owns navigation. Session preferences only supply the initial view of a bare '/'.
export function useWorkspaceRouteNavigation(
  search: WorkspaceSearch,
  navigate: RouteNavigate,
): WorkspaceNavigation {
  const [initialView] = useState(readLocation)
  const view = useMemo(
    () =>
      search.section !== undefined ||
      search.tab !== undefined ||
      search.settings !== undefined ||
      search.template !== undefined ||
      search.focus !== undefined
        ? completeLocation(search)
        : initialView,
    [search, initialView],
  )

  useEffect(() => {
    if (!sameLocation(search, view)) {
      void navigate({
        search: (previous) => ({ ...previous, ...view }),
        replace: true,
        resetScroll: false,
      })
    }
  }, [navigate, search, view])

  return useMemo(
    () => ({
      view,
      onNavigate: (next: WorkspaceLocation) => {
        if (!sameLocation(view, next)) {
          void navigate({
            search: (previous) => ({ ...previous, ...next }),
            resetScroll: false,
          })
        }
      },
    }),
    [navigate, view],
  )
}

const NavigationContext = createContext<{
  view: WorkspaceLocation
  navigate: (patch: WorkspaceSearch) => void
} | null>(null)

// A controlled navigation boundary keeps the workspace usable in isolated component tests.
export function WorkspaceNavigationProvider({
  children,
  navigation,
}: {
  children: ReactNode
  navigation?: WorkspaceNavigation
}) {
  const [localView, setLocalView] = useState(readLocation)
  const view = navigation?.view ?? localView
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(view))
    } catch {
      /* Optional view preference. */
    }
  }, [view])
  const value = useMemo(
    () => ({
      view,
      navigate: (patch: WorkspaceSearch) => {
        const next = { ...view, ...patch }
        if ('tab' in patch && !('focus' in patch)) next.focus = undefined
        if (sameLocation(view, next)) return
        if (navigation) navigation.onNavigate(next)
        else setLocalView(next)
      },
    }),
    [view, navigation],
  )
  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useWorkspaceNavigation() {
  const navigation = useContext(NavigationContext)
  if (!navigation) throw new Error('Workspace navigation provider is missing')
  return navigation
}
