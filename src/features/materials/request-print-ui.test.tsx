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
    fireEvent.click(
      screen.getByRole('button', { name: 'Вставить: Номер заявки' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ячейка F3' }))
    expect(
      screen.getByRole('button', { name: 'Ячейка F3' }).textContent,
    ).toContain('Номер заявки')
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
  it('keeps material bindings in one row and replaces an occupied cell without duplicate assignments', async () => {
    render(<RequestPrintSettings />)
    await screen.findByRole('button', { name: 'Ячейка F3' })
    fireEvent.click(screen.getByRole('button', { name: 'Таблица материалов' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Вставить: Количество' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ячейка F3' }))
    expect(screen.getByRole('alert').textContent).toContain('строке 8')
    expect(
      screen
        .getByRole('button', { name: 'Сохранить шаблон' })
        .hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Ячейка F8' }))
    expect(
      screen.getByText('Количество → F8 · вместо «Альтернативное количество»'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Изменить строку' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ячейка B10' }))
    expect(screen.getByText('Первая позиция: строка 10')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаблон' }))
    await screen.findByText('Шаблон сохранён. Он применяется ко всем заявкам.')
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toMatchObject(
      {
        config: { repeatRow: 10, columns: { quantity: 'F', altQuantity: '' } },
      },
    )
  })
  it('discarding changes reloads the saved template without a write', async () => {
    const view = render(<RequestPrintSettings />)
    const field = await screen.findByRole('button', {
      name: 'Вставить: Номер заявки',
    })
    fireEvent.click(field)
    fireEvent.click(screen.getByRole('button', { name: 'Ячейка D3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Ячейка D3' }).textContent,
      ).not.toContain('Номер заявки'),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Вставить: Номер заявки' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ячейка D3' }))
    view.unmount()
    expect(fetchMock.mock.calls.every((call) => !call[1]?.method)).toBe(true)
  })
  it('shows a save conflict and keeps unsaved mappings available', async () => {
    render(<RequestPrintSettings />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Вставить: Номер заявки' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ячейка D3' }))
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
    expect(
      screen.getByRole('button', { name: 'Ячейка D3' }).textContent,
    ).toContain('Номер заявки')
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
        Response.json({
          name: 'Заявка ЗП-1',
          excel: btoa('xlsx'),
          pdf: btoa('%PDF-test'),
        }),
      )
    finish('saved-v2')
    await screen.findByRole('dialog', { name: 'Предпросмотр PDF' })
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toEqual({
      action: 'print',
      format: 'bundle',
      entryId: 'entry-2',
      workspaceRevision: 'saved-v2',
      templateRevision: 'template-v1',
    })
    expect(screen.getByRole('button', { name: 'Скачать Excel' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Скачать PDF' })).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть PDF' }))
    expect(document.body.style.overflow).toBe('')
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
