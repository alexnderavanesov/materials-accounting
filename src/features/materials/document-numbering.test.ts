import { describe, expect, it } from 'vitest'
import {
  consumeDocumentNumbers,
  documentNumberHistory,
  documentNumberingSchema,
  emptyNumberHistory,
  formatDocumentNumber,
  initialNumbering,
  materialNumberContext,
  numberSequence,
  suggestDocumentNumber,
} from './document-numbering'

describe('document numbering', () => {
  it('initializes independent counters from existing documents and preserves their numbers', () => {
    const history = documentNumberHistory(
      [{ number: 'ЗП-10-26-0042-Трубы' }, { number: 'ЗП-10-26-0042-Трубы' }],
      [{ document: 'ПМ-2026-0012' }],
      {
        cases: [
          {
            revisions: [
              { zni: { number: '7' }, avk: { number: 'АВК-2026-0019' } },
            ],
          },
        ],
        customerReturns: [{ documentNumber: 'ВОЗ-2026-0003' }],
      },
    )
    const before = structuredClone(history)
    const rules = initialNumbering(history)
    expect(
      Object.fromEntries(
        Object.entries(rules).map(([key, value]) => [key, value.lastValue]),
      ),
    ).toEqual({ request: 42, zni: 7, avk: 19, issue: 12, return: 3 })
    expect(
      suggestDocumentNumber(rules, history, 'avk', { date: '2026-11-02' }),
    ).toEqual({ number: 'АВК-2026-0020', sequence: 20 })
    expect(history).toEqual(before)
  })
  it('supports custom tokens, literal punctuation and joined date/sequence tokens', () => {
    const rule = {
      pattern: 'ЗНИ({шифр})/{год}{месяц}{номер} — {тип}',
      padding: 3,
      lastValue: 0,
    }
    const number = formatDocumentNumber(rule, 12, {
      date: '2026-11-02',
      cipher: 'ТК1',
      materialType: 'Трубы',
    })
    expect(number).toBe('ЗНИ(ТК1)/202611012 — Трубы')
    expect(numberSequence(rule.pattern, number)).toBe(12)
    expect(
      materialNumberContext([
        { cipher: 'ТК1', materialType: 'Трубы' },
        { cipher: 'ТК2', materialType: 'Отводы' },
      ]),
    ).toEqual({ cipher: 'Разные шифры', materialType: 'Материалы' })
  })
  it('resetting a counter skips occupied numbers and advances only on saving a new document', () => {
    const history = {
      ...emptyNumberHistory(),
      avk: ['АВК-2026-0001', 'АВК-2026-0002', 'АВК-2026-0004'],
    }
    const rules = initialNumbering(history)
    rules.avk.lastValue = 0
    const next = suggestDocumentNumber(rules, history, 'avk', {
      date: '2026-11-02',
    })
    expect(next).toEqual({ number: 'АВК-2026-0003', sequence: 3 })
    expect(rules.avk.lastValue).toBe(0)
    expect(consumeDocumentNumbers(rules, history, history)).toBe(rules)
    const afterSave = consumeDocumentNumbers(rules, history, {
      ...history,
      avk: [...history.avk, next.number],
    })!
    expect(afterSave.avk.lastValue).toBe(3)
    // Deleting the saved document must not recycle its number.
    expect(
      consumeDocumentNumbers(
        afterSave,
        { ...history, avk: [...history.avk, next.number] },
        history,
      ),
    ).toBe(afterSave)
    expect(
      suggestDocumentNumber(afterSave, history, 'avk', { date: '2026-11-02' })
        .number,
    ).toBe('АВК-2026-0005')
  })
  it('consumes one sequence for a multi-position document, including manually corrected matching numbers', () => {
    const history = emptyNumberHistory()
    const next = documentNumberHistory(
      [],
      [{ document: 'ПМ-2026-0008' }, { document: 'ПМ-2026-0008' }],
    )
    expect(
      consumeDocumentNumbers(undefined, history, next)?.issue.lastValue,
    ).toBe(8)
    expect(
      consumeDocumentNumbers(undefined, history, {
        ...history,
        avk: ['Номер заказчика'],
      }),
    ).toBeUndefined()
  })
  it.each([
    'АВК',
    '{номер}-{номер}',
    '{неизвестное}-{номер}',
    '{номер',
    '{номер}}',
  ])('rejects invalid pattern %s', (pattern) => {
    const rules = initialNumbering(emptyNumberHistory())
    rules.avk.pattern = pattern
    expect(documentNumberingSchema.safeParse(rules).success).toBe(false)
  })
})
