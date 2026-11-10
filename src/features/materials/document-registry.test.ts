import { describe, expect, it } from 'vitest'
import { documentRegistryFixture } from './document-registry.fixtures'
import {
  buildDocumentRegistry,
  qualityDocumentCategory,
} from './document-registry'
import { buildQualityPrintData } from './quality-print-data'

describe('material document registry', () => {
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
