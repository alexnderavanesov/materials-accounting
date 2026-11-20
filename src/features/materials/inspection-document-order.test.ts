import { expect, it } from 'vitest'
import {
  acceptFixture,
  historicalReinspection,
} from './quality-workflow.fixtures'
import {
  correctInspectionAct,
  currentInspection,
  localToday,
  qualityWorkflowSchema,
  rejectInspectionAct,
  validateQualityWorkspace,
} from './quality-workflow'
import {
  newestInspectionDocuments,
  saveInspectionCase,
} from './inspection-document-order'
import type { QualityWorkflow } from './quality-workflow'

const time = Date.parse('2026-11-20T10:00:00.000Z')
const ids = (rows: ReturnType<typeof newestInspectionDocuments>) =>
  rows.map((row) => row.id)

function documents() {
  const fixture = acceptFixture()
  const first = structuredClone(fixture.qualityWorkflow.cases[0]!)
  const second = structuredClone(first)
  first.id = 'first'
  second.id = 'second'
  for (const entry of [first, second]) currentInspection(entry).avk = null
  let workflow: QualityWorkflow = { ...fixture.qualityWorkflow, cases: [] }
  workflow = saveInspectionCase(workflow, first, time)
  workflow = saveInspectionCase(workflow, second, time)
  return { fixture, first, second, workflow }
}

it('records first-save order even within one millisecond and preserves it on retries and edits', () => {
  const { workflow, first, second } = documents()
  const saved = currentInspection(workflow.cases[1]!).zni.createdAt
  expect(currentInspection(first).zni.createdAt).toBeUndefined()
  expect(saved).toBe('2026-11-20T10:00:00.001Z')
  expect(ids(newestInspectionDocuments(workflow.cases, 'zni'))).toEqual([
    'second',
    'first',
  ])
  const retry = saveInspectionCase(workflow, second, time + 1000)
  expect(retry).toEqual(workflow)
  const edited = structuredClone(workflow.cases[0]!)
  currentInspection(edited).zni.date = '2027-12-31'
  const updated = saveInspectionCase(workflow, edited, time + 2000)
  expect(ids(updated.cases)).toEqual(['first', 'second'])
  expect(ids(newestInspectionDocuments(updated.cases, 'zni'))).toEqual([
    'second',
    'first',
  ])
  expect(
    qualityWorkflowSchema.parse(JSON.parse(JSON.stringify(updated))),
  ).toEqual(updated)
})

it('orders AVKs by their own creation, leaving ZNI order and historical AVKs intact', () => {
  const { fixture, workflow } = documents()
  let next = workflow
  for (const id of ['second', 'first']) {
    const entry = structuredClone(next.cases.find((item) => item.id === id)!)
    currentInspection(entry).avk = structuredClone(
      currentInspection(fixture.qualityWorkflow.cases[0]!).avk,
    )
    next = saveInspectionCase(next, entry, time + 1000)
  }
  expect(ids(newestInspectionDocuments(next.cases, 'zni'))).toEqual([
    'second',
    'first',
  ])
  expect(ids(newestInspectionDocuments(next.cases, 'avk'))).toEqual([
    'first',
    'second',
  ])
  next.cases[0] = historicalReinspection(next.cases[0]!)
  expect(ids(newestInspectionDocuments(next.cases, 'avk'))).toEqual([
    'first',
    'second',
  ])
})

it('preserves creation on rejection and correction, including legacy timestamps being absent', () => {
  const fixture = acceptFixture()
  let entry = fixture.qualityWorkflow.cases[0]!
  currentInspection(entry).avk!.signedOn = null
  const baseline = saveInspectionCase(
    { ...fixture.qualityWorkflow, cases: [] },
    entry,
    time,
  )
  const original = baseline.cases[0]!
  entry = correctInspectionAct(
    rejectInspectionAct(
      original,
      'document',
      localToday(),
      'Исправить реквизиты',
    ),
  )
  const next = saveInspectionCase(baseline, entry, time + 1000)
  expect(currentInspection(next.cases[0]!).avk!.createdAt).toBe(
    currentInspection(original).avk!.createdAt,
  )
  expect(() =>
    validateQualityWorkspace(
      { ...fixture, qualityWorkflow: next },
      { ...fixture, qualityWorkflow: baseline },
    ),
  ).not.toThrow()
  const legacy = structuredClone(fixture.qualityWorkflow)
  const updated = saveInspectionCase(legacy, legacy.cases[0]!, time)
  expect(updated).toEqual(legacy)
})

it('uses each legacy document date independently without rewriting old records', () => {
  const fixture = acceptFixture()
  const first = structuredClone(fixture.qualityWorkflow.cases[0]!)
  const second = structuredClone(first)
  first.id = 'first'
  second.id = 'second'
  currentInspection(first).zni.date = '2026-11-01'
  currentInspection(second).zni.date = '2026-11-02'
  const cases = [first, second]
  const before = structuredClone(cases)
  expect(ids(newestInspectionDocuments(cases, 'zni'))).toEqual([
    'second',
    'first',
  ])
  expect(ids(newestInspectionDocuments(cases, 'avk'))).toEqual([
    'first',
    'second',
  ])
  expect(cases).toEqual(before)
})

it.each(['zni', 'avk'] as const)(
  'rejects changes and removal of stored %s creation time during workspace validation',
  (kind) => {
    const fixture = acceptFixture()
    const entry = fixture.qualityWorkflow.cases[0]!
    currentInspection(entry).avk!.signedOn = null
    const workflow = saveInspectionCase(
      { ...fixture.qualityWorkflow, cases: [] },
      entry,
      time,
    )
    for (const timestamp of ['2026-11-21T10:00:00.000Z', undefined]) {
      const next = structuredClone(workflow)
      currentInspection(next.cases[0]!)[kind]!.createdAt = timestamp
      expect(() =>
        validateQualityWorkspace(
          { ...fixture, qualityWorkflow: next },
          { ...fixture, qualityWorkflow: workflow },
        ),
      ).toThrow('Нельзя менять время создания сохранённого документа.')
    }
  },
)
