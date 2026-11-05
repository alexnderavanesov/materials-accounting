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
  requestRemainingQuantities,
  summarizeOverviewIndicators,
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
    for (const value of [
      'withoutRequests',
      'approved',
      'constructor',
      null,
      {},
      0,
    ])
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

it('counts positions per stage without mixing units or counting unrelated project demand', () => {
  const rows = ['м', 'шт', 'компл', 'м²'].map((unit, index) => ({
    unit,
    indicators: {
      ...emptyOverviewIndicators(),
      received: [30, 12, 10, 30][index]!,
      remaining: index === 0 ? 5 : 0,
    },
  }))
  rows.push({ unit: 'м', indicators: emptyOverviewIndicators() })
  const receipts = rows.slice(0, 4).map((row, index) => ({
    id: String(index),
    requestId: String(index),
    projectUnit: row.unit,
    quantity: row.indicators.received,
  }))
  const requests = receipts.map((receipt) => ({
    id: receipt.requestId,
    projectUnit: receipt.projectUnit,
  }))
  const remainingByRequest = new Map([['0', 5]])
  // A later edit to the project unit must not reinterpret saved receipt/request units.
  rows[0]!.unit = 'кг'
  const summary = summarizeOverviewIndicators({
    rows,
    receipts,
    requests,
    balances: receiptBalances(receipts, undefined, [], []),
    remainingByRequest,
  })
  expect(summary.received).toEqual({
    count: 4,
    quantities: [
      { unit: 'м', quantity: 30 },
      { unit: 'шт', quantity: 12 },
      { unit: 'компл', quantity: 10 },
      { unit: 'м²', quantity: 30 },
    ],
  })
  expect(summary.remaining).toEqual({
    count: 1,
    quantities: [{ unit: 'м', quantity: 5 }],
  })
  expect(summary.returned).toEqual({ count: 0, quantities: [] })
})

it('keeps outstanding requests separate even for the same material and rounds floating point noise', () => {
  const remaining = requestRemainingQuantities(
    [
      { id: 'surplus', quantity: 5 },
      { id: 'unreceived', quantity: 5 },
      { id: 'fraction', quantity: 0.3 },
    ],
    new Map([
      ['surplus', 10],
      ['fraction', 0.1 + 0.2],
    ]),
  )
  expect([...remaining]).toEqual([
    ['surplus', 0],
    ['unreceived', 5],
    ['fraction', 0],
  ])
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
