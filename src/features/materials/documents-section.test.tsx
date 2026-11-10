// @vitest-environment jsdom
import { StrictMode } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DocumentsSection } from './documents-section'
import { fileBase64 } from './request-print-ui'

vi.mock('./materials-grid', () => ({
  materialsGridTheme: {},
  MaterialsGridView: ({
    rowData,
    onSelectionChanged,
  }: {
    rowData: { id: string; name: string }[]
    onSelectionChanged: (event: unknown) => void
  }) => (
    <div>
      {rowData.map((row) => (
        <button
          key={row.id}
          onClick={() =>
            onSelectionChanged({ api: { getSelectedRows: () => [row] } })
          }
        >
          {row.name}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('./request-print-ui', () => ({
  PdfPreview: () => <div>PDF</div>,
  fileBase64: vi.fn(),
}))
vi.mock('./materials-column-filter', () => ({ materialsColumnFilter: {} }))
const data = {
  workspaceRevision: 'saved',
  manifest: { revision: 'files', documents: [], files: [] },
  materials: [
    {
      id: 'pipe',
      name: 'Труба 108х3',
      type: 'Труба',
      cipher: 'ТК1',
      standard: 'ГОСТ',
      unit: 'м',
      lineIds: ['line'],
      documentIds: ['app'],
    },
  ],
  documents: [
    {
      id: 'app',
      kind: 'app',
      label: 'АПП №1',
      date: '',
      materialIds: ['pipe'],
    },
  ],
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('loads under StrictMode, waits for save and opens selected documents without generating files', async () => {
  let saved!: () => void
  const prepare = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        saved = () => resolve('saved')
      }),
  )
  const fetch = vi.fn(async () => Response.json(data))
  vi.stubGlobal('fetch', fetch)
  render(
    <StrictMode>
      <DocumentsSection prepare={prepare} />
    </StrictMode>,
  )
  expect(fetch).not.toHaveBeenCalled()
  saved()
  fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Скачать архив · 1' }))
  expect(await screen.findByText('АПП №1')).toBeTruthy()
  expect(screen.getByText('Оригинал не прикреплён')).toBeTruthy()
  expect(
    screen.getByRole('button', { name: 'Скачать выбранные (1)' }),
  ).toBeTruthy()
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByLabelText('Все документы'))
  expect(
    screen
      .getByRole('button', { name: 'Скачать выбранные (0)' })
      .hasAttribute('disabled'),
  ).toBe(true)
})

it('shows a save failure instead of exporting stale data and allows retry', async () => {
  const prepare = vi
    .fn()
    .mockRejectedValueOnce(new Error('Ошибка сохранения'))
    .mockResolvedValue('saved')
  const fetch = vi.fn(async () => Response.json(data))
  vi.stubGlobal('fetch', fetch)
  render(<DocumentsSection prepare={prepare} />)
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Ошибка сохранения',
  )
  expect(fetch).not.toHaveBeenCalled()
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: 'Обновить реестр' })
        .hasAttribute('disabled'),
    ).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Обновить реестр' }))
  expect(
    await screen.findByRole('button', { name: 'Труба 108х3' }),
  ).toBeTruthy()
})

it('explains how to recover when another tab saved a newer workspace', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(data)),
  )
  render(<DocumentsSection prepare={async () => 'previous-revision'} />)
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Обновите страницу',
  )
  expect(screen.queryByRole('button', { name: 'Труба 108х3' })).toBeNull()
})

it('includes materials without documents by default and can explicitly hide them', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        ...data,
        materials: [
          ...data.materials,
          {
            ...data.materials[0],
            id: 'empty',
            name: 'Без документов',
            documentIds: [],
          },
        ],
      }),
    ),
  )
  render(<DocumentsSection prepare={async () => 'saved'} />)
  expect(
    await screen.findByRole('button', { name: 'Без документов' }),
  ).toBeTruthy()
  const checkbox = screen.getByRole<HTMLInputElement>('checkbox', {
    name: 'С документами',
  })
  expect(checkbox.checked).toBe(false)
  fireEvent.click(checkbox)
  expect(screen.queryByRole('button', { name: 'Без документов' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Труба 108х3' })).toBeTruthy()
  fireEvent.click(checkbox)
  expect(screen.getByRole('button', { name: 'Без документов' })).toBeTruthy()
})

it('accepts a dropped file, lets the picker replace it and uploads only after confirmation', async () => {
  const fetch = vi.fn(async () => Response.json(data))
  vi.stubGlobal('fetch', fetch)
  vi.mocked(fileBase64).mockResolvedValue('replacement-bytes')
  render(<DocumentsSection prepare={async () => 'saved'} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Прикрепить' }))
  fireEvent.change(screen.getByPlaceholderText('Например: Паспорт №221'), {
    target: { value: 'Паспорт №221' },
  })
  const zone = screen.getByRole('button', { name: 'Выбрать файл оригинала' })
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(['%PDF-first'], 'Паспорт.pdf')] },
  })
  expect(screen.getByText('Паспорт.pdf')).toBeTruthy()
  const replacement = new File(['%PDF-replacement'], 'Исправленный.pdf')
  fireEvent.change(screen.getByLabelText('Файл оригинала'), {
    target: { files: [replacement] },
  })
  expect(screen.queryByText('Паспорт.pdf')).toBeNull()
  expect(screen.getByText('Исправленный.pdf')).toBeTruthy()
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getAllByRole('button', { name: 'Прикрепить' }).at(-1)!)
  expect(await screen.findByText('Оригинал прикреплён.')).toBeTruthy()
  expect(fileBase64).toHaveBeenCalledWith(replacement)
  expect(fetch).toHaveBeenCalledWith(
    '/api/documents',
    expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"name":"Исправленный.pdf"'),
    }),
  )
})

it('blocks an invalid replacement and multiple dropped files instead of uploading a stale selection', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(data)),
  )
  render(<DocumentsSection prepare={async () => 'saved'} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Прикрепить' }))
  const zone = screen.getByRole('button', { name: 'Выбрать файл оригинала' })
  const file = new File(['%PDF-test'], 'Паспорт.pdf')
  fireEvent.drop(zone, { dataTransfer: { files: [file] } })
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(['unsupported'], 'Файл.zip')] },
  })
  expect(screen.getByRole('alert').textContent).toContain('Выберите PDF')
  expect(screen.queryByText('Паспорт.pdf')).toBeNull()
  expect(
    screen.getAllByRole('button', { name: 'Прикрепить' }).at(-1),
  ).toHaveProperty('disabled', true)
  fireEvent.drop(zone, { dataTransfer: { files: [file, file] } })
  expect(screen.getByRole('alert').textContent).toBe('Выберите один файл.')
  fireEvent.drop(zone, { dataTransfer: { files: [file] } })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('Паспорт.pdf')).toBeTruthy()
})

it('keeps the upload form and selected file when the native picker is cancelled, but allows closing the dialog', async () => {
  const fetch = vi.fn(async () => Response.json(data))
  vi.stubGlobal('fetch', fetch)
  render(<DocumentsSection prepare={async () => 'saved'} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Прикрепить' }))
  const name = screen.getByPlaceholderText('Например: Паспорт №221')
  fireEvent.change(name, { target: { value: 'Паспорт №221' } })
  const input = screen.getByLabelText('Файл оригинала')
  fireEvent(input, new Event('cancel', { bubbles: true }))
  expect(screen.getByRole('dialog').hasAttribute('open')).toBe(true)
  expect(name).toHaveProperty('value', 'Паспорт №221')
  expect(
    screen.getByRole('button', { name: 'Выбрать файл оригинала' }),
  ).toBeTruthy()

  fireEvent.change(input, {
    target: { files: [new File(['%PDF-test'], 'Паспорт.pdf')] },
  })
  fireEvent(input, new Event('cancel', { bubbles: true }))
  expect(screen.getByRole('dialog').hasAttribute('open')).toBe(true)
  expect(screen.getByText('Паспорт.pdf')).toBeTruthy()
  expect(name).toHaveProperty('value', 'Паспорт №221')
  expect(fetch).toHaveBeenCalledTimes(1)

  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { cancelable: true }),
  )
  expect(screen.queryByRole('dialog')).toBeNull()
})
