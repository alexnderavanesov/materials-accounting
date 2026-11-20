import { formatCalendarDate, normalizeCalendarDate } from './calendar-date'
import type { StockTransfer } from './project-change-types'
import type { SiteReturn } from './material-issues'
import { receiptDocumentNumberLabel } from './receipt-documents'
import { documentNumberLabel } from './document-number'
import type { InspectionRevision, QualityWorkflow } from './quality-workflow'
import { acceptedAfterInspection } from './quality-workflow'

type Operation = Record<string, unknown>
export type ChronologyWorkspace = {
  stockTransfers?: StockTransfer[]
  materialRequests?: Array<Operation>
  materialReceipts: Array<Operation>
  materialIssues: Array<Operation>
  qualityWorkflow?: QualityWorkflow
}
type Violation = { key: string; values: Array<unknown>; message: string }
const displayDate = (value: string) => formatCalendarDate(value)
const validDate = (value: unknown): value is string =>
  typeof value === 'string' && !!value && normalizeCalendarDate(value) === value
const precise = (value: number) => Number(value.toPrecision(15))

function orderError(later: unknown, earlier: unknown, label: string) {
  return validDate(later) && validDate(earlier) && later < earlier
    ? `${label}: ${displayDate(later)} раньше ${displayDate(earlier)}.`
    : ''
}

export function receiptChronologyError(
  request: { date?: unknown; number?: unknown },
  receiptDate: string,
) {
  return orderError(
    normalizeCalendarDate(receiptDate),
    request.date,
    `Дата получения не может быть раньше даты заявки${request.number ? ` «${String(request.number)}»` : ''}`,
  )
}

function revisionViolations(rev: InspectionRevision): Array<Violation> {
  const violations: Array<Violation> = []
  const check = (
    key: string,
    later: unknown,
    earlier: unknown,
    label: string,
  ) => {
    const message = orderError(later, earlier, label)
    if (message) violations.push({ key, values: [later, earlier], message })
  }
  check(
    'inspection',
    rev.zni.inspectionDate,
    rev.zni.date,
    'Дата инспекции не может быть раньше даты ЗНИ',
  )
  check(
    'zni-sign',
    rev.zni.signedOn,
    rev.zni.date,
    'Дата подписания ЗНИ не может быть раньше даты ЗНИ',
  )
  check(
    'inspection-sign',
    rev.zni.signedOn,
    rev.zni.inspectionDate,
    'Дата подписания ЗНИ не может быть раньше даты инспекции',
  )
  check(
    'avk',
    rev.avk?.date,
    rev.zni.signedOn,
    'Дата АВК не может быть раньше подписания ЗНИ',
  )
  check(
    'avk-zni',
    rev.avk?.date,
    rev.zni.date,
    'Дата АВК не может быть раньше даты ЗНИ',
  )
  check(
    'avk-inspection',
    rev.avk?.date,
    rev.zni.inspectionDate,
    'Дата АВК не может быть раньше даты инспекции',
  )
  check(
    'avk-sign',
    rev.avk?.signedOn,
    rev.avk?.date,
    'Дата подписания АВК не может быть раньше даты АВК',
  )
  check(
    'avk-zni-sign',
    rev.avk?.signedOn,
    rev.zni.signedOn,
    'Дата подписания АВК не может быть раньше подписания ЗНИ',
  )
  return violations
}

export function validateInspectionChronology(revision: InspectionRevision) {
  const violation = revisionViolations(revision)[0]
  if (violation) throw new Error(violation.message)
}

/** Calendar-day constraints shared by forms, imports and atomic server saves. */
export function workspaceChronologyViolations(workspace: ChronologyWorkspace) {
  const violations: Array<Violation> = []
  const requests = new Map(
    workspace.materialRequests?.map((item) => [item.id, item]),
  )
  const receipts = new Map(
    workspace.materialReceipts.map((item) => [item.id, item]),
  )
  const cases = new Map(
    workspace.qualityWorkflow?.cases.map((item) => [item.id, item]),
  )
  const check = (
    key: string,
    later: unknown,
    earlier: unknown,
    label: string,
  ) => {
    const message = orderError(later, earlier, label)
    if (message) violations.push({ key, values: [later, earlier], message })
  }
  for (const [kind, label, records] of [
    ['request', 'заявки', workspace.materialRequests ?? []],
    ['receipt', 'получения', workspace.materialReceipts],
    ['issue', 'выдачи', workspace.materialIssues],
  ] as const) {
    for (const item of records) {
      if (!validDate(item.date))
        violations.push({
          key: `${kind}:${item.id}:date`,
          values: [item.date],
          message: `Укажите корректную дату ${label}${item.number || item.document ? ` «${item.number || item.document}»` : ''}.`,
        })
    }
  }
  for (const receipt of workspace.materialReceipts) {
    const request = requests.get(receipt.requestId)
    if (request)
      check(
        `receipt:${receipt.id}:request:${request.id}`,
        receipt.date,
        request.date,
        `Получение «${receipt.actualName || 'Материал'}» не может быть раньше заявки «${request.number || request.id}»`,
      )
  }
  for (const entry of cases.values()) {
    for (const [index, rev] of entry.revisions.entries()) {
      const prefix = `case:${entry.id}:${rev.revision}`
      const label = `${documentNumberLabel('ЗНИ', rev.zni.number)}, ревизия ${rev.revision}`
      violations.push(
        ...revisionViolations(rev).map((item) => ({
          ...item,
          key: `${prefix}:${item.key}`,
          message: `${label}. ${item.message}`,
        })),
      )
      check(
        `${prefix}:basis`,
        rev.zni.date,
        entry.basis.date,
        `${label}: дата ЗНИ не может быть раньше ${receiptDocumentNumberLabel(entry.basis)}`,
      )
      for (const [stage, date] of [
        ['инспекция', rev.zni.inspectionDate],
        ['подписание ЗНИ', rev.zni.signedOn],
        ['АВК', rev.avk?.date],
        ['подписание АВК', rev.avk?.signedOn],
      ] as const)
        check(
          `${prefix}:${stage}:basis`,
          date,
          entry.basis.date,
          `${label}: ${stage} не может быть раньше документа-основания`,
        )
      const previous = entry.revisions[index - 1]
      if (previous && rev.kind !== 'avk-correction')
        check(
          `${prefix}:previous`,
          rev.zni.inspectionDate,
          previous.avk?.signedOn ?? previous.zni.signedOn,
          `${label}: повторная инспекция не может быть раньше подписания предыдущей ревизии`,
        )
      for (const row of rev.zni.rows) {
        const receipt = receipts.get(row.receiptId)
        const request = requests.get(receipt?.requestId)
        // Check ancestors explicitly: unchanged old errors must not authorize a new backdated stage.
        for (const [stage, date] of [
          ['ЗНИ', rev.zni.date],
          ['инспекция', rev.zni.inspectionDate],
          ['подписание ЗНИ', rev.zni.signedOn],
          ['АВК', rev.avk?.date],
          ['подписание АВК', rev.avk?.signedOn],
        ] as const) {
          check(
            `${prefix}:${stage}:receipt:${row.receiptId}`,
            date,
            receipt?.date,
            `${label}: ${stage} не может быть раньше получения «${row.name}»`,
          )
          check(
            `${prefix}:${stage}:request:${request?.id}`,
            date,
            request?.date,
            `${label}: ${stage} не может быть раньше заявки «${request?.number || request?.id}»`,
          )
        }
      }
    }
  }
  for (const item of workspace.qualityWorkflow?.customerReturns ?? []) {
    const receipt = receipts.get(item.receiptId)
    check(
      `return:${item.id}:receipt`,
      item.date,
      receipt?.date,
      'Дата возврата не может быть раньше получения',
    )
    check(
      `return:${item.id}:request`,
      item.date,
      requests.get(receipt?.requestId)?.date,
      'Дата возврата не может быть раньше заявки',
    )
    if (item.caseId) {
      const entry = cases.get(item.caseId)
      const rev = entry?.revisions.find(
        (candidate) => candidate.revision === item.revision,
      )
      for (const [stage, date] of [
        ['подписания ЗНИ', rev?.zni.signedOn],
        ['инспекции', rev?.zni.inspectionDate],
        ['ЗНИ', rev?.zni.date],
        ['документа-основания ЗНИ', entry?.basis.date],
      ] as const)
        check(
          `return:${item.id}:${stage}`,
          item.date,
          date,
          `Дата возврата не может быть раньше ${stage}`,
        )
    }
  }
  violations.push(...issueChronologyViolations(workspace))
  return violations
}

/** Revisions replace approvals; a later AVK must not retroactively authorize an issue. */
function issueChronologyViolations(
  workspace: ChronologyWorkspace,
): Array<Violation> {
  return issueLedger(workspace).violations
}

/** Uses the same dated ledger as validation, including partial approvals and site returns. */
export function issueStockOnDate(workspace: ChronologyWorkspace, date: string) {
  return issueLedger(workspace, date).stock
}

function issueLedger(workspace: ChronologyWorkspace, throughDate?: string) {
  type Event = {
    date: string
    kind:
      | 'approval'
      | 'return'
      | 'issue'
      | 'siteReturn'
      | 'quarantineReturn'
      | 'rejectedReturn'
      | 'uninspectedReturn'
    receiptId: string
    quantity: number
    caseId?: string
    issue?: Operation
  }
  const events: Array<Event> = []
  const relevant = new Set(
    throughDate
      ? workspace.materialReceipts.map((item) => String(item.id))
      : workspace.materialIssues.map((item) => String(item.receiptId)),
  )
  const receipts = new Map(
    workspace.materialReceipts.map((item) => [String(item.id), item]),
  )
  const requests = new Map(
    workspace.materialRequests?.map((item) => [item.id, item]),
  )
  for (const entry of workspace.qualityWorkflow?.cases ?? []) {
    for (const rev of entry.revisions) {
      if (!rev.avk?.signedOn) continue
      for (const row of rev.zni.rows) {
        const receipt = receipts.get(row.receiptId)
        if (relevant.has(row.receiptId))
          events.push({
            date: [
              rev.avk.signedOn,
              rev.avk.date,
              rev.zni.signedOn,
              rev.zni.inspectionDate,
              rev.zni.date,
              entry.basis.date,
              receipt?.date,
              requests.get(receipt?.requestId)?.date,
            ]
              .filter(validDate)
              .sort()
              .at(-1)!,
            kind: 'approval',
            receiptId: row.receiptId,
            caseId: entry.id,
            quantity: acceptedAfterInspection(rev, row),
          })
      }
    }
  }
  for (const item of workspace.qualityWorkflow?.customerReturns ?? []) {
    if (relevant.has(item.receiptId))
      events.push({
        ...item,
        kind:
          item.kind === 'rejected'
            ? 'rejectedReturn'
            : item.source === 'accepted'
              ? 'return'
              : 'uninspectedReturn',
      })
  }
  for (const issue of workspace.materialIssues) {
    if (validDate(issue.date))
      events.push({
        date: issue.date,
        kind: 'issue',
        receiptId: String(issue.receiptId),
        quantity: Number(issue.quantity),
        issue,
      })
    for (const item of (issue.siteReturns ?? []) as SiteReturn[])
      events.push({
        date: item.date,
        kind: item.condition === 'good' ? 'siteReturn' : 'quarantineReturn',
        receiptId: String(issue.receiptId),
        quantity: item.quantity,
      })
  }
  const order = {
    approval: 0,
    siteReturn: 2,
    quarantineReturn: 2,
    return: 3,
    rejectedReturn: 3,
    uninspectedReturn: 3,
    issue: 4,
  }
  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      order[a.kind] - order[b.kind] ||
      Number(!!a.issue?.beforeInspection) - Number(!!b.issue?.beforeInspection),
  )
  const approvals = new Map<string, number>()
  const returns = new Map<string, number>()
  const available = new Map<string, number>()
  const approvedCapacity = new Map<string, number>()
  const physical = new Map(
    [...receipts].map(([id, receipt]) => [id, Number(receipt.quantity)]),
  )
  const quarantine = new Map<string, number>()
  const violations: Array<Violation> = []
  for (const event of events) {
    if (throughDate && event.date > throughDate) break
    const key = JSON.stringify([event.receiptId, event.caseId])
    let balance = available.get(event.receiptId) ?? 0
    if (event.kind === 'approval') {
      const returned = returns.get(key) ?? 0
      const change =
        Math.max(0, event.quantity - returned) -
        Math.max(0, (approvals.get(key) ?? 0) - returned)
      balance += change
      approvedCapacity.set(
        event.receiptId,
        precise((approvedCapacity.get(event.receiptId) ?? 0) + change),
      )
      approvals.set(key, event.quantity)
    } else if (
      event.kind === 'siteReturn' ||
      event.kind === 'quarantineReturn'
    ) {
      physical.set(
        event.receiptId,
        precise((physical.get(event.receiptId) ?? 0) + event.quantity),
      )
      if (event.kind === 'siteReturn') balance += event.quantity
      else
        quarantine.set(
          event.receiptId,
          precise((quarantine.get(event.receiptId) ?? 0) + event.quantity),
        )
    } else if (
      event.kind === 'rejectedReturn' ||
      event.kind === 'uninspectedReturn'
    ) {
      physical.set(
        event.receiptId,
        precise((physical.get(event.receiptId) ?? 0) - event.quantity),
      )
    } else if (event.kind === 'return') {
      physical.set(
        event.receiptId,
        precise((physical.get(event.receiptId) ?? 0) - event.quantity),
      )
      const before = returns.get(key) ?? 0
      const approved = approvals.get(key) ?? 0
      const change =
        Math.max(0, approved - before - event.quantity) -
        Math.max(0, approved - before)
      balance += change
      approvedCapacity.set(
        event.receiptId,
        precise((approvedCapacity.get(event.receiptId) ?? 0) + change),
      )
      returns.set(key, precise(before + event.quantity))
    } else {
      const receipt = receipts.get(event.receiptId)
      const tooEarly = validDate(receipt?.date) && event.date < receipt.date
      const early = !!event.issue?.beforeInspection
      const capacity = early
        ? Math.max(
            0,
            precise(
              (physical.get(event.receiptId) ?? 0) -
                (quarantine.get(event.receiptId) ?? 0),
            ),
          )
        : Math.min(precise(balance), approvedCapacity.get(event.receiptId) ?? 0)
      if (tooEarly || capacity < precise(event.quantity))
        violations.push({
          key: `issue:${event.issue!.id}:availability`,
          values: [
            event.date,
            event.quantity,
            capacity,
            receipt?.date,
            ...(early ? [true] : []),
          ],
          message: early
            ? `Выдача до ВК: на ${displayDate(event.date)} доступно ${capacity} ${receipt?.projectUnit || ''}. Нельзя выдавать до получения, сверх остатка или непринятый материал.`
            : `Выдача «${event.issue!.document || event.issue!.id}»: на ${displayDate(event.date)} для «${receipt?.actualName || 'Материал'}» доступно по подписанным АВК ${Math.max(0, precise(balance))} ${receipt?.projectUnit || ''}. Дата выдачи не может быть раньше получения и подписания АВК на выдаваемое количество.`,
        })
      balance -= event.quantity
      physical.set(
        event.receiptId,
        precise((physical.get(event.receiptId) ?? 0) - event.quantity),
      )
    }
    available.set(event.receiptId, precise(balance))
  }
  const stock = new Map(
    [...receipts].map(([id, receipt]) => {
      const received =
        !throughDate || (validDate(receipt.date) && receipt.date <= throughDate)
      const free = received
        ? Math.max(
            0,
            precise((physical.get(id) ?? 0) - (quarantine.get(id) ?? 0)),
          )
        : 0
      return [
        id,
        {
          physical: free,
          approved: Math.max(
            0,
            Math.min(
              free,
              available.get(id) ?? 0,
              approvedCapacity.get(id) ?? 0,
            ),
          ),
        },
      ]
    }),
  )
  return { violations, stock }
}

export function validateWorkspaceChronology(
  next: ChronologyWorkspace,
  previous?: ChronologyWorkspace | null,
) {
  const violations = workspaceChronologyViolations(next)
  if (!violations.length) return
  // Do not rewrite or freeze signed history created before this validation existed.
  // An unchanged violation is tolerated; new/changed dates or dependencies are checked.
  const signature = (item: Violation) => JSON.stringify([item.key, item.values])
  const existing = new Set(
    previous ? workspaceChronologyViolations(previous).map(signature) : [],
  )
  const violation = violations.find((item) => !existing.has(signature(item)))
  if (violation) throw new Error(violation.message)
}
