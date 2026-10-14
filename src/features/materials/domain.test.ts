import { describe, expect, it } from 'vitest'

import {
  assertAvailableBalance,
  calculateLotBalances,
  generateDocumentNumber,
  getIssueWarnings,
  summarizeSubobjectMaterials,
  validateImportDraft,
} from './domain'

describe('materials domain', () => {
  it('generates document numbers by type and year', () => {
    expect(generateDocumentNumber('receipt', new Date('2026-06-26'), 7)).toBe(
      'ПР-2026-00007',
    )
    expect(
      generateDocumentNumber(
        'inventory_adjustment',
        new Date('2026-01-01'),
        12,
      ),
    ).toBe('ИНВ-2026-00012')
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

  it('calculates lot balances from immutable ledger movements', () => {
    expect(
      calculateLotBalances([
        {
          lotId: 'lot-1',
          projectMaterialLineId: 'line-1',
          direction: 'in',
          quantity: 10,
          reason: 'receipt',
        },
        {
          lotId: 'lot-1',
          projectMaterialLineId: 'line-1',
          direction: 'out',
          quantity: 3.25,
          reason: 'issue',
        },
        {
          lotId: 'lot-1',
          projectMaterialLineId: 'line-1',
          direction: 'in',
          quantity: 1.125,
          reason: 'return',
        },
      ]),
    ).toEqual([
      {
        lotId: 'lot-1',
        projectMaterialLineId: 'line-1',
        quantity: 7.875,
      },
    ])
  })

  it('prevents negative stock', () => {
    expect(() => assertAvailableBalance(5, 6, 'Труба 57')).toThrow(
      'нельзя провести операцию',
    )
  })

  it('summarizes project materials by category and cipher', () => {
    const summary = summarizeSubobjectMaterials([
      {
        project: 'НС-СЕВ',
        category: 'Трубопровод',
        cipher: '300',
        material: 'Труба 57',
        unit: 'м',
        plannedQuantity: 500,
        requested: 500,
        received: 320,
        qcPending: 80,
        accepted: 240,
        issued: 120,
        returned: 10,
        writtenOff: 0,
      },
      {
        project: 'НС-СЕВ',
        category: 'Трубопровод',
        cipher: '400',
        material: 'Труба 57',
        unit: 'м',
        plannedQuantity: 2200,
        requested: 1400,
        received: 900,
        qcPending: 150,
        accepted: 750,
        issued: 610,
        returned: 0,
        writtenOff: 12,
      },
    ])

    expect(summary).toHaveLength(1)
    expect(summary[0]?.totals.plannedQuantity).toBe(2700)
    expect(summary[0]?.totals.balance).toBe(258)
    expect(summary[0]?.rows.map((row) => row.cipher)).toEqual(['300', '400'])
  })

  it('warns when issuing material before accepted quality control', () => {
    expect(getIssueWarnings('pending')).toEqual([
      'Материал еще ожидает входной контроль',
    ])
    expect(getIssueWarnings('accepted')).toEqual([])
  })
})
