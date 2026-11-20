import { changeField } from './workflow-test-support'
// @vitest-environment jsdom
import { StrictMode } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
vi.mock('./request-print-preview', () => ({
  default: ({ url }: { url: string }) => (
    <div aria-label="Страницы файла PDF">{url}</div>
  ),
}))
const data = {
  workspaceRevision: 'saved',
  manifest: { revision: 'files', documents: [], files: [] },
  materials: [
    {
      id: 'pipe',
      name: 'Труба 108х3',
      receivedNames: [{ name: 'Труба 108х3', replacement: false }],
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
  vi.restoreAllMocks()
})

it.each(['image/png', 'application/pdf'])(
  'opens an original as %s without downloading and keeps its document dialog after closing',
  async (type) => {
    const file = {
      id: 'file-1',
      documentId: 'app',
      name: type === 'image/png' ? 'Фото.png' : 'Акт.pdf',
      size: 20,
      uploadedAt: '',
    }
    const fetch = vi.fn(async (url: string) =>
      url.includes('preview=1')
        ? new Response('file contents', { headers: { 'Content-Type': type } })
        : Response.json({
            ...data,
            manifest: { ...data.manifest, files: [file] },
          }),
    )
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn(() => 'blob:original'),
        revokeObjectURL: vi.fn(),
      }),
    )
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    render(<DocumentsSection prepare={async () => 'saved'} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Скачать архив · 1' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: type === 'image/png' ? 'Фотографии · 1' : 'Другие файлы · 1',
      }),
    )
    const trigger = screen.getByRole('button', {
      name: `Просмотр файла: ${file.name}`,
    })
    trigger.focus()
    fireEvent.click(trigger)
    const preview = await screen.findByRole('dialog', {
      name: `Предпросмотр: ${file.name}`,
    })
    if (type === 'image/png')
      expect(
        await screen.findByRole('img', { name: file.name }),
      ).toHaveProperty('src', 'blob:original')
    else expect(await screen.findByLabelText('Страницы файла PDF')).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(
      '/api/documents?file=file-1&preview=1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(
      screen.getByRole('link', { name: 'Скачать оригинал' }),
    ).toHaveProperty('download', file.name)
    expect(download).not.toHaveBeenCalled()
    fireEvent(preview, new Event('cancel', { cancelable: true }))
    expect(
      screen.queryByRole('dialog', { name: `Предпросмотр: ${file.name}` }),
    ).toBeNull()
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(document.activeElement).toBe(trigger)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original')
  },
)

it('keeps 20 photos compact, opens a gallery, returns from previews and updates counts after deleting an attachment', async () => {
  let files = Array.from({ length: 20 }, (_, index) => ({
    id: `photo-${index + 1}`,
    documentId: 'app',
    name: `Фото ${index + 1}.JPG`,
    size: 2048,
    uploadedAt: '',
  }))
  files.push({
    id: 'pdf',
    documentId: 'app',
    name: 'Паспорт.pdf',
    size: 2048,
    uploadedAt: '',
  })
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(options.body as string)
      expect(body.action).toBe('remove')
      files = files.filter((file) => file.id !== body.fileId)
    }
    return Response.json({ ...data, manifest: { ...data.manifest, files } })
  })
  vi.stubGlobal('fetch', fetch)
  render(<DocumentsSection prepare={async () => 'saved'} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Скачать архив · 1' }))
  const photos = screen.getByRole('button', { name: 'Фотографии · 20' })
  expect(screen.getByRole('button', { name: 'Другие файлы · 1' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Просмотр файла:/ })).toBeNull()
  expect(document.querySelectorAll('img')).toHaveLength(0)
  expect(fetch).toHaveBeenCalledTimes(1)
  photos.focus()
  fireEvent.click(photos)
  const gallery = screen.getByRole('dialog', {
    name: 'Фотографии',
  })
  expect(
    within(gallery).getAllByRole('button', { name: /^Просмотр файла:/ }),
  ).toHaveLength(20)
  expect(within(gallery).queryByText('Паспорт.pdf')).toBeNull()
  fireEvent.click(
    within(gallery).getByRole('button', { name: 'Удалить файл Фото 1.JPG' }),
  )
  fireEvent.click(within(gallery).getByRole('button', { name: 'Удалить файл' }))
  await waitFor(() =>
    expect(
      within(gallery).queryByRole('button', {
        name: 'Просмотр файла: Фото 1.JPG',
      }),
    ).toBeNull(),
  )
  expect(within(gallery).getByText('Всего: 19')).toBeTruthy()
  fireEvent(gallery, new Event('cancel', { cancelable: true, bubbles: true }))
  expect(screen.queryByRole('dialog', { name: 'Фотографии' })).toBeNull()
  expect(
    screen.getByRole('dialog', { name: 'Документы выбранных материалов' }),
  ).toBeTruthy()
  expect(document.activeElement).toBe(photos)
  expect(screen.getByRole('button', { name: 'Фотографии · 19' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Другие файлы · 1' }))
  expect(
    screen.getByRole('button', { name: 'Просмотр файла: Паспорт.pdf' }),
  ).toBeTruthy()
  expect(
    screen.queryByRole('button', { name: 'Просмотр файла: Фото 2.JPG' }),
  ).toBeNull()
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

it('downloads one photo archive for the gallery document and blocks duplicate clicks while preparing it', async () => {
  let complete!: (response: Response) => void
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST')
      return new Promise<Response>((resolve) => {
        complete = resolve
      })
    return Response.json({
      ...data,
      manifest: {
        ...data.manifest,
        files: [
          {
            id: 'photo',
            documentId: 'app',
            name: 'Фото.png',
            size: 50,
            uploadedAt: '',
          },
        ],
      },
    })
  })
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:zip'),
      revokeObjectURL: vi.fn(),
    }),
  )
  let downloaded = ''
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded = this.download
  })
  render(<DocumentsSection prepare={async () => 'saved'} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Скачать архив · 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Фотографии · 1' }))
  const download = screen.getByRole('button', { name: 'Скачать все фото' })
  fireEvent.click(download)
  fireEvent.click(download)
  await waitFor(() =>
    expect(
      fetch.mock.calls.filter((call) => call[1]?.method === 'POST'),
    ).toHaveLength(1),
  )
  expect(download).toHaveProperty('disabled', true)
  const post = fetch.mock.calls.find((call) => call[1]?.method === 'POST')!
  expect(JSON.parse(post[1]!.body as string)).toEqual({
    action: 'photos-archive',
    documentId: 'app',
    workspaceRevision: 'saved',
    filesRevision: 'files',
  })
  complete(
    new Response('zip', {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('Фотографии — АВК №9.zip')}`,
      },
    }),
  )
  await waitFor(() => expect(downloaded).toBe('Фотографии — АВК №9.zip'))
  expect(screen.getByRole('dialog', { name: 'Фотографии' })).toBeTruthy()
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

it('shows materials with documents by default and switches to only materials without documents', async () => {
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
    await screen.findByRole('button', { name: 'Труба 108х3' }),
  ).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Без документов' })).toBeNull()
  const checkbox = screen.getByRole<HTMLInputElement>('checkbox', {
    name: 'Без документов',
  })
  expect(checkbox.checked).toBe(false)
  fireEvent.click(checkbox)
  expect(screen.getByRole('button', { name: 'Без документов' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Труба 108х3' })).toBeNull()
  fireEvent.click(checkbox)
  expect(screen.queryByRole('button', { name: 'Без документов' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Труба 108х3' })).toBeTruthy()
})

it('adds multiple dropped and picked files, removes individual entries and uploads them together after confirmation', async () => {
  const fetch = vi.fn(async () => Response.json(data))
  vi.stubGlobal('fetch', fetch)
  vi.mocked(fileBase64).mockImplementation(async (file) => `bytes:${file.name}`)
  render(<DocumentsSection prepare={async () => 'saved'} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Прикрепить' }))
  changeField(screen.getByPlaceholderText('Например: Паспорт №221'), {
    target: { value: 'Паспорт №221' },
  })
  const first = new File(['%PDF-first'], 'Паспорт.pdf')
  const second = new File(['image'], 'Фото.png')
  fireEvent.drop(
    screen.getByRole('button', { name: 'Выбрать файлы оригиналов' }),
    { dataTransfer: { files: [first, second] } },
  )
  const third = new File(['%PDF-other'], 'Приложение.pdf')
  const input = screen.getByLabelText('Файлы оригиналов')
  expect(input).toHaveProperty('multiple', true)
  changeField(input, { target: { files: [second, third] } })
  expect(screen.getByText(/Выбрано файлов: 3/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Убрать файл: Фото.png' }))
  expect(screen.queryByText('Фото.png')).toBeNull()
  expect(fetch).toHaveBeenCalledTimes(1)
  const submit = screen.getByRole('button', { name: 'Прикрепить (2)' })
  fireEvent.click(submit)
  fireEvent.click(submit)
  expect(await screen.findByText('Прикреплено файлов: 2.')).toBeTruthy()
  const posts = fetch.mock.calls.filter(
    (call) => (call as unknown as [string, RequestInit?])[1]?.method === 'POST',
  )
  expect(posts).toHaveLength(1)
  expect(
    JSON.parse(
      (posts[0] as unknown as [string, RequestInit])[1].body as string,
    ),
  ).toMatchObject({
    action: 'upload-files',
    files: [
      { name: 'Паспорт.pdf', base64: 'bytes:Паспорт.pdf' },
      { name: 'Приложение.pdf', base64: 'bytes:Приложение.pdf' },
    ],
    document: { label: 'Паспорт №221', lineIds: ['line'] },
  })
})

it('keeps the chosen files but blocks submission until an invalid entry is removed', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(data)),
  )
  render(<DocumentsSection prepare={async () => 'saved'} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Скачать архив · 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Прикрепить: АПП №1' }))
  const file = new File(['%PDF-test'], 'Паспорт.pdf')
  fireEvent.drop(
    screen.getByRole('button', { name: 'Выбрать файлы оригиналов' }),
    { dataTransfer: { files: [file, new File(['bad'], 'Файл.zip')] } },
  )
  expect(screen.getByRole('alert').textContent).toContain('Файл.zip')
  expect(screen.getByRole('button', { name: 'Прикрепить (2)' })).toHaveProperty(
    'disabled',
    true,
  )
  expect(screen.getByText('Паспорт.pdf')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Убрать файл: Файл.zip' }))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('button', { name: 'Прикрепить (1)' })).toHaveProperty(
    'disabled',
    false,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Убрать все' }))
  expect(screen.queryByText('Паспорт.pdf')).toBeNull()
  expect(
    screen.getAllByRole('button', { name: 'Прикрепить' }).at(-1),
  ).toHaveProperty('disabled', true)
})

it('retains the batch after a failed upload so it can be retried against the same document', async () => {
  let failed = false
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST' && !failed) {
      failed = true
      return Response.json({ error: 'Ошибка записи' }, { status: 500 })
    }
    return Response.json(data)
  })
  vi.stubGlobal('fetch', fetch)
  vi.mocked(fileBase64).mockResolvedValue('bytes')
  render(<DocumentsSection prepare={async () => 'saved'} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Скачать архив · 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Прикрепить: АПП №1' }))
  changeField(screen.getByLabelText('Файлы оригиналов'), {
    target: {
      files: [new File(['a'], 'Фото1.png'), new File(['b'], 'Фото2.png')],
    },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Прикрепить (2)' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Ошибка записи')
  expect(screen.getByText('Фото1.png')).toBeTruthy()
  expect(screen.getByText('Фото2.png')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Прикрепить (2)' }))
  expect(await screen.findByText('Прикреплено файлов: 2.')).toBeTruthy()
  const posts = fetch.mock.calls.filter((call) => call[1]?.method === 'POST')
  expect(posts).toHaveLength(2)
  expect(posts[0]![1]!.body).toBe(posts[1]![1]!.body)
  expect(JSON.parse(posts[0]![1]!.body as string).documentId).toBe('app')
})

it('keeps the upload form and selected file when the native picker is cancelled, but allows closing the dialog', async () => {
  const fetch = vi.fn(async () => Response.json(data))
  vi.stubGlobal('fetch', fetch)
  render(<DocumentsSection prepare={async () => 'saved'} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Прикрепить' }))
  const name = screen.getByPlaceholderText('Например: Паспорт №221')
  changeField(name, { target: { value: 'Паспорт №221' } })
  const input = screen.getByLabelText('Файлы оригиналов')
  fireEvent(input, new Event('cancel', { bubbles: true }))
  expect(screen.getByRole('dialog').hasAttribute('open')).toBe(true)
  expect(name).toHaveProperty('value', 'Паспорт №221')
  expect(
    screen.getByRole('button', { name: 'Выбрать файлы оригиналов' }),
  ).toBeTruthy()

  changeField(input, {
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

it('keeps M-15 documents as scans without reconciliation controls', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        ...data,
        materials: [{ ...data.materials[0]!, documentIds: ['source'] }],
        documents: [
          {
            id: 'source',
            kind: 'm15',
            receiptDocumentId: 'm15',
            label: 'М-15 №15-1',
            date: '2026-11-18',
            materialIds: ['pipe'],
          },
        ],
        manifest: {
          revision: 'files',
          documents: [],
          files: [
            {
              id: 'scan',
              documentId: 'source',
              name: 'Скан М-15.pdf',
              size: 10,
              uploadedAt: '',
            },
          ],
        },
      }),
    ),
  )
  render(<DocumentsSection prepare={async () => 'saved'} />)
  await screen.findByRole('button', { name: 'Труба 108х3' })
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Вид документов' })).getByRole(
      'button',
      { name: 'М-15' },
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Труба 108х3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Скачать архив · 1' }))
  expect(screen.getByText('М-15 №15-1')).toBeTruthy()
  expect(
    screen.queryByRole('button', { name: 'Сверка с получениями' }),
  ).toBeNull()
  expect(screen.queryByText('Количества по М-15 не введены')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Другие файлы · 1' }))
  expect(
    screen.getByRole('button', { name: 'Просмотр файла: Скан М-15.pdf' }),
  ).toBeTruthy()
})
it('opens scans for M-15 entered before any receipts or project material links', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        ...data,
        materials: [],
        documents: [
          {
            id: 'source',
            kind: 'm15',
            receiptDocumentId: 'new',
            label: 'М-15 №NEW',
            date: '2026-11-18',
            materialIds: [],
          },
        ],
        manifest: {
          revision: 'files',
          documents: [],
          files: [
            {
              id: 'scan',
              documentId: 'source',
              name: 'М-15.pdf',
              size: 10,
              uploadedAt: '',
            },
          ],
        },
      }),
    ),
  )
  render(<DocumentsSection prepare={async () => 'saved'} />)
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: 'Обновить реестр' })
        .hasAttribute('disabled'),
    ).toBe(false),
  )
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Вид документов' })).getByRole(
      'button',
      { name: 'М-15' },
    ),
  )
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Нет привязки к проектной позиции',
    }),
  )
  expect(
    screen.getByRole('button', { name: 'Прикрепить' }).hasAttribute('disabled'),
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Скачать архив · 1' }))
  expect(screen.getByText('М-15 №NEW')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Другие файлы · 1' }))
  expect(
    screen.getByRole('button', { name: 'Просмотр файла: М-15.pdf' }),
  ).toBeTruthy()
})

it.each(['Заменить', 'Оставить несколько'])(
  'asks how to handle existing originals in the registry: %s',
  async (choice) => {
    const old = {
      id: '10000000-0000-4000-8000-000000000001',
      documentId: 'app',
      name: 'Old.pdf',
      size: 10,
      uploadedAt: '',
    }
    const posts: Record<string, unknown>[] = []
    vi.mocked(fileBase64).mockResolvedValue('JVBERi0=')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === 'POST')
          posts.push(JSON.parse(String(options.body)))
        return Response.json({
          ...data,
          manifest: { ...data.manifest, files: [old] },
        })
      }),
    )
    render(<DocumentsSection prepare={async () => 'saved'} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Труба 108х3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Скачать архив · 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Прикрепить: АПП №1' }))
    expect(
      screen.getByRole('button', { name: 'Посмотреть: Old.pdf' }),
    ).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Файлы оригиналов'), {
      target: { files: [new File(['%PDF-new'], 'New.pdf')] },
    })
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Прикрепить (1)' })
        .disabled,
    ).toBe(true)
    expect(posts).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: choice }))
    fireEvent.click(screen.getByRole('button', { name: 'Прикрепить (1)' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      documentId: 'app',
      expectedFileIds: [old.id],
      replaceFileIds: choice === 'Заменить' ? [old.id] : [],
    })
  },
)
