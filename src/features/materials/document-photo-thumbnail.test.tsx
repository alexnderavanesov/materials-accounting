// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DocumentPhotoThumbnail } from './document-photo-thumbnail'

const file = {
  id: 'photo',
  documentId: 'avk',
  name: 'Фото.png',
  size: 50,
  uploadedAt: '',
}
beforeEach(() => {
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:thumbnail'),
      revokeObjectURL: vi.fn(),
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('loads an API photo through fetch only when visible and frees its blob on close', async () => {
  let intersect!: (entries: { isIntersecting: boolean }[]) => void
  const disconnect = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof intersect) {
        intersect = callback
      }
      observe() {}
      disconnect = disconnect
    },
  )
  const fetch = vi.fn(
    async () =>
      new Response('png', { headers: { 'Content-Type': 'image/png' } }),
  )
  vi.stubGlobal('fetch', fetch)
  const view = render(<DocumentPhotoThumbnail file={file} alt={file.name} />)
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.queryByRole('img')).toBeNull()
  act(() => intersect([{ isIntersecting: true }]))
  expect(await screen.findByRole('img', { name: file.name })).toHaveProperty(
    'src',
    'blob:thumbnail',
  )
  expect(fetch).toHaveBeenCalledWith(
    '/api/documents?file=photo&preview=1',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect(disconnect).toHaveBeenCalled()
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumbnail')
})

it.each([404, 401])(
  'shows a failed thumbnail for HTTP %s instead of leaving a spinner',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Нет файла' }, { status })),
    )
    render(<DocumentPhotoThumbnail file={file} />)
    expect(
      await screen.findByText('Не удалось загрузить миниатюру'),
    ).toBeTruthy()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  },
)

it('aborts pending thumbnails and does not allocate a blob after the gallery closes', async () => {
  let resolve!: (response: Response) => void
  const fetch = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done
      }),
  )
  vi.stubGlobal('fetch', fetch)
  const view = render(<DocumentPhotoThumbnail file={file} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  const signal = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    .signal!
  view.unmount()
  expect(signal.aborted).toBe(true)
  await act(async () =>
    resolve(new Response('png', { headers: { 'Content-Type': 'image/png' } })),
  )
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})
