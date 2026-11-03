import { describe, expect, it } from 'vitest'
import {
  isMaterialFullyReceived,
  remainingMaterialQuantity,
} from './material-progress'
import {
  emptyOverviewIndicators,
  isOverviewSort,
  overviewIndicatorKeys,
  prioritizeOverviewRows,
  receiptIndicatorsByLine,
} from './operation-overview-indicators'
import { receiptBalances } from './receipt-balances'

describe('overview priorities', () => {
  it.each(overviewIndicatorKeys)(
    'puts %s materials first without dropping rows or comparing unlike units',
    (key) => {
      const rows = [
        { id: 'empty', unit: 'м', indicators: emptyOverviewIndicators() },
        {
          id: 'pieces',
          unit: 'шт',
          indicators: { ...emptyOverviewIndicators(), [key]: 2 },
        },
        {
          id: 'metres',
          unit: 'м',
          indicators: { ...emptyOverviewIndicators(), [key]: 100 },
        },
        {
          id: 'another-empty',
          unit: 'шт',
          indicators: emptyOverviewIndicators(),
        },
      ]
      const before = structuredClone(rows)
      expect(prioritizeOverviewRows(rows, key).map((row) => row.id)).toEqual([
        'pieces',
        'metres',
        'empty',
        'another-empty',
      ])
      expect(prioritizeOverviewRows(rows, '')).toBe(rows)
      expect(rows).toEqual(before)
    },
  )

  it('rejects obsolete or malformed persisted sort values', () => {
    expect(isOverviewSort('remaining')).toBe(true)
    expect(isOverviewSort('')).toBe(true)
    for (const value of ['approved', 'constructor', null, {}, 0])
      expect(isOverviewSort(value)).toBe(false)
  })

  it('aggregates multiple receipts of the same project line once', () => {
    const receipts = [
      { id: 'a', requestId: '1', projectLineId: 'one', quantity: 2.5 },
      { id: 'b', requestId: '2', projectLineId: 'one', quantity: 3.5 },
      { id: 'c', requestId: '3', projectLineId: 'two', quantity: 4 },
    ]
    const totals = receiptIndicatorsByLine(
      receipts,
      receiptBalances(receipts, undefined, [], []),
    )
    expect(totals.get('one')).toMatchObject({
      received: 6,
      awaitingInspection: 6,
      availableToIssue: 0,
    })
    expect(totals.get('two')).toMatchObject({
      received: 4,
      awaitingInspection: 4,
    })
  })
})

it('treats only positive, fully received project quantities as complete, tolerating floating-point sums', () => {
  const progress = {
    projectQuantity: 0.3,
    receivedQuantity: 0.1 + 0.2,
    requestedQuantity: 1,
    qcSignedQuantity: 0,
  }
  expect(remainingMaterialQuantity(progress)).toBe(0)
  expect(isMaterialFullyReceived(progress)).toBe(true)
  expect(
    isMaterialFullyReceived({ ...progress, receivedQuantity: 0.299 }),
  ).toBe(false)
  expect(isMaterialFullyReceived({ ...progress, projectQuantity: 0 })).toBe(
    false,
  )
  expect(
    remainingMaterialQuantity({
      projectQuantity: 534.702,
      receivedQuantity: 500,
    }),
  ).toBe(34.702)
})
