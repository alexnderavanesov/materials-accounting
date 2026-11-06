import { describe, expect, it } from 'vitest'
import { buildOperationActivityIndex } from './operation-activity'

const empty = {
  materialRequests: [],
  materialReceipts: [],
  qualityControls: [],
}
describe('overview activity ordering', () => {
  it('includes later issues, returns and inspection documents without losing the latest date per material', () => {
    const index = buildOperationActivityIndex({
      ...empty,
      materialReceipts: [{ projectLineId: 'material', date: '2026-10-30' }],
      additionalOperations: [
        { projectLineId: 'material', date: '2026-11-05' },
        { projectLineId: 'material', date: '2026-11-01' },
        { projectLineId: 'other', date: '2026-11-04' },
        { projectLineId: '', date: '2026-11-06' },
      ],
    })
    expect(index.get('material')!).toBeGreaterThan(index.get('other')!)
    expect(index.has('')).toBe(false)
  })
  it.each(['materialRequests', 'materialReceipts', 'qualityControls'] as const)(
    'prioritizes the most recently inserted same-date entry in %s',
    (kind) => {
      const index = buildOperationActivityIndex({
        ...empty,
        [kind]: [
          { projectLineId: 'new', date: '2026-10-14' },
          { projectLineId: 'old', date: '2026-10-14' },
        ],
      })
      expect(index.get('new')!).toBeGreaterThan(index.get('old')!)
    },
  )
  it('keeps the document date primary and uses the latest of several entries per line', () => {
    const index = buildOperationActivityIndex({
      ...empty,
      materialRequests: [
        { projectLineId: 'old', date: '2026-10-13' },
        { projectLineId: 'new', date: '2026-10-14' },
        { projectLineId: 'new', date: '2026-10-12' },
      ],
    })
    expect(index.get('new')!).toBeGreaterThan(index.get('old')!)
  })
  it('does not retain activity for removed operations and handles invalid legacy dates deterministically', () => {
    const index = buildOperationActivityIndex({
      ...empty,
      materialRequests: [
        { projectLineId: 'new', date: 'invalid' },
        { projectLineId: 'old', date: '' },
      ],
    })
    expect(index.get('new')!).toBeGreaterThan(index.get('old')!)
    expect(buildOperationActivityIndex(empty).size).toBe(0)
  })
})
