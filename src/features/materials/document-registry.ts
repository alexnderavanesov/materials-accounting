import { formatCalendarDate } from './calendar-date'
import type { WorkspaceSearch } from './workspace-navigation'
import type { SiteReturn } from './material-issues'
import { getMaterialIdentityKey } from './project-material-data'
import { documentNumberLabel } from './document-number'
import {
  documentsForReceipt,
  indexReceiptDocuments,
  receiptDocumentLabel,
} from './receipt-documents'
import { normalizeOperationSearch } from './operation-list-view'
import {
  receiptQualityDocument,
  isBlockedInspectionAct,
  isPartiallyRejectedAct,
} from './quality-workflow'
import type { SubobjectMaterialMetric } from './types'
import type { WorkspaceSnapshot } from './workspace-snapshot'

export const documentCategories = {
  app: 'АПП',
  m15: 'М-15',
  zni: 'ЗНИ',
  avk: 'АВК',
  arvk: 'АРВК заказчика',
  passport: 'Паспорта',
  certificate: 'Сертификаты',
  quality: 'Документы качества',
  request: 'Заявки',
  technical: 'Технические решения',
  issue: 'Выдачи',
  return: 'Возвраты',
  other: 'Прочие документы',
} as const
export type DocumentCategory = keyof typeof documentCategories
export const documentCategoryKeys = Object.keys(
  documentCategories,
) as DocumentCategory[]
export const externalDocumentCategories = documentCategoryKeys.filter(
  (kind) => !['request', 'zni', 'avk', 'issue', 'return'].includes(kind),
)
export type DocumentTarget =
  | { kind: 'request'; entryId: string }
  | { kind: 'zni' | 'avk'; caseId: string; revision: number }
export type RegistryDocument = {
  id: string
  kind: DocumentCategory
  label: string
  date: string
  materialIds: string[]
  operation?: WorkspaceSearch
  target?: DocumentTarget
  receiptDocumentId?: string
}
export type DocumentFile = {
  blobId?: string
  sha256?: string
  id: string
  documentId: string
  name: string
  size: number
  uploadedAt: string
}
export const isDocumentPhoto = (file: { name: string }) =>
  /\.(png|jpe?g)$/i.test(file.name)
export type ManualDocument = {
  id: string
  kind: DocumentCategory
  label: string
  date: string
  lineIds: string[]
}
export type DocumentFileManifest = {
  revision: string
  files: DocumentFile[]
  documents: ManualDocument[]
}
export type DocumentMaterial = {
  id: string
  name: string
  receivedNames: { name: string; replacement: boolean }[]
  type: string
  cipher: string
  standard: string
  unit: string
  lineIds: string[]
  documentIds: string[]
}
export type DocumentRegistry = {
  materials: DocumentMaterial[]
  documents: RegistryDocument[]
}
const text = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === 'string' ? record[key] : ''
const key = (...parts: (string | number)[]) => JSON.stringify(parts)
export const documentDateText = (date: string) => formatCalendarDate(date, '')
const datedLabel = (label: string, date: string) =>
  `${label}${date ? ` от ${documentDateText(date)}` : ''}`

/** A bare number in the combined receipt field does not identify its document type. */
export function qualityDocumentCategory(value: string): DocumentCategory {
  const passport = /паспорт/iu.test(value)
  const certificate = /сертификат/iu.test(value)
  return passport && !certificate
    ? 'passport'
    : certificate && !passport
      ? 'certificate'
      : 'quality'
}

/** One material across ciphers; documents are linked by IDs, never by material name. */
export function buildDocumentRegistry(
  workspace: WorkspaceSnapshot,
  manual: ManualDocument[] = [],
): DocumentRegistry {
  const materials = new Map<string, DocumentMaterial>()
  const byLine = new Map<string, DocumentMaterial>()
  const ciphers = new Map<string, Set<string>>()
  for (const raw of workspace.lines) {
    const line = raw as unknown as SubobjectMaterialMetric
    const identity = getMaterialIdentityKey(line)
    const lineId = line.id ?? identity
    let material = materials.get(identity)
    if (!material) {
      material = {
        id: identity,
        name: line.projectMaterialName || line.material || 'Материал',
        receivedNames: [],
        type: line.materialType || line.category || '',
        cipher: '',
        standard: line.normativeDocument || '',
        unit: line.unit,
        lineIds: [],
        documentIds: [],
      }
      materials.set(identity, material)
      ciphers.set(identity, new Set())
    }
    material.lineIds.push(lineId)
    ciphers.get(identity)!.add(line.cipher)
    byLine.set(lineId, material)
  }
  const materialFor = (lineId: string, name: string, unit = '') => {
    let row = byLine.get(lineId)
    if (!row) {
      row = {
        id: key('deleted', lineId),
        name: name || 'Удалённый материал',
        receivedNames: [],
        type: '',
        cipher: '',
        standard: '',
        unit,
        lineIds: [lineId],
        documentIds: [],
      }
      materials.set(row.id, row)
      byLine.set(lineId, row)
    }
    return row
  }
  const documents = new Map<string, RegistryDocument>()
  const links = new Map<string, Set<string>>()
  const add = (
    doc: Omit<RegistryDocument, 'materialIds'>,
    rows: DocumentMaterial[],
  ) => {
    if (!rows.length && doc.kind !== 'm15') return
    if (!documents.has(doc.id)) {
      documents.set(doc.id, { ...doc, materialIds: [] })
      links.set(doc.id, new Set())
    }
    for (const row of rows) links.get(doc.id)!.add(row.id)
  }
  const requests = new Map<string, DocumentMaterial>()
  const requestedNames = new Map<string, string>()
  for (const entry of workspace.materialRequests) {
    const row = materialFor(
      text(entry, 'projectLineId'),
      text(entry, 'projectMaterialName'),
      text(entry, 'projectUnit'),
    )
    requests.set(text(entry, 'id'), row)
    requestedNames.set(text(entry, 'id'), text(entry, 'projectMaterialName'))
    const number = text(entry, 'number'),
      date = text(entry, 'date')
    add(
      {
        id: key('request', number),
        kind: 'request',
        label: datedLabel(number || 'Заявка', date),
        date,
        target: { kind: 'request', entryId: text(entry, 'id') },
        operation: { section: 'operations', tab: 'requests', focus: number },
      },
      [row],
    )
  }
  const receiptMaterials = new Map<string, DocumentMaterial>()
  const receivedNames = new Map<
    string,
    Map<string, DocumentMaterial['receivedNames'][number]>
  >()
  const qualitySources = new Map<string, Set<string>>()
  const qualityKey = (doc: { name: string; number: string; date: string }) =>
    key(
      doc.name.trim().toLocaleLowerCase('ru'),
      doc.number.trim().toLocaleLowerCase('ru'),
      doc.date,
    )
  const receiptDocs = new Map(
    workspace.qualityWorkflow?.receiptDocuments?.map((doc) => [doc.id, doc]),
  )
  // M-15 composition may be entered before receipts; its scan uses the same stable ID.
  const composedM15 = new Map(
    workspace.m15Reconciliations?.map((value) => [value.id, value]),
  )
  for (const doc of receiptDocs.values()) {
    if (doc.kind === 'm15')
      add(
        {
          id: key('receipt-document', doc.id),
          kind: doc.kind,
          label: receiptDocumentLabel(doc),
          date: doc.date,
          receiptDocumentId: doc.id,
          operation: { section: 'm15', focus: doc.id },
        },
        (composedM15.get(doc.id)?.lines ?? []).flatMap((line) =>
          line.projectLineId && byLine.has(line.projectLineId)
            ? [byLine.get(line.projectLineId)!]
            : [],
        ),
      )
  }
  const linkedWorkflow = workspace.qualityWorkflow && {
    ...workspace.qualityWorkflow,
    m15Reconciliations: workspace.m15Reconciliations,
  }
  const documentIndex = indexReceiptDocuments(linkedWorkflow)
  for (const receipt of workspace.materialReceipts) {
    const row =
      requests.get(text(receipt, 'requestId')) ??
      materialFor(
        text(receipt, 'projectLineId'),
        text(receipt, 'actualName'),
        text(receipt, 'projectUnit'),
      )
    const receiptId = text(receipt, 'id')
    receiptMaterials.set(receiptId, row)
    const actualName = text(receipt, 'actualName').trim()
    if (actualName) {
      let names = receivedNames.get(row.id)
      if (!names) {
        names = new Map()
        receivedNames.set(row.id, names)
      }
      const normalized = normalizeOperationSearch(actualName)
      const replacement =
        normalized !==
        normalizeOperationSearch(
          requestedNames.get(text(receipt, 'requestId')) || row.name,
        )
      const existing = names.get(normalized)
      if (existing) existing.replacement ||= replacement
      else names.set(normalized, { name: actualName, replacement })
    }
    for (const doc of documentsForReceipt(
      {
        id: String(receipt.id),
        appDocumentId: text(receipt, 'appDocumentId'),
        m15DocumentId: text(receipt, 'm15DocumentId'),
      },
      linkedWorkflow,
      documentIndex,
    )) {
      add(
        {
          id: key('receipt-document', doc.id),
          kind: doc.kind,
          label: receiptDocumentLabel(doc),
          date: doc.date,
          receiptDocumentId: doc.id,
          operation:
            doc.kind === 'm15'
              ? { section: 'm15', focus: doc.id }
              : {
                  section: 'operations',
                  tab: 'receipts',
                  focus: String(receipt.id),
                },
        },
        [row],
      )
    }
    for (const [field, kind, prefix] of [
      ['certificate', 'quality', 'Паспорт / сертификат'],
      ['qualityDocument', 'quality', 'Документ качества'],
      ['customerArvk', 'arvk', 'АРВК заказчика'],
      ['technicalDecision', 'technical', 'Техническое решение'],
    ] as const) {
      const value = text(receipt, field).trim()
      if (!value) continue
      if (kind === 'quality') {
        const parsed = receiptQualityDocument(
          value,
          field === 'certificate'
            ? 'Паспорт / сертификат'
            : 'Документ о качестве',
        )
        if (parsed) {
          const sources = qualitySources.get(receiptId) ?? new Set<string>()
          sources.add(qualityKey(parsed))
          qualitySources.set(receiptId, sources)
        }
      }
      add(
        {
          id: key('receipt-field', receiptId, field),
          kind: kind === 'quality' ? qualityDocumentCategory(value) : kind,
          label: `${prefix}: ${value}`,
          date: '',
        },
        [row],
      )
    }
  }
  for (const entry of workspace.qualityWorkflow?.cases ?? []) {
    for (const revision of entry.revisions) {
      for (const kind of ['zni', 'avk'] as const) {
        if (kind === 'zni' && revision.kind === 'avk-correction') continue
        const doc = revision[kind]
        if (!doc) continue
        const rows = revision.zni.rows
          .filter((row) => kind === 'zni' || (row.accepted ?? 0) > 0)
          .map(
            (row) =>
              receiptMaterials.get(row.receiptId) ??
              materialFor(row.projectLineId, row.name, row.unit),
          )
        add(
          {
            id: key(kind, entry.id, revision.revision),
            kind,
            label: `${datedLabel(documentNumberLabel(kind === 'zni' ? 'ЗНИ' : 'АВК', doc.number), doc.date)} · рев. ${revision.revision}${kind === 'avk' && isPartiallyRejectedAct(revision) ? ' · принято частично' : ''}${kind === 'avk' && isBlockedInspectionAct(revision) ? ' · отклонён' : doc.signedOn ? ' · подписан' : ' · в работе'}`,
            date: doc.date,
            target: { kind, caseId: entry.id, revision: revision.revision },
            operation: {
              section: 'operations',
              tab: 'quality',
              inspection: kind,
              focus: `inspection:${entry.id}:${revision.revision}`,
            },
          },
          rows,
        )
        for (const quality of doc.documents) {
          // The ZNI/AVK copy is a print snapshot of the receipt's quality document,
          // not another original and not proof that it covers every material in the ZNI.
          if (
            revision.zni.rows.some((row) =>
              qualitySources.get(row.receiptId)?.has(qualityKey(quality)),
            )
          )
            continue
          const label = [quality.name, quality.number && `№${quality.number}`]
            .filter(Boolean)
            .join(' ')
          if (label)
            add(
              {
                id: key(
                  'quality-document',
                  entry.id,
                  quality.id,
                  qualityKey(quality),
                ),
                kind: qualityDocumentCategory(quality.name),
                label: datedLabel(label, quality.date),
                date: quality.date,
              },
              rows,
            )
        }
      }
    }
  }
  for (const issue of workspace.materialIssues) {
    const row =
      receiptMaterials.get(text(issue, 'receiptId')) ??
      materialFor(text(issue, 'projectLineId'), '')
    const number = text(issue, 'document'),
      date = text(issue, 'date')
    add(
      {
        id: key('issue', number || text(issue, 'id'), date),
        kind: 'issue',
        label: datedLabel(`Выдача ${number}`, date),
        operation: {
          section: 'operations',
          tab: 'issues',
          focus: String(issue.id),
        },
        date,
      },
      [row],
    )
  }
  for (const issue of workspace.materialIssues) {
    const row =
      receiptMaterials.get(text(issue, 'receiptId')) ??
      materialFor(text(issue, 'projectLineId'), '')
    for (const item of (issue.siteReturns ?? []) as SiteReturn[])
      add(
        {
          id: key('site-return', item.id),
          kind: 'return',
          label: datedLabel(`Возврат с площадки ${item.document}`, item.date),
          date: item.date,
        },
        [row],
      )
  }
  for (const entry of workspace.qualityWorkflow?.customerReturns ?? []) {
    const row = receiptMaterials.get(entry.receiptId)
    if (row)
      add(
        {
          id: key('return', entry.documentNumber || entry.id, entry.date),
          kind: 'return',
          label: datedLabel(`Возврат ${entry.documentNumber}`, entry.date),
          date: entry.date,
        },
        [row],
      )
  }
  for (const doc of manual) {
    add(
      { id: doc.id, kind: doc.kind, label: doc.label, date: doc.date },
      // Originals outlive their source operations and project positions.
      // Keep a historical row so the retained file can still be found/downloaded.
      doc.lineIds.map((id) => materialFor(id, 'Удалённый материал')),
    )
  }
  for (const doc of documents.values()) {
    doc.materialIds = [...links.get(doc.id)!]
    for (const id of doc.materialIds)
      materials.get(id)!.documentIds.push(doc.id)
  }
  for (const material of materials.values()) {
    material.cipher = [...(ciphers.get(material.id) ?? [])]
      .filter(Boolean)
      .join(', ')
    material.receivedNames = [
      ...(receivedNames.get(material.id)?.values() ?? []),
    ]
  }
  return {
    materials: [...materials.values()],
    documents: [...documents.values()].sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.label.localeCompare(b.label, 'ru'),
    ),
  }
}
