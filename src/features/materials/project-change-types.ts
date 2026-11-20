import { z } from 'zod'
import { normalizeCalendarDate } from './calendar-date'

const id = z.string().min(1).max(500)
const date = z
  .string()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      normalizeCalendarDate(value) === value,
    'Укажите корректную дату.',
  )
const quantity = z.number().finite().nonnegative()
export const projectPositionSchema = z
  .object({
    id,
    project: z.string(),
    cipher: z.string().min(1),
    category: z.string(),
    projectMaterialName: z.string().min(1),
    materialId: z.string().nullable().optional(),
    materialType: z.string().nullable().optional(),
    normativeDocument: z.string().nullable().optional(),
    material: z.string(),
    unit: z.string().min(1),
    plannedQuantity: quantity,
    unitWeight: quantity.nullable().optional(),
    alternativeUnit: z.string().nullable().optional(),
    alternativeUnitFactor: z.number().finite().positive().nullable().optional(),
  })
  .strict()
export type ProjectPosition = z.infer<typeof projectPositionSchema>
export const projectChangeSchema = z
  .object({
    id,
    project: z.string(),
    cipher: z.string().min(1),
    kind: z.enum(['baseline', 'revision', 'correction']),
    number: z.string(),
    date,
    author: z.string().min(1),
    reason: z.string().trim().min(1),
    previousId: id.nullable(),
    items: z.array(
      z
        .object({
          id,
          before: projectPositionSchema.nullable(),
          after: projectPositionSchema,
          replacesLineId: id.optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .refine(
    (value) => value.kind === 'baseline' || value.items.length > 0,
    'Изменение должно содержать позиции.',
  )
export type ProjectChange = z.infer<typeof projectChangeSchema>
export const requestCancellationSchema = z
  .object({
    id,
    quantity: quantity.positive(),
    date,
    basisId: id,
    basisKind: z.enum(['project-change', 'transfer']),
  })
  .strict()
export type RequestCancellation = z.infer<typeof requestCancellationSchema>
export const stockTransferSchema = z
  .object({
    sequence: z.number().int().positive(),
    id,
    receiptId: id,
    fromProjectLineId: id,
    toProjectLineId: id,
    quantity: quantity.positive(),
    date,
    projectChangeId: id,
    author: z.string().min(1),
    note: z.string(),
  })
  .strict()
export type StockTransfer = z.infer<typeof stockTransferSchema>
export type ProjectAccounting = {
  projectChanges?: ProjectChange[]
  stockTransfers?: StockTransfer[]
}
export type CancellableRequest = {
  quantity: number
  projectCancellations?: RequestCancellation[]
}
export const preciseProjectQuantity = (value: number) =>
  Number(value.toPrecision(15))
export function cancelledRequestQuantity(request: CancellableRequest) {
  return preciseProjectQuantity(
    (request.projectCancellations ?? []).reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
  )
}
export function effectiveRequestQuantity(request: CancellableRequest) {
  return Math.max(
    0,
    preciseProjectQuantity(
      request.quantity - cancelledRequestQuantity(request),
    ),
  )
}
export const stockAssignmentKey = (receiptId: string, projectLineId: string) =>
  JSON.stringify([receiptId, projectLineId])

/** Storage order is a presentation concern; revision ancestry is authoritative. */
export function orderProjectChanges(changes: ProjectChange[]) {
  const children = new Map<string, ProjectChange[]>()
  const ids = new Set(changes.map((change) => change.id))
  const roots: ProjectChange[] = []
  for (const change of changes) {
    if (!change.previousId || !ids.has(change.previousId)) roots.push(change)
    else {
      const list = children.get(change.previousId) ?? []
      list.push(change)
      children.set(change.previousId, list)
    }
  }
  const ordered: ProjectChange[] = [],
    visited = new Set<string>()
  const pending = [...roots].reverse()
  while (pending.length) {
    const item = pending.pop()!
    if (visited.has(item.id)) continue
    visited.add(item.id)
    ordered.push(item)
    pending.push(...(children.get(item.id) ?? []).slice().reverse())
  }
  return ordered.length === changes.length ? ordered : changes
}
