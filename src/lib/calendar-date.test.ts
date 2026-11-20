import { expect, it } from 'vitest'
import { formatCalendarDate, normalizeCalendarDate } from './calendar-date'

it('shows one format for ISO, legacy and short dates without timezone conversion', () => {
  for (const value of ['2026-11-20', '20.11.2026', '20-11-26']) {
    expect(formatCalendarDate(value)).toBe('20-11-26')
    expect(normalizeCalendarDate(value)).toBe('2026-11-20')
  }
  expect(formatCalendarDate('2000-01-01')).toBe('01-01-00')
  expect(formatCalendarDate('2099-12-31')).toBe('31-12-99')
  expect(formatCalendarDate(null)).toBe('—')
  expect(formatCalendarDate('', '')).toBe('')
})

it('rejects impossible and incomplete dates and keeps invalid text visible', () => {
  for (const value of [
    '31-02-26',
    '29-02-25',
    '00-11-26',
    '20-13-26',
    '20-11-2',
  ]) {
    expect(normalizeCalendarDate(value)).toBeNull()
    expect(formatCalendarDate(value)).toBe(value)
  }
  expect(normalizeCalendarDate('29-02-24')).toBe('2024-02-29')
  expect(normalizeCalendarDate('2026-1-2')).toBe('2026-01-02')
})
