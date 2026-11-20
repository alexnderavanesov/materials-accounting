// @vitest-environment jsdom
import { useState } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { changeField } from './workflow-test-support'
import { M15Section } from './m15-section'
import { M15ReceiptsPicker } from './m15-receipts-picker'
import { m15Fixture, linkedM15Fixture } from './m15-reconciliation.fixtures'
import { withM15Document } from './m15-document'
import { buildDocumentRegistry } from './document-registry'
import { validateQualityWorkspace } from './quality-workflow'
import type { M15Workspace, M15Reconciliation } from './m15-reconciliation'
import type { ReceiptDocument } from './receipt-documents'
import type { DocumentFileManifest } from './document-registry'
import type { WorkspaceSnapshot } from './workspace-snapshot'

beforeEach(() => {
  sessionStorage.clear()
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function mount(failUpload = false) {
  const { workspace } = linkedM15Fixture()
  workspace.m15Reconciliations = []
  delete workspace.materialReceipts[0]!.m15DocumentId
  let committed: WorkspaceSnapshot = workspace
  const before = structuredClone(workspace)
  let manifest: DocumentFileManifest = {
    files: [],
    documents: [],
    revision: 'files-1',
  }
  const save = vi.fn(),
    uploads = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        const body = JSON.parse(String(options.body))
        uploads(body)
        expect(committed.m15Reconciliations).toHaveLength(1)
        expect(body.workspaceRevision).toBe('saved')
        if (failUpload) {
          failUpload = false
          return Response.json(
            { error: 'Ошибка загрузки скана' },
            { status: 500 },
          )
        }
        manifest = {
          ...manifest,
          revision: 'files-2',
          files: body.files.map((file: { name: string }) => ({
            id: crypto.randomUUID(),
            documentId: body.documentId,
            name: file.name,
            size: 10,
            uploadedAt: '',
          })),
        }
        return Response.json(manifest)
      }
      return Response.json({
        ...buildDocumentRegistry(committed),
        manifest,
        workspaceRevision: 'saved',
      })
    }),
  )
  function Harness() {
    const [current, setCurrent] = useState<M15Workspace>(workspace)
    return (
      <M15Section
        workspace={current}
        save={async (
          value: M15Reconciliation,
          baseline: M15Reconciliation | undefined,
          document?: ReceiptDocument,
          ids = [],
        ) => {
          const next = {
            ...withM15Document(committed, document),
            m15Reconciliations: [value],
          }
          validateQualityWorkspace(next, committed)
          committed = { ...next, m15Reconciliations: [value] }
          save(value, baseline, document, ids)
          setCurrent(committed)
        }}
      />
    )
  }
  render(<Harness />)
  return { save, uploads, before, state: () => committed }
}
async function prepareCard() {
  fireEvent.click(screen.getByRole('button', { name: 'Добавить М-15' }))
  const dialog = await screen.findByRole('dialog', { name: 'Новая М-15' })
  fireEvent.change(within(dialog).getByLabelText('Номер М-15'), {
    target: { value: 'NEW-APP' },
  })
  changeField(within(dialog).getByLabelText('Шифр М-15'), {
    target: { value: 'ТКМ5' },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Далее' }))
  await within(dialog).findByLabelText('Количество по М-15: Клапан, шт')
  changeField(within(dialog).getByLabelText('Количество по М-15: Клапан, шт'), {
    target: { value: '12' },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Далее' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сканы М-15' }))
  fireEvent.change(within(dialog).getByLabelText('Файлы оригиналов'), {
    target: {
      files: [
        new File(['%PDF-1.4 test'], 'М-15.pdf', { type: 'application/pdf' }),
      ],
    },
  })
  return dialog
}
it('enters independent quantities and uploads a scan in one card while preserving receipts and signed inspections', async () => {
  const app = mount()
  const dialog = await prepareCard()
  expect(app.save).not.toHaveBeenCalled()
  expect(app.uploads).not.toHaveBeenCalled()
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Сохранить М-15' }),
  )
  await screen.findByText('М-15 сохранена.')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(app.save).toHaveBeenCalledOnce()
  expect(app.uploads).toHaveBeenCalledOnce()
  const state = app.state(),
    id = state.m15Reconciliations![0]!.id
  expect(state.materialReceipts).toEqual(app.before.materialReceipts)
  expect(state.m15Reconciliations![0]!).toMatchObject({
    mode: 'independent',
    allocations: [],
  })
  expect(state.materialRequests).toEqual(app.before.materialRequests)
  expect(state.qualityWorkflow!.cases).toEqual(app.before.qualityWorkflow.cases)
  expect(app.uploads.mock.calls[0]![0]).toMatchObject({
    documentId: JSON.stringify(['receipt-document', id]),
    files: [expect.objectContaining({ name: 'М-15.pdf' })],
  })
})
it('retries a failed scan without repeating receipt or composition saves', async () => {
  const app = mount(true),
    dialog = await prepareCard()
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Сохранить М-15' }),
  )
  await screen.findByText(/М-15 сохранена, сканы не загружены/)
  expect(screen.getByRole('dialog')).toBe(dialog)
  expect(
    within(dialog).getByRole('contentinfo').contains(screen.getByRole('alert')),
  ).toBe(true)
  expect(app.save).toHaveBeenCalledOnce()
  expect(app.uploads).toHaveBeenCalledOnce()
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Сохранить М-15' }),
  )
  await screen.findByText('М-15 сохранена.')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(app.save).toHaveBeenCalledOnce()
  expect(app.uploads).toHaveBeenCalledTimes(2)
  expect(app.state().materialReceipts).toHaveLength(1)
})
it('cancels composition and scans without writing any accounting data or files', async () => {
  const app = mount(),
    dialog = await prepareCard()
  fireEvent.click(within(dialog).getByRole('button', { name: /^Закрыть:/ }))
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Выйти без сохранения' }),
  )
  expect(app.save).not.toHaveBeenCalled()
  expect(app.uploads).not.toHaveBeenCalled()
  expect(app.state()).toEqual(app.before)
})
it('keeps a large APP collapsed and pages its positions while selecting all receipts together', () => {
  const { workspace } = m15Fixture(),
    changed = vi.fn()
  const template = { ...workspace.materialReceipts[0]! }
  delete template.m15DocumentId
  workspace.materialReceipts = Array.from({ length: 50000 }, (_, i) => ({
    ...template,
    id: `receipt-${i}`,
  }))
  render(
    <M15ReceiptsPicker
      workspace={workspace}
      documentId="new"
      selected={new Set()}
      onChange={changed}
    />,
  )
  expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  fireEvent.click(screen.getByRole('checkbox', { name: /^АПП/ }))
  expect(changed.mock.calls[0]![0].size).toBe(50000)
  fireEvent.click(screen.getByRole('button', { name: /^Позиции:/ }))
  expect(screen.getAllByRole('checkbox')).toHaveLength(51)
  fireEvent.click(screen.getByRole('button', { name: 'Следующие позиции' }))
  expect(screen.getAllByRole('checkbox')).toHaveLength(51)
  expect(screen.queryByRole('checkbox', { name: /, receipt-0$/ })).toBeNull()
})
