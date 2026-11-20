import { m15Fixture, linkedM15Fixture } from './m15-reconciliation.fixtures'
import { calculateM15, m15ReceiptIndex } from './m15-reconciliation'
import { automaticM15, calculateAutomaticM15 } from './m15-automatic'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPostgresWorkspaceStore } from './workspace-postgres.server'
import { scaledWorkspace } from './scalability.fixtures'
import {
  acceptFixture,
  documentInspectionFixture,
} from './quality-workflow.fixtures'
import {
  correctInspectionAct,
  currentInspection,
  localToday,
  rejectInspectionAct,
  recordCustomerReturn,
  signInspection,
  inspectionApprovals,
  createAcceptedInspectionAct,
} from './quality-workflow'
import {
  entityGroups,
  recordKey,
  workspaceEntities,
  jsonEqual,
} from './workspace-protocol'
import type { WorkspacePatch, Json, Collection } from './workspace-protocol'
import type { LoadedWorkspace } from './workspace-snapshot'

const enabled = process.env.MATERIALS_POSTGRES_TEST === '1'
describe.skipIf(!enabled)(
  'PostgreSQL workspace: isolated transactions and concurrent editors',
  () => {
    let sql: postgres.Sql, admin: postgres.Sql
    const connections: { sql?: postgres.Sql; admin?: postgres.Sql } = {}
    let store: ReturnType<typeof createPostgresWorkspaceStore>
    const schema = `materials_test_${randomUUID().replaceAll('-', '')}`
    beforeAll(async () => {
      const url = process.env.DATABASE_URL_TEST!
      if (!url || !new URL(url).pathname.endsWith('_test'))
        throw new Error('Use a dedicated DATABASE_URL_TEST ending in _test')
      admin = postgres(url, { max: 1, onnotice: () => {} })
      connections.admin = admin
      const [identity] = await admin`select current_database() as name`
      if (!String(identity!.name).endsWith('_test'))
        throw new Error('Wrong database')
      await admin`create schema ${admin(schema)}`
      sql = postgres(url, {
        max: 10,
        onnotice: () => {},
        connection: { search_path: schema },
      })
      connections.sql = sql
      for (const table of [
        'workspace_records',
        'workspace_meta',
        'workspace_groups',
        'workspace_commits',
      ])
        await sql`create table ${sql(table)} (like ${sql(`public.${table}`)} including all)`
      store = createPostgresWorkspaceStore(sql)
    })
    beforeEach(async () => {
      // Only tables in this randomly named, test-owned schema are cleared.
      await sql`truncate workspace_records, workspace_meta, workspace_groups, workspace_commits`
    })
    afterAll(async () => {
      if (connections.sql) await connections.sql.end()
      if (connections.admin) {
        await admin`drop schema ${admin(schema)} cascade`
        await admin.end()
      }
    })
    async function fixture(count = 2) {
      await store.importWorkspace(scaledWorkspace(count))
      return store.load()
    }
    function patch(
      loaded: LoadedWorkspace,
      collection: Collection,
      id: string,
      value: Json | null,
    ): WorkspacePatch {
      const key = recordKey({ collection, id })
      const old = workspaceEntities(loaded.workspace!).get(key)
      const groupKeys = [
        ...new Set([
          ...(old ? entityGroups(old) : []),
          ...entityGroups({ collection, value }),
        ]),
      ]
      return {
        mutationId: randomUUID(),
        groups: Object.fromEntries(
          groupKeys.map((group) => [group, loaded.groups?.[group] ?? null]),
        ),
        changes: [
          {
            collection,
            id,
            value,
            expectedVersion: loaded.versions?.[key]?.version ?? null,
            position: loaded.versions?.[key]?.position ?? -1,
          },
        ],
      }
    }
    it('serializes coverage of one receipt across different M15 documents and safely retries the same mutation', async () => {
      const { workspace, value } = linkedM15Fixture()
      workspace.qualityWorkflow.cases = []
      const second = { ...structuredClone(value), id: 'm15-second' }
      value.allocations = []
      second.allocations = []
      workspace.m15Reconciliations = [value, second]
      workspace.qualityWorkflow.receiptDocuments!.push({
        id: second.id,
        kind: 'm15',
        number: '15-2',
        date: localToday(),
      })
      await store.importWorkspace(workspace)
      const loaded = await store.load()
      const link = {
        lineId: 'row1',
        receiptId: 'receipt',
        quantity: 8,
        documentQuantity: 8,
        receiptQuantity: 10,
        receiptUnit: 'шт',
      }
      const mutations = [value, second].map((record) =>
        patch(loaded, 'm15Reconciliations', record.id, {
          ...record,
          allocations: [link],
        }),
      )
      const outcomes = await Promise.all(
        mutations.map((mutation) => store.patch(mutation, 'test')),
      )
      expect(outcomes.map((result) => result.status).sort()).toEqual([
        'conflict',
        'saved',
      ])
      const winner = outcomes.findIndex((result) => result.status === 'saved')
      expect(await store.patch(mutations[winner]!, 'test')).toMatchObject({
        status: 'saved',
      })
      const current = await store.load()
      expect(current.workspace!.materialReceipts).toEqual(
        workspace.materialReceipts,
      )
      expect(
        current.workspace!.m15Reconciliations!.flatMap(
          (record) => record.allocations,
        ),
      ).toHaveLength(1)
      const losing = [value, second][1 - winner]!
      expect(
        await store.patch(
          patch(current, 'm15Reconciliations', losing.id, {
            ...losing,
            allocations: [link],
          }),
          'test',
        ),
      ).toMatchObject({
        status: 'rejected',
        message: expect.stringContaining('другой М-15'),
      })
      expect(
        await store.patch(
          patch(current, 'materialReceipts', 'receipt', null),
          'test',
        ),
      ).toMatchObject({ status: 'rejected' })
    })
    it('persists M-15 independently of signed documents and detects simultaneous edits', async () => {
      const { workspace, value } = m15Fixture()
      workspace.qualityWorkflow.cases[0]!.basis = {
        ...workspace.qualityWorkflow.receiptDocuments!.find(
          (doc) => doc.id === 'm15',
        )!,
      }
      await store.importWorkspace(workspace)
      const loaded = await store.load()
      const results = await Promise.all(
        [10, 12].map((quantity) =>
          store.patch(
            patch(loaded, 'm15Reconciliations', value.id, {
              ...automaticM15(value.id, value),
              lines: [{ ...value.lines[0]!, quantity }],
            }),
            'test',
          ),
        ),
      )
      expect(
        results.filter((result) => result.status === 'saved'),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === 'conflict'),
      ).toHaveLength(1)
      const saved = await store.load()
      expect(saved.workspace!.m15Reconciliations).toHaveLength(1)
      expect(saved.workspace!.qualityWorkflow).toEqual(
        workspace.qualityWorkflow,
      )
      expect(saved.workspace!.materialReceipts).toEqual(
        workspace.materialReceipts,
      )
      expect(
        saved.versions!['cases/' + workspace.qualityWorkflow.cases[0]!.id],
      ).toEqual(
        loaded.versions!['cases/' + workspace.qualityWorkflow.cases[0]!.id],
      )
      expect(
        await store.patch(
          patch(saved, 'm15Reconciliations', value.id, {
            ...value,
            allocations: [{ ...value.allocations[0]!, quantity: 11 }],
          }),
          'test',
        ),
      ).toMatchObject({
        status: 'rejected',
        message: expect.stringContaining('превышает'),
      })
      const changedCase = structuredClone(workspace.qualityWorkflow.cases[0]!)
      changedCase.revisions[0]!.zni.rows[0]!.accepted = 7
      expect(
        await store.patch(
          patch(saved, 'cases', changedCase.id, changedCase),
          'test',
        ),
      ).toMatchObject({ status: 'rejected' })
    })
    it('automatically recalculates M-15 after receipt correction and deletion without changing the reconciliation version', async () => {
      const { workspace, value } = m15Fixture()
      workspace.qualityWorkflow.cases = []
      const record = automaticM15('m15', value)
      await store.importWorkspace({
        ...workspace,
        m15Reconciliations: [record],
      })
      const old = await store.load()
      expect(
        await store.patch(
          patch(old, 'materialReceipts', 'receipt', {
            ...workspace.materialReceipts[0]!,
            quantity: 9,
            altQuantity: 22.5,
          }),
          'test',
        ),
      ).toMatchObject({ status: 'saved' })
      const saved = await store.load()
      expect(saved.workspace!.m15Reconciliations).toEqual([record])
      expect(saved.versions!['m15Reconciliations/m15']).toEqual(
        old.versions!['m15Reconciliations/m15'],
      )
      expect(
        calculateAutomaticM15(record, m15ReceiptIndex(saved.workspace!))
          .rows[0],
      ).toMatchObject({ received: 9, delta: -1, status: 'difference' })
      // A documentary quantity can still be edited; there are no stale receipt snapshots.
      expect(
        await store.patch(
          patch(saved, 'm15Reconciliations', 'm15', {
            ...record,
            lines: [{ ...record.lines[0]!, quantity: 12 }],
          }),
          'test',
        ),
      ).toMatchObject({ status: 'saved' })
      const edited = await store.load()
      expect(
        await store.patch(
          patch(edited, 'materialReceipts', 'receipt', null),
          'test',
        ),
      ).toMatchObject({ status: 'saved' })
      const next = await store.load()
      expect(
        calculateAutomaticM15(
          next.workspace!.m15Reconciliations![0]!,
          m15ReceiptIndex(next.workspace!),
        ).rows[0],
      ).toMatchObject({ received: 0, delta: -12 })
    })

    it('leaves an allocation visibly stale when an otherwise unreferenced receipt is deleted', async () => {
      const { workspace, value } = m15Fixture()
      workspace.qualityWorkflow.cases = []
      await store.importWorkspace({ ...workspace, m15Reconciliations: [value] })
      const loaded = await store.load()
      expect(
        await store.patch(
          patch(loaded, 'materialReceipts', 'receipt', null),
          'test',
        ),
      ).toMatchObject({ status: 'saved' })
      const next = await store.load()
      expect(
        calculateM15(
          next.workspace!.m15Reconciliations![0]!,
          m15ReceiptIndex(next.workspace!),
        ).rows[0]!.status,
      ).toBe('stale')
    })

    it('persists site returns and rejects conflicting returns and over-issue in the same receipt', async () => {
      const source = acceptFixture(10)
      source.materialIssues = [
        {
          id: 'issued',
          projectLineId: 'line',
          receiptId: 'receipt',
          projectUnit: 'шт',
          date: localToday(),
          quantity: 10,
          document: 'ПМ-1',
          receiver: 'Бригада',
          note: '',
          altQuantity: 25,
        },
      ]
      await store.importWorkspace(source)
      const loaded = await store.load()
      const makeReturn = (id: string) => ({
        ...source.materialIssues[0]!,
        siteReturns: [
          {
            id,
            date: localToday(),
            quantity: 7,
            condition: 'good',
            document: '',
            note: '',
          },
        ],
      })
      const results = await Promise.all(
        ['return-a', 'return-b'].map((id) =>
          store.patch(
            patch(loaded, 'materialIssues', 'issued', makeReturn(id)),
            'test',
          ),
        ),
      )
      expect(
        results.filter((result) => result.status === 'saved'),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === 'conflict'),
      ).toHaveLength(1)
      const saved = await store.load()
      expect(
        saved.workspace!.materialIssues[0]!.siteReturns as Array<unknown>,
      ).toHaveLength(1)
      await expect(
        store.patch(
          patch(saved, 'materialIssues', 'too-much', {
            ...source.materialIssues[0]!,
            id: 'too-much',
            document: 'ПМ-2',
            quantity: 8,
          }),
          'test',
        ),
      ).resolves.toMatchObject({
        status: 'rejected',
        message: expect.stringMatching(/недостаточно|АВК|выданного/),
      })
      await expect(
        store.patch(patch(saved, 'materialIssues', 'issued', null), 'test'),
      ).resolves.toMatchObject({
        status: 'rejected',
        message: expect.stringMatching(/возврат с площадки/),
      })
    })

    it('saves actual issues before VK and serializes competing stock withdrawals', async () => {
      const source = acceptFixture(10)
      source.qualityWorkflow.cases = []
      await store.importWorkspace(source)
      const loaded = await store.load()
      const movement = {
        projectLineId: 'line',
        receiptId: 'receipt',
        projectUnit: 'шт',
        date: localToday(),
        quantity: 7,
        receiver: 'Бригада',
        note: '',
        altQuantity: 17.5,
      }
      expect(
        (
          await store.patch(
            patch(loaded, 'materialIssues', 'ordinary', {
              ...movement,
              id: 'ordinary',
              document: 'ПМ-1',
            }),
            'test',
          )
        ).status,
      ).toBe('rejected')
      const results = await Promise.all(
        ['early-a', 'early-b'].map((id) =>
          store.patch(
            patch(loaded, 'materialIssues', id, {
              ...movement,
              id,
              document: id,
              beforeInspection: {
                reason: 'Фактическая передача до оформления контроля',
              },
            }),
            'test',
          ),
        ),
      )
      expect(
        results.filter((result) => result.status === 'saved'),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === 'conflict'),
      ).toHaveLength(1)
      const restored = (await store.load()).workspace!
      expect(restored.materialIssues).toHaveLength(1)
      expect(restored.materialIssues[0]).toMatchObject({
        quantity: 7,
        beforeInspection: {
          reason: 'Фактическая передача до оформления контроля',
        },
      })
      expect(restored.qualityWorkflow?.cases).toHaveLength(0)
    })

    it('checks automatic VK allocation and saves both parts of one issue atomically', async () => {
      const source = acceptFixture(3)
      Object.assign(
        currentInspection(source.qualityWorkflow.cases[0]!).zni.rows[0]!,
        {
          presented: 3,
          accepted: 3,
          result: 'accepted',
          remarks: '',
        },
      )
      await store.importWorkspace(source)
      const loaded = await store.load()
      const issue = {
        id: 'approved',
        projectLineId: 'line',
        receiptId: 'receipt',
        projectUnit: 'шт',
        date: localToday(),
        quantity: 3,
        document: 'ПМ-1',
        receiver: 'Бригада',
        note: '',
      }
      const early = {
        ...issue,
        id: 'early',
        quantity: 1,
        beforeInspection: { reason: 'Передан до ВК' },
      }
      const wrong = await store.patch(
        patch(loaded, 'materialIssues', 'wrong', {
          ...early,
          id: 'wrong',
          quantity: 4,
        }),
        'test',
      )
      expect(wrong.status).toBe('rejected')
      expect((await store.load()).workspace!.materialIssues).toHaveLength(0)
      const normalPatch = patch(loaded, 'materialIssues', issue.id, issue)
      const earlyPatch = patch(loaded, 'materialIssues', early.id, early)
      const combined = {
        ...normalPatch,
        groups: { ...normalPatch.groups, ...earlyPatch.groups },
        changes: [...earlyPatch.changes, ...normalPatch.changes],
      }
      expect((await store.patch(combined, 'test')).status).toBe('saved')
      await store.patch(combined, 'test')
      const saved = (await store.load()).workspace!.materialIssues
      expect(saved).toHaveLength(2)
      expect(saved.reduce((sum, item) => sum + Number(item.quantity), 0)).toBe(
        4,
      )
      expect(saved.filter((item) => item.beforeInspection)).toHaveLength(1)
    })

    it('imports every entity without changing values and refuses a second import', async () => {
      const source = scaledWorkspace(3)
      await store.importWorkspace(source)
      const loaded = await store.load()
      const before = workspaceEntities(source),
        after = workspaceEntities(loaded.workspace!)
      expect(
        [...before].every(([key, item]) =>
          jsonEqual(item.value, after.get(key)?.value),
        ),
      ).toBe(true)
      expect(after.size).toBe(before.size)
      await expect(store.importWorkspace(source)).rejects.toThrow(
        'уже содержит',
      )
    })
    it('saves all ten independent cipher edits from the same initial revision', async () => {
      const source = scaledWorkspace(10)
      source.lines.forEach((line, index) => {
        line.cipher = `ТКМ-${index}`
      })
      await store.importWorkspace(source)
      const loaded = await store.load()
      const results = await Promise.all(
        loaded.workspace!.lines.map((line) =>
          store.patch(
            patch(loaded, 'lines', String(line.id), {
              ...line,
              plannedQuantity: 77,
            }),
            'test',
          ),
        ),
      )
      expect(results.map((result) => result.status)).toEqual(
        Array(10).fill('saved'),
      )
      expect(
        (await store.load()).workspace!.lines.every(
          (line) => line.plannedQuantity === 77,
        ),
      ).toBe(true)
    })
    it('persists partial AVK acceptance and rejects a competing second return of the same rejected quantity', async () => {
      const workspace = acceptFixture(10)
      const entry = workspace.qualityWorkflow.cases[0]!
      currentInspection(entry).avk!.signedOn = null
      await store.importWorkspace(workspace)
      const loaded = await store.load()
      const rejected = rejectInspectionAct(
        entry,
        'materials',
        localToday(),
        'Отклонено 4 шт.',
        [{ receiptId: 'receipt', quantity: 4 }],
      )
      rejected.revisions[0] = signInspection(
        currentInspection(rejected),
        'avk',
        localToday(),
      )
      expect(
        (
          await store.patch(
            patch(loaded, 'cases', entry.id, rejected as Json),
            'test',
          )
        ).status,
      ).toBe('saved')
      const shared = await store.load()
      const makeReturn = () =>
        recordCustomerReturn(
          shared.workspace!.qualityWorkflow!,
          entry.id,
          [{ receiptId: 'receipt', quantity: 4 }],
          localToday(),
        ).customerReturns!.at(-1)!
      const first = makeReturn(),
        second = makeReturn()
      const results = await Promise.all(
        [first, second].map((item) =>
          store.patch(
            patch(shared, 'customerReturns', item.id, item as Json),
            'test',
          ),
        ),
      )
      expect(results.map((result) => result.status).sort()).toEqual([
        'conflict',
        'saved',
      ])
      const reloaded = (await store.load()).workspace!
      expect(reloaded.qualityWorkflow!.customerReturns).toHaveLength(1)
      expect(reloaded.qualityWorkflow!.customerReturns![0]!.rejectedAt).toBe(
        'avk',
      )
      expect(inspectionApprovals(reloaded.qualityWorkflow)[0]!.quantity).toBe(6)
    })

    it.each(['document', 'materials'] as const)(
      'persists %s rejection and protects it against signing or overwriting via a direct patch',
      async (kind) => {
        const workspace = acceptFixture()
        currentInspection(workspace.qualityWorkflow.cases[0]!).avk!.signedOn =
          null
        await store.importWorkspace(workspace)
        const loaded = await store.load()
        const entry = loaded.workspace!.qualityWorkflow!.cases[0]!
        const rejected = rejectInspectionAct(
          entry,
          kind,
          localToday(),
          'Отклонение в тестовой базе',
        )
        expect(
          (
            await store.patch(
              patch(loaded, 'cases', entry.id, rejected as Json),
              'test',
            )
          ).status,
        ).toBe('saved')
        const refreshed = await store.load()
        expect(
          currentInspection(refreshed.workspace!.qualityWorkflow!.cases[0]!)
            .avk!.rejection?.kind,
        ).toBe(kind)
        const forged = structuredClone(rejected)
        delete currentInspection(forged).avk!.rejection
        currentInspection(forged).avk!.signedOn = localToday()
        expect(
          (
            await store.patch(
              patch(refreshed, 'cases', entry.id, forged as Json),
              'test',
            )
          ).status,
        ).toBe('rejected')
        if (kind === 'document') {
          const corrected = correctInspectionAct(rejected)
          expect(
            (
              await store.patch(
                patch(refreshed, 'cases', entry.id, corrected as Json),
                'test',
              )
            ).status,
          ).toBe('saved')
          expect(
            (await store.load()).workspace!.qualityWorkflow!.cases[0]!
              .revisions,
          ).toHaveLength(2)
        }
      },
    )
    it('reports a same-record conflict instead of silently replacing an edit', async () => {
      const loaded = await fixture()
      const line = loaded.workspace!.lines[0]!
      const results = await Promise.all(
        [1, 2].map((plannedQuantity) =>
          store.patch(
            patch(loaded, 'lines', String(line.id), {
              ...line,
              plannedQuantity,
            }),
            'test',
          ),
        ),
      )
      expect(
        results.filter((result) => result.status === 'saved'),
      ).toHaveLength(1)
      const conflict = results.find((result) => result.status === 'conflict')!
      expect(conflict.conflicts[0]?.current?.value).toHaveProperty(
        'plannedQuantity',
      )
    })
    it('replays the same mutation without another write and rejects changed reuse', async () => {
      const loaded = await fixture()
      const line = loaded.workspace!.lines[0]!
      const input = patch(loaded, 'lines', String(line.id), {
        ...line,
        plannedQuantity: 44,
      })
      const first = await store.patch(input, 'test')
      expect(await store.patch(input, 'test')).toEqual(first)
      expect(
        (await sql`select count(*)::int as count from workspace_commits`)[0]!
          .count,
      ).toBe(1)
      input.changes[0]!.value = line
      expect((await store.patch(input, 'test')).status).toBe('rejected')
    })
    it('prevents two users issuing five each from the same seven available units', async () => {
      const loaded = await fixture(1)
      const existing = loaded.workspace!.materialIssues[0]!
      const results = await Promise.all(
        ['a', 'b'].map((id) =>
          store.patch(
            patch(loaded, 'materialIssues', id, {
              ...existing,
              id,
              quantity: 5,
            }),
            id,
          ),
        ),
      )
      expect(
        results.filter((result) => result.status === 'saved'),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === 'conflict'),
      ).toHaveLength(1)
      expect(
        (await store.load()).workspace!.materialIssues.reduce(
          (sum, row) => sum + Number(row.quantity),
          0,
        ),
      ).toBe(6)
    })
    it('protects requests against concurrent excess receipts', async () => {
      const source = scaledWorkspace(1)
      const receipt = source.materialReceipts[0]!
      source.materialReceipts = []
      source.materialIssues = []
      source.qualityWorkflow.cases = []
      source.qualityWorkflow.customerReturns = []
      await store.importWorkspace(source)
      const loaded = await store.load()
      const results = await Promise.all(
        ['a', 'b'].map((id) =>
          store.patch(
            patch(loaded, 'materialReceipts', id, {
              ...receipt,
              id,
              quantity: 6,
            }),
            id,
          ),
        ),
      )
      expect(
        results.filter((result) => result.status === 'saved'),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1)
    })
    it('rolls back the entire operation when one changed record violates stock rules', async () => {
      const loaded = await fixture(1)
      const line = loaded.workspace!.lines[0]!,
        issue = loaded.workspace!.materialIssues[0]!
      const input = patch(loaded, 'lines', String(line.id), {
        ...line,
        plannedQuantity: 999,
      })
      input.changes.push(
        ...patch(loaded, 'materialIssues', 'excess', {
          ...issue,
          id: 'excess',
          quantity: 999,
        }).changes,
      )
      for (const change of input.changes)
        for (const group of entityGroups(change))
          input.groups[group] = loaded.groups?.[group] ?? null
      expect((await store.patch(input, 'test')).status).toBe('rejected')
      expect((await store.load()).workspace!.lines[0]!.plannedQuantity).toBe(
        line.plannedQuantity,
      )
      expect(
        (await sql`select count(*)::int as count from workspace_commits`)[0]!
          .count,
      ).toBe(0)
    })
    it('rejects regular issues with a foreign project position or unit atomically', async () => {
      const loaded = await fixture(2)
      const source = loaded.workspace!.materialIssues[0]!
      for (const [field, value] of [
        ['projectLineId', String(loaded.workspace!.lines[1]!.id)],
        ['projectUnit', 'м'],
      ]) {
        const issue = {
          ...source,
          id: `wrong-${field}`,
          quantity: 1,
          [field!]: value!,
        }
        const result = await store.patch(
          patch(loaded, 'materialIssues', issue.id, issue),
          'audit',
        )
        expect(result.status).toBe('rejected')
        if (result.status === 'rejected')
          expect(result.message).toMatch(/соответств.*поступлению/)
      }
      expect((await store.load()).workspace!.materialIssues).toEqual(
        loaded.workspace!.materialIssues,
      )
    })
    it('continues AVK for a signed historical M15 basis without manufacturing quantitative links', async () => {
      const source = documentInspectionFixture('m15')
      source.m15Reconciliations = []
      const entry = source.qualityWorkflow.cases[0]!
      currentInspection(entry).avk = null
      // Import represents an existing historical record with its old single reference.
      await store.importWorkspace(source)
      const loaded = await store.load()
      const next = structuredClone(entry)
      currentInspection(next).avk = createAcceptedInspectionAct(next)
      currentInspection(next).avk!.number = 'Historical AVK'
      expect(
        (await store.patch(patch(loaded, 'cases', next.id, next), 'audit'))
          .status,
      ).toBe('saved')
      const after = (await store.load()).workspace!
      expect(after.qualityWorkflow!.cases[0]!.revisions[0]!.zni).toEqual(
        entry.revisions[0]!.zni,
      )
      expect(after.m15Reconciliations ?? []).toEqual([])
      expect(after.materialReceipts).toEqual(source.materialReceipts)
    })
    it('preserves signed inspection history and rejects missing references', async () => {
      const loaded = await fixture(1)
      const entry = structuredClone(
        loaded.workspace!.qualityWorkflow!.cases[0]!,
      )
      entry.revisions[0]!.zni.number = 'changed'
      expect(
        (await store.patch(patch(loaded, 'cases', entry.id, entry), 'test'))
          .status,
      ).toBe('rejected')
      const issue = {
        ...loaded.workspace!.materialIssues[0]!,
        id: 'missing',
        receiptId: 'not-there',
      }
      expect(
        (
          await store.patch(
            patch(loaded, 'materialIssues', issue.id, issue),
            'test',
          )
        ).status,
      ).toBe('rejected')
      expect(
        (
          await store.patch(
            patch(
              loaded,
              'materialRequests',
              String(loaded.workspace!.materialRequests[0]!.id),
              null,
            ),
            'test',
          )
        ).status,
      ).toBe('rejected')
    })
    it('checks unique inspection numbers across separate material branches', async () => {
      const source = scaledWorkspace(2)
      const entries = structuredClone(source.qualityWorkflow.cases)
      source.qualityWorkflow.cases = []
      source.qualityWorkflow.customerReturns = []
      source.materialIssues = []
      await store.importWorkspace(source)
      const loaded = await store.load()
      for (const entry of entries)
        entry.revisions[0]!.zni.number = 'same-number'
      const results = await Promise.all(
        entries.map((entry) =>
          store.patch(patch(loaded, 'cases', entry.id, entry), 'test'),
        ),
      )
      expect(
        results.filter((result) => result.status === 'saved'),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1)
    })
    it('publishes committed changes and deletions in cursor order', async () => {
      const loaded = await fixture(2)
      const line = loaded.workspace!.lines[0]!
      await store.patch(
        patch(loaded, 'lines', String(line.id), {
          ...line,
          plannedQuantity: 12,
        }),
        'test',
      )
      const changes = await store.changes(loaded.revision!)
      expect(changes.records).toHaveLength(1)
      expect(changes.records[0]!.value).toHaveProperty('plannedQuantity', 12)
      expect((await store.changes(changes.revision)).records).toEqual([])
    })
    it('does not merge two newly created documents that happen to use the same number', async () => {
      const loaded = await fixture(1)
      const request = {
        ...loaded.workspace!.materialRequests[0]!,
        number: 'NEW-NUMBER',
      }
      const first = patch(loaded, 'materialRequests', 'new-a', {
        ...request,
        id: 'new-a',
      })
      first.creatingGroups = ['materialRequests:NEW-NUMBER']
      expect((await store.patch(first, 'a')).status).toBe('saved')
      const refreshed = await store.load()
      const second = patch(refreshed, 'materialRequests', 'new-b', {
        ...request,
        id: 'new-b',
      })
      second.creatingGroups = ['materialRequests:NEW-NUMBER']
      expect((await store.patch(second, 'b')).status).toBe('rejected')
      expect(
        (await store.load()).workspace!.materialRequests.filter(
          (row) => row.number === 'NEW-NUMBER',
        ),
      ).toHaveLength(1)
    })
    it.skipIf(process.env.MATERIALS_POSTGRES_SCALE !== '1')(
      'measures 50,000 fully populated positions and ten concurrent writers',
      async () => {
        const source = scaledWorkspace(50000)
        const started = performance.now()
        await store.importWorkspace(source)
        const importedMs = performance.now() - started
        console.log('Scale import ms:', importedMs)
        const loadStarted = performance.now(),
          loaded = await store.load(),
          loadMs = performance.now() - loadStarted
        console.log('Scale load ms:', loadMs)
        const inputs = loaded.workspace!.lines.slice(0, 10).map((line) =>
          patch(loaded, 'lines', String(line.id), {
            ...line,
            plannedQuantity: 78,
          }),
        )
        const times: number[] = []
        const results = await Promise.all(
          inputs.map(async (input) => {
            const start = performance.now(),
              result = await store.patch(input, 'scale')
            times.push(performance.now() - start)
            return result.status
          }),
        )
        // All positions share one cipher. The project aggregate protects concurrent
        // edits with one winner; other writers must refresh before retrying.
        expect(results.filter((status) => status === 'saved')).toHaveLength(1)
        expect(results.filter((status) => status === 'conflict')).toHaveLength(
          9,
        )
        const retryIndex = results.findIndex((status) => status === 'conflict')
        const fresh = await store.load()
        const retryLine = fresh.workspace!.lines[retryIndex]!
        expect(
          (
            await store.patch(
              patch(fresh, 'lines', String(retryLine.id), {
                ...retryLine,
                plannedQuantity: 78,
              }),
              'scale-retry',
            )
          ).status,
        ).toBe('saved')
        const report = {
          positions: 50000,
          writers: 10,
          conflicts: results.filter((status) => status === 'conflict').length,
          importedMs: Math.round(importedMs),
          loadMs: Math.round(loadMs),
          saveMs: times.map(Math.round),
          maxSaveMs: Math.round(Math.max(...times)),
          patchBytes: Buffer.byteLength(JSON.stringify(inputs[0])),
          heapMiB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        }
        if (process.env.MATERIALS_POSTGRES_SCALE_REPORT)
          writeFileSync(
            process.env.MATERIALS_POSTGRES_SCALE_REPORT,
            JSON.stringify(report, null, 2),
          )
        console.log('PostgreSQL scale:', report)
      },
      180000,
    )
  },
)
