import {
  inspectionSourceRevision,
  isBlockedInspectionAct,
  localToday,
  signInspection,
} from './quality-workflow'
import type { InspectionCase, InspectionRevision } from './quality-workflow'

export function inspectionDocumentEditable(
  revision: InspectionRevision,
  kind: 'zni' | 'avk',
) {
  return kind === 'zni'
    ? !revision.zni.signedOn
    : !!revision.avk &&
        !revision.avk.signedOn &&
        !isBlockedInspectionAct(revision)
}

export function inspectionDocumentRevisions(
  entry: InspectionCase,
  kind: 'zni' | 'avk',
) {
  if (kind === 'avk') return entry.revisions.filter((revision) => revision.avk)
  return [
    ...new Map(
      entry.revisions.map((revision) => {
        const source = inspectionSourceRevision(entry, revision)
        return [source.revision, source] as const
      }),
    ).values(),
  ]
}

export function inspectionSigningError(
  revision: InspectionRevision,
  kind: 'zni' | 'avk',
) {
  // Check content without choosing the actual signature date for the user.
  const date = [
    localToday(),
    revision.zni.date,
    revision.zni.inspectionDate,
    revision.zni.signedOn ?? '',
    revision.avk?.date ?? '',
    revision.avk?.rejection?.date ?? '',
  ]
    .sort()
    .at(-1)!
  try {
    signInspection(revision, kind, date)
    return undefined
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Документ пока не готов к подписанию.'
  }
}
