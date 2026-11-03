import { receiptIndicatorLabels } from './operation-overview-indicators'
import type { receiptBalances } from './receipt-balances'

export type ReceiptSort = keyof typeof receiptIndicatorLabels | ''
export type OperationListView = {
  cipher: string
  materialType: string
  sort: ReceiptSort
}
export type OperationMaterial = { cipher: string; materialType: string }
export type ReceiptPriority = { key: ReceiptSort; ids: ReadonlySet<string> }
export const emptyOperationListView: OperationListView = {
  cipher: '',
  materialType: '',
  sort: '',
}
export const emptyReceiptPriority: ReceiptPriority = { key: '', ids: new Set() }

export function isOperationListViews(
  value: unknown,
): value is Record<string, OperationListView> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([tab, item]) =>
        ['requests', 'receipts', 'quality', 'issues', 'returns'].includes(
          tab,
        ) &&
        item &&
        typeof item === 'object' &&
        typeof item.cipher === 'string' &&
        typeof item.materialType === 'string' &&
        typeof item.sort === 'string' &&
        (item.sort === '' || Object.hasOwn(receiptIndicatorLabels, item.sort)),
    )
  )
}

export function operationMaterial(
  line?: { cipher?: string; materialType?: string | null; category?: string },
  snapshot?: { cipher?: string; materialType?: string },
): OperationMaterial {
  return {
    cipher: snapshot?.cipher || line?.cipher || '',
    materialType:
      snapshot?.materialType || line?.materialType || line?.category || '',
  }
}

export function normalizeOperationSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/×/g, 'x')
    .replace(/х/g, 'x')
    .replace(/ё/g, 'е')
    .replace(/[.,;:()[\]{}"']/g, ' ')
    .replace(/[-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
}
export function matchesOperationMaterial(
  material: OperationMaterial,
  view: OperationListView,
) {
  return (
    normalizeOperationSearch(material.cipher).includes(
      normalizeOperationSearch(view.cipher),
    ) &&
    normalizeOperationSearch(material.materialType).includes(
      normalizeOperationSearch(view.materialType),
    )
  )
}

export function receiptPriority(
  key: ReceiptSort,
  balances: ReturnType<typeof receiptBalances>,
): ReceiptPriority {
  return {
    key,
    ids: new Set(
      key
        ? [...balances]
            .filter(([, balance]) => balance[key] > 0)
            .map(([id]) => id)
        : [],
    ),
  }
}

/** Prioritize matching receipts without hiding rows or comparing unlike units. */
export function prioritizeReceiptRows<T>(
  rows: Array<T>,
  priority: ReceiptPriority,
  ids: (row: T) => Iterable<string>,
): Array<T> {
  if (!priority.key) return rows
  const first: Array<T> = [],
    rest: Array<T> = []
  for (const row of rows) {
    const matches = Array.from(ids(row)).some((id) => priority.ids.has(id))
    ;(matches ? first : rest).push(row)
  }
  return first.concat(rest)
}
