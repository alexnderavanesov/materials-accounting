import { expect, it } from 'vitest'
import {
  acceptFixture,
  historicalReinspection,
  inspectionFixture,
} from './quality-workflow.fixtures'
import {
  createAcceptedInspectionAct,
  currentInspection,
  localToday,
  signInspection,
} from './quality-workflow'
import { summarizeInspectionDocuments } from './quality-workflow-indicators'

it('tracks ZNI signing, AVK creation and signing as separate work stages', () => {
  const { cases } = inspectionFixture().qualityWorkflow
  const entry = cases[0]!
  expect(summarizeInspectionDocuments(cases)).toEqual({
    zniCreated: 1,
    zniSigned: 0,
    zniPending: 1,
    avkCreated: 0,
    avkSigned: 0,
    avkPending: 0,
    avkNeeded: 0,
  })
  const revision = currentInspection(entry)
  Object.assign(revision.zni.rows[0]!, { accepted: 10, result: 'accepted' })
  entry.revisions[0] = signInspection(revision, 'zni', localToday())
  expect(summarizeInspectionDocuments(cases)).toMatchObject({
    zniSigned: 1,
    zniPending: 0,
    avkNeeded: 1,
    avkPending: 0,
  })
  const signed = currentInspection(entry)
  signed.avk = createAcceptedInspectionAct(entry)
  expect(summarizeInspectionDocuments(cases)).toMatchObject({
    avkCreated: 1,
    avkSigned: 0,
    avkPending: 1,
    avkNeeded: 0,
  })
  signed.avk.number = 'АВК-1'
  signed.avk.checks.fill('Проверено')
  signed.avk.conclusion = 'Принято'
  entry.revisions[0] = signInspection(signed, 'avk', localToday())
  expect(summarizeInspectionDocuments(cases)).toMatchObject({
    avkCreated: 1,
    avkSigned: 1,
    avkPending: 0,
    avkNeeded: 0,
  })
})

it('counts current documents once, excluding historical acts and wholly rejected ZNI from acts to create', () => {
  const signed = acceptFixture().qualityWorkflow.cases[0]!
  const rejected = acceptFixture(0).qualityWorkflow.cases[0]!
  const reopened = historicalReinspection(signed)
  const signedRevision = currentInspection(signed)
  signedRevision.zni.rows.push({
    ...signedRevision.zni.rows[0]!,
    receiptId: 'another-receipt',
  })
  const cases = [signed, rejected, reopened]
  const before = structuredClone(cases)
  expect(summarizeInspectionDocuments(cases)).toEqual({
    zniCreated: 3,
    zniSigned: 2,
    zniPending: 1,
    avkCreated: 1,
    avkSigned: 1,
    avkPending: 0,
    avkNeeded: 0,
  })
  expect(cases).toEqual(before)
  expect(Object.values(summarizeInspectionDocuments([]))).toEqual(
    Array(7).fill(0),
  )
})
