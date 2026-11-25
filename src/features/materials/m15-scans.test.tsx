// @vitest-environment jsdom
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocumentFileStore } from './document-files.server'
import { createDocumentsHandler } from './documents-api.server'
import { M15Section } from './m15-section'
import { linkedM15Fixture } from './m15-reconciliation.fixtures'
import { m15ScanDocumentId, uploadM15Scans } from './m15-scans'

const directories: string[] = []
afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

function serveCatalog(store: ReturnType<typeof createDocumentFileStore>) {
  const { workspace } = linkedM15Fixture()
  const handle = createDocumentsHandler({
    workspace: {
      load: vi.fn(async () => ({ workspace, revision: 'test-1' })),
    },
    files: store,
    renderer: vi.fn(),
    convert: vi.fn(),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options?: RequestInit) =>
      handle(
        new Request(new URL(url, 'http://localhost'), {
          ...options,
          headers: { ...options?.headers, Origin: 'http://localhost' },
        }),
      ),
    ),
  )
  return workspace
}

it.each([false, true])(
  'uploads or replaces the single PDF from the folder (%s), with conflict recovery and refreshed filename',
  async (existing) => {
    sessionStorage.clear()
    const directory = await mkdtemp(join(tmpdir(), 'materials-m15-one-scan-'))
    directories.push(directory)
    const store = createDocumentFileStore(directory)
    const documentId = m15ScanDocumentId('m15')
    if (existing)
      await store.add({
        documentId,
        name: 'Старый.pdf',
        bytes: Buffer.from('%PDF-old'),
        expectedRevision: (await store.load()).revision,
      })
    const workspace = serveCatalog(store)
    render(<M15Section workspace={workspace} save={vi.fn()} />)
    const click = async (name: string | RegExp) =>
      fireEvent.click(await screen.findByRole('button', { name }))
    if (!existing) await screen.findByText('Нет скана')
    await click('Открыть М-15')
    const picker = await screen.findByRole('button', {
      name: existing ? 'Заменить PDF-скан' : 'Добавить PDF-скан',
    })
    await waitFor(() => expect(picker).toHaveProperty('disabled', false))
    expect(screen.getByLabelText('Файлы оригиналов')).toHaveProperty(
      'multiple',
      false,
    )
    expect(
      screen.getByLabelText('Файлы оригиналов').getAttribute('accept'),
    ).toBe('.pdf')
    fireEvent.change(screen.getByLabelText('Файлы оригиналов'), {
      target: { files: [new File(['%PDF-new'], 'Новый.pdf')] },
    })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByText('Есть несохранённые изменения.')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    if (existing)
      await store.add({
        documentId,
        name: 'Параллельный.pdf',
        bytes: Buffer.from('%PDF-parallel'),
        expectedRevision: (await store.load()).revision,
      })
    const before = (await store.load()).files
    await click(existing ? 'Заменить скан' : 'Загрузить скан')
    if (existing) {
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Файлы документа изменились',
      )
      expect((await store.load()).files).toEqual(before)
      await click('Обновить список файлов')
      await screen.findByText('Ранее загружено: 2')
      await click('Заменить скан')
    }
    await screen.findByText('PDF-скан сохранён.')
    await screen.findByText('Ранее загружено: 1')
    const reopened = createDocumentFileStore(directory)
    expect((await reopened.load()).files.map((file) => file.name)).toEqual([
      'Новый.pdf',
    ])
    expect(
      (
        await reopened.read((await reopened.load()).files[0]!.id)
      ).bytes.toString(),
    ).toBe('%PDF-new')
    expect(
      (await readdir(join(directory, 'document-files'))).filter((file) =>
        file.endsWith('.bin'),
      ),
    ).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Удалить файл/ })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Оставить несколько' }),
    ).toBeNull()
    await click('Закрыть')
    await screen.findByText('Новый.pdf')
    expect(screen.queryByText('Нет скана')).toBeNull()
  },
)

it('rejects multiple files and non-PDF selections without changing stored originals', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'materials-m15-invalid-scan-'))
  directories.push(directory)
  const store = createDocumentFileStore(directory)
  const documentId = m15ScanDocumentId('m15')
  const initial = await store.add({
    documentId,
    name: 'Скан.pdf',
    bytes: Buffer.from('%PDF-original'),
    expectedRevision: (await store.load()).revision,
  })
  const workspace = serveCatalog(store)
  render(<M15Section workspace={workspace} save={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Открыть М-15' }))
  await screen.findByText('Ранее загружено: 1')
  for (const files of [
    [new File(['image'], 'Скан.png')],
    [new File(['%PDF-a'], 'a.pdf'), new File(['%PDF-b'], 'b.pdf')],
  ]) {
    fireEvent.change(screen.getByLabelText('Файлы оригиналов'), {
      target: { files },
    })
    expect(
      screen.getByRole('button', { name: 'Заменить скан' }),
    ).toHaveProperty('disabled', true)
    expect(screen.getByRole('alert').textContent).toContain('один PDF')
    await expect(
      uploadM15Scans('m15', files, {
        expectedFileIds: initial.files.map((file) => file.id),
        replace: true,
      }),
    ).rejects.toThrow('один PDF')
    expect(await store.load()).toEqual(initial)
  }
})

it('blocks saving M15 without a scan and retries a failed operation without uploading the PDF twice', async () => {
  sessionStorage.clear()
  const directory = await mkdtemp(
    join(tmpdir(), 'materials-m15-save-required-'),
  )
  directories.push(directory)
  const store = createDocumentFileStore(directory)
  const workspace = serveCatalog(store)
  const save = vi.fn(async () => {
    expect((await store.load()).files.map((file) => file.name)).toEqual([
      'scan.pdf',
    ])
    if (save.mock.calls.length === 1)
      throw new Error('Тестовый сбой сохранения')
  })
  render(<M15Section workspace={workspace} save={save} />)
  const click = async (name: string | RegExp) =>
    fireEvent.click(await screen.findByRole('button', { name }))
  await click('Редактировать М-15')
  await click(/3\s*Проверка и сохранение/)
  await click('Сохранить М-15')
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Загрузите обязательный PDF',
  )
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Файлы оригиналов'), {
    target: { files: [new File(['not a PDF'], 'scan.pdf')] },
  })
  await click('Сохранить М-15')
  await screen.findByText(/Содержимое должно/)
  expect(save).not.toHaveBeenCalled()
  expect((await store.load()).files).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Файлы оригиналов'), {
    target: { files: [new File(['%PDF-valid'], 'scan.pdf')] },
  })
  await click('Сохранить М-15')
  await screen.findByText('Тестовый сбой сохранения')
  const stored = (await store.load()).files
  expect(stored).toHaveLength(1)
  await click('Сохранить М-15')
  await screen.findByText('М-15 сохранена.')
  expect(save).toHaveBeenCalledTimes(2)
  expect((await store.load()).files).toEqual(stored)
  const uploadCalls = vi
    .mocked(fetch)
    .mock.calls.filter(([, options]) => options?.method === 'POST')
  expect(uploadCalls).toHaveLength(2) // rejected invalid bytes, then one successful upload
})
