// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useReceiptScans, resolveReceiptScan } from './receipt-scans'
import { DocumentScanDialog } from './document-scan-picker'
import type { ReceiptScanTarget } from './receipt-scans'
import type { DocumentFile } from './document-registry'
import { linkedM15Fixture } from './m15-reconciliation.fixtures'

vi.mock('./document-file-preview', () => ({
  DocumentFilePreview: ({
    file,
    onClose,
  }: {
    file: DocumentFile
    onClose: () => void
  }) => (
    <div role="dialog" aria-label={`Предпросмотр: ${file.name}`}>
      <button onClick={onClose}>Закрыть предпросмотр</button>
    </div>
  ),
}))
const document = {
  id: 'app',
  kind: 'app' as const,
  number: '15',
  date: '2026-11-20',
}
const documentId = JSON.stringify(['receipt-document', 'app'])
const stored = {
  id: '10000000-0000-4000-8000-000000000001',
  documentId,
  name: 'Ранее.pdf',
  size: 100,
  uploadedAt: '2026-11-20',
}
const selected = new File(['%PDF-new'], 'Новый.pdf', {
  type: 'application/pdf',
})
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it.each(['Заменить', 'Оставить несколько'])(
  'requires an explicit %s decision and previews previous originals',
  async (choice) => {
    const confirm = vi.fn()
    render(
      <DocumentScanDialog
        label="АПП 15"
        stored={[stored]}
        loading={false}
        error=""
        onRefresh={vi.fn()}
        onClose={vi.fn()}
        onConfirm={confirm}
      />,
    )
    fireEvent.change(screen.getByLabelText('Файлы оригиналов'), {
      target: { files: [selected] },
    })
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Прикрепить (1)' })
        .disabled,
    ).toBe(true)
    fireEvent.click(
      screen.getByRole('button', { name: 'Посмотреть: Ранее.pdf' }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Предпросмотр: Ранее.pdf' }),
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Закрыть предпросмотр' }),
    )
    fireEvent.click(screen.getByRole('button', { name: choice }))
    fireEvent.click(screen.getByRole('button', { name: 'Прикрепить (1)' }))
    expect(confirm).toHaveBeenCalledWith({
      files: [selected],
      replace: choice === 'Заменить',
      expectedFileIds: [stored.id],
    })
  },
)
it('blocks upload on a catalog read error and never treats unknown files as absent', () => {
  render(
    <DocumentScanDialog
      label="АПП"
      stored={[]}
      initial={{ files: [selected], expectedFileIds: [], replace: false }}
      loading={false}
      error="Нет связи"
      onRefresh={vi.fn()}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />,
  )
  expect(screen.getByRole('alert').textContent).toBe('Нет связи')
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Прикрепить (1)' })
      .disabled,
  ).toBe(true)
})
it('refreshes the paperclip color from shared files and cancels without staging a file', async () => {
  let files: DocumentFile[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        materials: [],
        documents: [],
        workspaceRevision: '1',
        manifest: { revision: '1', files, documents: [] },
      }),
    ),
  )
  function Form() {
    const scans = useReceiptScans(true, [document])
    return (
      <>
        {scans.documentClip('app', {
          appNumber: '15',
          appDate: document.date,
          m15Number: '',
          m15Date: '',
        })}
        {scans.dialog}
        {scans.summary}
      </>
    )
  }
  render(<Form />)
  const clip = screen.getByRole('button', {
    name: 'Сканы: АПП №15 от 20-11-26',
  })
  expect(clip.className).toContain('text-slate-400')
  files = [stored]
  fireEvent.click(clip)
  await screen.findByRole('button', { name: 'Посмотреть: Ранее.pdf' })
  expect(clip.className).toContain('text-emerald-700')
  fireEvent.change(screen.getByLabelText('Файлы оригиналов'), {
    target: { files: [selected] },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(screen.queryByRole('region', { name: 'Выбранные сканы' })).toBeNull()
})
it('resolves common APPs by number and date, fields by receipt ID, and M15 by allocations', () => {
  const entry = {
    id: 'r1',
    appDocumentId: 'app',
    certificate: 'Паспорт 1',
    customerArvk: '',
    qualityDocument: '',
    technicalDecision: '',
  }
  const target: ReceiptScanTarget = {
    type: 'document',
    document,
    label: 'АПП 15',
  }
  expect(resolveReceiptScan(target, [entry], [document])).toBe(documentId)
  expect(() =>
    resolveReceiptScan(
      { ...target, document: { ...document, date: '2026-11-19' } },
      [entry],
      [document],
    ),
  ).toThrow('реквизиты изменены')
  const field: ReceiptScanTarget = {
    type: 'field',
    receiptId: 'r1',
    field: 'certificate',
    value: 'Паспорт 1',
    label: 'Паспорт 1',
  }
  expect(resolveReceiptScan(field, [entry], [])).toBe(
    JSON.stringify(['receipt-field', 'r1', 'certificate']),
  )
  expect(() =>
    resolveReceiptScan(field, [{ ...entry, id: 'other' }], []),
  ).toThrow('реквизиты изменены')
  expect(() =>
    resolveReceiptScan(field, [{ ...entry, certificate: 'Паспорт 2' }], []),
  ).toThrow('реквизиты изменены')
  const fixture = linkedM15Fixture()
  const m15 = {
    id: 'm15',
    kind: 'm15' as const,
    number: 'M15',
    date: '2026-11-20',
  }
  const record = {
    ...fixture.value,
    id: 'm15',
    allocations: [
      { ...fixture.value.allocations[0]!, receiptId: 'r1', quantity: 1 },
    ],
  }
  expect(
    resolveReceiptScan(
      { type: 'document', document: m15, label: 'М-15' },
      [entry],
      [m15],
      [record],
    ),
  ).toBe(JSON.stringify(['receipt-document', 'm15']))
})
it('invalidates replacement confirmation when the existing file list changes', () => {
  const props = {
    label: 'АПП',
    stored: [stored],
    loading: false,
    error: '',
    onRefresh: vi.fn(),
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  }
  const view = render(<DocumentScanDialog {...props} />)
  fireEvent.change(screen.getByLabelText('Файлы оригиналов'), {
    target: { files: [selected] },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Заменить' }))
  view.rerender(
    <DocumentScanDialog
      {...props}
      stored={[stored, { ...stored, id: 'new-file', name: 'New.pdf' }]}
    />,
  )
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Прикрепить (1)' })
      .disabled,
  ).toBe(true)
})

it('opens a gray paperclip even before requisites are entered and explains how to establish the link', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        materials: [],
        documents: [],
        workspaceRevision: '1',
        manifest: { revision: '1', files: [], documents: [] },
      }),
    ),
  )
  function Form() {
    const scans = useReceiptScans(true, [])
    return (
      <>
        {scans.documentClip('app', {
          appNumber: '',
          appDate: '',
          m15Number: '',
          m15Date: '',
        })}
        {scans.dialog}
      </>
    )
  }
  render(<Form />)
  fireEvent.click(screen.getByRole('button', { name: 'Сканы: АПП' }))
  expect(await screen.findByRole('dialog', { name: 'Сканы: АПП' })).toBeTruthy()
  expect(screen.getByText(/Сначала укажите номер и дату/)).toBeTruthy()
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'Выбрать файлы оригиналов',
    }).disabled,
  ).toBe(true)
})
