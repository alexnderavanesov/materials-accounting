import { z } from 'zod'
import {
  documentsForReceipt,
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
  })
  .strict()
const revisionSchema = z
  .object({
    revision: z.number().int().positive(),
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
export const activeInspection = (entry: InspectionCase) =>
  [...entry.revisions].reverse().find((revision) => revision.avk?.signedOn)
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
      zni.signedOn ? 'ЗНИ подписана' : 'ЗНИ в работе',
      avk?.signedOn ? 'АВК подписан' : 'АВК в работе',
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
) {
  return lines.find((line) => {
    const identity =
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
    return identity === projectLineId
  })
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
  const used = new Set(
    workflow.cases.map((item) => currentInspection(item).zni.number),
  )
  let number = 1
  while (used.has(String(number))) number++
  const rows = selection.map(({ receiptId, quantity: presented }) => {
    const receipt = receipts.find((item) => item.id === receiptId)
    if (!receipt) fail('Получение материала не найдено.')
    if (
      !documentsForReceipt(receipt, workflow).some((doc) => doc.id === basis.id)
    )
      fail('Все позиции ЗНИ должны относиться к выбранному АПП или М-15.')
    if (!Number.isFinite(presented) || presented <= 0)
      fail('Укажите положительное количество для инспекции.')
    if (presented > (available.get(receiptId) ?? 0))
      fail('Количество для инспекции превышает доступный остаток поступления.')
    const line = findInspectionMaterial(lines, receipt.projectLineId)
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
        requests.find((request) => request.id === receipt.requestId)?.number ??
        'Заявка удалена',
      appNumber: basis.kind === 'app' ? basis.number : '',
      appDate: basis.kind === 'app' ? basis.date : '',
    }
  })
  return {
    id: crypto.randomUUID(),
    processVersion: 2,
    basis: { ...basis },
    revisions: [
      {
        revision: 1,
        zni: {
          number: String(number),
          date: localToday(),
          inspectionDate: localToday(),
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
function inspectionSourceDocuments(
  receiptIds: Array<string>,
  receipts: Array<Receipt>,
): Array<QualityDocument> {
  const documents: Array<QualityDocument> = []
  for (const receipt of receipts.filter((item) =>
    receiptIds.includes(item.id),
  )) {
    for (const name of [receipt.certificate, receipt.qualityDocument]) {
      if (name?.trim())
        documents.push({
          id: crypto.randomUUID(),
          name: name.trim(),
          number: '',
          date: '',
          orderNumber: '',
        })
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
export function reopenInspection(entry: InspectionCase): InspectionCase {
  const last = currentInspection(entry)
  if (!last.zni.signedOn)
    throw new Error('Текущая ревизия уже находится в работе.')
  // A signed ZNI without an AVK may be superseded, but is still retained in history.
  const next = structuredClone(last)
  next.revision++
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
  act.number =
    entry.revisions.find((item) => item.avk?.number)?.avk?.number ?? ''
  return act
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
export function pendingCustomerReturns(
  workflow: QualityWorkflow,
  entry: InspectionCase,
) {
  const revision = currentInspection(entry)
  if (!revision.zni.signedOn) return []
  return revision.zni.rows
    .map((row) => ({
      row,
      quantity: Number(
        (
          row.presented -
          (row.accepted ?? 0) -
          (workflow.customerReturns ?? [])
            .filter(
              (item) =>
                item.kind !== 'surplus' &&
                item.caseId === entry.id &&
                item.receiptId === row.receiptId,
            )
            .reduce((sum, item) => sum + item.quantity, 0)
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
  const additions = selection.map((item) => {
    if (
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > (available.get(item.receiptId) ?? 0)
    )
      fail('Количество возврата превышает непринятый остаток ЗНИ.')
    if (returnDate < currentInspection(entry).zni.signedOn!)
      fail('Дата возврата не может быть раньше подписания ЗНИ.')
    return customerReturnSchema.parse({
      id: crypto.randomUUID(),
      kind: 'rejected',
      caseId,
      revision: currentInspection(entry).revision,
      receiptId: item.receiptId,
      quantity: item.quantity,
      date: returnDate,
      documentNumber,
      note,
    })
  })
  return {
    ...workflow,
    customerReturns: [...(workflow.customerReturns ?? []), ...additions],
  }
}
const precise = (value: number) => Number(value.toPrecision(15))
export type ReturnReceipt = { id: string; quantity: number; date?: string }
export type ReturnIssue = { receiptId: string; quantity: number }
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
  for (const item of workflow?.customerReturns ?? []) {
    if (item.kind !== 'surplus' || item.source !== 'accepted') continue
    const entry = workflow?.cases.find((value) => value.id === item.caseId)
    if (entry && activeInspection(entry)?.revision === item.revision)
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
          revision: revision.revision,
          quantity: row.accepted ?? 0,
          approved: !!revision.avk?.signedOn,
          availableOn: [dates.get(row.receiptId) ?? '', revision.zni.signedOn]
            .sort()
            .at(-1)!,
        })
    }
  }
  for (const receipt of receipts)
    sources.unshift({
      receiptId: receipt.id,
      source: 'uninspected',
      quantity: Math.max(0, free.get(receipt.id) ?? 0),
      approved: false,
      availableOn: receipt.date ?? '',
    })
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
      precise((approved.get(issue.receiptId) ?? 0) - issue.quantity),
    )
  return sources
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
    next.avk.signedOn = signedOn
  }
  validateRevision(next)
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
  const workflow = next.qualityWorkflow
  unique(
    next.materialReceipts.map((receipt) => String(receipt.id)),
    'ID поступлений',
  )
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
      currentInspection(entry).avk?.number.trim()
        ? [currentInspection(entry).avk!.number.trim()]
        : [],
    ),
    'номера АВК',
  )
  const receipts = new Map(
    next.materialReceipts.map((receipt) => [receipt.id, receipt]),
  )
  const documents = receiptDocuments(workflow)
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
        !documents.some((doc) => doc.id === receipt[field] && doc.kind === kind)
      )
        fail('Документ поступления не найден или имеет неверный тип.')
    }
  }
  for (const old of previous?.qualityWorkflow?.receiptDocuments ?? []) {
    const current = documents.find((doc) => doc.id === old.id)
    const linked =
      next.materialReceipts.some(
        (receipt) =>
          receipt.appDocumentId === old.id || receipt.m15DocumentId === old.id,
      ) || workflow.cases.some((entry) => entry.basis.id === old.id)
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
      (issuedByReceipt.get(receiptId) ?? 0) + amount,
    )
  }
  const reservedByReceipt = new Map<string, number>()
  const acceptedByReceipt = new Map<string, number>()
  for (const entry of workflow.cases) {
    if (!documents.some((doc) => same(doc, entry.basis)))
      fail('Проверьте основание ЗНИ: выберите АПП или М-15.')
    const firstRows = entry.revisions[0]!.zni.rows
    for (const [index, revision] of entry.revisions.entries()) {
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
      const numberedAct = entry.revisions.find(
        (item) => item.avk?.signedOn,
      )?.avk
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
          firstRows.map((row) => [row.receiptId, row.presented]).sort(),
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
          (acceptedByReceipt.get(row.receiptId) ?? 0) + (row.accepted ?? 0),
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
  for (const [receiptId, issued] of issuedByReceipt) {
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
    const current = workflow.cases.find((entry) => entry.id === old.id)
    const signed = old.revisions.some((revision) => revision.zni.signedOn)
    if (signed && !current)
      fail('Подписанные документы удалять нельзя. Используйте новую ревизию.')
    if (!current) continue
    if (
      !same(current.basis, old.basis) ||
      current.revisions.length < old.revisions.length
    )
      fail('Нельзя менять основание или удалять историю ЗНИ.')
    for (const [index, revision] of old.revisions.entries()) {
      const updated = current.revisions[index]!
      if (revision.zni.signedOn && !same(revision.zni, updated.zni))
        fail('Подписанную ЗНИ можно изменить только в новой ревизии.')
      if (
        (revision.avk?.signedOn || index < current.revisions.length - 1) &&
        !same(revision, updated)
      )
        fail('Историю ревизий и подписанный АВК изменять нельзя.')
    }
  }
  unique(
    (workflow.customerReturns ?? []).map((item) => item.id),
    'ID возвратов',
  )
  const returnedByCaseReceipt = new Map<string, number>()
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
    const entry = workflow.cases.find((value) => value.id === item.caseId)
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
    if (currentInspection(entry).revision !== item.revision)
      fail(
        'После фактического возврата повторная проверка этой партии недоступна.',
      )
    const key = JSON.stringify([item.caseId, item.receiptId])
    const total = Number(
      ((returnedByCaseReceipt.get(key) ?? 0) + item.quantity).toPrecision(15),
    )
    if (total > Number((row.presented - (row.accepted ?? 0)).toPrecision(15)))
      fail('Суммарный возврат превышает непринятое количество.')
    returnedByCaseReceipt.set(key, total)
  }
  for (const [receiptId, total] of customerReturnTotals(workflow)) {
    if (
      precise(total + (issuedByReceipt.get(receiptId) ?? 0)) >
      Number(receipts.get(receiptId)?.quantity)
    )
      fail('Возврат превышает остаток на складе с учётом выданного материала.')
  }
  for (const old of previous?.qualityWorkflow?.customerReturns ?? []) {
    if (
      !same(
        old,
        workflow.customerReturns?.find((item) => item.id === old.id),
      )
    )
      fail('Сохранённый фактический возврат нельзя удалить или переписать.')
    const oldReceipt = previous!.materialReceipts.find(
      (receipt) => receipt.id === old.receiptId,
    )
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
  if (next.materialRequests && previous) {
    const totals = receivedByRequest(
      next.materialReceipts.map((receipt) => ({
        id: String(receipt.id),
        requestId: String(receipt.requestId),
        quantity: Number(receipt.quantity),
      })),
      workflow,
    )
    for (const request of next.materialRequests) {
      const oldRequest = previous.materialRequests?.find(
        (item) => item.id === request.id,
      )
      const changed =
        (oldRequest && oldRequest.quantity !== request.quantity) ||
        next.materialReceipts.some(
          (receipt) =>
            receipt.requestId === request.id &&
            !same(
              receipt,
              previous.materialReceipts.find((old) => old.id === receipt.id),
            ),
        )
      if (
        changed &&
        (totals.get(String(request.id)) ?? 0) > Number(request.quantity)
      )
        fail('Поступления за вычетом возвратов превышают количество по заявке.')
    }
    for (const item of workflow.customerReturns ?? []) {
      const receipt = receipts.get(item.receiptId)!
      if (
        previous.materialRequests?.some(
          (request) => request.id === receipt.requestId,
        ) &&
        !next.materialRequests.some(
          (request) => request.id === receipt.requestId,
        )
      )
        fail(
          'Нельзя удалить заявку с возвратом заказчику: она связана с историей возврата.',
        )
    }
  }
  // Keep the source batch stable after inspection starts, even while its ZNI is a draft.
  for (const oldCase of previous?.qualityWorkflow?.cases ?? []) {
    if (!workflow.cases.some((entry) => entry.id === oldCase.id)) continue
    for (const row of currentInspection(oldCase).zni.rows) {
      const oldReceipt = previous!.materialReceipts.find(
        (receipt) => receipt.id === row.receiptId,
      )
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
      quantity: row.accepted ?? 0,
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
