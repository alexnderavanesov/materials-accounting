import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPostgresWorkspaceStore } from './workspace-postgres.server'
import { resetTestOperations } from './workspace-reset.server'
import { acceptFixture } from './quality-workflow.fixtures'
import { entityGroups, workspaceEntities } from './workspace-protocol'
import type { Entity, WorkspacePatch } from './workspace-protocol'
import type { LoadedWorkspace } from './workspace-snapshot'

const enabled = process.env.MATERIALS_POSTGRES_TEST === '1'
describe.skipIf(!enabled)(
  'APP and independent M15 PostgreSQL transition',
  () => {
    let sql: postgres.Sql, admin: postgres.Sql
    const schema = `materials_test_${randomUUID().replaceAll('-', '')}`
    let store: ReturnType<typeof createPostgresWorkspaceStore>
    beforeAll(async () => {
      const url = process.env.DATABASE_URL_TEST
      if (
        !url ||
        !new URL(url).pathname.endsWith('_test') ||
        url === process.env.DATABASE_URL
      )
        throw new Error('Dedicated test database required')
      admin = postgres(url, { max: 1, onnotice: () => {} })
      const [identity] = await admin`select current_database() as name`
      if (!String(identity!.name).endsWith('_test'))
        throw new Error('Wrong database')
      await admin`create schema ${admin(schema)}`
      sql = postgres(url, {
        max: 4,
        onnotice: () => {},
        connection: { search_path: schema },
      })
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
      await sql`truncate workspace_records,workspace_meta,workspace_groups,workspace_commits`
    })
    afterAll(async () => {
      await sql.end()
      {
        await admin`drop schema ${admin(schema)} cascade`
        await admin.end()
      }
    })
    function patch(
      loaded: LoadedWorkspace,
      entities: Entity[],
    ): WorkspacePatch {
      const groups = [...new Set(entities.flatMap(entityGroups))]
      return {
        accountingGeneration: loaded.accountingGeneration,
        mutationId: randomUUID(),
        groups: Object.fromEntries(
          groups.map((key) => [key, loaded.groups?.[key] ?? null]),
        ),
        changes: entities.map((entity) => ({
          ...entity,
          expectedVersion:
            loaded.versions?.[`${entity.collection}/${entity.id}`]?.version ??
            null,
        })),
      }
    }
    it('resets only test operations, retains the project, resets numbering, and blocks old tabs and repeated resets', async () => {
      const original = acceptFixture(10)
      await store.importWorkspace(original)
      const before = await store.load()
      const transition = await resetTestOperations(sql, before.revision!)
      const after = await store.load()
      expect(after.workspace!.lines).toEqual(original.lines)
      expect(after.workspace!.configuredUnits).toEqual(original.configuredUnits)
      expect(after.workspace!.materialReceipts).toEqual([])
      expect(after.workspace!.qualityWorkflow?.cases ?? []).toEqual([])
      expect(after.accountingGeneration).toBe(transition.accountingGeneration)
      const stale = patch(
        before,
        [...workspaceEntities(original).values()].filter(
          (row) => row.collection === 'materialReceipts',
        ),
      )
      expect(await store.patch(stale, 'test')).toMatchObject({
        status: 'rejected',
        message: expect.stringContaining('заново'),
      })
      await expect(resetTestOperations(sql, after.revision!)).rejects.toThrow(
        'уже выполнен',
      )
      expect((await store.changes(before.revision!)).accountingGeneration).toBe(
        after.accountingGeneration,
      )
    })
    it('saves composition without receipts, rejects duplicate document identities and rejects the retired linked model', async () => {
      await store.importWorkspace(acceptFixture(10))
      await resetTestOperations(sql, (await store.load()).revision!)
      const loaded = await store.load()
      const doc = {
        collection: 'receiptDocuments' as const,
        id: 'm15',
        position: 0,
        value: { id: 'm15', kind: 'm15', number: '42', date: '2026-11-20' },
      }
      const composition = {
        collection: 'm15Reconciliations' as const,
        id: 'm15',
        position: 0,
        value: {
          id: 'm15',
          mode: 'independent',
          cipher: 'ТКМ5',
          allocations: [],
          lines: [
            {
              id: 'row',
              projectLineId: 'line',
              position: '',
              name: 'Клапан',
              unit: 'шт',
              quantity: 100,
            },
          ],
        },
      }
      expect(
        await store.patch(patch(loaded, [doc, composition]), 'test'),
      ).toMatchObject({ status: 'saved' })
      expect((await store.load()).workspace!.materialReceipts).toEqual([])
      const duplicate = {
        ...doc,
        id: 'duplicate',
        value: { ...doc.value, id: 'duplicate', number: ' № 42 ' },
      }
      expect(
        await store.patch(patch(await store.load(), [duplicate]), 'test'),
      ).toMatchObject({ status: 'rejected' })
      expect(
        await store.patch(
          patch(await store.load(), [
            {
              collection: 'settings',
              id: 'accountingGeneration',
              value: null,
              position: 0,
            },
          ]),
          'test',
        ),
      ).toMatchObject({ status: 'rejected' })
      const linked = {
        ...composition,
        value: { ...composition.value, mode: 'linked' },
      }
      expect(
        await store.patch(patch(await store.load(), [linked]), 'test'),
      ).toMatchObject({ status: 'rejected' })
    })
  },
)
