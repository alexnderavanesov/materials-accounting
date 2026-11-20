// @vitest-environment jsdom
import { useEffect, useState } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reviewWorkflow } from './workflow-test-support'
import { InspectionWorkspace } from './quality-workflow-ui'
import { acceptFixture } from './quality-workflow.fixtures'
import { currentInspection, validateQualityWorkspace } from './quality-workflow'
import { buildDocumentRegistry } from './document-registry'
import type { DocumentFileManifest } from './document-registry'
import type { SubobjectMaterialMetric } from './types'
import { inspectionPhotoDocumentId } from './inspection-photos'

const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL
beforeEach(() => {
  sessionStorage.clear()
  HTMLElement.prototype.scrollIntoView = vi.fn()
  URL.createObjectURL = vi.fn((file: Blob) => `blob:photo-${file.size}`)
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
})
const photos = () => [
  new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    'маркировка.png',
    { type: 'image/png' },
  ),
  new File([new Uint8Array([255, 216, 255])], 'общий вид.jpg', {
    type: 'image/jpeg',
  }),
]

function mount({ newAct = false, signed = false } = {}) {
  const fixture = acceptFixture()
  const entry = fixture.qualityWorkflow.cases[0]!
  const revision = currentInspection(entry)
  revision.avk!.signedOn = signed ? revision.zni.signedOn : null
  revision.avk!.photos = signed ? 'yes' : ''
  if (newAct) revision.avk = null
  let committed = fixture
  let manifest: DocumentFileManifest = {
    revision: 'files-1',
    files: [],
    documents: [],
  }
  const order: string[] = []
  const save = vi.fn()
  const prepare = vi.fn(async () => {
    order.push('prepare')
    return 'workspace-2'
  })
  let uploadError = false
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      order.push('upload')
      const body = JSON.parse(String(options.body))
      expect(body.documentId).toBe(inspectionPhotoDocumentId(entry.id, 1))
      expect(body.workspaceRevision).toBe('workspace-2')
      expect(body.filesRevision).toBe(manifest.revision)
      expect(
        buildDocumentRegistry(committed).documents.some(
          (doc) => doc.id === body.documentId,
        ),
      ).toBe(true)
      if (uploadError)
        return Response.json(
          { error: 'Не удалось записать файлы' },
          { status: 500 },
        )
      manifest = {
        ...manifest,
        revision: 'files-2',
        files: [
          ...manifest.files,
          ...body.files.map((file: { name: string }, index: number) => ({
            id: `photo-${index}`,
            name: file.name,
            documentId: body.documentId,
            uploadedAt: '2026-11-12T12:00:00Z',
            size: 8,
          })),
        ],
      }
      return Response.json(manifest)
    }
    return Response.json({
      ...buildDocumentRegistry(committed),
      manifest,
      workspaceRevision: 'workspace-2',
    })
  })
  vi.stubGlobal('fetch', fetch)
  function Harness() {
    const [workspace, setWorkspace] = useState(fixture)
    useEffect(() => {
      committed = workspace
      order.push('commit')
    }, [workspace])
    return (
      <InspectionWorkspace
        kind="avk"
        value={workspace.qualityWorkflow}
        receipts={
          workspace.materialReceipts as unknown as Parameters<
            typeof InspectionWorkspace
          >[0]['receipts']
        }
        lines={workspace.lines as unknown as SubobjectMaterialMetric[]}
        prepare={prepare}
        onChange={(qualityWorkflow) => {
          const next = { ...workspace, qualityWorkflow }
          validateQualityWorkspace(next, workspace)
          save(next)
          order.push('save')
          setWorkspace(next)
        }}
      />
    )
  }
  render(<Harness />)
  if (newAct) {
    fireEvent.click(screen.getByRole('button', { name: 'Создать АВК' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /^ЗНИ №/,
      }),
    )
  } else {
    fireEvent.click(screen.getByRole('button', { name: /^Действия АВК/ }))
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: signed ? 'Просмотр АВК' : 'Редактировать АВК',
      }),
    )
  }
  return {
    save,
    prepare,
    order,
    fetch,
    entry,
    files: () => manifest.files,
    setFiles: (files: DocumentFileManifest['files']) => {
      manifest.files = files
    },
    failUpload: (next: boolean) => {
      uploadError = next
    },
  }
}
function chooseYes() {
  fireEvent.click(
    screen.getByRole('combobox', { name: 'Фотоматериалы приложены' }),
  )
  fireEvent.click(screen.getByRole('option', { name: 'Да' }))
  return screen.getByRole('dialog', { name: 'Фотоматериалы АВК' })
}
async function selectPhotos() {
  const dialog = chooseYes()
  fireEvent.change(within(dialog).getByLabelText('Фотографии АВК'), {
    target: { files: photos() },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Готово' }))
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Фотоматериалы АВК' }),
    ).toBeNull(),
  )
}

it('queues photos until a new AVK is saved, waits for persistence, and attaches both to that exact document', async () => {
  const f = mount({ newAct: true })
  let finish!: (revision: string) => void
  f.prepare.mockImplementationOnce(() => {
    f.order.push('prepare')
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  await selectPhotos()
  expect(f.save).not.toHaveBeenCalled()
  expect(f.files()).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть документ' }))
  expect(
    screen.getByRole('dialog', { name: 'Несохранённые изменения' }),
  ).toBeTruthy()
  fireEvent.click(
    screen.getByRole('button', { name: 'Продолжить редактирование' }),
  )
  expect(screen.getByText(/Выбрано: 2/)).toBeTruthy()
  reviewWorkflow()
  const button = screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(f.save).toHaveBeenCalledTimes(1)
  expect(f.order.slice(-3)).toEqual(['save', 'commit', 'prepare'])
  expect(f.files()).toHaveLength(0)
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Закрыть документ' })
      .disabled,
  ).toBe(true)
  await act(async () => finish('workspace-2'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(f.files().map((file) => file.name)).toEqual([
    'маркировка.png',
    'общий вид.jpg',
  ])
  const body = JSON.parse(
    String(
      f.fetch.mock.calls.find(([, options]) => options?.method === 'POST')![1]!
        .body,
    ),
  )
  expect(body.files.map((file: { base64: string }) => file.base64)).toEqual([
    'iVBORw0KGgo=',
    '/9j/',
  ])
  expect(f.order.at(-1)).toBe('upload')
})

it('cancels selection without changing the photo flag or uploading and rejects non-photo files', async () => {
  const f = mount()
  let dialog = chooseYes()
  fireEvent.change(within(dialog).getByLabelText('Фотографии АВК'), {
    target: { files: [new File(['pdf'], 'паспорт.pdf')] },
  })
  expect(within(dialog).getByRole('alert').textContent).toContain(
    'JPEG или PNG',
  )
  expect(
    within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Готово' })
      .disabled,
  ).toBe(true)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
  expect(
    screen.getByRole('combobox', { name: 'Фотоматериалы приложены' })
      .textContent,
  ).toBe('Не указано')
  dialog = chooseYes()
  expect(within(dialog).queryByText('паспорт.pdf')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
  expect(f.save).not.toHaveBeenCalled()
  expect(
    f.fetch.mock.calls.every(([, options]) => options?.method !== 'POST'),
  ).toBe(true)
})

it('keeps pending photos after an upload error and allows one successful retry', async () => {
  const f = mount()
  f.failUpload(true)
  await selectPhotos()
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ }))
  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('alert').textContent,
    ).toContain('АВК сохранён, фотографии не загружены'),
  )
  expect(f.files()).toHaveLength(0)
  expect(screen.getByText(/Выбрано: 2/)).toBeTruthy()
  f.failUpload(false)
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(f.files()).toHaveLength(2)
})

it('does not upload when saving the AVK fails', async () => {
  const f = mount()
  f.prepare.mockRejectedValueOnce(new Error('Конфликт сохранения'))
  await selectPhotos()
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ }))
  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('alert').textContent,
    ).toContain('Конфликт сохранения'),
  )
  expect(
    f.fetch.mock.calls.every(([, options]) => options?.method !== 'POST'),
  ).toBe(true)
  expect(screen.getByText(/Выбрано: 2/)).toBeTruthy()
})

it('clears unsaved photos when choosing No and leaves stored attachments intact', async () => {
  const f = mount()
  f.setFiles([
    {
      id: 'stored-photo',
      documentId: inspectionPhotoDocumentId(f.entry.id, 1),
      name: 'ранее прикреплённое фото.png',
      size: 8,
      uploadedAt: '2026-11-12T12:00:00Z',
    },
  ])
  await selectPhotos()
  fireEvent.click(
    screen.getByRole('combobox', { name: 'Фотоматериалы приложены' }),
  )
  fireEvent.click(screen.getByRole('option', { name: 'Нет' }))
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ }))
  expect(
    currentInspection(f.save.mock.calls[0]![0].qualityWorkflow.cases[0]).avk!
      .photos,
  ).toBe('no')
  expect(
    f.fetch.mock.calls.every(([, options]) => options?.method !== 'POST'),
  ).toBe(true)
  expect(f.files()).toHaveLength(1)
})

it('shows only this signed AVK photos in read-only mode', async () => {
  const f = mount({ signed: true })
  f.setFiles(
    ['this-act', 'another-act'].map((id, index) => ({
      id,
      documentId: index ? 'other' : inspectionPhotoDocumentId(f.entry.id, 1),
      name: `${id}.png`,
      size: 8,
      uploadedAt: '2026-11-12T12:00:00Z',
    })),
  )
  expect(
    screen.getByRole<HTMLButtonElement>('combobox', {
      name: 'Фотоматериалы приложены',
    }).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Фотографии АВК' }))
  const dialog = screen.getByRole('dialog', { name: 'Фотоматериалы АВК' })
  await waitFor(() =>
    expect(within(dialog).getByText('this-act.png')).toBeTruthy(),
  )
  expect(within(dialog).queryByText('another-act.png')).toBeNull()
  expect(
    within(dialog).queryByRole('button', { name: 'Выбрать фотографии' }),
  ).toBeNull()
  expect(f.save).not.toHaveBeenCalled()
})
