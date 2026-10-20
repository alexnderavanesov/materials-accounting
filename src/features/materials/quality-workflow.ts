import { z } from 'zod'

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
const appSchema = z
  .object({
    id,
    number: text,
    date,
    receiptIds: z.array(id).min(1),
    documents: z.array(qualityDocumentSchema),
  })
  .strict()
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
  .object({ id, appId: id, revisions: z.array(revisionSchema).min(1) })
  .strict()
export const qualityWorkflowSchema = z
  .object({
    version: z.literal(1),
    defaults: qualityDefaultsSchema,
    apps: z.array(appSchema),
    cases: z.array(caseSchema),
  })
  .strict()
export type QualityWorkflow = z.infer<typeof qualityWorkflowSchema>
export type QualityDefaults = z.infer<typeof qualityDefaultsSchema>
export type TransferAct = z.infer<typeof appSchema>
export type InspectionCase = z.infer<typeof caseSchema>
export type InspectionRevision = z.infer<typeof revisionSchema>
export type InspectionRow = z.infer<typeof rowSchema>
export type InspectionAct = z.infer<typeof avkSchema>
export type QualityDocument = z.infer<typeof qualityDocumentSchema>
export const emptyQualityWorkflow = (): QualityWorkflow => ({
  version: 1,
  defaults: { ...emptyQualityDefaults },
  apps: [],
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

export function inspectionMatches(
  entry: InspectionCase,
  app: TransferAct | undefined,
  search: string,
) {
  const query = search.trim().toLocaleLowerCase('ru')
  if (!query) return true
  const values = [
    app?.number,
    app?.date,
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
      ...zni.rows.flatMap((row) => [
        row.name,
        row.cipher,
        row.factoryNumber,
        row.heatBatch,
        row.document,
        row.alloy,
        row.remarks,
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
  projectLineId: string
  requestId: string
  quantity: number
  projectUnit: string
  actualName: string
  factoryNumber: string
  heatBatch: string
  altUnit: string
  altUnitFactor?: number | null
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
export function newInspection(
  workflow: QualityWorkflow,
  appId: string,
  receipts: Array<Receipt>,
  lines: Array<Line>,
): InspectionCase {
  const app = workflow.apps.find((item) => item.id === appId)
  if (!app || !app.number.trim())
    throw new Error('Сначала оформите АПП с номером и датой.')
  if (workflow.cases.some((item) => item.appId === appId))
    throw new Error('Для этого АПП уже существует ЗНИ.')
  const used = new Set(
    workflow.cases.map((item) => currentInspection(item).zni.number),
  )
  let number = 1
  while (used.has(String(number))) number++
  const rows = app.receiptIds.map((receiptId) => {
    const receipt = receipts.find((item) => item.id === receiptId)
    if (!receipt) throw new Error('Получение из АПП не найдено.')
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
      presented: receipt.quantity,
      accepted: null,
      result: '' as const,
      remarks: '',
      altUnit: receipt.altUnit,
      altUnitFactor: receipt.altUnitFactor ?? null,
    }
  })
  return {
    id: crypto.randomUUID(),
    appId,
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
        },
        avk: null,
      },
    ],
  }
}
export function newInspectionAct(app: TransferAct): InspectionAct {
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
    documents: structuredClone(app.documents),
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
  if (next.avk) next.avk.signedOn = null
  return { ...entry, revisions: [...entry.revisions, next] }
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
  qualityControls: Array<Record<string, unknown>>
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function validateQualityWorkspace(
  next: WorkspaceLike,
  previous?: WorkspaceLike | null,
) {
  const workflow = next.qualityWorkflow
  if (!workflow) {
    if (previous?.qualityWorkflow)
      fail('Нельзя удалить весь учёт АПП, ЗНИ и АВК устаревшей вкладкой.')
    return
  }
  if (!qualityWorkflowSchema.safeParse(workflow).success)
    fail(
      'Проверьте реквизиты: выберите хотя бы одно получение, укажите корректные даты и неотрицательные количества.',
    )
  unique(
    workflow.apps.map((app) => app.id),
    'ID АПП',
  )
  unique(
    workflow.cases.map((entry) => entry.id),
    'ID ЗНИ',
  )
  unique(
    workflow.cases.map((entry) => entry.appId),
    'ЗНИ для одного АПП',
  )
  unique(
    workflow.apps.flatMap((app) => app.receiptIds),
    'получения в АПП',
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
  const linkedReceipts = new Set(workflow.apps.flatMap((app) => app.receiptIds))
  const issuedByReceipt = new Map<string, number>()
  for (const issue of next.materialIssues) {
    const receiptId = String(issue.receiptId)
    if (!linkedReceipts.has(receiptId)) continue
    const amount = Number(issue.quantity)
    if (!Number.isFinite(amount) || amount <= 0)
      fail('Укажите положительное количество выдачи.')
    issuedByReceipt.set(
      receiptId,
      (issuedByReceipt.get(receiptId) ?? 0) + amount,
    )
  }
  for (const app of workflow.apps) {
    if (!app.number.trim()) fail('Укажите номер АПП.')
    if (
      !workflow.cases.some((entry) => entry.appId === app.id) &&
      app.receiptIds.some((receiptId) => issuedByReceipt.has(receiptId))
    )
      fail(
        'Получение с существующими выдачами нельзя включить в новый АПП без переноса прежнего входного контроля.',
      )
    for (const receiptId of app.receiptIds) {
      if (!receipts.has(receiptId))
        fail('Нельзя удалить получение, связанное с АПП. Сначала измените АПП.')
      if (
        next.qualityControls.some((control) => control.receiptId === receiptId)
      )
        fail(
          'Получение уже участвует в прежнем входном контроле. Автоматическое объединение не поддерживается.',
        )
    }
  }
  for (const entry of workflow.cases) {
    const app = workflow.apps.find((item) => item.id === entry.appId)
    if (!app) fail('ЗНИ должна ссылаться на существующий АПП.')
    for (const [index, revision] of entry.revisions.entries()) {
      if (revision.revision !== index + 1)
        fail('Нарушена последовательность ревизий ЗНИ.')
      if (index < entry.revisions.length - 1 && !revision.zni.signedOn)
        fail('Нельзя архивировать неподписанную ревизию ЗНИ.')
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
          [...revision.zni.rows.map((row) => row.receiptId)].sort(),
          [...app.receiptIds].sort(),
        )
      )
        fail('ЗНИ должна включать все позиции одного АПП.')
      for (const row of revision.zni.rows) {
        const receipt = receipts.get(row.receiptId)!
        if (
          row.presented !== receipt.quantity ||
          row.projectLineId !== receipt.projectLineId ||
          row.unit !== receipt.projectUnit
        )
          fail(
            'Предъявленное количество и единица должны соответствовать получению.',
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
    const effective = activeInspection(entry)
    for (const receiptId of app.receiptIds) {
      const accepted =
        effective?.zni.rows.find((row) => row.receiptId === receiptId)
          ?.accepted ?? 0
      const issued = issuedByReceipt.get(receiptId) ?? 0
      if (Number(issued.toPrecision(15)) > accepted)
        fail(
          'Принятое количество по действующему АВК не может быть меньше уже выданного в монтаж.',
        )
    }
  }
  for (const old of previous?.qualityWorkflow?.cases ?? []) {
    const current = workflow.cases.find((entry) => entry.id === old.id)
    const signed = old.revisions.some((revision) => revision.zni.signedOn)
    if (signed && !current)
      fail('Подписанные документы удалять нельзя. Используйте новую ревизию.')
    if (!current) continue
    if (
      current.appId !== old.appId ||
      current.revisions.length < old.revisions.length
    )
      fail('Нельзя менять АПП или удалять историю ЗНИ.')
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
    const oldApp = previous!.qualityWorkflow!.apps.find(
      (app) => app.id === old.appId,
    )
    if (
      !same(
        oldApp,
        workflow.apps.find((app) => app.id === old.appId),
      )
    )
      fail('АПП с оформленной ЗНИ изменять нельзя.')
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

/** Compatibility projection for existing balances. Only ONE effective AVK revision contributes. */
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
