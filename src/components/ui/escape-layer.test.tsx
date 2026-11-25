// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { createPortal } from 'react-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EscapeFilters, EscapeLayer } from './escape-layer'
import { AppSelect } from './app-select'
import { WorkflowDialog } from '#/features/materials/workflow-dialog'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)
const escape = (options = {}) =>
  fireEvent.keyDown(document.body, { key: 'Escape', ...options })

it('closes the deepest portal first even on the same mount, then clears only exposed filters, then closes its parent', () => {
  const pageReset = vi.fn()
  function App() {
    const [parent, setParent] = useState(true)
    const [child, setChild] = useState(true)
    const [filtered, setFiltered] = useState(true)
    return (
      <>
        <EscapeFilters active onReset={pageReset} />
        {parent && (
          <EscapeLayer onEscape={() => setParent(false)}>
            <p>Родитель</p>
            <EscapeFilters
              active={filtered}
              onReset={() => setFiltered(false)}
            />
            {filtered && <p>Фильтр родителя</p>}
            {child &&
              createPortal(
                <EscapeLayer onEscape={() => setChild(false)}>
                  <p>Вложенное окно</p>
                </EscapeLayer>,
                document.body,
              )}
          </EscapeLayer>
        )}
      </>
    )
  }
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  escape()
  expect(screen.queryByText('Вложенное окно')).toBeNull()
  expect(screen.getByText('Фильтр родителя')).toBeTruthy()
  escape()
  expect(screen.queryByText('Фильтр родителя')).toBeNull()
  expect(screen.getByText('Родитель')).toBeTruthy()
  expect(pageReset).not.toHaveBeenCalled()
  escape()
  expect(screen.queryByText('Родитель')).toBeNull()
  expect(pageReset).not.toHaveBeenCalled()
  escape()
  expect(pageReset).toHaveBeenCalledOnce()
})

it('uses opening order for independent layers, not callback changes or focus left behind', () => {
  const first = vi.fn(),
    second = vi.fn(),
    latest = vi.fn()
  const view = render(
    <>
      <EscapeLayer onEscape={first}>
        <button>Первое</button>
      </EscapeLayer>
    </>,
  )
  view.rerender(
    <>
      <EscapeLayer onEscape={latest}>
        <button>Первое</button>
      </EscapeLayer>
      <EscapeLayer onEscape={second}>
        <p>Второе</p>
      </EscapeLayer>
    </>,
  )
  screen.getByRole('button', { name: 'Первое' }).focus()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(second).toHaveBeenCalledOnce()
  expect(latest).not.toHaveBeenCalled()
  view.rerender(
    <>
      <EscapeLayer onEscape={latest}>
        <button>Первое</button>
      </EscapeLayer>
    </>,
  )
  escape()
  expect(latest).toHaveBeenCalledOnce()
  expect(first).not.toHaveBeenCalled()
})

it('consumes a held key without walking down the stack and ignores composition and other keys', () => {
  const close = vi.fn(),
    behind = vi.fn()
  render(
    <EscapeLayer onEscape={close}>
      <p>Окно</p>
    </EscapeLayer>,
  )
  window.addEventListener('keydown', behind)
  try {
    expect(escape({ repeat: true })).toBe(false)
    expect(close).not.toHaveBeenCalled()
    expect(behind).not.toHaveBeenCalled()
    escape({ isComposing: true })
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(close).not.toHaveBeenCalled()
    escape()
    expect(close).toHaveBeenCalledOnce()
  } finally {
    window.removeEventListener('keydown', behind)
  }
})

it('closes a select before its containing dialog and restores trigger focus', () => {
  const close = vi.fn()
  render(
    <WorkflowDialog title="Форма" onClose={close}>
      <AppSelect
        label="Материал"
        value="a"
        options={[
          { value: 'a', label: 'А' },
          { value: 'b', label: 'Б' },
        ]}
        onChange={vi.fn()}
      />
    </WorkflowDialog>,
  )
  const trigger = screen.getByRole('combobox', { name: 'Материал' })
  fireEvent.click(trigger)
  escape()
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(close).not.toHaveBeenCalled()
  escape()
  expect(close).toHaveBeenCalledOnce()
})

it('keeps unsaved work and treats its discard prompt as the next level; a busy dialog blocks lower layers', () => {
  const close = vi.fn(),
    reset = vi.fn()
  const view = render(
    <>
      <EscapeFilters active onReset={reset} />
      <WorkflowDialog title="Правки" dirty busy onClose={close}>
        <input defaultValue="Сохранить ввод" />
      </WorkflowDialog>
    </>,
  )
  escape()
  expect(close).not.toHaveBeenCalled()
  expect(reset).not.toHaveBeenCalled()
  view.rerender(
    <>
      <EscapeFilters active onReset={reset} />
      <WorkflowDialog title="Правки" dirty onClose={close}>
        <input defaultValue="Сохранить ввод" />
      </WorkflowDialog>
    </>,
  )
  escape()
  expect(screen.getByText('Есть несохранённые изменения.')).toBeTruthy()
  escape()
  expect(screen.queryByText('Есть несохранённые изменения.')).toBeNull()
  expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe(
    'Сохранить ввод',
  )
  expect(close).not.toHaveBeenCalled()
  expect(reset).not.toHaveBeenCalled()
})

it('removes handlers on unmount, including StrictMode remounts', () => {
  const close = vi.fn()
  const view = render(
    <StrictMode>
      <EscapeLayer onEscape={close}>Окно</EscapeLayer>
    </StrictMode>,
  )
  view.unmount()
  expect(escape()).toBe(true)
  expect(close).not.toHaveBeenCalled()
})
