// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkspaceDock } from './workspace-dock'
import {
  WorkspaceNavigationProvider,
  useWorkspaceNavigation,
} from './workspace-navigation'

function Workspace() {
  const { view, navigate } = useWorkspaceNavigation()
  return (
    <>
      <WorkspaceDock view={view} onNavigate={navigate} />
      <output aria-label="Текущий раздел">{JSON.stringify(view)}</output>
      <button>Вне меню</button>
    </>
  )
}

function mount() {
  return render(
    <WorkspaceNavigationProvider>
      <Workspace />
    </WorkspaceNavigationProvider>,
  )
}

function location() {
  return JSON.parse(screen.getByLabelText('Текущий раздел').textContent)
}

beforeEach(() => {
  sessionStorage.clear()
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1280,
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('hides operation links without navigating and remembers the group and pin after remount', () => {
  let rendered = mount()
  fireEvent.click(screen.getByRole('button', { name: 'АВК' }))
  fireEvent.click(screen.getByRole('button', { name: 'Закрепить меню' }))
  fireEvent.click(screen.getByRole('button', { name: 'Операции' }))
  expect(screen.queryByRole('button', { name: 'АВК' })).toBeNull()
  expect(location()).toMatchObject({
    section: 'operations',
    tab: 'quality',
    inspection: 'avk',
  })
  rendered.unmount()
  rendered = mount()
  expect(
    screen
      .getByRole('button', { name: 'Открепить меню' })
      .getAttribute('aria-pressed'),
  ).toBe('true')
  expect(
    screen
      .getByRole('button', { name: 'Операции' })
      .getAttribute('aria-expanded'),
  ).toBe('false')
  expect(screen.queryByRole('button', { name: 'Заявки' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Операции' }))
  expect(
    screen.getByRole('button', { name: 'АВК' }).getAttribute('aria-current'),
  ).toBe('page')
  expect(
    screen.getByRole('button', { name: 'ЗНИ' }).hasAttribute('aria-current'),
  ).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Обзор операций' }))
  expect(location()).toMatchObject({ section: 'operations', tab: 'overview' })
  rendered.unmount()
})

it('keeps M-15, ZNI and AVK destinations separate and clears a previous document target', () => {
  sessionStorage.setItem(
    'materials.workspaceView.v1:navigation',
    JSON.stringify({
      section: 'operations',
      tab: 'receipts',
      focus: 'receipt-1',
    }),
  )
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'М-15' }))
  expect(location()).toMatchObject({ section: 'm15' })
  expect(location().focus).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'АВК' }))
  expect(location()).toMatchObject({
    section: 'operations',
    tab: 'quality',
    inspection: 'avk',
  })
  fireEvent.click(screen.getByRole('button', { name: 'ЗНИ' }))
  expect(location()).toMatchObject({
    section: 'operations',
    tab: 'quality',
    inspection: 'zni',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Получение' }))
  expect(location()).toMatchObject({ section: 'operations', tab: 'receipts' })
  expect(location().inspection).toBeUndefined()
})

it('closes the mobile menu with its trigger, Escape, outside click and section selection', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 390,
  })
  mount()
  const panel = screen.getByRole('complementary')
  const open = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
  open()
  const close = screen.getByRole('button', {
    name: 'Закрыть меню',
  })
  act(() => close.focus())
  fireEvent.click(close)
  expect(panel.getAttribute('data-mobile-open')).toBe('false')
  open()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(panel.getAttribute('data-mobile-open')).toBe('false')
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Открыть меню' }),
  )
  open()
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть меню снаружи' }))
  expect(panel.getAttribute('data-mobile-open')).toBe('false')
  open()
  fireEvent.click(screen.getByRole('button', { name: 'Заявки' }))
  expect(panel.getAttribute('data-mobile-open')).toBe('false')
  expect(location()).toMatchObject({ section: 'operations', tab: 'requests' })
})
