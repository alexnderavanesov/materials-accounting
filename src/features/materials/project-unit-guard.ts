type ProjectLine = {
  id?: unknown
  unit?: unknown
  projectMaterialName?: unknown
}
type Operation = { projectLineId?: unknown }
type UnitHistory = {
  materialRequests?: ReadonlyArray<Operation>
  materialReceipts?: ReadonlyArray<Operation>
  materialIssues?: ReadonlyArray<Operation>
  qualityWorkflow?: {
    cases: ReadonlyArray<{
      revisions: ReadonlyArray<{ zni: { rows: ReadonlyArray<Operation> } }>
    }>
  }
}

/** Primary units describe saved quantities; changing them is not a conversion. */
export function validateProjectUnitChanges(
  next: ReadonlyArray<ProjectLine> | undefined,
  previous: ReadonlyArray<ProjectLine> | undefined,
  ...histories: Array<UnitHistory | null | undefined>
) {
  if (!next || !previous) return
  const previousById = new Map(previous.map((line) => [line.id, line]))
  const changed = next.filter((line) => {
    const old = previousById.get(line.id)
    return typeof line.id === 'string' && old && old.unit !== line.unit
  })
  if (!changed.length) return
  const used = new Set<unknown>()
  for (const history of histories) {
    for (const entries of [
      history?.materialRequests,
      history?.materialReceipts,
      history?.materialIssues,
    ])
      for (const entry of entries ?? []) used.add(entry.projectLineId)
    for (const entry of history?.qualityWorkflow?.cases ?? [])
      for (const revision of entry.revisions)
        for (const row of revision.zni.rows) used.add(row.projectLineId)
  }
  const blocked = changed.find((line) => used.has(line.id))
  if (blocked)
    throw new Error(
      `Нельзя изменить основную единицу материала «${String(blocked.projectMaterialName ?? blocked.id)}»: по нему уже есть операции. Создайте отдельный материал с другой единицей.`,
    )
}
