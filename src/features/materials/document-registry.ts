import type { SiteReturn } from './material-issues'
import { getMaterialIdentityKey } from './project-material-data'
import { documentNumberLabel } from './document-number'
import { receiptDocumentLabel } from './receipt-documents'
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
  target?: DocumentTarget
}
export type DocumentFile = {
  id: string
  documentId: string
  name: string
  size: number
  uploadedAt: string
}
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
export const documentDateText = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('.') : date
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
    if (!rows.length) return
    if (!documents.has(doc.id)) {
      documents.set(doc.id, { ...doc, materialIds: [] })
      links.set(doc.id, new Set())
    }
    for (const row of rows) links.get(doc.id)!.add(row.id)
  }
  const requests = new Map<string, DocumentMaterial>()
  for (const entry of workspace.materialRequests) {
    const row = materialFor(
      text(entry, 'projectLineId'),
      text(entry, 'projectMaterialName'),
      text(entry, 'projectUnit'),
    )
    requests.set(text(entry, 'id'), row)
    const number = text(entry, 'number'),
      date = text(entry, 'date')
    add(
      {
        id: key('request', number),
        kind: 'request',
        label: datedLabel(number || 'Заявка', date),
        date,
        target: { kind: 'request', entryId: text(entry, 'id') },
      },
      [row],
    )
  }
  const receiptMaterials = new Map<string, DocumentMaterial>()
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
    for (const field of ['appDocumentId', 'm15DocumentId']) {
      const doc = receiptDocs.get(text(receipt, field))
      if (doc)
        add(
          {
            id: key('receipt-document', doc.id),
            kind: doc.kind,
            label: receiptDocumentLabel(doc),
            date: doc.date,
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
  for (const material of materials.values())
    material.cipher = [...(ciphers.get(material.id) ?? [])]
      .filter(Boolean)
      .join(', ')
  return {
    materials: [...materials.values()],
    documents: [...documents.values()].sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.label.localeCompare(b.label, 'ru'),
    ),
  }
}
