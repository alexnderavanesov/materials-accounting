import { expect, it } from 'vitest'
import {
  emptyOperationListView,
  isOperationListViews,
  matchesOperationMaterial,
  normalizeOperationSearch,
  prioritizeReceiptRows,
  receiptPriority,
} from './operation-list-view'
import { receiptBalances } from './receipt-balances'

it('uses the same tolerant search for typed filters and suggestions', () => {
  expect(normalizeOperationSearch('  Отвод 23х7 / чёрный  ')).toBe(
    'отвод 23x7 черный',
  )
  expect(
    matchesOperationMaterial(
      {
        cipher: '29-36-RD/700',
        materialType: 'Трубопроводы / трубная продукция',
      },
      {
        ...emptyOperationListView,
        cipher: '29 36 rd',
        materialType: 'ТРУБНАЯ',
      },
    ),
  ).toBe(true)
  expect(
    matchesOperationMaterial(
      { cipher: '29-36-RD/700', materialType: 'Трубопроводы' },
      {
        ...emptyOperationListView,
        cipher: '29 36 rd',
        materialType: 'Оборудование',
      },
    ),
  ).toBe(false)
})

it('prioritizes only positive receipt balances stably across a 10000-row list', () => {
  const rows = Array.from({ length: 10000 }, (_, i) => ({
    id: String(i),
    requestId: String(i),
    quantity: 0.125,
  }))
  const balances = receiptBalances(rows, undefined, [], [])
  balances.get('9999')!.returned = 0.125
  balances.get('100')!.returned = 0.125
  const priority = receiptPriority('returned', balances)
  const sorted = prioritizeReceiptRows(rows, priority, (row) => [row.id])
  expect(sorted.map((row) => row.id)).toEqual([
    '100',
    '9999',
    ...rows
      .filter((row) => row.id !== '100' && row.id !== '9999')
      .map((row) => row.id),
  ])
  expect(rows[0]!.id).toBe('0')
  expect(
    prioritizeReceiptRows(rows, receiptPriority('', balances), (row) => [
      row.id,
    ]),
  ).toBe(rows)
})

it('rejects invalid saved criteria without accepting unknown tabs or indicators', () => {
  expect(
    isOperationListViews({
      requests: { ...emptyOperationListView, sort: 'remaining' },
    }),
  ).toBe(true)
  expect(
    isOperationListViews({
      requests: { ...emptyOperationListView, sort: 'returned' },
    }),
  ).toBe(true)
  expect(
    isOperationListViews({
      requests: { ...emptyOperationListView, sort: 'nonexistent' },
    }),
  ).toBe(false)
  expect(isOperationListViews({ unknown: emptyOperationListView })).toBe(false)
  expect(isOperationListViews(null)).toBe(false)
})

it('prioritizes receipts linked to requests with an outstanding balance', () => {
  const receipts = [
    { id: 'received', requestId: 'complete', quantity: 4 },
    { id: 'partial', requestId: 'incomplete', quantity: 3 },
  ]
  const priority = receiptPriority(
    'remaining',
    receiptBalances(receipts, undefined, [], []),
    {
      receipts,
      byRequest: new Map([
        ['complete', 0],
        ['incomplete', 1],
        ['not-delivered', 4],
      ]),
    },
  )
  expect([...priority.ids]).toEqual(['partial'])
  expect(
    prioritizeReceiptRows(receipts, priority, (receipt) => [receipt.id]).map(
      (receipt) => receipt.id,
    ),
  ).toEqual(['partial', 'received'])
})
