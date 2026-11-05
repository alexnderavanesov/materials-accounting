import { z } from 'zod'
import { localDateInputValue } from './calendar-date'

export const documentKinds = [
  'request',
  'zni',
  'avk',
  'issue',
  'return',
] as const
export type DocumentKind = (typeof documentKinds)[number]
export const documentLabels: Record<DocumentKind, string> = {
  request: 'Заявки на получение',
  zni: 'ЗНИ',
  avk: 'АВК',
  issue: 'Выдачи в монтаж',
  return: 'Возвраты заказчику',
}
export const numberTokens = [
  'номер',
  'год',
  'год2',
  'месяц',
  'день',
  'шифр',
  'тип',
] as const
function validPattern(value: string) {
  const tokens = [...value.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1])
  return (
    tokens.filter((token) => token === 'номер').length === 1 &&
    tokens.every((token) =>
      numberTokens.includes(token as (typeof numberTokens)[number]),
    ) &&
    !/[{}]/.test(value.replace(/\{[^{}]*\}/g, ''))
  )
}
export const numberingRuleSchema = z
  .object({
    pattern: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .refine(
        validPattern,
        'Добавьте один {номер}; используйте только предложенные поля.',
      ),
    padding: z.number().int().min(1).max(9),
    lastValue: z.number().int().min(0).max(999999999),
  })
  .strict()
export const documentNumberingSchema = z.record(
  z.enum(documentKinds),
  numberingRuleSchema,
)
export type DocumentNumbering = z.infer<typeof documentNumberingSchema>
export type NumberContext = {
  date?: string
  cipher?: string
  materialType?: string
}
export type NumberHistory = Record<DocumentKind, string[]>
export const emptyNumberHistory = (): NumberHistory => ({
  request: [],
  zni: [],
  avk: [],
  issue: [],
  return: [],
})
const defaults: DocumentNumbering = {
  request: {
    pattern: 'ЗП-{месяц}-{год2}-{номер}-{тип}',
    padding: 4,
    lastValue: 0,
  },
  zni: { pattern: '{номер}', padding: 1, lastValue: 0 },
  avk: { pattern: 'АВК-{год}-{номер}', padding: 4, lastValue: 0 },
  issue: { pattern: 'ПМ-{год}-{номер}', padding: 4, lastValue: 0 },
  return: { pattern: 'ВОЗ-{год}-{номер}', padding: 4, lastValue: 0 },
}
export class DocumentNumberExhaustedError extends Error {
  constructor() {
    super('Счётчик исчерпан. Измените его в настройках нумерации.')
  }
}
const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function numberSequence(pattern: string, value: string): number | null {
  const parts = pattern.split(/(\{[^{}]+\})/g)
  const expression = parts
    .map((part) =>
      part === '{номер}'
        ? '(\\d+)'
        : part === '{год}'
          ? '\\d{4}'
          : ['{год2}', '{месяц}', '{день}'].includes(part)
            ? '\\d{2}'
            : part.startsWith('{')
              ? '.+?'
              : escapeRegex(part),
    )
    .join('')
  const match = new RegExp(`^${expression}$`, 'u').exec(value)
  return match ? Number(match[1]) : null
}
export function initialNumbering(history: NumberHistory): DocumentNumbering {
  const next = structuredClone(defaults)
  for (const kind of documentKinds) {
    for (const number of history[kind]) {
      const sequence = numberSequence(next[kind].pattern, number)
      if (
        sequence !== null &&
        Number.isSafeInteger(sequence) &&
        sequence <= 999999999
      )
        next[kind].lastValue = Math.max(next[kind].lastValue, sequence)
    }
  }
  return next
}
export function formatDocumentNumber(
  rule: DocumentNumbering[DocumentKind],
  sequence: number,
  context: NumberContext = {},
) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(context.date ?? '')
    ? context.date!
    : localDateInputValue()
  const values: Record<string, string> = {
    номер: String(sequence).padStart(rule.padding, '0'),
    год: date.slice(0, 4),
    год2: date.slice(2, 4),
    месяц: date.slice(5, 7),
    день: date.slice(8, 10),
    шифр: context.cipher?.trim() || 'Без шифра',
    тип: context.materialType?.trim().replace(/\s+/g, ' ') || 'Материалы',
  }
  return rule.pattern
    .replace(/\{([^{}]+)\}/g, (_, key: string) => values[key] ?? '')
    .trim()
}
export function suggestDocumentNumber(
  settings: DocumentNumbering,
  history: NumberHistory,
  kind: DocumentKind,
  context: NumberContext = {},
) {
  const rule = settings[kind],
    used = new Set(history[kind])
  let sequence = rule.lastValue
  for (let i = 0; i <= used.size; i++) {
    if (++sequence > 999999999) throw new DocumentNumberExhaustedError()
    const number = formatDocumentNumber(rule, sequence, context)
    if (!used.has(number)) return { number, sequence }
  }
  throw new Error('Не удалось подобрать свободный номер.')
}
export function consumeDocumentNumbers(
  settings: DocumentNumbering | undefined,
  previous: NumberHistory,
  next: NumberHistory,
): DocumentNumbering | undefined {
  let result = settings
  const rules = settings ?? initialNumbering(previous)
  for (const kind of documentKinds) {
    const used = new Set(previous[kind])
    let lastValue = rules[kind].lastValue
    for (const number of next[kind]) {
      if (used.has(number)) continue
      const sequence = numberSequence(rules[kind].pattern, number)
      if (
        sequence !== null &&
        Number.isSafeInteger(sequence) &&
        sequence <= 999999999
      )
        lastValue = Math.max(lastValue, sequence)
    }
    if (lastValue !== rules[kind].lastValue) {
      result = { ...(result ?? rules), [kind]: { ...rules[kind], lastValue } }
    }
  }
  return result
}

export function documentNumberHistory(
  requests: Array<{ number: string }>,
  issues: Array<{ document: string }>,
  workflow?: {
    cases: Array<{
      revisions: Array<{
        zni: { number: string }
        avk: { number: string } | null
      }>
    }>
    customerReturns?: Array<{ documentNumber: string }>
  },
): NumberHistory {
  return {
    request: [...new Set(requests.map((item) => item.number))],
    issue: [...new Set(issues.map((item) => item.document))],
    zni: [
      ...new Set(
        workflow?.cases.flatMap((item) =>
          item.revisions.map((rev) => rev.zni.number),
        ) ?? [],
      ),
    ],
    avk: [
      ...new Set(
        workflow?.cases.flatMap((item) =>
          item.revisions.flatMap((rev) =>
            rev.avk?.number ? [rev.avk.number] : [],
          ),
        ) ?? [],
      ),
    ],
    return: [
      ...new Set(
        workflow?.customerReturns?.flatMap((item) =>
          item.documentNumber ? [item.documentNumber] : [],
        ) ?? [],
      ),
    ],
  }
}

export function materialNumberContext(
  rows: Array<{ cipher?: string | null; materialType?: string | null }>,
): Pick<NumberContext, 'cipher' | 'materialType'> {
  const ciphers = [
    ...new Set(rows.map((row) => row.cipher?.trim()).filter(Boolean)),
  ]
  const types = [
    ...new Set(rows.map((row) => row.materialType?.trim()).filter(Boolean)),
  ]
  return {
    cipher:
      ciphers.length === 1 ? ciphers[0] : ciphers.length ? 'Разные шифры' : '',
    materialType: types.length === 1 ? types[0] : 'Материалы',
  }
}
