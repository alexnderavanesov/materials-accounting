import { expect, it } from 'vitest'
import { acceptFixture, inspectionFixture } from './quality-workflow.fixtures'
import {
  correctInspectionAct,
  createAcceptedInspectionAct,
  currentInspection,
  inspectionApprovals,
  inspectionMatches,
  inspectionMaterialName,
  localToday,
  rejectInspectionAct,
  reopenInspection,
  signInspection,
  validateQualityWorkspace,
} from './quality-workflow'
import { buildQualityPrintData } from './quality-print-data'
import { workspaceSnapshotSchema } from './workspace-snapshot'

it('keeps legacy documents unchanged when loading and printing without additions', () => {
  const workspace = acceptFixture()
  const entry = workspace.qualityWorkflow.cases[0]!
  expect(workspaceSnapshotSchema.parse(workspace)).toEqual(workspace)
  for (const kind of ['zni', 'avk'] as const) {
    expect(
      buildQualityPrintData(workspace, entry.id, 1, kind).materials[0]!.name,
    ).toBe('Клапан')
  }
})

it('persists additions per receipt, inherits them into AVK and preserves names and quantities at the source', () => {
  const workspace = inspectionFixture()
  workspace.lines[0]!.projectMaterialName = 'Проектное наименование'
  const before = structuredClone(workspace)
  const entry = workspace.qualityWorkflow.cases[0]!
  const row = currentInspection(entry).zni.rows[0]!
  row.nameAddition = 'с покрытием'
  row.accepted = 10
  row.result = 'accepted'
  entry.revisions[0] = signInspection(
    currentInspection(entry),
    'zni',
    localToday(),
  )
  const revision = currentInspection(entry)
  revision.avk = createAcceptedInspectionAct(entry)
  const saved = workspaceSnapshotSchema.parse(
    JSON.parse(JSON.stringify(workspace)),
  )
  expect(() => validateQualityWorkspace(saved, before)).not.toThrow()
  expect(saved.materialReceipts).toEqual(before.materialReceipts)
  expect(saved.lines).toEqual(before.lines)
  expect(revision.zni.rows[0]!.name).toBe('Клапан')
  for (const kind of ['zni', 'avk'] as const) {
    const data = buildQualityPrintData(saved, entry.id, 1, kind)
    expect(data.materials[0]).toMatchObject({
      name: 'Клапан, с покрытием',
      quantity: 10,
    })
    expect(data.fields.materials).toBe('Клапан, с покрытием')
    expect(data.fields.description).toContain('Клапан, с покрытием — 10 шт')
  }
  expect(inspectionMatches(entry, 'клапан, с покрытием')).toBe(true)
})

it('changes and clears AVK additions independently while keeping the signed ZNI intact', () => {
  const workspace = acceptFixture()
  const entry = workspace.qualityWorkflow.cases[0]!
  const revision = currentInspection(entry)
  revision.zni.rows[0]!.nameAddition = 'из ЗНИ'
  revision.avk!.signedOn = null
  const before = structuredClone(workspace)
  const zniPrint = buildQualityPrintData(workspace, entry.id, 1, 'zni')
  for (const addition of ['уточнение АВК', '']) {
    revision.avk!.nameAdditions = { receipt: addition }
    const saved = workspaceSnapshotSchema.parse(
      JSON.parse(JSON.stringify(workspace)),
    )
    expect(() => validateQualityWorkspace(saved, before)).not.toThrow()
    expect(buildQualityPrintData(saved, entry.id, 1, 'zni')).toEqual(zniPrint)
    const data = buildQualityPrintData(saved, entry.id, 1, 'avk')
    const name = addition ? `Клапан, ${addition}` : 'Клапан'
    expect(data.materials[0]!.name).toBe(name)
    expect(data.fields.materials).toBe(name)
    expect(data.fields.remarks).toContain(`${name} (зав. №123)`)
    expect(data.fields.conclusion).toContain(`${name} (зав. №123)`)
    expect(inspectionApprovals(saved.qualityWorkflow)).toEqual(
      inspectionApprovals(before.qualityWorkflow),
    )
  }
  revision.avk!.nameAdditions = { receipt: 'уточнение АВК' }
  expect(inspectionMatches(entry, 'уточнение авк')).toBe(true)
  expect(inspectionMatches(entry, 'из зни')).toBe(true)
})

it('keeps additions tied to receipt IDs even when two materials have the same name', () => {
  const workspace = acceptFixture(10)
  const entry = workspace.qualityWorkflow.cases[0]!
  const revision = currentInspection(entry)
  workspace.materialReceipts.push({
    ...workspace.materialReceipts[0]!,
    id: 'receipt-2',
  })
  revision.zni.rows.push({
    ...revision.zni.rows[0]!,
    receiptId: 'receipt-2',
    nameAddition: 'второй',
  })
  revision.zni.rows[0]!.nameAddition = 'первый'
  revision.avk!.nameAdditions = { 'receipt-2': 'уточнённый второй' }
  expect(() => validateQualityWorkspace(workspace)).not.toThrow()
  expect(
    buildQualityPrintData(workspace, entry.id, 1, 'avk').materials.map(
      (row) => row.name,
    ),
  ).toEqual(['Клапан, первый', 'Клапан, уточнённый второй'])
  revision.avk!.nameAdditions = { missing: 'другая позиция' }
  expect(() => validateQualityWorkspace(workspace)).toThrow(
    'Дополнение к наименованию АВК',
  )
  revision.avk!.nameAdditions = { 'receipt-2': 'непринятая позиция' }
  revision.zni.rows[1]!.accepted = 0
  revision.zni.rows[1]!.result = 'rejected'
  expect(() => validateQualityWorkspace(workspace)).toThrow(
    'Дополнение к наименованию АВК',
  )
})

it('protects signed additions and preserves old text through new ZNI and AVK revisions', () => {
  const signed = acceptFixture(10)
  const entry = signed.qualityWorkflow.cases[0]!
  const revision = currentInspection(entry)
  revision.zni.rows[0]!.nameAddition = 'исходное дополнение'
  revision.avk!.nameAdditions = { receipt: 'исходное дополнение АВК' }
  for (const kind of ['zni', 'avk'] as const) {
    const changed = structuredClone(signed)
    const next = currentInspection(changed.qualityWorkflow.cases[0]!)
    if (kind === 'zni') next.zni.rows[0]!.nameAddition = 'изменено'
    else next.avk!.nameAdditions = { receipt: 'изменено' }
    expect(() => validateQualityWorkspace(changed, signed)).toThrow(
      /Подписанную ЗНИ|подписанный АВК/,
    )
  }

  revision.avk!.signedOn = null
  signed.qualityWorkflow.cases[0] = rejectInspectionAct(
    entry,
    'document',
    localToday(),
    'Уточнить название',
  )
  const corrected = structuredClone(signed)
  corrected.qualityWorkflow.cases[0] = correctInspectionAct(
    corrected.qualityWorkflow.cases[0]!,
  )
  const current = currentInspection(corrected.qualityWorkflow.cases[0])
  current.avk!.nameAdditions = { receipt: 'новое дополнение АВК' }
  expect(() => validateQualityWorkspace(corrected, signed)).not.toThrow()
  expect(buildQualityPrintData(corrected, entry.id, 2, 'zni')).toEqual(
    buildQualityPrintData(signed, entry.id, 1, 'zni'),
  )
  expect(buildQualityPrintData(corrected, entry.id, 1, 'avk')).toEqual(
    buildQualityPrintData(signed, entry.id, 1, 'avk'),
  )
  expect(
    buildQualityPrintData(corrected, entry.id, 2, 'avk').materials[0]!.name,
  ).toBe('Клапан, новое дополнение АВК')

  const onlyZni = acceptFixture(10)
  const zni = onlyZni.qualityWorkflow.cases[0]!
  currentInspection(zni).avk = null
  currentInspection(zni).zni.rows[0]!.nameAddition = 'первое'
  const reopened = structuredClone(onlyZni)
  reopened.qualityWorkflow.cases[0] = reopenInspection(zni)
  currentInspection(
    reopened.qualityWorkflow.cases[0],
  ).zni.rows[0]!.nameAddition = 'второе'
  expect(() => validateQualityWorkspace(reopened, onlyZni)).not.toThrow()
  expect(
    buildQualityPrintData(reopened, zni.id, 1, 'zni').materials[0]!.name,
  ).toBe('Клапан, первое')
  expect(
    buildQualityPrintData(reopened, zni.id, 2, 'zni').materials[0]!.name,
  ).toBe('Клапан, второе')
})

it('treats whitespace as an empty addition without changing the received name', () => {
  const row = currentInspection(inspectionFixture().qualityWorkflow.cases[0]!)
    .zni.rows[0]!
  row.nameAddition = '  \n '
  expect(inspectionMaterialName(row)).toBe('Клапан')
})
