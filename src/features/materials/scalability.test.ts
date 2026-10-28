import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acceptFixture } from './quality-workflow.fixtures'
import {
  inspectionApprovals,
  validateQualityWorkspace,
} from './quality-workflow'
import { receiptBalances } from './receipt-balances'
import { documentsForReceipt, indexReceiptDocuments } from './receipt-documents'
import { normalizeImportRow } from './domain'
import { applyMaterialImportRows } from './project-material-data'
import { toWorkspaceSnapshot } from './workspace-snapshot'
import { createWorkspaceStore } from './workspace-snapshot.server'

// Synthetic fixtures only; no production file, browser cache or database access.
function scaledWorkspace(count: number) {
  const seed = acceptFixture(8)
  const workspace = {
    ...seed,
    lines: [] as typeof seed.lines,
    materialRequests: [] as typeof seed.materialRequests,
    materialReceipts: [] as typeof seed.materialReceipts,
    materialIssues: [] as typeof seed.materialIssues,
    qualityWorkflow: {
      ...seed.qualityWorkflow,
      cases: [] as typeof seed.qualityWorkflow.cases,
      receiptDocuments: [] as NonNullable<
        typeof seed.qualityWorkflow.receiptDocuments
      >,
      customerReturns: [] as NonNullable<
        typeof seed.qualityWorkflow.customerReturns
      >,
    },
  }
  for (let index = 0; index < count; index++) {
    const lineId = `line-${index}`,
      receiptId = `receipt-${index}`,
      requestId = `request-${index}`
    const document = {
      ...seed.qualityWorkflow.receiptDocuments![0]!,
      id: `app-${index}`,
      number: `АПП-${index}`,
    }
    const entry = structuredClone(seed.qualityWorkflow.cases[0]!)
    entry.id = `case-${index}`
    entry.basis = document
    const revision = entry.revisions[0]!
    revision.zni.number = `ЗНИ-${index}`
    revision.avk!.number = `АВК-${index}`
    Object.assign(revision.zni.rows[0]!, { receiptId, projectLineId: lineId })
    workspace.lines.push({ ...seed.lines[0], id: lineId })
    workspace.materialRequests.push({
      id: requestId,
      projectLineId: lineId,
      quantity: 10,
    })
    workspace.materialReceipts.push({
      ...seed.materialReceipts[0],
      id: receiptId,
      projectLineId: lineId,
      requestId,
      appDocumentId: document.id,
    })
    workspace.materialIssues.push({
      id: `issue-${index}`,
      receiptId,
      projectLineId: lineId,
      quantity: 1,
    })
    workspace.qualityWorkflow.cases.push(entry)
    workspace.qualityWorkflow.receiptDocuments.push(document)
    workspace.qualityWorkflow.customerReturns.push({
      id: `return-${index}`,
      kind: 'rejected',
      receiptId,
      caseId: entry.id,
      revision: 1,
      quantity: 2,
      date: revision.zni.signedOn!,
      documentNumber: '',
      note: '',
    })
  }
  return workspace
}

describe('isolated accounting scale', () => {
  it('keeps receipt, inspection, issue and return quantities consistent across 1000 positions', () => {
    const workspace = scaledWorkspace(1000)
    validateQualityWorkspace(workspace, workspace)
    const balances = receiptBalances(
      workspace.materialReceipts as unknown as Parameters<
        typeof receiptBalances
      >[0],
      workspace.qualityWorkflow,
      inspectionApprovals(workspace.qualityWorkflow),
      workspace.materialIssues as unknown as Parameters<
        typeof receiptBalances
      >[3],
    )
    expect(balances.size).toBe(1000)
    for (const value of balances.values())
      expect(value).toMatchObject({
        received: 10,
        returned: 2,
        stock: 7,
        availableToIssue: 7,
        toReturn: 0,
        awaitingAct: 0,
        awaitingInspection: 0,
      })
  })
  it.skipIf(process.env.MATERIALS_SCALE_CHECK !== '1')(
    'measures validation, balances, document lookup and snapshot copies at the target scale',
    async () => {
      const results: Array<Record<string, number>> = []
      for (const count of [1000, 5000, 10000]) {
        const workspace = scaledWorkspace(count)
        const times: Record<string, number> = {}
        function measure(name: string, run: () => unknown) {
          const start = performance.now()
          run()
          times[name] = Math.round(performance.now() - start)
        }
        measure('validateMs', () =>
          validateQualityWorkspace(workspace, workspace),
        )
        measure('balancesMs', () =>
          receiptBalances(
            workspace.materialReceipts as unknown as Parameters<
              typeof receiptBalances
            >[0],
            workspace.qualityWorkflow,
            inspectionApprovals(workspace.qualityWorkflow),
            workspace.materialIssues as unknown as Parameters<
              typeof receiptBalances
            >[3],
          ),
        )
        measure('documentLookupMs', () => {
          const index = indexReceiptDocuments(workspace.qualityWorkflow)
          workspace.materialReceipts.forEach((receipt) =>
            documentsForReceipt(
              receipt as unknown as Parameters<typeof documentsForReceipt>[0],
              workspace.qualityWorkflow,
              index,
            ),
          )
        })
        measure('importMs', () =>
          applyMaterialImportRows(
            [],
            Array.from({ length: count }, (_, i) =>
              normalizeImportRow(
                {
                  cipher: 'ТК1',
                  projectMaterialName: `Материал ${i}`,
                  unit: 'м',
                  quantity: 1,
                },
                i + 1,
              ),
            ),
          ),
        )
        measure('snapshotCopyMs', () => toWorkspaceSnapshot(workspace))
        const directory = await mkdtemp(join(tmpdir(), 'materials-scale-'))
        try {
          const store = createWorkspaceStore(directory)
          const snapshot = toWorkspaceSnapshot(workspace)
          const initial = await store.save(snapshot, null)
          if (initial.status !== 'saved') throw new Error('Fixture save failed')
          snapshot.configuredUnits.push('кг')
          const start = performance.now()
          const saved = await store.save(snapshot, initial.revision)
          times.saveMs = Math.round(performance.now() - start)
          expect(saved.status).toBe('saved')
          const loadStart = performance.now()
          const restored = await store.load()
          times.loadMs = Math.round(performance.now() - loadStart)
          expect(restored.workspace?.materialReceipts).toHaveLength(count)
          expect(restored.workspace?.configuredUnits).toContain('кг')
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
        results.push({
          positions: count,
          snapshotMiB: Number(
            (
              Buffer.byteLength(JSON.stringify(workspace)) /
              1024 /
              1024
            ).toFixed(2),
          ),
          ...times,
        })
        if (process.env.MATERIALS_SCALE_OUTPUT)
          writeFileSync(
            process.env.MATERIALS_SCALE_OUTPUT,
            JSON.stringify(results, null, 2),
          )
      }
    },
    120000,
  )
})
