import {
  issueApprovalConsumption,
  netIssued,
  validateIssueMovements,
} from './material-issues'
import type { IssueMovement } from './material-issues'
import { validateIssueAllocation } from './issue-allocation'
import { z } from 'zod'
import { normalizeCalendarDate } from './calendar-date'
import { validateProjectUnitChanges } from './project-unit-guard'
import {
  validateInspectionChronology,
  validateWorkspaceChronology,
} from './operation-chronology'
import {
  documentsForReceipt,
  indexReceiptDocuments,
  receiptDocuments,
  receiptDocumentSchema,
  receiptDocumentKey,
  receiptDocumentLabel,
} from './receipt-documents'

const text = z.string().max(20000)
const id = z.string().min(1).max(500)
const date = z
  .string()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value,
    'Укажите корректную дату',
  )
const quantity = z.number().finite().nonnegative()
export const qualityDocumentSchema = z
  .object({ id, name: text, number: text, date: text, orderNumber: text })
  .strict()
export const qualityDefaultsSchema = z
  .object({
    customer: text,
    generalContractor: text,
    contractor: text,
    project: text,
    location: text,
    issuerRole: text,
    issuerName: text,
    customerRepresentative: text,
    generalRepresentative: text,
    contractorRepresentative: text,
    chairmanRole: text,
    chairmanName: text,
    contractorRole: text,
    generalRole: text,
    customerRole: text,
  })
  .strict()
export const emptyQualityDefaults = {
  customer: '',
  generalContractor: '',
  contractor: '',
  project: '',
  location: '',
  issuerRole: '',
  issuerName: '',
  customerRepresentative: '',
  generalRepresentative: '',
  contractorRepresentative: '',
  chairmanRole: '',
  chairmanName: '',
  contractorRole: '',
  generalRole: '',
  customerRole: '',
}
const rowSchema = z
  .object({
    receiptId: id,
    projectLineId: id,
    name: text,
    cipher: text,
    unit: text,
    factoryNumber: text,
    heatBatch: text,
    document: text,
    alloy: text,
    presented: quantity.positive(),
    accepted: quantity.nullable(),
    result: z.enum(['', 'accepted', 'remarks', 'rejected']),
    remarks: text,
    altUnit: text,
    altUnitFactor: quantity.nullable(),
    // Optional source document details captured for printing, not a prerequisite.
    appNumber: text.optional(),
    appDate: text.optional(),
    requestNumber: text.optional(),
  })
  .strict()
const zniSchema = z
  .object({
    number: text,
    date,
    inspectionDate: date,
    inspectionTime: text,
    signedOn: date.nullable(),
    details: qualityDefaultsSchema,
    rows: z.array(rowSchema).min(1),
    remarks: text,
    documents: z.array(qualityDocumentSchema),
  })
  .strict()
export const inspectionChecks = [
  'Сопроводительная документация',
  'Маркировка',
  'Упаковка',
  'Комплектность',
  'Визуальный контроль',
  'Соответствие проекту',
  'Условия хранения',
  'Консервация',
  'Срок годности',
  'Прочие проверки',
] as const
const avkSchema = z
  .object({
    number: text,
    date,
    signedOn: date.nullable(),
    buyer: text,
    supplier: text,
    manufacturer: text,
    standards: text,
    checks: z.array(text).length(10),
    conclusion: text,
    attachments: text,
    photos: z.enum(['', 'yes', 'no']),
    documents: z.array(qualityDocumentSchema),
    rejection: z
      .object({
        kind: z.enum(['document', 'materials']),
        date,
        reason: text,
        quantities: z.record(id, quantity.positive()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
const revisionSchema = z
  .object({
    revision: z.number().int().positive(),
    kind: z.literal('avk-correction').optional(),
    zni: zniSchema,
    avk: avkSchema.nullable(),
  })
  .strict()
const caseSchema = z
  .object({
    id,
    processVersion: z.literal(2),
    basis: receiptDocumentSchema,
    revisions: z.array(revisionSchema).min(1),
  })
  .strict()
export const customerReturnSchema = z
  .object({
    id,
    kind: z.enum(['rejected', 'surplus']),
    rejectedAt: z.enum(['zni', 'avk']).optional(),
    source: z.enum(['uninspected', 'accepted']).optional(),
    caseId: id.optional(),
    revision: z.number().int().positive().optional(),
    receiptId: id,
    date,
    quantity: quantity.positive(),
    documentNumber: text,
    note: text,
  })
  .strict()
export type CustomerReturn = z.infer<typeof customerReturnSchema>
export const qualityWorkflowSchema = z
  .object({
    version: z.literal(1),
    defaults: qualityDefaultsSchema,
    cases: z.array(caseSchema),
    receiptDocuments: z.array(receiptDocumentSchema).optional(),
    customerReturns: z.array(customerReturnSchema).optional(),
  })
  .strict()
export type QualityWorkflow = z.infer<typeof qualityWorkflowSchema>
export type QualityDefaults = z.infer<typeof qualityDefaultsSchema>
export type InspectionCase = z.infer<typeof caseSchema>
export type InspectionRevision = z.infer<typeof revisionSchema>
export type InspectionRow = z.infer<typeof rowSchema>
export type InspectionAct = z.infer<typeof avkSchema>
export type QualityDocument = z.infer<typeof qualityDocumentSchema>
export const emptyQualityWorkflow = (): QualityWorkflow => ({
  version: 1,
  defaults: { ...emptyQualityDefaults },
  cases: [],
})
export const currentInspection = (entry: InspectionCase) =>
  entry.revisions[entry.revisions.length - 1]!
export const latestInspectionAct = (entry: InspectionCase) =>
  [...entry.revisions].reverse().find((revision) => revision.avk)
export const activeInspection = (entry: InspectionCase) =>
  [...entry.revisions].reverse().find((revision) => revision.avk?.signedOn)
/** AVK corrections keep the same signed inspection and stock allocation. */
export function inspectionSourceRevision(
  entry: InspectionCase,
  revision = currentInspection(entry),
) {
  let index = entry.revisions.indexOf(revision)
  while (index > 0 && entry.revisions[index]?.kind === 'avk-correction') index--
  return entry.revisions[index] ?? revision
}
export const rejectedByAct = (
  revision: InspectionRevision,
  row: InspectionRow,
) => {
  const rejection = revision.avk?.rejection
  if (rejection?.kind !== 'materials') return 0
  // Old acts rejected the entire accepted quantity; never reinterpret that history.
  return rejection.quantities
    ? (rejection.quantities[row.receiptId] ?? 0)
    : (row.accepted ?? 0)
}
export const acceptedAfterInspection = (
  revision: InspectionRevision,
  row: InspectionRow,
) =>
  Number(((row.accepted ?? 0) - rejectedByAct(revision, row)).toPrecision(15))
export const isPartiallyRejectedAct = (revision: InspectionRevision) =>
  revision.avk?.rejection?.kind === 'materials' &&
  revision.zni.rows.some((row) => acceptedAfterInspection(revision, row) > 0)
export const isBlockedInspectionAct = (revision: InspectionRevision) =>
  !!revision.avk?.rejection && !isPartiallyRejectedAct(revision)

export function customerReturnReason(
  item: CustomerReturn,
  entry?: InspectionCase,
  allocation?: { zni: number; avk: number },
) {
  if (item.kind === 'surplus') return 'Лишний материал'
  if (allocation)
    return allocation.zni && allocation.avk
      ? 'Не принято по ЗНИ / АВК'
      : allocation.avk
        ? 'Не принято по АВК'
        : 'Не принято по ЗНИ'
  if (item.rejectedAt)
    return item.rejectedAt === 'avk' ? 'Не принято по АВК' : 'Не принято по ЗНИ'
  const revision = entry?.revisions.find(
    (rev) => rev.revision === item.revision,
  )
  const row = revision?.zni.rows.find(
    (candidate) => candidate.receiptId === item.receiptId,
  )
  if (revision && row && rejectedByAct(revision, row) > 0) {
    return row.presented === row.accepted
      ? 'Не принято по АВК'
      : 'Не принято по ЗНИ / АВК'
  }
  return 'Не принято по ЗНИ'
}

/** Legacy returns consumed the ZNI-rejected part first; new records store the stage. */
export function rejectedReturnAllocations(workflow: QualityWorkflow) {
  const result = new Map<string, { zni: number; avk: number }>()
  const cases = new Map(workflow.cases.map((entry) => [entry.id, entry]))
  const usedZni = new Map<string, number>()
  for (const item of workflow.customerReturns ?? []) {
    if (item.kind !== 'rejected') continue
    const revision = cases
      .get(item.caseId ?? '')
      ?.revisions.find((rev) => rev.revision === item.revision)
    const row = revision?.zni.rows.find(
      (candidate) => candidate.receiptId === item.receiptId,
    )
    const key = JSON.stringify([item.caseId, item.receiptId])
    const availableZni = Math.max(
      0,
      precise(
        (row ? row.presented - (row.accepted ?? 0) : item.quantity) -
          (usedZni.get(key) ?? 0),
      ),
    )
    const zni =
      item.rejectedAt === 'avk'
        ? 0
        : item.rejectedAt === 'zni'
          ? item.quantity
          : Math.min(availableZni, item.quantity)
    usedZni.set(key, precise((usedZni.get(key) ?? 0) + zni))
    result.set(item.id, { zni, avk: precise(item.quantity - zni) })
  }
  return result
}
export const localToday = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
export const resultLabels = {
  '': 'Не проверено',
  accepted: 'Принято',
  remarks: 'Принято с замечаниями',
  rejected: 'Не принято',
}

export function inspectionMatches(entry: InspectionCase, search: string) {
  const query = search.trim().toLocaleLowerCase('ru')
  if (!query) return true
  const values = [
    receiptDocumentLabel(entry.basis),
    ...entry.revisions.flatMap(({ zni, avk }) => [
      zni.number,
      zni.date,
      zni.inspectionDate,
      zni.signedOn,
      avk?.number,
      avk?.date,
      avk?.signedOn,
      avk?.rejection?.date,
      avk?.rejection?.reason,
      zni.signedOn ? 'ЗНИ подписана' : 'ЗНИ в работе',
      avk?.rejection
        ? 'АВК отклонён'
        : avk?.signedOn
          ? 'АВК подписан'
          : 'АВК в работе',
      ...Object.values(zni.details),
      zni.remarks,
      ...zni.documents.flatMap((doc) => [doc.name, doc.number]),
      ...zni.rows.flatMap((row) => [
        row.name,
        row.cipher,
        row.factoryNumber,
        row.heatBatch,
        row.document,
        row.alloy,
        row.remarks,
        row.appNumber,
        row.appDate,
        row.requestNumber,
        resultLabels[row.result],
      ]),
    ]),
  ].filter((value): value is string => typeof value === 'string')
  return values.some((value) =>
    [
      value,
      /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? value.split('-').reverse().join('.')
        : '',
    ].some((candidate) => candidate.toLocaleLowerCase('ru').includes(query)),
  )
}

type Receipt = {
  id: string
  date?: string
  appDocumentId?: string
  m15DocumentId?: string
  projectLineId: string
  requestId: string
  quantity: number
  projectUnit: string
  actualName: string
  factoryNumber: string
  heatBatch: string
  altUnit: string
  altUnitFactor?: number | null
  certificate?: string
  qualityDocument?: string
}
type Line = {
  id?: string
  cipher: string
  projectMaterialName?: string | null
  normativeDocument?: string | null
  material: string
  unit?: string
  materialType?: string | null
  category?: string
  materialId?: string | null
  unitWeight?: number | null
  alternativeUnit?: string | null
  alternativeUnitFactor?: number | null
}
// Older workspace rows use the material identity instead of a generated ID.
export function findInspectionMaterial<T extends Line>(
  lines: Array<T>,
  projectLineId: string,
  index?: ReadonlyMap<string, T>,
) {
  return index
    ? index.get(projectLineId)
    : lines.find((line) => inspectionMaterialId(line) === projectLineId)
}
function inspectionMaterialId(line: Line) {
  return (
    line.id ??
    [
      line.projectMaterialName ?? '',
      line.materialType ?? line.category,
      line.materialId ?? '',
      line.normativeDocument ?? '',
      line.unit,
      line.material,
      line.unitWeight ?? '',
      line.alternativeUnit ?? '',
      line.alternativeUnitFactor ?? '',
    ]
      .join('|')
      .toLocaleLowerCase('ru')
  )
}
export function indexInspectionMaterials<T extends Line>(lines: Array<T>) {
  return new Map(lines.map((line) => [inspectionMaterialId(line), line]))
}
export type InspectionSelection = { receiptId: string; quantity: number }

/** Each receipt batch can be split between cases; revisions reuse its allocation. */
export function inspectionAvailableQuantities(
  workflow: QualityWorkflow,
  receipts: Array<Pick<Receipt, 'id' | 'quantity'>>,
  excludeCaseId?: string,
) {
  const available = new Map(
    receipts.map((receipt) => [receipt.id, receipt.quantity]),
  )
  for (const entry of workflow.cases) {
    if (entry.id === excludeCaseId) continue
    for (const row of currentInspection(entry).zni.rows) {
      available.set(
        row.receiptId,
        Number(
          ((available.get(row.receiptId) ?? 0) - row.presented).toPrecision(15),
        ),
      )
    }
  }
  for (const item of workflow.customerReturns ?? []) {
    if (item.kind === 'surplus' && item.source === 'uninspected')
      available.set(
        item.receiptId,
        precise((available.get(item.receiptId) ?? 0) - item.quantity),
      )
  }
  return available
}

export function newInspection(
  workflow: QualityWorkflow,
  selection: Array<InspectionSelection>,
  receipts: Array<Receipt>,
  lines: Array<Line>,
  basisId: string,
  requests: Array<{ id: string; number: string }> = [],
): InspectionCase {
  const basis = receiptDocuments(workflow).find((doc) => doc.id === basisId)
  if (!basis) fail('Документ получения не найден.')
  if (!selection.length) fail('Выберите хотя бы один полученный материал.')
  unique(
    selection.map((item) => item.receiptId),
    'позиции ЗНИ',
  )
  const available = inspectionAvailableQuantities(workflow, receipts)
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  const requestById = new Map(requests.map((request) => [request.id, request]))
  const materialById = indexInspectionMaterials(lines)
  const used = new Set(
    workflow.cases.map((item) => currentInspection(item).zni.number),
  )
  let number = 1
  while (used.has(String(number))) number++
  const rows = selection.map(({ receiptId, quantity: presented }) => {
    const receipt = receiptById.get(receiptId)
    if (!receipt) fail('Получение материала не найдено.')
    if (
      receipt.appDocumentId !== basis.id &&
      receipt.m15DocumentId !== basis.id
    )
      fail('Все позиции ЗНИ должны относиться к выбранному АПП или М-15.')
    if (!Number.isFinite(presented) || presented <= 0)
      fail('Укажите положительное количество для инспекции.')
    if (presented > (available.get(receiptId) ?? 0))
      fail('Количество для инспекции превышает доступный остаток поступления.')
    const line = materialById.get(receipt.projectLineId)
    return {
      receiptId,
      projectLineId: receipt.projectLineId,
      name: receipt.actualName || line?.projectMaterialName || 'Материал',
      cipher: line?.cipher ?? '',
      unit: receipt.projectUnit,
      factoryNumber: receipt.factoryNumber,
      heatBatch: receipt.heatBatch,
      document: line?.normativeDocument ?? '',
      alloy: line?.material ?? '',
      presented,
      accepted: null,
      result: '' as const,
      remarks: '',
      altUnit: receipt.altUnit,
      altUnitFactor: receipt.altUnitFactor ?? null,
      requestNumber:
        requestById.get(receipt.requestId)?.number ?? 'Заявка удалена',
      appNumber: basis.kind === 'app' ? basis.number : '',
      appDate: basis.kind === 'app' ? basis.date : '',
    }
  })
  const initialDate = [
    localToday(),
    basis.date,
    ...selection.map((item) => receiptById.get(item.receiptId)?.date ?? ''),
  ]
    .sort()
    .at(-1)!
  return {
    id: crypto.randomUUID(),
    processVersion: 2,
    basis: { ...basis },
    revisions: [
      {
        revision: 1,
        zni: {
          number: String(number),
          date: initialDate,
          inspectionDate: initialDate,
          inspectionTime: '',
          signedOn: null,
          details: { ...workflow.defaults },
          rows,
          remarks: '',
          documents: inspectionSourceDocuments(
            selection.map((item) => item.receiptId),
            receipts,
          ),
        },
        avk: null,
      },
    ],
  }
}
export function receiptQualityDocument(
  value: string | undefined,
  defaultName: string,
): QualityDocument | null {
  const source = value?.trim()
  if (!source) return null
  const document: QualityDocument = {
    id: crypto.randomUUID(),
    name: source,
    number: '',
    date: '',
    orderNumber: '',
  }
  let documentText = source
  let documentDate = ''
  const dated =
    /\s+от\s+(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{1,2}-\d{1,2})$/iu.exec(
      documentText,
    )
  if (dated) {
    const normalized = normalizeCalendarDate(dated[1]!)
    if (!normalized) return document
    documentDate = normalized
    documentText = documentText.slice(0, dated.index).trim()
  }
  const numbered = /^([^№]*?)\s*№\s*([^№]+)$/u.exec(documentText)
  const identifier = /^[\p{L}\p{N}][\p{L}\p{N}./_-]*$/u
  const named =
    /^(паспорт(?: изделия| качества)?|сертификат(?: качества| соответствия)?|документ о качестве)\s+(.+)$/iu.exec(
      documentText,
    )
  if (numbered) {
    document.name = numbered[1]!.trim() || defaultName
    document.number = numbered[2]!.trim()
  } else if (named && identifier.test(named[2]!) && /\d/.test(named[2]!)) {
    document.name = named[1]!
    document.number = named[2]!
  } else if (identifier.test(documentText) && /\d/.test(documentText)) {
    document.name = defaultName
    document.number = documentText
  } else {
    // Free-form descriptions stay intact when the document number is ambiguous.
    return document
  }
  document.date = documentDate
  return document
}

function inspectionSourceDocuments(
  receiptIds: Array<string>,
  receipts: Array<Receipt>,
): Array<QualityDocument> {
  const documents: Array<QualityDocument> = []
  const selectedIds = new Set(receiptIds)
  for (const receipt of receipts.filter((item) => selectedIds.has(item.id))) {
    for (const [value, defaultName] of [
      [receipt.certificate, 'Паспорт / сертификат'],
      [receipt.qualityDocument, 'Документ о качестве'],
    ] as const) {
      const document = receiptQualityDocument(value, defaultName)
      if (document) documents.push(document)
    }
  }
  const seen = new Set<string>()
  return documents.filter((doc) => {
    const key = JSON.stringify([
      doc.name,
      doc.number,
      doc.date,
      doc.orderNumber,
    ])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function newInspectionAct(
  documents: Array<QualityDocument> = [],
): InspectionAct {
  return {
    number: '',
    date: localToday(),
    signedOn: null,
    buyer: '',
    supplier: '',
    manufacturer: '',
    standards: '',
    checks: Array<string>(10).fill(''),
    conclusion: '',
    attachments: '',
    photos: '',
    documents: structuredClone(documents),
  }
}
const reinspectionWithActError =
  'Повторная проверка доступна только до создания АВК. Сначала удалите АВК, если по нему ещё нет выдач или возвратов.'

export function canReopenInspection(entry: InspectionCase) {
  return (
    !!currentInspection(entry).zni.signedOn &&
    !entry.revisions.some((revision) => revision.avk)
  )
}

export function deleteInspectionDocument(
  workflow: QualityWorkflow,
  caseId: string,
  kind: 'zni' | 'avk',
  issues: ReadonlyArray<{ receiptId?: unknown }> = [],
): QualityWorkflow {
  const entry = workflow.cases.find((item) => item.id === caseId)
  if (!entry) fail('ЗНИ не найдена. Обновите страницу.')
  const error = inspectionDeletionError(entry, kind, workflow, issues)
  if (error) fail(error)
  return {
    ...workflow,
    cases:
      kind === 'zni'
        ? workflow.cases.filter((item) => item.id !== caseId)
        : workflow.cases.map((item) =>
            item.id !== caseId
              ? item
              : {
                  ...item,
                  revisions: item.revisions.map((revision, index) =>
                    index === item.revisions.length - 1
                      ? { ...revision, avk: null }
                      : revision,
                  ),
                },
          ),
  }
}

export function inspectionDeletionError(
  entry: InspectionCase,
  kind: 'zni' | 'avk',
  workflow: QualityWorkflow,
  issues: ReadonlyArray<{ receiptId?: unknown }> = [],
): string | null {
  if (kind === 'zni' && entry.revisions.some((revision) => revision.avk))
    return 'Сначала удалите АВК этой ЗНИ.'
  if (kind === 'avk') {
    if (entry.revisions.some((revision) => revision.avk?.rejection))
      return 'Отклонённый АВК сохраняется в истории и не удаляется.'
    if (!currentInspection(entry).avk)
      return 'АВК не найден. Обновите страницу.'
    if (entry.revisions.slice(0, -1).some((revision) => revision.avk))
      return 'Нельзя удалить АВК с предыдущими редакциями в истории.'
  }
  const receiptIds = new Set(
    currentInspection(entry).zni.rows.map((row) => row.receiptId),
  )
  const label = kind === 'zni' ? 'ЗНИ' : 'АВК'
  if (issues.some((issue) => receiptIds.has(String(issue.receiptId))))
    return `Нельзя удалить ${label}: по связанным поступлениям уже есть выдачи в монтаж.`
  if (
    (workflow.customerReturns ?? []).some(
      (item) => item.caseId === entry.id || receiptIds.has(item.receiptId),
    )
  )
    return `Нельзя удалить ${label}: по связанным поступлениям уже оформлен возврат.`
  return null
}

export function reopenInspection(entry: InspectionCase): InspectionCase {
  const last = currentInspection(entry)
  if (!last.zni.signedOn)
    throw new Error('Текущая ревизия уже находится в работе.')
  if (!canReopenInspection(entry)) fail(reinspectionWithActError)
  // A signed ZNI without an AVK may be superseded, but is still retained in history.
  const next = structuredClone(last)
  next.revision++
  next.zni.inspectionDate = [
    localToday(),
    last.zni.inspectionDate,
    last.zni.signedOn,
  ]
    .sort()
    .at(-1)!
  next.zni.signedOn = null
  next.avk = null
  return { ...entry, revisions: [...entry.revisions, next] }
}
export function createAcceptedInspectionAct(
  entry: InspectionCase,
  documents: Array<QualityDocument> = [],
): InspectionAct {
  const revision = currentInspection(entry)
  if (!revision.zni.signedOn) fail('Сначала подпишите ЗНИ.')
  if (!revision.zni.rows.some((row) => (row.accepted ?? 0) > 0))
    fail('Нет принятого количества для АВК.')
  const act = newInspectionAct(documents)
  act.date = [act.date, revision.zni.signedOn].sort().at(-1)!
  act.number =
    entry.revisions.find((item) => item.avk?.number)?.avk?.number ?? ''
  return act
}

export function rejectInspectionAct(
  entry: InspectionCase,
  kind: 'document' | 'materials',
  rejectionDate: string,
  reason: string,
  rows?: Array<InspectionSelection>,
): InspectionCase {
  const next = structuredClone(entry)
  const revision = currentInspection(next)
  if (!revision.avk || !revision.zni.signedOn)
    fail('Сначала создайте АВК по подписанной ЗНИ.')
  if (revision.avk.signedOn) fail('Подписанный АВК нельзя отклонить.')
  if (revision.avk.rejection) fail('АВК уже отклонён.')
  if (
    kind === 'materials' &&
    entry.revisions.some((item) => item.avk?.signedOn)
  )
    fail(
      'По этой ЗНИ уже есть подписанный АВК. Отклонение материала не может отменять действующую приёмку.',
    )
  if (rows)
    unique(
      rows.map((row) => row.receiptId),
      'позиции отклонения АВК',
    )
  revision.avk.rejection = {
    kind,
    date: rejectionDate,
    reason: reason.trim(),
    ...(kind === 'materials' && rows
      ? {
          quantities: Object.fromEntries(
            rows.map((row) => [row.receiptId, row.quantity]),
          ),
        }
      : {}),
  }
  validateRevision(revision)
  return next
}

export function correctInspectionAct(entry: InspectionCase): InspectionCase {
  const current = currentInspection(entry)
  if (current.avk?.rejection?.kind !== 'document')
    fail(
      'Исправление доступно для АВК, отклонённого из-за оформления документа.',
    )
  const next = structuredClone(current)
  next.revision++
  next.kind = 'avk-correction'
  next.avk!.date = [localToday(), current.avk.rejection.date].sort().at(-1)!
  next.avk!.signedOn = null
  delete next.avk!.rejection
  return { ...entry, revisions: [...entry.revisions, next] }
}

/** A correction is explicit and retains the original rejection and signed ZNI. */
export function correctMaterialRejection(
  entry: InspectionCase,
  rows: Array<InspectionSelection>,
  reason: string,
): InspectionCase {
  const current = currentInspection(entry)
  if (current.avk?.rejection?.kind !== 'materials' || current.avk.signedOn)
    fail(
      'Уточнение доступно только для неподписанного АВК с непринятым материалом.',
    )
  const next = structuredClone(current)
  next.revision++
  next.kind = 'avk-correction'
  // The act date and rejection date remain the original dates for return chronology.
  unique(
    rows.map((row) => row.receiptId),
    'позиции отклонения АВК',
  )
  next.avk!.rejection = {
    ...next.avk!.rejection!,
    quantities: Object.fromEntries(
      rows.map((row) => [row.receiptId, row.quantity]),
    ),
    reason: reason.trim(),
  }
  validateRevision(next)
  return { ...entry, revisions: [...entry.revisions, next] }
}

export function receivedByRequest(
  receipts: Array<{ id: string; requestId: string; quantity: number }>,
  workflow?: QualityWorkflow,
) {
  const returned = customerReturnTotals(workflow, 'rejected')
  const totals = new Map<string, number>()
  for (const receipt of receipts)
    totals.set(
      receipt.requestId,
      Number(
        (
          (totals.get(receipt.requestId) ?? 0) +
          receipt.quantity -
          (returned.get(receipt.id) ?? 0)
        ).toPrecision(15),
      ),
    )
  return totals
}

export function customerReturnTotals(
  workflow?: QualityWorkflow,
  kind?: 'rejected' | 'surplus',
) {
  const totals = new Map<string, number>()
  for (const entry of workflow?.customerReturns ?? []) {
    if (kind && entry.kind !== kind) continue
    totals.set(
      entry.receiptId,
      Number(
        ((totals.get(entry.receiptId) ?? 0) + entry.quantity).toPrecision(15),
      ),
    )
  }
  return totals
}
export function rejectedReturnsByCase(workflow: QualityWorkflow) {
  const result = new Map<string, Map<string, number>>()
  for (const item of workflow.customerReturns ?? []) {
    if (item.kind === 'surplus' || !item.caseId) continue
    const receipts = result.get(item.caseId) ?? new Map<string, number>()
    receipts.set(
      item.receiptId,
      precise((receipts.get(item.receiptId) ?? 0) + item.quantity),
    )
    result.set(item.caseId, receipts)
  }
  return result
}
/** A pending correction does not make a known rejected batch available for early issue. */
export function rejectedStockTotals(workflow?: QualityWorkflow) {
  const totals = new Map<string, number>()
  if (!workflow) return totals
  const returned = rejectedReturnsByCase(workflow)
  for (const entry of workflow.cases) {
    const revision = [...entry.revisions]
      .reverse()
      .find((item) => item.zni.signedOn)
    if (!revision) continue
    for (const row of revision.zni.rows) {
      const rejectedQuantity = Math.max(
        0,
        precise(
          row.presented -
            acceptedAfterInspection(revision, row) -
            (returned.get(entry.id)?.get(row.receiptId) ?? 0),
        ),
      )
      totals.set(
        row.receiptId,
        precise((totals.get(row.receiptId) ?? 0) + rejectedQuantity),
      )
    }
  }
  return totals
}

export function pendingCustomerReturns(
  workflow: QualityWorkflow,
  entry: InspectionCase,
  returned = rejectedReturnsByCase(workflow),
) {
  const revision = currentInspection(entry)
  if (!revision.zni.signedOn) return []
  return revision.zni.rows
    .map((row) => ({
      row,
      quantity: Number(
        (
          row.presented -
          acceptedAfterInspection(revision, row) -
          (returned.get(entry.id)?.get(row.receiptId) ?? 0)
        ).toPrecision(15),
      ),
    }))
    .filter((item) => item.quantity > 0)
}
export function recordCustomerReturn(
  workflow: QualityWorkflow,
  caseId: string,
  selection: Array<InspectionSelection>,
  returnDate: string,
  documentNumber = '',
  note = '',
): QualityWorkflow {
  const entry = workflow.cases.find((item) => item.id === caseId)
  if (!entry) fail('ЗНИ не найдена.')
  const available = new Map(
    pendingCustomerReturns(workflow, entry).map((item) => [
      item.row.receiptId,
      item.quantity,
    ]),
  )
  if (!selection.length) fail('Укажите количество для возврата.')
  unique(
    selection.map((item) => item.receiptId),
    'позиции возврата',
  )
  const allocations = rejectedReturnAllocations(workflow)
  const alreadyReturnedZni = new Map<string, number>()
  for (const item of workflow.customerReturns ?? []) {
    if (item.caseId !== caseId || item.kind !== 'rejected') continue
    alreadyReturnedZni.set(
      item.receiptId,
      precise(
        (alreadyReturnedZni.get(item.receiptId) ?? 0) +
          (allocations.get(item.id)?.zni ?? 0),
      ),
    )
  }
  const revision = currentInspection(entry)
  const additions = selection.flatMap((item) => {
    if (
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > (available.get(item.receiptId) ?? 0)
    )
      fail('Количество возврата превышает непринятый остаток ЗНИ / АВК.')
    if (returnDate < revision.zni.signedOn!)
      fail('Дата возврата не может быть раньше подписания ЗНИ.')
    const row = revision.zni.rows.find(
      (candidate) => candidate.receiptId === item.receiptId,
    )!
    const remainingZni = Math.max(
      0,
      precise(
        row.presented -
          (row.accepted ?? 0) -
          (alreadyReturnedZni.get(item.receiptId) ?? 0),
      ),
    )
    const zniQuantity = Math.min(item.quantity, remainingZni)
    const avkQuantity = precise(item.quantity - zniQuantity)
    const rejection = revision.avk?.rejection
    if (avkQuantity > 0 && rejection && returnDate < rejection.date)
      fail('Дата возврата не может быть раньше отклонения АВК.')
    return (
      [
        ['zni', zniQuantity],
        ['avk', avkQuantity],
      ] as const
    )
      .filter(([, amount]) => amount > 0)
      .map(([rejectedAt, amount]) =>
        customerReturnSchema.parse({
          id: crypto.randomUUID(),
          kind: 'rejected',
          rejectedAt,
          caseId,
          revision: revision.revision,
          receiptId: item.receiptId,
          quantity: amount,
          date: returnDate,
          documentNumber,
          note,
        }),
      )
  })
  return {
    ...workflow,
    customerReturns: [...(workflow.customerReturns ?? []), ...additions],
  }
}
const precise = (value: number) => Number(value.toPrecision(15))
export type ReturnReceipt = { id: string; quantity: number; date?: string }
export type ReturnIssue = IssueMovement
export type SurplusReturnSource = {
  receiptId: string
  source: 'uninspected' | 'accepted'
  caseId?: string
  revision?: number
  quantity: number
  availableOn: string
  approved: boolean
}
export const surplusReturnSourceKey = (
  item: Pick<CustomerReturn, 'receiptId' | 'source' | 'caseId' | 'revision'>,
) => JSON.stringify([item.receiptId, item.source, item.caseId, item.revision])

/** Returns from accepted stock only reduce their own approval, never rejected stock. */
export function approvedCustomerReturnTotals(workflow?: QualityWorkflow) {
  const result = new Map<string, number>()
  const cases = new Map(workflow?.cases.map((entry) => [entry.id, entry]))
  for (const item of workflow?.customerReturns ?? []) {
    if (item.kind !== 'surplus' || item.source !== 'accepted') continue
    const entry = item.caseId ? cases.get(item.caseId) : undefined
    const active = entry && activeInspection(entry)
    if (
      entry &&
      active &&
      inspectionSourceRevision(entry, active).revision === item.revision
    )
      result.set(
        item.receiptId,
        precise((result.get(item.receiptId) ?? 0) + item.quantity),
      )
  }
  return result
}

/** Batches reserved by a draft ZNI are released by editing/removing that draft first. */
export function surplusReturnSources(
  workflow: QualityWorkflow,
  receipts: Array<ReturnReceipt>,
  issues: Array<ReturnIssue>,
): Array<SurplusReturnSource> {
  const sources: Array<SurplusReturnSource> = []
  const free = new Map(
    receipts.map((receipt) => [receipt.id, receipt.quantity]),
  )
  const dates = new Map(
    receipts.map((receipt) => [receipt.id, receipt.date ?? '']),
  )
  for (const entry of workflow.cases) {
    const revision = currentInspection(entry)
    for (const row of revision.zni.rows) {
      free.set(
        row.receiptId,
        precise((free.get(row.receiptId) ?? 0) - row.presented),
      )
      // A pending reinspection must be completed before returning its accepted stock.
      const effective = activeInspection(entry)
      if (
        revision.zni.signedOn &&
        (!effective || effective.revision === revision.revision)
      )
        sources.push({
          receiptId: row.receiptId,
          source: 'accepted',
          caseId: entry.id,
          revision: inspectionSourceRevision(entry, revision).revision,
          quantity: acceptedAfterInspection(revision, row),
          approved: !!revision.avk?.signedOn,
          availableOn: [dates.get(row.receiptId) ?? '', revision.zni.signedOn]
            .sort()
            .at(-1)!,
        })
    }
  }
  const uninspected = [...receipts].reverse().map(
    (receipt): SurplusReturnSource => ({
      receiptId: receipt.id,
      source: 'uninspected',
      quantity: Math.max(0, free.get(receipt.id) ?? 0),
      approved: false,
      availableOn: receipt.date ?? '',
    }),
  )
  const returned = new Map<string, number>()
  for (const item of workflow.customerReturns ?? []) {
    if (item.kind !== 'surplus') continue
    const key = surplusReturnSourceKey(item)
    returned.set(key, precise((returned.get(key) ?? 0) + item.quantity))
  }
  const approved = new Map<string, number>()
  for (const control of inspectionApprovals(workflow))
    approved.set(
      control.receiptId,
      precise((approved.get(control.receiptId) ?? 0) + control.quantity),
    )
  for (const [receiptId, amount] of approvedCustomerReturnTotals(workflow))
    approved.set(receiptId, precise((approved.get(receiptId) ?? 0) - amount))
  for (const issue of issues)
    approved.set(
      issue.receiptId,
      precise(
        (approved.get(issue.receiptId) ?? 0) - issueApprovalConsumption(issue),
      ),
    )
  const physical = new Map(
    receipts.map((receipt) => [receipt.id, receipt.quantity]),
  )
  for (const item of workflow.customerReturns ?? [])
    physical.set(
      item.receiptId,
      precise((physical.get(item.receiptId) ?? 0) - item.quantity),
    )
  for (const issue of issues)
    physical.set(
      issue.receiptId,
      precise((physical.get(issue.receiptId) ?? 0) - netIssued(issue)),
    )
  return [...uninspected, ...sources]
    .map((source) => {
      let amount = Math.max(
        0,
        precise(
          source.quantity - (returned.get(surplusReturnSourceKey(source)) ?? 0),
        ),
      )
      if (source.approved) {
        amount = Math.min(
          amount,
          Math.max(0, approved.get(source.receiptId) ?? 0),
        )
        approved.set(
          source.receiptId,
          precise((approved.get(source.receiptId) ?? 0) - amount),
        )
      }
      amount = Math.min(
        amount,
        Math.max(0, physical.get(source.receiptId) ?? 0),
      )
      physical.set(
        source.receiptId,
        precise((physical.get(source.receiptId) ?? 0) - amount),
      )
      return { ...source, quantity: amount }
    })
    .filter((source) => source.quantity > 0)
}

export function recordSurplusReturn(
  workflow: QualityWorkflow,
  receipts: Array<ReturnReceipt>,
  issues: Array<ReturnIssue>,
  selection: Array<InspectionSelection>,
  returnDate: string,
  documentNumber = '',
  note = '',
): QualityWorkflow {
  if (!selection.length) fail('Укажите количество для возврата.')
  unique(
    selection.map((item) => item.receiptId),
    'позиции возврата',
  )
  const sources = surplusReturnSources(workflow, receipts, issues)
  const additions: Array<CustomerReturn> = []
  for (const item of selection) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0)
      fail('Укажите положительное количество возврата.')
    let remaining = item.quantity
    for (const source of sources.filter(
      (candidate) =>
        candidate.receiptId === item.receiptId &&
        candidate.availableOn <= returnDate,
    )) {
      const amount = Math.min(remaining, source.quantity)
      if (amount <= 0) continue
      additions.push(
        customerReturnSchema.parse({
          id: crypto.randomUUID(),
          kind: 'surplus',
          source: source.source,
          caseId: source.caseId,
          revision: source.revision,
          receiptId: item.receiptId,
          quantity: amount,
          date: returnDate,
          documentNumber,
          note,
        }),
      )
      remaining = precise(remaining - amount)
    }
    if (remaining > 0)
      fail(
        'Возврат превышает доступный остаток на эту дату. Выданный материал и позиции в неподписанной ЗНИ недоступны; непринятое возвращается по ЗНИ.',
      )
  }
  return {
    ...workflow,
    customerReturns: [...(workflow.customerReturns ?? []), ...additions],
  }
}

export function signInspection(
  revision: InspectionRevision,
  kind: 'zni' | 'avk',
  signedOn: string,
): InspectionRevision {
  if (!date.safeParse(signedOn).success)
    fail('Укажите корректную дату подписания.')
  const next = structuredClone(revision)
  if (kind === 'zni') {
    if (next.zni.signedOn) throw new Error('ЗНИ уже подписана.')
    next.zni.signedOn = signedOn
  } else {
    if (!next.zni.signedOn || !next.avk)
      throw new Error('Сначала подпишите ЗНИ этой ревизии и создайте АВК.')
    if (next.avk.signedOn) throw new Error('АВК уже подписан.')
    if (isBlockedInspectionAct(next))
      fail(
        'Отклонённый АВК нельзя подписать. Для исправления документа создайте новую редакцию.',
      )
    next.avk.signedOn = signedOn
  }
  validateRevision(next)
  validateInspectionChronology(next)
  return next
}
function fail(message: string): never {
  throw new Error(message)
}
function unique(values: Array<string>, label: string) {
  if (new Set(values).size !== values.length) fail(`Повторяющиеся ${label}.`)
}
function validateRevision(rev: InspectionRevision) {
  if (!rev.zni.number.trim()) fail('Укажите номер ЗНИ.')
  unique(
    rev.zni.rows.map((row) => row.receiptId),
    'позиции ЗНИ',
  )
  for (const row of rev.zni.rows) {
    if (row.accepted !== null && row.accepted > row.presented)
      fail('Принятое количество превышает предъявленное.')
    if (row.result === 'rejected' && row.accepted !== 0)
      fail('Для непринятой позиции принятое количество должно быть равно нулю.')
    if (row.result === 'accepted' && row.accepted !== row.presented)
      fail('Для частичной приёмки выберите «Принято с замечаниями».')
    if (row.result === 'remarks' && !row.remarks.trim())
      fail('Укажите замечания к частичной приёмке.')
    if (rev.zni.signedOn && (row.accepted === null || !row.result))
      fail('Перед подписанием заполните результаты всех позиций ЗНИ.')
  }
  if (rev.zni.signedOn && rev.zni.signedOn < rev.zni.date)
    fail('Дата подписания ЗНИ не может быть раньше даты документа.')
  if (rev.avk?.rejection) {
    const rejection = rev.avk.rejection
    if (rev.avk.signedOn && !isPartiallyRejectedAct(rev))
      fail('Подписанный АВК нельзя отклонить.')
    if (!rev.avk.number.trim()) fail('Укажите номер АВК перед отклонением.')
    if (!rejection.reason.trim()) fail('Укажите причину отклонения АВК.')
    if (
      !date.safeParse(rejection.date).success ||
      rejection.date < rev.avk.date ||
      !rev.zni.signedOn ||
      rejection.date < rev.zni.signedOn
    )
      fail(
        'Дата отклонения АВК не может быть раньше даты акта или подписания ЗНИ.',
      )
    if (rejection.quantities) {
      if (rejection.kind !== 'materials')
        fail('Количество отклонения относится только к материалам.')
      const rowsByReceipt = new Map(
        rev.zni.rows.map((row) => [row.receiptId, row]),
      )
      if (!Object.keys(rejection.quantities).length)
        fail('Укажите непринятое количество хотя бы для одной позиции АВК.')
      for (const [receiptId, amount] of Object.entries(rejection.quantities)) {
        const row = rowsByReceipt.get(receiptId)
        if (
          !row ||
          !Number.isFinite(amount) ||
          amount <= 0 ||
          amount > (row.accepted ?? 0)
        )
          fail(
            'Непринятое по АВК количество должно быть больше нуля и не превышать принятое по ЗНИ.',
          )
      }
    }
    if (rev.avk.signedOn && rev.avk.signedOn < rejection.date)
      fail(
        'Подписание АВК не может предшествовать результату проверки материалов.',
      )
  }
  if (rev.avk?.signedOn) {
    if (!rev.zni.signedOn || !rev.avk.number.trim())
      fail('Для подписания АВК нужны номер АВК и подписанная ЗНИ этой ревизии.')
    if (rev.avk.signedOn < rev.avk.date || rev.avk.signedOn < rev.zni.signedOn)
      fail(
        'Дата подписания АВК не может быть раньше даты АВК или подписания ЗНИ.',
      )
    if (
      rev.avk.checks.some((check) => !check.trim()) ||
      !rev.avk.conclusion.trim()
    )
      fail(
        'Заполните все проверки и заключение АВК. Для неприменимых проверок укажите «Не применимо».',
      )
  }
}
type WorkspaceLike = {
  lines?: Array<{ id?: unknown; unit?: unknown; projectMaterialName?: unknown }>
  qualityWorkflow?: QualityWorkflow
  materialReceipts: Array<Record<string, unknown>>
  materialIssues: Array<Record<string, unknown>>
  materialRequests?: Array<Record<string, unknown>>
}
// Compare JSON content, not insertion order (schema parsing can reorder keys).
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    )
  return value
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
export function validateQualityWorkspace(
  next: WorkspaceLike,
  previous?: WorkspaceLike | null,
) {
  validateIssueMovements(next, previous)
  validateProjectUnitChanges(next.lines, previous?.lines, next, previous)
  const workflow = next.qualityWorkflow
  const documents = receiptDocuments(workflow)
  const documentById = indexReceiptDocuments(workflow)
  const previousReceipts = new Map(
    previous?.materialReceipts.map((receipt) => [receipt.id, receipt]),
  )
  unique(
    (next.materialRequests ?? []).map((request) => String(request.id)),
    'ID позиций заявок',
  )
  unique(
    next.materialIssues.map((issue) => String(issue.id)),
    'ID выдач',
  )
  unique(
    next.materialReceipts.map((receipt) => String(receipt.id)),
    'ID поступлений',
  )
  const previousRequests = new Map(
    previous?.materialRequests?.map((request) => [request.id, request]),
  )
  for (const request of next.materialRequests ?? []) {
    if (
      (!Number.isFinite(request.quantity) || Number(request.quantity) <= 0) &&
      (!previousRequests.has(request.id) ||
        previousRequests.get(request.id)!.quantity !== request.quantity)
    )
      fail('Укажите положительное количество позиции заявки.')
  }
  for (const receipt of next.materialReceipts) {
    {
      if (!Number.isFinite(receipt.quantity) || Number(receipt.quantity) <= 0)
        fail('Укажите положительное количество поступления.')
      if (
        !documentsForReceipt(
          {
            id: String(receipt.id),
            appDocumentId: receipt.appDocumentId as string | undefined,
            m15DocumentId: receipt.m15DocumentId as string | undefined,
          },
          workflow,
          documentById,
        ).length
      )
        fail('Укажите АПП или М-15 для получения.')
    }
  }
  if (!workflow) {
    if (next.materialIssues.length)
      fail('Выдача возможна только по подписанному АВК.')
    if (previous?.qualityWorkflow)
      fail('Нельзя удалить весь учёт АПП, ЗНИ и АВК устаревшей вкладкой.')
    validateWorkspaceChronology(next, previous)
    return
  }
  if (!qualityWorkflowSchema.safeParse(workflow).success)
    fail(
      'Проверьте реквизиты: выберите хотя бы одно получение, укажите корректные даты и неотрицательные количества.',
    )
  unique(
    workflow.cases.map((entry) => entry.id),
    'ID ЗНИ',
  )
  unique(
    workflow.cases.map((entry) => currentInspection(entry).zni.number.trim()),
    'номера ЗНИ',
  )
  unique(
    workflow.cases.flatMap((entry) =>
      // Revisions belong to one document. Its number stays reserved even
      // while the newest revision has no AVK yet.
      [
        ...new Set(
          entry.revisions.flatMap((revision) =>
            revision.avk?.number.trim() ? [revision.avk.number.trim()] : [],
          ),
        ),
      ],
    ),
    'номера АВК',
  )
  const receipts = new Map(
    next.materialReceipts.map((receipt) => [receipt.id, receipt]),
  )
  const caseById = new Map(workflow.cases.map((entry) => [entry.id, entry]))
  const previousCaseById = new Map(
    previous?.qualityWorkflow?.cases.map((entry) => [entry.id, entry]),
  )
  // Validate destructive transitions against both snapshots, before balances.
  // Removing dependent records in the same save must not bypass this check.
  for (const old of previous?.qualityWorkflow?.cases ?? []) {
    const current = caseById.get(old.id)
    const deletedKind = !current
      ? 'zni'
      : old.revisions.length === current.revisions.length &&
          currentInspection(old).avk &&
          !currentInspection(current).avk
        ? 'avk'
        : null
    if (!deletedKind) continue
    for (const state of [previous!, next]) {
      const error = inspectionDeletionError(
        old,
        deletedKind,
        state.qualityWorkflow!,
        state.materialIssues,
      )
      if (error) fail(error)
    }
  }
  const linkedDocuments = new Set([
    ...next.materialReceipts.flatMap((receipt) => [
      receipt.appDocumentId,
      receipt.m15DocumentId,
    ]),
    ...workflow.cases.map((entry) => entry.basis.id),
  ])
  unique(
    documents.map((doc) => doc.id),
    'ID документов получения',
  )
  unique(
    (workflow.receiptDocuments ?? []).map(receiptDocumentKey),
    'реквизиты документов получения',
  )
  for (const receipt of next.materialReceipts) {
    for (const [field, kind] of [
      ['appDocumentId', 'app'],
      ['m15DocumentId', 'm15'],
    ] as const) {
      if (
        receipt[field] &&
        documentById.get(String(receipt[field]))?.kind !== kind
      )
        fail('Документ поступления не найден или имеет неверный тип.')
    }
  }
  for (const old of previous?.qualityWorkflow?.receiptDocuments ?? []) {
    const current = documentById.get(old.id)
    const linked = linkedDocuments.has(old.id)
    if (linked && !same(old, current))
      fail(
        'Реквизиты связанного документа защищены: выберите или создайте другой документ.',
      )
  }
  const issuedByReceipt = new Map<string, number>()
  for (const issue of next.materialIssues) {
    const receiptId = String(issue.receiptId)
    if (!receipts.has(receiptId)) fail('Получение для выдачи не найдено.')
    const amount = Number(issue.quantity)
    if (!Number.isFinite(amount) || amount <= 0)
      fail('Укажите положительное количество выдачи.')
    issuedByReceipt.set(
      receiptId,
      (issuedByReceipt.get(receiptId) ?? 0) +
        netIssued(issue as unknown as IssueMovement),
    )
  }
  // Later inspection results must not invalidate a previously recorded physical issue.
  // For a new exception, known rejected quantities are never available to issue.
  const previousIssues = new Map(
    previous?.materialIssues.map((issue) => [issue.id, issue]),
  )
  const rejectedCapacity = rejectedStockTotals(workflow)
  const returnedTotals = customerReturnTotals(workflow)
  for (const issue of next.materialIssues) {
    if (!issue.beforeInspection || same(issue, previousIssues.get(issue.id)))
      continue
    const old = previousIssues.get(issue.id)
    if (
      old &&
      ['receiptId', 'quantity', 'date'].every((key) => old[key] === issue[key])
    )
      continue
    const receiptId = String(issue.receiptId)
    const stock = precise(
      Number(receipts.get(receiptId)?.quantity) -
        (returnedTotals.get(receiptId) ?? 0) -
        (issuedByReceipt.get(receiptId) ?? 0),
    )
    if (stock < (rejectedCapacity.get(receiptId) ?? 0))
      fail(
        'Выдача до ВК превышает складской остаток без непринятого материала.',
      )
  }
  const reservedByReceipt = new Map<string, number>()
  const acceptedByReceipt = new Map<string, number>()
  for (const entry of workflow.cases) {
    const old = previousCaseById.get(entry.id)
    if (!same(documentById.get(entry.basis.id), entry.basis))
      fail('Проверьте основание ЗНИ: выберите АПП или М-15.')
    const firstRows = entry.revisions[0]!.zni.rows
    const firstAllocation = firstRows
      .map((row) => [row.receiptId, row.presented])
      .sort()
    const numberedAct = entry.revisions.find((item) => item.avk?.signedOn)?.avk
    for (const [index, revision] of entry.revisions.entries()) {
      const previousRevision = entry.revisions[index - 1]
      if (revision.kind === 'avk-correction') {
        if (
          !previousRevision ||
          !previousRevision.avk?.rejection ||
          previousRevision.avk.signedOn ||
          !revision.avk ||
          !same(revision.zni, previousRevision.zni) ||
          revision.avk.number !== previousRevision.avk.number ||
          (previousRevision.avk.rejection.kind === 'document'
            ? revision.avk.date < previousRevision.avk.rejection.date
            : revision.avk.rejection?.kind !== 'materials' ||
              revision.avk.rejection.date !==
                previousRevision.avk.rejection.date ||
              revision.avk.date !== previousRevision.avk.date)
        )
          fail(
            'Новая редакция АВК сохраняет подписанную ЗНИ и номер акта; её дата не может быть раньше отклонения.',
          )
      } else if (
        index >= (old?.revisions.length ?? 1) &&
        (old?.revisions.some((item) => item.avk) ||
          entry.revisions.slice(0, index).some((item) => item.avk))
      ) {
        fail(reinspectionWithActError)
      }
      if (
        revision.avk?.rejection?.kind === 'materials' &&
        entry.revisions.slice(0, index).some((item) => item.avk?.signedOn)
      )
        fail(
          'Отклонение материала не может отменять действующий подписанный АВК.',
        )
      if (revision.revision !== index + 1)
        fail('Нарушена последовательность ревизий ЗНИ.')
      if (index < entry.revisions.length - 1 && !revision.zni.signedOn)
        fail('Нельзя архивировать неподписанную ревизию ЗНИ.')
      if (
        revision.avk &&
        (!revision.zni.signedOn ||
          !revision.zni.rows.some((row) => (row.accepted ?? 0) > 0))
      )
        fail(
          'АВК создаётся после подписания ЗНИ только на принятое количество.',
        )
      validateRevision(revision)
      if (revision.zni.number !== entry.revisions[0]!.zni.number)
        fail('Повторная проверка сохраняет номер ЗНИ.')
      if (
        numberedAct &&
        revision.avk &&
        revision.avk.number.trim() &&
        revision.avk.number !== numberedAct.number
      )
        fail('Повторная проверка сохраняет номер АВК.')
      if (
        !same(
          revision.zni.rows.map((row) => [row.receiptId, row.presented]).sort(),
          firstAllocation,
        )
      )
        fail(
          'Повторная проверка сохраняет состав и предъявленное количество ЗНИ.',
        )
      for (const row of revision.zni.rows) {
        const receipt = receipts.get(row.receiptId)
        if (!receipt) fail('Нельзя удалить получение, связанное с ЗНИ.')
        if (
          !documentsForReceipt(
            {
              id: String(receipt.id),
              appDocumentId: receipt.appDocumentId as string | undefined,
              m15DocumentId: receipt.m15DocumentId as string | undefined,
            },
            workflow,
            documentById,
          ).some((doc) => doc.id === entry.basis.id)
        )
          fail('Поступление не относится к документу-основанию ЗНИ.')
        if (
          row.presented > Number(receipt.quantity) ||
          row.projectLineId !== receipt.projectLineId ||
          row.unit !== receipt.projectUnit
        )
          fail(
            'Предъявленное количество не может превышать поступление; материал и единица должны соответствовать получению.',
          )
        if (
          row.factoryNumber !== (receipt.factoryNumber ?? '') ||
          row.heatBatch !== (receipt.heatBatch ?? '') ||
          (receipt.actualName && row.name !== receipt.actualName)
        )
          fail(
            'Наименование, заводской номер и партия должны соответствовать получению.',
          )
      }
    }
    for (const row of currentInspection(entry).zni.rows)
      reservedByReceipt.set(
        row.receiptId,
        precise((reservedByReceipt.get(row.receiptId) ?? 0) + row.presented),
      )
    for (const row of activeInspection(entry)?.zni.rows ?? [])
      acceptedByReceipt.set(
        row.receiptId,
        precise(
          (acceptedByReceipt.get(row.receiptId) ?? 0) +
            acceptedAfterInspection(activeInspection(entry)!, row),
        ),
      )
  }
  for (const [receiptId, reserved] of reservedByReceipt) {
    if (precise(reserved) > Number(receipts.get(receiptId)?.quantity))
      fail(
        'Суммарное количество в ЗНИ превышает поступление. Эта часть материала уже включена в другую ЗНИ.',
      )
  }
  const approvedReturned = approvedCustomerReturnTotals(workflow)
  const regularConsumption = new Map<string, number>()
  for (const issue of next.materialIssues) {
    if (issue.beforeInspection) continue
    const receiptId = String(issue.receiptId)
    regularConsumption.set(
      receiptId,
      precise(
        (regularConsumption.get(receiptId) ?? 0) +
          issueApprovalConsumption(issue as unknown as IssueMovement),
      ),
    )
  }
  for (const [receiptId, issued] of regularConsumption) {
    if (
      Number(issued.toPrecision(15)) >
      precise(
        (acceptedByReceipt.get(receiptId) ?? 0) -
          (approvedReturned.get(receiptId) ?? 0),
      )
    )
      fail(
        'Принятое количество по действующим АВК за вычетом возвратов не может быть меньше уже выданного в монтаж.',
      )
  }
  for (const old of previous?.qualityWorkflow?.cases ?? []) {
    const current = caseById.get(old.id)
    if (!current) continue
    if (
      !same(current.basis, old.basis) ||
      current.revisions.length < old.revisions.length
    )
      fail('Нельзя менять основание или удалять историю ЗНИ.')
    for (const [index, revision] of old.revisions.entries()) {
      const updated = current.revisions[index]!
      const deletedAct =
        index === old.revisions.length - 1 &&
        current.revisions.length === old.revisions.length &&
        !!revision.avk &&
        !updated.avk
      if (deletedAct && !same({ ...revision, avk: null }, updated))
        fail('Удаление АВК не должно изменять ЗНИ или историю.')
      if (revision.zni.signedOn && !same(revision.zni, updated.zni))
        fail('Подписанную ЗНИ можно изменить только в новой ревизии.')
      const editablePartialAct =
        !revision.avk?.signedOn &&
        isPartiallyRejectedAct(revision) &&
        same(revision.avk?.rejection, updated.avk?.rejection) &&
        revision.avk?.date === updated.avk?.date &&
        revision.avk?.number === updated.avk?.number &&
        index === current.revisions.length - 1
      if (
        revision.avk &&
        !revision.avk.rejection &&
        updated.avk?.rejection &&
        !isPartiallyRejectedAct(updated) &&
        !same(
          {
            ...revision,
            avk: { ...revision.avk, rejection: updated.avk.rejection },
          },
          updated,
        )
      )
        fail('Отклонение АВК не должно изменять содержание документа.')
      if (
        revision.avk &&
        !revision.avk.rejection &&
        isPartiallyRejectedAct(updated) &&
        (revision.avk.number !== updated.avk?.number ||
          revision.avk.date !== updated.avk.date)
      )
        fail('При частичном отклонении сохраняются номер и дата АВК.')
      // The outbox may combine rejection and correction before the first save.
      // Only the previously current, unsigned act may acquire rejection metadata.
      const newlyRejected =
        index === old.revisions.length - 1 &&
        !revision.avk?.signedOn &&
        !revision.avk?.rejection &&
        !!updated.avk?.rejection
      if (
        (revision.avk?.signedOn ||
          revision.avk?.rejection ||
          index < current.revisions.length - 1) &&
        !same(revision, updated) &&
        !deletedAct &&
        !newlyRejected &&
        !editablePartialAct
      )
        fail('Историю ревизий и подписанный АВК изменять нельзя.')
    }
  }
  unique(
    (workflow.customerReturns ?? []).map((item) => item.id),
    'ID возвратов',
  )
  const returnedByCaseReceipt = new Map<string, number>()
  const returnedBeforeRejection = new Map<string, number>()
  const returnedByStage = new Map<string, number>()
  const allocations = rejectedReturnAllocations(workflow)
  const surplusCapacity = new Map(
    surplusReturnSources(
      { ...workflow, customerReturns: [] },
      next.materialReceipts.map((item) => ({
        id: String(item.id),
        quantity: Number(item.quantity),
        date: String(item.date ?? ''),
      })),
      [],
    ).map((item) => [surplusReturnSourceKey(item), item]),
  )
  const surplusTotals = new Map<string, number>()
  for (const item of workflow.customerReturns ?? []) {
    if (item.kind === 'surplus') {
      if (item.rejectedAt)
        fail('У возврата лишнего материала не может быть причины непринятия.')
      const key = surplusReturnSourceKey(item)
      const capacity = surplusCapacity.get(key)
      if (!capacity || !receipts.has(item.receiptId))
        fail('Источник возврата лишнего материала не найден или защищён ЗНИ.')
      if (item.date < capacity.availableOn)
        fail('Возврат не может предшествовать получению или подписанию ЗНИ.')
      const total = precise((surplusTotals.get(key) ?? 0) + item.quantity)
      if (total > capacity.quantity)
        fail('Суммарный возврат превышает доступное количество материала.')
      surplusTotals.set(key, total)
      continue
    }
    if (item.source) fail('Непринятый материал возвращается только по ЗНИ.')
    const entry = item.caseId ? caseById.get(item.caseId) : undefined
    const revision = entry?.revisions.find(
      (value) => value.revision === item.revision,
    )
    const row = revision?.zni.rows.find(
      (value) => value.receiptId === item.receiptId,
    )
    if (
      !entry ||
      !revision?.zni.signedOn ||
      !row ||
      !receipts.has(item.receiptId)
    )
      fail('Возврат должен относиться к подписанной ЗНИ и её поступлению.')
    if (item.date < revision.zni.signedOn)
      fail('Возврат не может предшествовать подписанию ЗНИ.')
    const latest = currentInspection(entry)
    if (
      inspectionSourceRevision(entry, latest).revision !==
      inspectionSourceRevision(entry, revision).revision
    )
      fail(
        'После фактического возврата повторная проверка этой партии недоступна.',
      )
    const key = JSON.stringify([item.caseId, item.receiptId])
    const total = Number(
      ((returnedByCaseReceipt.get(key) ?? 0) + item.quantity).toPrecision(15),
    )
    if (total > precise(row.presented - acceptedAfterInspection(latest, row)))
      fail('Суммарный возврат превышает непринятое количество.')
    for (const stage of ['zni', 'avk'] as const) {
      const stageKey = JSON.stringify([item.caseId, item.receiptId, stage])
      const amount = allocations.get(item.id)?.[stage] ?? 0
      const stageTotal = precise((returnedByStage.get(stageKey) ?? 0) + amount)
      const capacity =
        stage === 'zni'
          ? precise(row.presented - (row.accepted ?? 0))
          : rejectedByAct(latest, row)
      if (stageTotal > capacity)
        fail(
          'Возврат превышает непринятое количество на указанном этапе проверки.',
        )
      returnedByStage.set(stageKey, stageTotal)
      if (
        stage === 'avk' &&
        amount > 0 &&
        (!latest.avk?.rejection || item.date < latest.avk.rejection.date)
      )
        fail('Возврат по АВК не может предшествовать отклонению материала.')
    }
    const rejection = latest.avk?.rejection
    if (rejection?.kind === 'materials' && item.date < rejection.date) {
      const beforeRejection = precise(
        (returnedBeforeRejection.get(key) ?? 0) + item.quantity,
      )
      if (beforeRejection > precise(row.presented - (row.accepted ?? 0)))
        fail(
          'Возврат материала по отклонённому АВК не может предшествовать отклонению.',
        )
      returnedBeforeRejection.set(key, beforeRejection)
    }
    returnedByCaseReceipt.set(key, total)
  }
  for (const [receiptId, total] of customerReturnTotals(workflow)) {
    if (
      precise(total + (issuedByReceipt.get(receiptId) ?? 0)) >
      Number(receipts.get(receiptId)?.quantity)
    )
      fail('Возврат превышает остаток на складе с учётом выданного материала.')
  }
  const returnById = new Map(
    workflow.customerReturns?.map((item) => [item.id, item]),
  )
  for (const old of previous?.qualityWorkflow?.customerReturns ?? []) {
    if (!same(old, returnById.get(old.id)))
      fail('Сохранённый фактический возврат нельзя удалить или переписать.')
    const oldReceipt = previousReceipts.get(old.receiptId)
    const currentReceipt = receipts.get(old.receiptId)
    for (const key of [
      'actualName',
      'quantity',
      'projectUnit',
      'projectLineId',
      'factoryNumber',
      'heatBatch',
      'requestId',
      'date',
    ]) {
      if (!same(oldReceipt?.[key], currentReceipt?.[key]))
        fail(
          'Материал, партия, дата и количество получения с возвратом защищены от изменения.',
        )
    }
  }
  if (next.materialRequests) {
    const requestIds = new Set(
      next.materialRequests.map((request) => request.id),
    )
    const changedRequests = new Set(
      next.materialReceipts
        .filter((receipt) => !same(receipt, previousReceipts.get(receipt.id)))
        .map((receipt) => receipt.requestId),
    )
    const totals = receivedByRequest(
      next.materialReceipts.map((receipt) => ({
        id: String(receipt.id),
        requestId: String(receipt.requestId),
        quantity: Number(receipt.quantity),
      })),
      workflow,
    )
    for (const request of next.materialRequests) {
      const oldRequest = previousRequests.get(request.id)
      const changed =
        !oldRequest ||
        oldRequest.quantity !== request.quantity ||
        changedRequests.has(request.id)
      if (
        changed &&
        (totals.get(String(request.id)) ?? 0) > Number(request.quantity)
      )
        fail('Поступления за вычетом возвратов превышают количество по заявке.')
    }
    for (const item of workflow.customerReturns ?? []) {
      const receipt = receipts.get(item.receiptId)!
      if (
        previousRequests.has(receipt.requestId) &&
        !requestIds.has(receipt.requestId)
      )
        fail(
          'Нельзя удалить заявку с возвратом заказчику: она связана с историей возврата.',
        )
    }
  }
  // Keep the source batch stable after inspection starts, even while its ZNI is a draft.
  for (const oldCase of previous?.qualityWorkflow?.cases ?? []) {
    if (!caseById.has(oldCase.id)) continue
    for (const row of currentInspection(oldCase).zni.rows) {
      const oldReceipt = previousReceipts.get(row.receiptId)
      const newReceipt = receipts.get(row.receiptId)
      for (const key of [
        'actualName',
        'quantity',
        'projectUnit',
        'projectLineId',
        'factoryNumber',
        'heatBatch',
        'requestId',
      ]) {
        if (!same(oldReceipt?.[key], newReceipt?.[key]))
          fail(
            'Материал, партия и количество получения с оформленной ЗНИ защищены от изменения.',
          )
      }
    }
  }
  validateWorkspaceChronology(next, previous)
  validateIssueAllocation(next, previous)
}

/** Only the effective signed AVK revision contributes to material approvals. */
export function inspectionApprovals(workflow?: QualityWorkflow) {
  return (workflow?.cases ?? []).flatMap((entry) => {
    const revision = activeInspection(entry)
    if (!revision?.avk) return []
    return revision.zni.rows.map((row) => ({
      id: `inspection:${entry.id}:${row.receiptId}`,
      receiptId: row.receiptId,
      projectLineId: row.projectLineId,
      quantity: acceptedAfterInspection(revision, row),
      status: 'signed' as const,
      date: revision.avk!.signedOn!,
      arvkDate: revision.avk!.date,
      arvkNumber: revision.avk!.number,
      zniNumber: revision.zni.number,
      author: revision.zni.details.issuerName,
      comment: row.remarks,
    }))
  })
}
