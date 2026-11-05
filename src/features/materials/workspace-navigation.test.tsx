// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  WorkspaceNavigationProvider,
  useWorkspaceNavigation,
  useWorkspaceRouteNavigation,
  validateWorkspaceSearch,
} from './workspace-navigation'

function Probe() {
  const { view, navigate } = useWorkspaceNavigation()
  return (
    <>
      <output data-testid="location">{JSON.stringify(view)}</output>
      <button onClick={() => navigate({ tab: 'requests' })}>Requests</button>
      <button
        onClick={() =>
          navigate({ tab: 'receipts', focus: 'получение №1/ТК-2' })
        }
      >
        Receipt
      </button>
      <button onClick={() => navigate({ section: 'database' })}>
        Database
      </button>
      <button onClick={() => navigate({ section: 'settings' })}>
        Settings
      </button>
      <button onClick={() => navigate({ settings: 'print' })}>Print</button>
      <button onClick={() => navigate({ template: 'avk' })}>AVK</button>
    </>
  )
}

async function mount(url = '/') {
  const history = createMemoryHistory({ initialEntries: [url] })
  const loader = vi.fn(() => 'snapshot')
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: '/',
    validateSearch: validateWorkspaceSearch,
    shouldReload: false,
    loader,
    component: () => {
      const navigation = useWorkspaceRouteNavigation(
        route.useSearch(),
        route.useNavigate(),
      )
      return (
        <WorkspaceNavigationProvider navigation={navigation}>
          <Probe />
        </WorkspaceNavigationProvider>
      )
    },
  })
  const router = createRouter({ routeTree: root.addChildren([route]), history })
  await act(async () => {
    await router.load()
  })
  const result = render(<RouterProvider router={router} />)
  await screen.findByTestId('location')
  await waitFor(() => expect(router.state.location.search.section).toBeTruthy())
  return { ...result, router, history, loader }
}
const location = () => JSON.parse(screen.getByTestId('location').textContent)
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

beforeEach(() => {
  sessionStorage.clear()
  window.scrollTo = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('travels back and forward through tabs, document targets, sections and print templates without reloading data', async () => {
  const { history, loader } = await mount()
  const originalLength = history.length
  await click('Requests')
  await click('Receipt')
  expect(location()).toMatchObject({
    tab: 'receipts',
    focus: 'получение №1/ТК-2',
  })
  await click('Database')
  await click('Settings')
  await click('Print')
  await click('AVK')
  expect(history.length).toBe(originalLength + 6)
  await act(async () => {
    history.back()
  })
  await waitFor(() => expect(location().template).toBe('request'))
  await act(async () => {
    history.back()
  })
  await waitFor(() => expect(location().settings).toBe('numbering'))
  await act(async () => {
    history.back()
  })
  await waitFor(() => expect(location().section).toBe('database'))
  await act(async () => {
    history.back()
  })
  await waitFor(() =>
    expect(location()).toMatchObject({
      section: 'operations',
      tab: 'receipts',
      focus: 'получение №1/ТК-2',
    }),
  )
  await act(async () => {
    history.back()
  })
  await waitFor(() => expect(location().tab).toBe('requests'))
  expect(location().focus).toBeUndefined()
  await click('Requests') // Clicking the current tab must not destroy Forward.
  await act(async () => {
    history.forward()
  })
  await waitFor(() => expect(location().focus).toBe('получение №1/ТК-2'))
  expect(history.length).toBe(originalLength + 6)
  expect(loader).toHaveBeenCalledTimes(1)
})

it('restores the old session view on a bare URL without adding an initial history entry', async () => {
  sessionStorage.setItem('materials.workspaceView.v1:section', '"operations"')
  sessionStorage.setItem(
    'materials.workspaceView.v1:operations.tab',
    '"quality"',
  )
  const { history } = await mount()
  expect(location().tab).toBe('quality')
  expect(history.length).toBe(1)
  expect(history.location.search).toContain('tab=quality')
})

it('uses the URL instead of the latest session preference after reload or a direct link', async () => {
  const first = await mount('/?section=operations&tab=receipts&focus=receipt-1')
  const receiptUrl = first.history.location.href
  await click('Settings')
  await click('Print')
  first.unmount()
  const second = await mount(receiptUrl)
  expect(location()).toMatchObject({
    section: 'operations',
    tab: 'receipts',
    focus: 'receipt-1',
  })
  await click('Requests')
  expect(location().focus).toBeUndefined()
  expect(second.history.location.search).not.toContain('focus=')
})

it('ignores malformed navigation values and works when session storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  const { history } = await mount(
    '/?section=other&tab=%5B1%5D&settings=false&template=invalid&focus=42',
  )
  expect(location()).toEqual({
    section: 'operations',
    tab: 'overview',
    settings: 'numbering',
    template: 'request',
  })
  await click('Requests')
  await act(async () => {
    history.back()
  })
  await waitFor(() => expect(location().tab).toBe('overview'))
})
