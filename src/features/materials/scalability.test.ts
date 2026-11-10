import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaledWorkspace } from './scalability.fixtures'
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
import { buildDocumentRegistry } from './document-registry'

// Synthetic fixtures only; no production file, browser cache or database access.

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
      const counts = process.env.MATERIALS_SCALE_COUNTS
        ? process.env.MATERIALS_SCALE_COUNTS.split(',').map(Number)
        : [1000, 5000, 10000]
      if (
        counts.some(
          (count) => !Number.isSafeInteger(count) || count < 1 || count > 50000,
        )
      )
        throw new Error('Scale counts must be integers from 1 to 50000')
      for (const count of counts) {
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
        measure('registryMs', () => {
          const registry = buildDocumentRegistry(toWorkspaceSnapshot(workspace))
          expect(registry.materials).toHaveLength(count)
        })
        measure('serializeMs', () => JSON.stringify(workspace))
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
          times.heapMiB = Math.round(
            process.memoryUsage().heapUsed / 1024 / 1024,
          )
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
