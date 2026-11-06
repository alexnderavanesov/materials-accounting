import { currentInspection } from './quality-workflow'
import type { InspectionCase } from './quality-workflow'

export const inspectionDocumentIndicators = [
  {
    key: 'zniCreated',
    label: 'Создано ЗНИ',
    details: 'Все ЗНИ, включая подписанные. Каждая ЗНИ учитывается один раз.',
  },
  {
    key: 'zniSigned',
    label: 'Подписано ЗНИ',
    details: 'ЗНИ с подписанной текущей редакцией.',
  },
  {
    key: 'zniPending',
    label: 'Осталось подписать ЗНИ',
    details: 'ЗНИ, текущая редакция которых ещё не подписана.',
  },
  {
    key: 'avkCreated',
    label: 'Создано АВК',
    details: 'АВК текущих редакций ЗНИ, включая подписанные.',
  },
  {
    key: 'avkSigned',
    label: 'Подписано АВК',
    details: 'Подписанные АВК текущих редакций ЗНИ.',
  },
  {
    key: 'avkPending',
    label: 'Осталось подписать АВК',
    details: 'Уже созданные АВК, которые ещё не подписаны.',
  },
  {
    key: 'avkNeeded',
    label: 'Осталось создать АВК',
    details:
      'Подписанные ЗНИ с принятыми материалами, для которых ещё не создан АВК.',
  },
] as const

type IndicatorKey = (typeof inspectionDocumentIndicators)[number]['key']
export type InspectionDocumentSort = '' | IndicatorKey

export function isInspectionDocumentSort(
  value: unknown,
): value is InspectionDocumentSort {
  return (
    value === '' ||
    inspectionDocumentIndicators.some((indicator) => indicator.key === value)
  )
}

export function canCreateAct(entry: InspectionCase) {
  const rev = currentInspection(entry)
  return (
    !!rev.zni.signedOn &&
    !rev.avk &&
    rev.zni.rows.some((row) => (row.accepted ?? 0) > 0)
  )
}

function documentIndicators(
  entry: InspectionCase,
): Record<IndicatorKey, boolean> {
  const rev = currentInspection(entry)
  return {
    zniCreated: true,
    zniSigned: !!rev.zni.signedOn,
    zniPending: !rev.zni.signedOn,
    avkCreated: !!rev.avk,
    avkSigned: !!rev.avk?.signedOn,
    avkPending: !!rev.avk && !rev.avk.signedOn,
    avkNeeded: canCreateAct(entry),
  }
}

export function summarizeInspectionDocuments(
  cases: ReadonlyArray<InspectionCase>,
) {
  const counts: Record<IndicatorKey, number> = {
    zniCreated: 0,
    zniSigned: 0,
    zniPending: 0,
    avkCreated: 0,
    avkSigned: 0,
    avkPending: 0,
    avkNeeded: 0,
  }
  for (const entry of cases) {
    const indicators = documentIndicators(entry)
    for (const { key } of inspectionDocumentIndicators) {
      if (indicators[key]) counts[key]++
    }
  }
  return counts
}

export function prioritizeInspectionDocuments(
  cases: Array<InspectionCase>,
  sort: InspectionDocumentSort,
) {
  if (!sort) return cases
  const first: Array<InspectionCase> = []
  const rest: Array<InspectionCase> = []
  for (const entry of cases) {
    ;(documentIndicators(entry)[sort] ? first : rest).push(entry)
  }
  return [...first, ...rest]
}
