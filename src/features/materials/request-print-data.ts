import { z } from 'zod'
import { recalculateRequestAlternatives } from './domain'
import type { WorkspaceSnapshot } from './workspace-snapshot'
import type { PrintData } from './request-print'

const text = z.string().optional().default('')
const requestSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  cipher: text,
  requester: text,
  projectLineId: z.string(),
  projectMaterialName: text,
  projectUnit: z.string(),
  quantity: z.number().finite().positive(),
  note: text,
  altQuantity: z.number().finite().nullable().optional().default(null),
  altUnit: text,
  altUnitFactor: z.number().finite().nullable().optional(),
})
const lineSchema = z.object({
  id: z.string().optional(),
  unit: z.string(),
  material: text,
  materialType: z.string().nullable().optional(),
  category: text,
  projectMaterialName: z.string().nullable().optional(),
  materialId: z.string().nullable().optional(),
  normativeDocument: z.string().nullable().optional(),
  unitWeight: z.number().nullable().optional(),
  alternativeUnit: z.string().nullable().optional(),
  alternativeUnitFactor: z.number().nullable().optional(),
})

export function buildRequestPrintData(
  workspace: WorkspaceSnapshot,
  entryId: string,
): PrintData {
  const selected = workspace.materialRequests.find(
    (entry) => entry.id === entryId,
  )
  if (!selected) throw new Error('Заявка не найдена. Обновите страницу.')
  const result = z
    .array(requestSchema)
    .safeParse(
      workspace.materialRequests.filter(
        (entry) => entry.number === selected.number,
      ),
    )
  if (!result.success)
    throw new Error(
      'В заявке некорректные данные. Проверьте реквизиты и количества.',
    )
  const lines = workspace.lines.map((raw) => lineSchema.parse(raw))
  const lineById = new Map(
    lines.map((line) => [
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
          .toLocaleLowerCase('ru'),
      line,
    ]),
  )
  const requests = recalculateRequestAlternatives(result.data, lines)
  const first = requests[0]!
  const unique = (values: Array<string>) =>
    [...new Set(values.filter(Boolean))].join(', ')
  return {
    headers: {
      number: first.number,
      date: /^\d{4}-\d{2}-\d{2}$/.test(first.date)
        ? first.date.split('-').reverse().join('.')
        : first.date,
      requester: requests.find((entry) => entry.requester)?.requester ?? '',
      cipher: unique(requests.map((entry) => entry.cipher)),
      materialType: unique(
        requests.map((entry) => {
          const line = lineById.get(entry.projectLineId)
          return line?.materialType ?? line?.category ?? 'Материалы'
        }),
      ),
    },
    rows: requests.map((entry, index) => {
      const line = lineById.get(entry.projectLineId)
      return {
        index: index + 1,
        name: entry.projectMaterialName || line?.projectMaterialName || '',
        document: line?.normativeDocument ?? '',
        alloy: line?.material ?? '',
        unit: entry.projectUnit,
        quantity: entry.quantity,
        altUnit: entry.altUnit,
        altQuantity: entry.altQuantity,
        cipher: entry.cipher,
        note: entry.note,
      }
    }),
  }
}
