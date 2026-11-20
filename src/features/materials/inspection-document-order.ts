import { currentInspection, latestInspectionAct } from './quality-workflow'
import type { InspectionCase, QualityWorkflow } from './quality-workflow'

type DocumentKind = 'zni' | 'avk'

/** Capture first save, not draft opening, editing, signing or correction. */
export function saveInspectionCase(
  workflow: QualityWorkflow,
  entry: InspectionCase,
  now = Date.now(),
): QualityWorkflow {
  const previous = workflow.cases.find((item) => item.id === entry.id)
  const next = structuredClone(entry)
  const revision = currentInspection(next)
  const oldRevision = previous?.revisions.find(
    (item) => item.revision === revision.revision,
  )
  // A photo-upload retry can reuse the draft from before its first save.
  for (const kind of ['zni', 'avk'] as const) {
    const stored = oldRevision?.[kind]
    const document = revision[kind]
    if (stored && document) {
      if (stored.createdAt) document.createdAt = stored.createdAt
      else delete document.createdAt
    }
  }
  const creationTime = (kind: DocumentKind) => {
    let time = now
    for (const item of workflow.cases)
      for (const version of item.revisions) {
        const createdAt = version[kind]?.createdAt
        // Consecutive saves within one millisecond still have a definite order.
        if (createdAt) time = Math.max(time, Date.parse(createdAt) + 1)
      }
    return new Date(time).toISOString()
  }
  if (!previous) revision.zni.createdAt = creationTime('zni')
  if (revision.avk && !oldRevision?.avk && revision.kind !== 'avk-correction')
    revision.avk.createdAt = creationTime('avk')
  return {
    ...workflow,
    // Updating an AVK must not move its ZNI (including legacy documents).
    cases: previous
      ? workflow.cases.map((item) => (item.id === next.id ? next : item))
      : [...workflow.cases, next],
  }
}

export function newestInspectionDocuments(
  cases: ReadonlyArray<InspectionCase>,
  kind: DocumentKind,
): Array<InspectionCase> {
  return cases
    .flatMap((entry) => {
      const document =
        kind === 'zni'
          ? currentInspection(entry).zni
          : latestInspectionAct(entry)?.avk
      return document ? [{ entry, document }] : []
    })
    .sort((left, right) => {
      const a = left.document.createdAt
      const b = right.document.createdAt
      if (a || b)
        return (
          (b ? Date.parse(b) : 0) - (a ? Date.parse(a) : 0) ||
          right.entry.id.localeCompare(left.entry.id)
        )
      // Legacy documents have no creation time. Keep their own date order
      // without fabricating timestamps or using the related document's date.
      return right.document.date.localeCompare(left.document.date)
    })
    .map(({ entry }) => entry)
}
