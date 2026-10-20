import { z } from 'zod'
import type { GridState } from 'ag-grid-community'

const key = 'materials.workspaceView.v1:database.agGrid.v1'
const ids = z.array(z.string())
const stateSchema = z.object({
  version: z.string().optional(),
  columnVisibility: z.object({ hiddenColIds: ids }).optional(),
  columnOrder: z.object({ orderedColIds: ids }).optional(),
  columnSizing: z
    .object({
      columnSizingModel: z.array(
        z.object({
          colId: z.string(),
          width: z.number().finite().positive().optional(),
          flex: z.number().finite().nonnegative().optional(),
        }),
      ),
    })
    .optional(),
  columnPinning: z.object({ leftColIds: ids, rightColIds: ids }).optional(),
  sort: z
    .object({
      sortModel: z.array(
        z.object({ colId: z.string(), sort: z.enum(['asc', 'desc']) }),
      ),
    })
    .optional(),
  filter: z
    .object({
      filterModel: z
        .record(z.string(), z.record(z.string(), z.unknown()))
        .optional(),
    })
    .optional(),
  scroll: z
    .object({
      top: z.number().finite().nonnegative(),
      left: z.number().finite().nonnegative(),
    })
    .optional(),
})

export function readProjectGridState(): GridState {
  try {
    const saved = sessionStorage.getItem(key)
    if (saved) return stateSchema.parse(JSON.parse(saved))
    const legacy = JSON.parse(
      sessionStorage.getItem('materials.workspaceView.v1:database.filters') ??
        '{}',
    )
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy))
      return {}
    return {
      filter: {
        filterModel: Object.fromEntries(
          Object.entries(legacy)
            .filter(([, value]) => typeof value === 'string' && value.trim())
            .map(([colId, value]) => [
              colId,
              { filterType: 'text', type: 'contains', filter: value },
            ]),
        ),
      },
    }
  } catch {
    return {}
  }
}

export function saveProjectGridState(state: GridState) {
  try {
    sessionStorage.setItem(key, JSON.stringify(stateSchema.parse(state)))
  } catch {
    /* The grid remains usable if browser storage is unavailable. */
  }
}

/** Blank clears a quantity; malformed text must never silently become zero. */
export function parseProjectQuantity(value: unknown): number | null {
  const text = String(value ?? '')
    .trim()
    .replace(/[\s\u00a0\u202f]/g, '')
  if (!text) return 0
  if (!/^\+?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return null
  const amount = Number(text.replace(',', '.'))
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export type MaterialMatrixRow = {
  key: string
  firstLineId: string
  lineIds: Array<string>
  material: string
  materialId: string
  projectMaterialName: string
  changeNumber: string
  materialType: string
  normativeDocument: string
  unit: string
  unitWeight: number | null
  alternativeUnit: string
  alternativeUnitFactor: number | null
  totalQuantity: number
  cipherQuantities: Record<string, number>
  cipherLineIds: Record<string, string>
}
export type MaterialHighlight = {
  cellKeys: Array<string>
  expiresAt: number
  rowKey: string
}
export type PendingDeleteMaterial = { lineIds: Array<string>; name: string }

/** View preferences only. No row data or workspace writes. */
export function readDataGridState(id: string): GridState {
  try {
    return stateSchema.parse(
      JSON.parse(
        sessionStorage.getItem(`materials.workspaceView.v1:grid:${id}`) ?? '{}',
      ),
    )
  } catch {
    return {}
  }
}
export function saveDataGridState(id: string, state: GridState) {
  try {
    sessionStorage.setItem(
      `materials.workspaceView.v1:grid:${id}`,
      JSON.stringify(stateSchema.parse(state)),
    )
  } catch {
    /* Private mode or quota must not block table actions. */
  }
}
