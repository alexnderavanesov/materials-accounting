// @vitest-environment jsdom
import { useState } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DocumentFilePreview } from './document-file-preview'

const file = {
  id: 'photo',
  documentId: 'avk',
  name: 'Фото.jpg',
  size: 20,
  uploadedAt: '',
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:photo'),
      revokeObjectURL: vi.fn(),
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows preview failures, retains an explicit download and lets the user retry', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: 'Конвертер недоступен' }, { status: 503 }),
    )
    .mockResolvedValueOnce(
      new Response('photo', { headers: { 'Content-Type': 'image/jpeg' } }),
    )
  vi.stubGlobal('fetch', fetch)
  render(<DocumentFilePreview file={file} onClose={() => {}} />)
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Конвертер недоступен',
  )
  expect(
    screen.getByRole('link', { name: 'Скачать оригинал' }).getAttribute('href'),
  ).toBe('/api/documents?file=photo')
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
  expect(await screen.findByRole('img', { name: file.name })).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('alert').textContent).toContain(
    'Не удалось отобразить изображение',
  )
})

it('aborts a closed preview and ignores a response that completes after closing', async () => {
  let resolve!: (response: Response) => void
  const fetch = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done
      }),
  )
  vi.stubGlobal('fetch', fetch)
  const view = render(<DocumentFilePreview file={file} onClose={() => {}} />)
  const signal = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    .signal!
  view.unmount()
  expect(signal.aborted).toBe(true)
  await act(async () =>
    resolve(
      new Response('late', { headers: { 'Content-Type': 'image/jpeg' } }),
    ),
  )
  await waitFor(() => expect(URL.createObjectURL).not.toHaveBeenCalled())
})

it('navigates a photo gallery by buttons and arrow keys while releasing previous images', async () => {
  const files = [file, { ...file, id: 'photo-2', name: 'Фото 2.jpg' }]
  const fetch = vi.fn(
    async () =>
      new Response('photo', { headers: { 'Content-Type': 'image/jpeg' } }),
  )
  vi.stubGlobal('fetch', fetch)
  function Gallery() {
    const [index, setIndex] = useState(0)
    return (
      <DocumentFilePreview
        file={files[index]!}
        onClose={() => {}}
        navigation={{ index, total: files.length, onChange: setIndex }}
      />
    )
  }
  render(<Gallery />)
  expect(await screen.findByRole('img', { name: file.name })).toBeTruthy()
  expect(screen.getByText('1 из 2')).toBeTruthy()
  expect(
    screen.getByRole('button', { name: 'Предыдущая фотография' }),
  ).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: 'Следующая фотография' }))
  expect(await screen.findByRole('img', { name: 'Фото 2.jpg' })).toBeTruthy()
  expect(screen.getByText('2 из 2')).toBeTruthy()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo')
  expect(screen.getByRole('link', { name: 'Скачать оригинал' })).toHaveProperty(
    'download',
    'Фото 2.jpg',
  )
  expect(
    screen.getByRole('button', { name: 'Следующая фотография' }),
  ).toHaveProperty('disabled', true)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
  expect(screen.getByText('2 из 2')).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
  expect(await screen.findByRole('img', { name: file.name })).toBeTruthy()
  expect(screen.getByText('1 из 2')).toBeTruthy()
  expect(fetch).toHaveBeenCalledTimes(3)
})
