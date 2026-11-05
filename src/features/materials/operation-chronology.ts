import { normalizeCalendarDate } from './calendar-date'
import type { InspectionRevision, QualityWorkflow } from './quality-workflow'

type Operation = Record<string, unknown>
export type ChronologyWorkspace = {
  materialRequests?: Array<Operation>
  materialReceipts: Array<Operation>
  materialIssues: Array<Operation>
  qualityWorkflow?: QualityWorkflow
}
type Violation = { key: string; values: Array<unknown>; message: string }
const displayDate = (value: string) => value.split('-').reverse().join('.')
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
      const label = `ЗНИ №${rev.zni.number}, ревизия ${rev.revision}`
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
        `${label}: дата ЗНИ не может быть раньше ${entry.basis.kind === 'app' ? 'АПП' : 'М-15'} №${entry.basis.number}`,
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
      if (previous)
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
  type Event = {
    date: string
    kind: 'approval' | 'return' | 'issue'
    receiptId: string
    quantity: number
    caseId?: string
    issue?: Operation
  }
  const events: Array<Event> = []
  const relevant = new Set(
    workspace.materialIssues.map((item) => String(item.receiptId)),
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
            quantity: row.accepted ?? 0,
          })
      }
    }
  }
  for (const item of workspace.qualityWorkflow?.customerReturns ?? []) {
    if (
      item.kind === 'surplus' &&
      item.source === 'accepted' &&
      relevant.has(item.receiptId)
    )
      events.push({ ...item, kind: 'return' })
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
  }
  const order = { approval: 0, return: 1, issue: 2 }
  events.sort(
    (a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind],
  )
  const approvals = new Map<string, number>()
  const returns = new Map<string, number>()
  const available = new Map<string, number>()
  const violations: Array<Violation> = []
  for (const event of events) {
    const key = JSON.stringify([event.receiptId, event.caseId])
    let balance = available.get(event.receiptId) ?? 0
    if (event.kind === 'approval') {
      const returned = returns.get(key) ?? 0
      balance +=
        Math.max(0, event.quantity - returned) -
        Math.max(0, (approvals.get(key) ?? 0) - returned)
      approvals.set(key, event.quantity)
    } else if (event.kind === 'return') {
      const before = returns.get(key) ?? 0
      const approved = approvals.get(key) ?? 0
      balance +=
        Math.max(0, approved - before - event.quantity) -
        Math.max(0, approved - before)
      returns.set(key, precise(before + event.quantity))
    } else {
      const receipt = receipts.get(event.receiptId)
      const tooEarly = validDate(receipt?.date) && event.date < receipt.date
      if (tooEarly || precise(balance) < precise(event.quantity))
        violations.push({
          key: `issue:${event.issue!.id}:availability`,
          values: [event.date, event.quantity, precise(balance), receipt?.date],
          message: `Выдача «${event.issue!.document || event.issue!.id}»: на ${displayDate(event.date)} для «${receipt?.actualName || 'Материал'}» доступно по подписанным АВК ${Math.max(0, precise(balance))} ${receipt?.projectUnit || ''}. Дата выдачи не может быть раньше получения и подписания АВК на выдаваемое количество.`,
        })
      balance -= event.quantity
    }
    available.set(event.receiptId, precise(balance))
  }
  return violations
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
