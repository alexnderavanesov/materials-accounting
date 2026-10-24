import { describe, expect, it } from 'vitest'

import {
  calculateAlternativeQuantity,
  getAlternativeConversionError,
  getOperationAlternative,
  getOperationConversion,
  recalculateOperationAlternatives,
  recalculateRequestAlternatives,
  validateImportDraft,
} from './domain'

describe('materials domain', () => {
  it('uses each operation quantity, remembers its base unit and never guesses a factor from totals', () => {
    const line = {
      id: 'line',
      unit: 'м',
      alternativeUnit: 'кг',
      alternativeUnitFactor: 2.5,
    }
    const entries = [2.4, 0.4, 0].map((quantity) => ({
      quantity,
      altQuantity: 999,
      altUnit: 'уп',
    }))
    const original = structuredClone(entries)
    const conversion = getOperationConversion(line, 'м')
    const result = recalculateOperationAlternatives(entries, () => conversion)
    expect(result.map((entry) => entry.altQuantity)).toEqual([6, 1, 0])
    expect(result[0]).toMatchObject({
      altUnit: 'кг',
      altUnitFactor: 2.5,
      projectUnit: 'м',
    })
    expect(entries).toEqual(original)
    expect(recalculateOperationAlternatives(result, () => conversion)).toBe(
      result,
    )
    expect(getOperationConversion(undefined, 'м', entries[0])).toBeNull()
    expect(getOperationAlternative(null, conversion).altQuantity).toBeNull()
    expect(getOperationAlternative(2.4, null, entries[0]).error).toBe('')
    expect(getOperationAlternative(3, null, entries[0]).error).toMatch(
      /проектной базе/,
    )
  })
  it('prefers the current coefficient, uses a saved coefficient only for the same base unit and rejects overflow', () => {
    const previous = {
      projectUnit: 'м',
      quantity: 2,
      altQuantity: 6,
      altUnit: 'кг',
      altUnitFactor: 3,
    }
    const line = {
      id: 'line',
      unit: 'м',
      alternativeUnit: 'т',
      alternativeUnitFactor: 0.1,
    }
    expect(getOperationConversion(line, 'м', previous)).toMatchObject({
      factor: 0.1,
      unit: 'т',
    })
    expect(getOperationConversion(undefined, 'м', previous)).toMatchObject({
      factor: 3,
      unit: 'кг',
    })
    expect(
      getOperationConversion({ ...line, unit: 'шт' }, 'м', previous),
    ).toMatchObject({ factor: 3, unit: 'кг' })
    expect(getOperationConversion(undefined, 'шт', previous)).toBeNull()
    expect(getOperationConversion(line, undefined, previous)).toBeNull()
    expect(
      getOperationAlternative(
        1.2,
        getOperationConversion(undefined, 'м', previous),
      ).altQuantity,
    ).toBe(3.6)
    expect(
      getOperationAlternative(Number.MAX_VALUE, { factor: 2, unit: 'кг' })
        .error,
    ).not.toBe('')
    expect(
      recalculateOperationAlternatives([previous], () => ({
        factor: Number.MAX_VALUE,
        unit: 'кг',
      })),
    ).toEqual([previous])
  })
  it('recalculates every saved request from its own material without changing other data', () => {
    const entries = [undefined, null, 99].map((factor, index) => ({
      id: `request-${index}`,
      number: `ЗП-${index}`,
      projectLineId: 'line-1',
      projectUnit: 'м',
      quantity: 1.2 + index,
      altQuantity: 111,
      altUnit: 'уп',
      altUnitFactor: factor,
      note: 'Сохранить примечание',
    }))
    entries.push({ ...entries[0]!, projectLineId: 'line-2', quantity: 4 })
    const original = structuredClone(entries)
    const lines = [
      {
        id: 'line-1',
        unit: ' М ',
        alternativeUnit: 'кг',
        alternativeUnitFactor: 2.5,
      },
      {
        id: 'line-2',
        unit: 'м',
        alternativeUnit: 'т',
        alternativeUnitFactor: 0.1,
      },
    ]
    const result = recalculateRequestAlternatives(entries, lines)
    expect(result).toEqual([
      ...entries.slice(0, 3).map((entry, index) => ({
        ...entry,
        altQuantity: 3 + index * 2.5,
        altUnit: 'кг',
        altUnitFactor: 2.5,
      })),
      { ...entries[3], altQuantity: 0.4, altUnit: 'т', altUnitFactor: 0.1 },
    ])
    expect(entries).toEqual(original)
    expect(recalculateRequestAlternatives(result, lines)).toBe(result)
  })
  it('preserves historical values when a current conversion cannot be applied safely', () => {
    const entries = [
      {
        projectLineId: 'line-1',
        projectUnit: 'м',
        quantity: 3,
        altQuantity: 6,
        altUnit: 'кг',
        altUnitFactor: 2,
      },
    ]
    const line = {
      id: 'line-1',
      unit: 'м',
      alternativeUnit: 'кг',
      alternativeUnitFactor: 5,
    }
    for (const lines of [
      [],
      [{ ...line, id: 'different-line' }],
      [{ ...line, unit: 'шт' }],
      [{ ...line, alternativeUnit: '' }],
      ...[null, undefined, 0, -1, NaN, Infinity, Number.MAX_VALUE].map(
        (alternativeUnitFactor) => [{ ...line, alternativeUnitFactor }],
      ),
    ]) {
      expect(recalculateRequestAlternatives(entries, lines)).toBe(entries)
    }
  })
  it('converts quantities per base unit and rejects invalid factors or overflow', () => {
    expect(calculateAlternativeQuantity(3, 2)).toBe(6)
    expect(calculateAlternativeQuantity(0.1, 3)).toBe(0.3)
    expect(calculateAlternativeQuantity(1.2, 2.5)).toBe(3)
    expect(calculateAlternativeQuantity(0, 2.5)).toBe(0)
    for (const factor of [0, -1, NaN, Infinity])
      expect(calculateAlternativeQuantity(3, factor)).toBeNull()
    expect(calculateAlternativeQuantity(Number.MAX_VALUE, 2)).toBeNull()
    expect(getAlternativeConversionError('кг', '2,5')).toBe('')
    expect(getAlternativeConversionError('', '')).toBe('')
    for (const factor of ['', '0', '-1', 'Infinity', 'abc'])
      expect(getAlternativeConversionError('кг', factor)).not.toBe('')
    expect(getAlternativeConversionError('', 2)).not.toBe('')
  })
  it('imports conversion factors without merging different conversions or requiring them in older files', () => {
    const base = {
      cipher: 'ТК1',
      projectMaterialName: 'Труба',
      unit: 'м',
      quantity: 3,
      alternativeUnit: 'кг',
    }
    const result = validateImportDraft([
      { ...base, alternativeUnitFactor: '2,5' },
      { ...base, alternativeUnitFactor: 3 },
      base,
      { ...base, alternativeUnitFactor: -1 },
      { ...base, alternativeUnitFactor: 'abc' },
      { ...base, alternativeUnit: '', alternativeUnitFactor: 2 },
    ])
    expect(result.summary.validRows).toBe(3)
    expect(result.summary.errorRows).toBe(3)
    expect(result.summary.duplicateRows).toBe(0)
    expect(result.rows[0]?.alternativeUnitFactor).toBe(2.5)
    expect(result.rows[2]?.alternativeUnitFactor).toBeNull()
  })

  it('validates Excel import rows and keeps equal materials separate by cipher', () => {
    const validation = validateImportDraft([
      {
        cipher: '300',
        category: 'Трубопровод',
        projectMaterialName: 'Труба 57',
        material: '09Г2С',
        unit: 'м',
        quantity: '500',
      },
      {
        cipher: '400',
        category: 'Трубопровод',
        projectMaterialName: 'Труба 57',
        material: '09Г2С',
        unit: 'м',
        quantity: '2200',
      },
      {
        cipher: '400',
        category: 'Трубопровод',
        projectMaterialName: 'Труба 57',
        material: '09Г2С',
        unit: 'м',
        quantity: '2200',
      },
      {
        cipher: '',
        category: 'Крепеж',
        projectMaterialName: 'Шпилька М16',
        unit: 'шт',
        quantity: '-1',
      },
    ])

    expect(validation.summary.totalRows).toBe(4)
    expect(validation.summary.validRows).toBe(3)
    expect(validation.summary.errorRows).toBe(1)
    expect(validation.summary.duplicateRows).toBe(1)
    expect(validation.rows[0]?.fingerprint).not.toBe(
      validation.rows[1]?.fingerprint,
    )
  })
})
