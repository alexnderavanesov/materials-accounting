// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDocument } from 'pdfjs-dist'
import RequestPrintPreview from './request-print-preview'

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/pdf.worker.mjs',
}))
const getPage = vi.fn(),
  destroy = vi.fn(async () => {}),
  cancel = vi.fn()
beforeEach(() => {
  getPage.mockReset()
  destroy.mockClear()
  cancel.mockClear()
  getPage.mockResolvedValue({
    getViewport: () => ({ width: 1000, height: 700 }),
    render: () => ({ promise: Promise.resolve(), cancel }),
  })
  vi.mocked(getDocument).mockReturnValue({
    promise: Promise.resolve({ numPages: 3, getPage }),
    destroy,
  } as unknown as ReturnType<typeof getDocument>)
})
afterEach(cleanup)

it('renders pages without a native PDF plugin, navigates and releases its worker on close', async () => {
  const view = render(<RequestPrintPreview url="blob:pdf" />)
  await screen.findByText('Страница 1 из 3')
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  expect(getPage).toHaveBeenCalledWith(1)
  fireEvent.click(screen.getByRole('button', { name: 'Следующая' }))
  await waitFor(() => expect(getPage).toHaveBeenCalledWith(2))
  expect(screen.getByText('Страница 2 из 3')).toBeTruthy()
  expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
  view.unmount()
  expect(destroy).toHaveBeenCalledOnce()
  expect(cancel).toHaveBeenCalled()
})

it('reports a PDF rendering failure while download remains available in the parent', async () => {
  getPage.mockRejectedValue(new Error('render failed'))
  render(<RequestPrintPreview url="blob:pdf" />)
  expect((await screen.findByRole('alert')).textContent).toContain(
    'PDF доступен для скачивания',
  )
})
