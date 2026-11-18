import { describe, expect, it } from 'vitest'
import { documentRegistryFixture } from './document-registry.fixtures'
import {
  buildDocumentRegistry,
  qualityDocumentCategory,
} from './document-registry'
import { buildQualityPrintData } from './quality-print-data'

describe('material document registry', () => {
  it('collects distinct receipt names across ciphers and marks only substitutions without changing document links', () => {
    const workspace = documentRegistryFixture()
    const projectName =
      'Труба стальная бесшовная горячедеформированная 57x4 сталь 20 гарантия гидроиспытания, кроме изготовленных из слитков'
    for (const line of workspace.lines) line.projectMaterialName = projectName
    for (const request of workspace.materialRequests)
      request.projectMaterialName = projectName
    const original = buildDocumentRegistry(workspace)
    workspace.materialReceipts[0]!.actualName = 'Труба 57х4 09г2с'
    workspace.materialReceipts[1]!.actualName = projectName
    const changed = buildDocumentRegistry(workspace)
    expect(changed.documents).toEqual(original.documents)
    expect(changed.materials[0]!.id).toBe(original.materials[0]!.id)
    workspace.materialReceipts.push({
      ...workspace.materialReceipts[0],
      id: 'receipt-duplicate-name',
      actualName: '  ТРУБА   57X4 09Г2С  ',
    })
    const before = JSON.stringify(workspace)
    const registry = buildDocumentRegistry(workspace)
    expect(registry.materials).toHaveLength(1)
    expect(registry.materials[0]).toMatchObject({
      name: projectName,
      receivedNames: [
        { name: 'Труба 57х4 09г2с', replacement: true },
        { name: projectName, replacement: false },
      ],
    })
    expect(registry.documents.filter((doc) => doc.kind === 'app')).toHaveLength(
      1,
    )
    expect(JSON.stringify(workspace)).toBe(before)
  })
  it('uses the original request name for replacement status and keeps names separate for distinct project materials', () => {
    const workspace = documentRegistryFixture()
    workspace.lines[0]!.projectMaterialName =
      'Клапан с новым проектным названием'
    workspace.materialReceipts[0]!.actualName = 'Клапан'
    workspace.materialReceipts[1]!.actualName = 'Другой клапан'
    const registry = buildDocumentRegistry(workspace)
    expect(registry.materials).toHaveLength(2)
    expect(
      registry.materials.find((row) => row.lineIds.includes('line'))!
        .receivedNames,
    ).toEqual([{ name: 'Клапан', replacement: false }])
    expect(
      registry.materials.find((row) =>
        row.lineIds.includes('line-second-cipher'),
      )!.receivedNames,
    ).toEqual([{ name: 'Другой клапан', replacement: true }])
  })
  it('does not invent a receipt name before delivery and keeps both names if a project material was deleted', () => {
    const workspace = documentRegistryFixture()
    workspace.materialReceipts = []
    expect(
      buildDocumentRegistry(workspace).materials[0]!.receivedNames,
    ).toEqual([])
    const historical = documentRegistryFixture()
    historical.lines = []
    historical.materialReceipts[0]!.actualName = 'Клапан по факту'
    expect(
      buildDocumentRegistry(historical).materials.find((row) =>
        row.lineIds.includes('line'),
      ),
    ).toMatchObject({
      name: 'Клапан',
      receivedNames: [{ name: 'Клапан по факту', replacement: true }],
    })
  })
  it('keeps uploaded originals discoverable after deleting their material and source operation', () => {
    const workspace = documentRegistryFixture()
    workspace.lines = []
    workspace.materialRequests = []
    workspace.materialReceipts = []
    workspace.materialIssues = []
    workspace.qualityWorkflow.cases = []
    workspace.qualityWorkflow.customerReturns = []
    const registry = buildDocumentRegistry(workspace, [
      {
        id: 'manual:retained-original',
        kind: 'certificate',
        label: 'Сертификат №221',
        date: '',
        lineIds: ['deleted-line'],
      },
    ])
    expect(registry.documents).toHaveLength(1)
    expect(registry.materials).toHaveLength(1)
    expect(registry.materials[0]).toMatchObject({
      name: 'Удалённый материал',
      lineIds: ['deleted-line'],
      documentIds: ['manual:retained-original'],
    })
    expect(registry.documents[0]!.materialIds).toEqual([
      registry.materials[0]!.id,
    ])
  })
  it('groups one material across ciphers, links every document type and deduplicates shared APP', () => {
    const workspace = documentRegistryFixture(),
      before = JSON.stringify(workspace)
    const registry = buildDocumentRegistry(workspace)
    expect(registry.materials).toHaveLength(1)
    expect(registry.materials[0]!.lineIds).toEqual([
      'line',
      'line-second-cipher',
    ])
    expect(registry.documents.filter((doc) => doc.kind === 'app')).toHaveLength(
      1,
    )
    expect(
      registry.documents.filter((doc) => doc.kind === 'request'),
    ).toHaveLength(2)
    expect(new Set(registry.documents.map((doc) => doc.kind))).toEqual(
      new Set([
        'request',
        'app',
        'm15',
        'passport',
        'zni',
        'avk',
        'arvk',
        'issue',
        'return',
      ]),
    )
    // Copied passport data in ZNI and AVK does not create extra originals.
    expect(
      registry.documents.filter((doc) => doc.kind === 'passport'),
    ).toHaveLength(2)
    expect(JSON.stringify(workspace)).toBe(before)
  })
  it('does not merge materials with identical names but different specifications', () => {
    const workspace = documentRegistryFixture()
    workspace.lines[1]!.normativeDocument = 'Другой ГОСТ'
    const registry = buildDocumentRegistry(workspace)
    expect(registry.materials).toHaveLength(2)
    expect(
      registry.documents.find((doc) => doc.kind === 'app')!.materialIds,
    ).toHaveLength(2)
  })
  it('does not guess whether a bare number is a passport or certificate', () => {
    expect(qualityDocumentCategory('221')).toBe('quality')
    expect(qualityDocumentCategory('Паспорт / сертификат')).toBe('quality')
    expect(qualityDocumentCategory('Сертификат соответствия №221')).toBe(
      'certificate',
    )
    expect(qualityDocumentCategory('Паспорт №221')).toBe('passport')
  })
  it('links manual originals by line IDs after renaming a material', () => {
    const workspace = documentRegistryFixture()
    workspace.lines[0]!.projectMaterialName = 'Другое имя'
    const registry = buildDocumentRegistry(workspace, [
      {
        id: 'manual:file',
        kind: 'certificate',
        label: 'Сертификат №221',
        date: '',
        lineIds: ['line'],
      },
    ])
    const doc = registry.documents.find((entry) => entry.id === 'manual:file')!
    expect(
      registry.materials.find((row) => row.id === doc.materialIds[0])!.name,
    ).toBe('Другое имя')
  })
  it('prints names and main quantities from the saved revision using existing alternative conversion rules', () => {
    const workspace = documentRegistryFixture(),
      entry = workspace.qualityWorkflow.cases[0]!
    const before = buildQualityPrintData(workspace, entry.id, 1, 'avk')
    workspace.lines[0]!.alternativeUnitFactor = 100
    workspace.lines[0]!.projectMaterialName = 'Новое название'
    workspace.materialReceipts[0]!.altUnitFactor = 100
    const after = buildQualityPrintData(workspace, entry.id, 1, 'avk')
    expect(after.materials[0]!.name).toBe(before.materials[0]!.name)
    expect(after.materials[0]!.quantity).toBe(before.materials[0]!.quantity)
    expect(after.materials[0]!.altQuantity).toBe(
      Number(after.materials[0]!.quantity) * 100,
    )
  })
  it('indexes 10,000 positions without changing the workspace', () => {
    const workspace = documentRegistryFixture()
    workspace.lines = Array.from({ length: 10000 }, (_, i) => ({
      ...workspace.lines[0],
      id: `line-${i}`,
      projectMaterialName: `Труба ${i}`,
    }))
    workspace.materialRequests = workspace.lines.map((line, i) => ({
      ...workspace.materialRequests[0],
      id: `request-${i}`,
      number: `ЗП-${i}`,
      projectLineId: String(line.id),
      projectMaterialName: String(line.projectMaterialName),
    }))
    workspace.materialReceipts = []
    workspace.materialIssues = []
    workspace.qualityWorkflow.cases = []
    workspace.qualityWorkflow.customerReturns = []
    const start = performance.now(),
      registry = buildDocumentRegistry(workspace)
    expect(registry.materials).toHaveLength(10000)
    expect(registry.documents).toHaveLength(10000)
    expect(performance.now() - start).toBeLessThan(4000)
  })
})
