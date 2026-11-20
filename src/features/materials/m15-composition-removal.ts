import { validateM15Workspace } from './m15-reconciliation'
import type { M15Reconciliation, M15Workspace } from './m15-reconciliation'
import { jsonEqual } from './workspace-protocol'

/** Remove the composition, never the document or physical receipt history. */
export function withoutM15Composition<T extends M15Workspace>(
  workspace: T,
  baseline: M15Reconciliation,
  lineId?: string,
): T {
  if (
    !workspace.qualityWorkflow?.receiptDocuments?.some(
      (document) => document.id === baseline.id && document.kind === 'm15',
    )
  )
    throw new Error('М-15 не найдена. Обновите список накладных.')
  if (lineId && !baseline.lines.some((line) => line.id === lineId))
    throw new Error('Позиция М-15 не найдена. Откройте состав заново.')
  const lines = lineId
    ? baseline.lines.filter((line) => line.id !== lineId)
    : []
  const remaining = lines.length
    ? {
        ...baseline,
        lines,
        allocations: baseline.allocations.filter(
          (allocation) => allocation.lineId !== lineId,
        ),
      }
    : undefined
  const current = workspace.m15Reconciliations?.find(
    (record) => record.id === baseline.id,
  )
  // A retry after an acknowledged save must not repeat or widen the removal.
  if (jsonEqual(current, remaining)) return workspace
  if (!jsonEqual(current, baseline))
    throw new Error(
      'Состав М-15 изменился. Закройте подтверждение и выберите удаление заново.',
    )
  const next = {
    ...workspace,
    m15Reconciliations: (workspace.m15Reconciliations ?? []).flatMap(
      (record) =>
        record.id === baseline.id ? (remaining ? [remaining] : []) : [record],
    ),
  }
  validateM15Workspace(next, workspace)
  return next
}
