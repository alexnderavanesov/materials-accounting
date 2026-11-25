import { expect, it } from 'vitest'
import { workspaceDocumentScanError } from './required-document-scans'
import type { DocumentFile } from './document-registry'
import type { WorkspacePatch } from './workspace-protocol'

const file = (documentId: string, name = 'scan.pdf'): DocumentFile => ({
  id: name,
  documentId: JSON.stringify(['receipt-document', documentId]),
  name,
  size: 100,
  uploadedAt: '',
})
const patch = (
  ...changes: Pick<
    WorkspacePatch['changes'][number],
    'collection' | 'id' | 'value'
  >[]
): WorkspacePatch => ({
  mutationId: 'test',
  groups: {},
  changes: changes.map((change) => ({
    ...change,
    expectedVersion: null,
    position: 0,
  })),
})

it('requires files for every APP used by a receipt, including unchanged document metadata', () => {
  const changes = patch(
    { collection: 'materialReceipts', id: 'r1', value: { appDocumentId: 'a' } },
    { collection: 'materialReceipts', id: 'r2', value: { appDocumentId: 'b' } },
  )
  expect(workspaceDocumentScanError(changes, [file('a')])).toContain('АПП')
  expect(
    workspaceDocumentScanError(changes, [file('a'), file('b', 'photo.png')]),
  ).toBe('')
  expect(
    workspaceDocumentScanError(
      patch({ collection: 'materialReceipts', id: 'r1', value: {} }),
      [],
    ),
  ).toContain('АПП')
})
it('requires a single PDF for new and edited M15 and prevents changing its type to bypass validation', () => {
  for (const changes of [
    patch({ collection: 'receiptDocuments', id: 'm', value: { kind: 'm15' } }),
    patch({ collection: 'm15Reconciliations', id: 'm', value: { lines: [] } }),
  ]) {
    expect(workspaceDocumentScanError(changes, [])).toContain('PDF')
    expect(workspaceDocumentScanError(changes, [file('another')])).toContain(
      'PDF',
    )
    expect(
      workspaceDocumentScanError(changes, [file('m', 'photo.png')]),
    ).toContain('PDF')
    expect(
      workspaceDocumentScanError(changes, [file('m'), file('m', 'second.pdf')]),
    ).toContain('PDF')
    expect(workspaceDocumentScanError(changes, [file('m')])).toBe('')
  }
})
it('does not block unrelated edits or deletions because of old incomplete operations', () => {
  expect(
    workspaceDocumentScanError(
      patch(
        { collection: 'lines', id: 'l', value: { name: 'edited' } },
        { collection: 'receiptDocuments', id: 'm', value: null },
      ),
      [],
    ),
  ).toBe('')
})
