// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestPrintButton, RequestPrintSettings } from './request-print-ui'
import { defaultPrintConfig } from './request-print'
import type { PrintTemplate } from './request-print'

vi.mock('./request-print-preview', () => ({
  default: () => <div>Страницы PDF</div>,
}))

const template: PrintTemplate = {
  base64: 'dGVtcGxhdGU=',
  fileName: 'Заявка.xlsx',
  config: defaultPrintConfig,
  revision: 'template-v1',
  sheet: {
    name: 'Заявка',
    rows: 14,
    columns: 9,
    cells: [{ address: 'A1', text: 'Бланк' }],
    merges: [],
  },
}
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => Response.json(template))
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:test-pdf')
      static revokeObjectURL = vi.fn()
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('print template settings', () => {
  it('binds clicked cells, previews a draft and saves only on explicit request with the original revision', async () => {
    render(<RequestPrintSettings />)
    await screen.findByRole('button', { name: 'Ячейка F3' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Ячейка F3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Связать с F3' }))
    expect(
      screen.getByLabelText<HTMLInputElement>('Ячейка: Номер заявки').value,
    ).toBe('F3')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValueOnce(
      new Response('%PDF-test', {
        headers: { 'Content-Type': 'application/pdf' },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр PDF' }))
    await screen.findByRole('dialog', { name: 'Предпросмотр PDF' })
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toMatchObject(
      { action: 'preview', config: { fields: { number: 'F3' } } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть PDF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаблон' }))
    await screen.findByText('Шаблон сохранён. Он применяется ко всем заявкам.')
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body))).toMatchObject(
      { action: 'save', expectedRevision: 'template-v1' },
    )
  })
  it('discarding changes reloads the saved template without a write', async () => {
    const view = render(<RequestPrintSettings />)
    const input = await screen.findByLabelText('Ячейка: Номер заявки')
    fireEvent.change(input, { target: { value: 'D3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''))
    fireEvent.change(input, { target: { value: 'D3' } })
    view.unmount()
    expect(fetchMock.mock.calls.every((call) => !call[1]?.method)).toBe(true)
  })
  it('shows a save conflict and keeps unsaved mappings available', async () => {
    render(<RequestPrintSettings />)
    const input = await screen.findByLabelText('Ячейка: Номер заявки')
    fireEvent.change(input, { target: { value: 'D3' } })
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { error: 'Шаблон изменён в другой вкладке.' },
        { status: 409 },
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаблон' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'другой вкладке',
    )
    expect((input as HTMLInputElement).value).toBe('D3')
  })
})

describe('request print button', () => {
  it('waits for saving before loading the template and printing the selected complete request', async () => {
    let finish: (revision: string) => void = () => {}
    const prepare = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    render(
      <RequestPrintButton entryId="entry-2" number="ЗП-1" prepare={prepare} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Печать' }))
    expect(prepare).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock
      .mockResolvedValueOnce(Response.json(template))
      .mockResolvedValueOnce(
        new Response('%PDF-test', {
          headers: { 'Content-Type': 'application/pdf' },
        }),
      )
    finish('saved-v2')
    await screen.findByRole('dialog', { name: 'Предпросмотр PDF' })
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toEqual({
      action: 'print',
      entryId: 'entry-2',
      workspaceRevision: 'saved-v2',
      templateRevision: 'template-v1',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть PDF' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-pdf')
  })
  it('shows a save failure instead of requesting a PDF from stale data', async () => {
    render(
      <RequestPrintButton
        entryId="entry"
        number="ЗП-1"
        prepare={async () => {
          throw new Error('Заявка ещё не сохранена.')
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Печать' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'не сохранена',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
