import { describe, expect, it } from 'vitest'
import { projectChangeFixture } from './project-changes.fixtures'
import { cipherKey, validateProjectAccounting } from './project-changes'
import { effectiveRequestQuantity } from './project-change-types'
import { localToday } from './quality-workflow'
import {
  importProjectDraft,
  prepareProjectDraft,
  projectDraftChanges,
  refreshProjectDraft,
  updateProjectFields,
} from './project-edit-draft'
import type {
  ProjectEditDraft,
  ProjectEditMetadata,
} from './project-edit-draft'

function fixture(): ProjectEditDraft {
  const baseline = projectChangeFixture()
  baseline.qualityWorkflow!.cases = []
  baseline.materialReceipts[0]!.quantity = 6
  baseline.lines.push({
    ...baseline.lines[0]!,
    id: 'second',
    projectMaterialName: 'Отвод',
    plannedQuantity: 4,
  })
  return { baseline, lines: structuredClone(baseline.lines) }
}
function metadata(
  draft: ProjectEditDraft,
  kind: ProjectEditMetadata['kind'] = 'revision',
): ProjectEditMetadata {
  return {
    kind,
    author: 'Тест',
    date: localToday(),
    reason: 'Согласованные изменения',
    numbers: Object.fromEntries(
      draft.lines.map((line) => [cipherKey(line.project, line.cipher), '2']),
    ),
    replacements: {},
  }
}
const excel = (draft: ProjectEditDraft, quantity = 8) => {
  const line = draft.lines[0]!
  return {
    cipher: line.cipher,
    category: line.category,
    materialType: line.materialType ?? line.category,
    projectMaterialName: line.projectMaterialName ?? line.material,
    material: line.material,
    unit: line.unit,
    quantity,
    unitWeight: line.unitWeight ?? undefined,
    alternativeUnit: line.alternativeUnit ?? undefined,
    alternativeUnitFactor: line.alternativeUnitFactor ?? undefined,
    normativeDocument: line.normativeDocument ?? undefined,
  }
}
describe('project grid and Excel edit batches', () => {
  it('stages several cells without touching facts, commits one revision and cancellation for the cipher', () => {
    const draft = fixture(),
      original = structuredClone(draft.baseline)
    draft.lines[0]!.plannedQuantity = 8
    draft.lines[1]!.plannedQuantity = 3
    expect(draft.baseline).toEqual(original)
    const next = prepareProjectDraft(draft, metadata(draft))
    validateProjectAccounting(next, draft.baseline)
    expect(next.projectChanges?.map((row) => row.kind)).toEqual([
      'baseline',
      'revision',
    ])
    expect(next.projectChanges?.at(-1)?.items).toHaveLength(2)
    expect(next.materialRequests[0]!.quantity).toBe(10)
    expect(effectiveRequestQuantity(next.materialRequests[0]!)).toBe(8)
    expect(next.materialReceipts).toEqual(original.materialReceipts)
    expect(draft.baseline).toEqual(original)
  })
  it('turns a characteristic revision into a linked position, but keeps its ID for a correction', () => {
    const draft = fixture()
    draft.lines = updateProjectFields(
      draft.lines,
      ['line'],
      'material',
      'Новая сталь',
    )
    const revision = prepareProjectDraft(draft, metadata(draft))
    validateProjectAccounting(revision, draft.baseline)
    expect(
      revision.lines.find((row) => row.id === 'line')?.plannedQuantity,
    ).toBe(0)
    const fresh = revision.lines.find((row) => row.material === 'Новая сталь')!
    expect(fresh.id).not.toBe('line')
    expect(
      revision.projectChanges
        ?.at(-1)
        ?.items.find((item) => item.after.id === fresh.id)?.replacesLineId,
    ).toBe('line')
    expect(revision.materialReceipts[0]!.projectLineId).toBe('line')
    const correction = prepareProjectDraft(draft, metadata(draft, 'correction'))
    expect(correction.lines).toHaveLength(2)
    expect(correction.lines.find((row) => row.id === 'line')?.material).toBe(
      'Новая сталь',
    )
    expect(correction.projectChanges?.at(-1)?.number).toBe('')
  })
  it('allows a new unit as a replacement but blocks changing the unit of old documents as an error', () => {
    const draft = fixture()
    draft.lines = updateProjectFields(draft.lines, ['line'], 'unit', 'м')
    expect(() =>
      prepareProjectDraft(draft, metadata(draft, 'correction')),
    ).toThrow('основную единицу')
    expect(() => prepareProjectDraft(draft, metadata(draft))).not.toThrow()
  })
  it('uses one number per cipher, and does not mutate anything if any cipher is invalid', () => {
    const draft = fixture()
    draft.baseline.lines[1]!.cipher = 'ТКМ6'
    draft.lines[1]!.cipher = 'ТКМ6'
    draft.lines = draft.lines.map((line) => ({ ...line, plannedQuantity: 1 }))
    const original = structuredClone(draft.baseline),
      meta = metadata(draft)
    meta.numbers[cipherKey('Объект', 'ТКМ6')] = ''
    expect(() => prepareProjectDraft(draft, meta)).toThrow()
    expect(draft.baseline).toEqual(original)
    meta.numbers[cipherKey('Объект', 'ТКМ6')] = '5'
    const next = prepareProjectDraft(draft, meta)
    validateProjectAccounting(next, draft.baseline)
    expect(
      next.projectChanges
        ?.filter((row) => row.kind === 'revision')
        .map((row) => row.number),
    ).toEqual(['2', '5'])
  })
  it('full Excel excludes missing rows only in included ciphers, changes mode preserves them', () => {
    const draft = fixture()
    draft.lines.push({ ...draft.lines[0]!, id: 'other', cipher: 'ТКМ6' })
    draft.baseline.lines = structuredClone(draft.lines)
    const changes = importProjectDraft(draft, [excel(draft)], 'changes')
    expect(
      changes.lines.find((row) => row.id === 'second')!.plannedQuantity,
    ).toBe(4)
    expect(
      changes.lines.find((row) => row.id === 'line')!.plannedQuantity,
    ).toBe(8)
    const full = importProjectDraft(draft, [excel(draft)], 'full')
    expect(full.lines.find((row) => row.id === 'second')!.plannedQuantity).toBe(
      0,
    )
    expect(full.lines.find((row) => row.id === 'other')!.plannedQuantity).toBe(
      10,
    )
    validateProjectAccounting(
      prepareProjectDraft(full, metadata(full)),
      draft.baseline,
    )
  })
  it('requires an explicit reduced source for partial Excel replacement and preserves old document links', () => {
    const draft = fixture()
    const staged = importProjectDraft(
      draft,
      [{ ...excel(draft, 2), projectMaterialName: 'Клапан новый' }],
      'changes',
    )
    const fresh = staged.lines.find(
      (line) => line.projectMaterialName === 'Клапан новый',
    )!
    const meta = metadata(staged)
    expect(
      prepareProjectDraft(staged, meta)
        .projectChanges?.at(-1)
        ?.items.find((item) => item.after.id === fresh.id)?.replacesLineId,
    ).toBeUndefined()
    meta.replacements[fresh.id!] = 'line'
    expect(() => prepareProjectDraft(staged, meta)).toThrow(
      'Уменьшите старую потребность',
    )
    staged.lines = staged.lines.map((line) =>
      line.id === 'line' ? { ...line, plannedQuantity: 8 } : line,
    )
    const next = prepareProjectDraft(staged, meta)
    validateProjectAccounting(next, draft.baseline)
    expect(next.lines.find((line) => line.id === 'line')!.plannedQuantity).toBe(
      8,
    )
    expect(
      next.projectChanges
        ?.at(-1)
        ?.items.find((item) => item.after.id === fresh.id)?.replacesLineId,
    ).toBe('line')
    expect(next.materialReceipts).toEqual(draft.baseline.materialReceipts)
  })
  it('saves a first Excel import as one populated baseline and links the next revision to it', () => {
    const draft = fixture(),
      row = { ...excel(draft), cipher: 'НОВЫЙ' },
      staged = importProjectDraft(
        draft,
        [row, { ...row, projectMaterialName: 'Задвижка DN50' }],
        'full',
      )
    const initial = { ...metadata(staged, 'baseline'), reason: '', numbers: {} }
    const next = prepareProjectDraft(staged, initial)
    validateProjectAccounting(next, draft.baseline)
    expect(next.projectChanges).toHaveLength(1)
    const baseline = next.projectChanges![0]!
    expect(baseline).toMatchObject({
      cipher: 'НОВЫЙ',
      kind: 'baseline',
      number: '',
      previousId: null,
      date: initial.date,
      author: initial.author,
    })
    expect(
      baseline.items.map((item) => [
        item.before,
        item.after.projectMaterialName,
      ]),
    ).toEqual([
      [null, row.projectMaterialName],
      [null, 'Задвижка DN50'],
    ])
    expect(next.materialRequests).toEqual(draft.baseline.materialRequests)
    const saved = { baseline: next, lines: next.lines }
    expect(
      projectDraftChanges(importProjectDraft(saved, [row], 'changes')),
    ).toEqual([])
    const updated = importProjectDraft(
      saved,
      [{ ...row, quantity: 12 }],
      'changes',
    )
    expect(() => prepareProjectDraft(updated, initial)).toThrow('Выберите')
    const revised = prepareProjectDraft(updated, metadata(updated))
    validateProjectAccounting(revised, next)
    expect(revised.projectChanges).toHaveLength(2)
    expect(revised.projectChanges?.[1]).toMatchObject({
      kind: 'revision',
      previousId: baseline.id,
      items: [
        { before: { plannedQuantity: 8 }, after: { plannedQuantity: 12 } },
      ],
    })
  })
  it('rejects an incomplete initial history or a competing first import in the same cipher', () => {
    const draft = fixture(),
      row = { ...excel(draft), cipher: 'НОВЫЙ' }
    const staged = importProjectDraft(
      draft,
      [row, { ...row, projectMaterialName: 'Задвижка DN50' }],
      'changes',
    )
    const initial = metadata(staged, 'baseline')
    const next = prepareProjectDraft(staged, initial)
    const incomplete = structuredClone(next)
    incomplete.projectChanges![0]!.items.pop()
    expect(() =>
      validateProjectAccounting(incomplete, draft.baseline),
    ).toThrow()
    const otherDraft = importProjectDraft(
      draft,
      [{ ...row, projectMaterialName: 'Отвод' }],
      'changes',
    )
    const other = prepareProjectDraft(otherDraft, initial)
    expect(() =>
      validateProjectAccounting(
        {
          ...next,
          lines: [
            ...next.lines,
            ...other.lines.filter((line) => line.cipher === 'НОВЫЙ'),
          ],
          projectChanges: [...next.projectChanges!, ...other.projectChanges!],
        },
        other,
      ),
    ).toThrow()
    expect(() =>
      prepareProjectDraft(refreshProjectDraft(staged, other), initial),
    ).toThrow('Выберите')
  })
  it('treats matching legacy defaults in Excel as unchanged and refuses unallocated new placeholders', () => {
    const draft = fixture()
    expect(
      projectDraftChanges(
        importProjectDraft(draft, [excel(draft, 10)], 'changes'),
      ),
    ).toEqual([])
    draft.lines.push({
      ...draft.lines[0]!,
      id: 'new',
      projectMaterialName: 'Новая позиция',
      plannedQuantity: 0,
    })
    expect(() => prepareProjectDraft(draft, metadata(draft))).toThrow(
      'Укажите количество',
    )
  })
  it('returns to a clean draft when a quantity is restored', () => {
    const draft = fixture()
    draft.lines[0]!.plannedQuantity = 8
    expect(projectDraftChanges(draft)).toHaveLength(1)
    draft.lines[0]!.plannedQuantity = 10
    expect(projectDraftChanges(draft)).toEqual([])
  })
  it('refreshes consequences for new operations but preserves local edits and detects field conflicts', () => {
    const draft = fixture()
    draft.lines[0]!.plannedQuantity = 8
    const current = structuredClone(draft.baseline)
    current.materialReceipts[0]!.quantity = 7
    const refreshed = refreshProjectDraft(draft, current)
    expect(refreshed.lines[0]!.plannedQuantity).toBe(8)
    expect(refreshed.baseline.materialReceipts[0]!.quantity).toBe(7)
    current.lines[0]!.plannedQuantity = 12
    expect(() => refreshProjectDraft(draft, current)).toThrow(
      'изменено другим пользователем',
    )
    expect(draft.lines[0]!.plannedQuantity).toBe(8)
  })
})
