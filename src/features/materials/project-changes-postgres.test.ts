import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest'
import { projectChangeFixture } from './project-changes.fixtures'
import { createPostgresWorkspaceStore } from './workspace-postgres.server'
import {
  prepareProjectChange,
  prepareStockTransfer,
  projectPosition, cipherKey
} from './project-changes'
import type { ProjectChangeWorkspace } from './project-changes'
import { toWorkspaceSnapshot } from './workspace-snapshot'
import type { LoadedWorkspace } from './workspace-snapshot'
import {
  entityGroups,
  jsonEqual,
  workspaceEntities,
} from './workspace-protocol'
import type { WorkspacePatch } from './workspace-protocol'
import { prepareProjectDraft } from './project-edit-draft'
import { localToday } from './quality-workflow'

const enabled = process.env.MATERIALS_POSTGRES_TEST === '1'
describe.skipIf(!enabled)(
  'project changes: isolated PostgreSQL transactions',
  () => {
    let admin: postgres.Sql,
      sql: postgres.Sql,
      store: ReturnType<typeof createPostgresWorkspaceStore>
    const connections: { admin?: postgres.Sql; sql?: postgres.Sql } = {}
    const schema = `materials_test_izm_${randomUUID().replaceAll('-', '')}`
    beforeAll(async () => {
      const url = process.env.DATABASE_URL_TEST
      if (!url || !new URL(url).pathname.endsWith('_test'))
        throw new Error('Requires an isolated _test database')
      admin = postgres(url, { max: 1, onnotice: () => {} })
      connections.admin = admin
      const [db] = await admin`select current_database() as name`
      if (!String(db!.name).endsWith('_test')) throw new Error('Wrong database')
      await admin`create schema ${admin(schema)}`
      sql = postgres(url, {
        max: 5,
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
      await sql`truncate workspace_records, workspace_meta, workspace_groups, workspace_commits`
    })
    afterAll(async () => {
      await connections.sql?.end()
      if (connections.admin) {
        await admin`drop schema if exists ${admin(schema)} cascade`
        await admin.end()
      }
    })
    const accounting = (loaded: LoadedWorkspace) =>
      loaded.workspace as unknown as ProjectChangeWorkspace
    function patch(
      loaded: LoadedWorkspace,
      next: ProjectChangeWorkspace,
    ): WorkspacePatch {
      const before = workspaceEntities(loaded.workspace!),
        after = workspaceEntities(toWorkspaceSnapshot(next)),
        changes: WorkspacePatch['changes'] = []
      for (const [key, row] of after)
        if (!jsonEqual(row.value, before.get(key)?.value))
          changes.push({
            ...row,
            expectedVersion: loaded.versions?.[key]?.version ?? null,
          })
      return {
        mutationId: randomUUID(),
        changes,
        groups: Object.fromEntries(
          changes
            .flatMap(entityGroups)
            .map((key) => [key, loaded.groups?.[key] ?? null]),
        ),
      }
    }
    const revise = (
      source: ProjectChangeWorkspace,
      amount: number,
      number = '2',
    ) =>
      prepareProjectChange(source, {
        project: 'Объект',
        cipher: 'ТКМ5',
        kind: 'revision',
        number,
        date: localToday(),
        reason: 'ИЗМ',
        author: 'Тест',
        positions: source.lines
          .filter((row) => row.cipher === 'ТКМ5')
          .map((row) => ({ ...projectPosition(row), plannedQuantity: amount })),
      })
    it('commits baseline, revision and cancellations together; reload and retry keep history', async () => {
      const fixture = projectChangeFixture()
      fixture.qualityWorkflow!.cases = []
      fixture.materialReceipts[0]!.quantity = 6
      await store.importWorkspace(toWorkspaceSnapshot(fixture))
      const loaded = await store.load()
      const request = patch(loaded, revise(accounting(loaded), 8))
      const saved = await store.patch(request, 'test')
      expect(saved).toMatchObject({ status: 'saved' })
      expect(await store.patch(request, 'test')).toEqual(saved)
      const reload = await store.load()
      expect(reload.workspace!.projectChanges?.map((row) => row.kind)).toEqual([
        'baseline',
        'revision',
      ])
      expect(
        accounting(reload).materialRequests[0]?.projectCancellations?.[0]
          ?.quantity,
      ).toBe(2)
      const next = revise(accounting(reload), 6, '3')
      expect(await store.patch(patch(reload, next), 'test')).toMatchObject({
        status: 'saved',
      })
      expect(
        (await store.load()).workspace!.projectChanges?.map(
          (row) => row.number,
        ),
      ).toEqual(['', '2', '3'])
    })
    it('saves a multi-cipher grid batch, including a new cipher, atomically and idempotently', async () => {
      const fixture = projectChangeFixture()
      fixture.qualityWorkflow!.cases = []
      fixture.materialReceipts[0]!.quantity = 6
      await store.importWorkspace(toWorkspaceSnapshot(fixture))
      const loaded = await store.load(),
        baseline = accounting(loaded)
      const lines = [
        { ...baseline.lines[0]!, plannedQuantity: 8 },
        {
          ...baseline.lines[0]!,
          id: 'new-cipher',
          cipher: 'ТКМ6',
          plannedQuantity: 2,
        },
      ]
      const next = prepareProjectDraft(
        { baseline, lines },
        {
          kind: 'revision',
          date: localToday(),
          reason: 'Пакет правок',
          author: 'Тест',
          replacements: {},
          numbers: {
            [cipherKey('Объект', 'ТКМ5')]: '2',
            [cipherKey('Объект', 'ТКМ6')]: '1',
          },
        },
      )
      const invalid = structuredClone(next)
      invalid.projectChanges!.find(
        (change) => change.cipher === 'ТКМ6' && change.kind === 'revision',
      )!.items[0]!.after.plannedQuantity = 99
      expect(await store.patch(patch(loaded, invalid), 'test')).toMatchObject({
        status: 'rejected',
      })
      expect((await store.load()).workspace).toEqual(loaded.workspace)
      const request = patch(loaded, next),
        saved = await store.patch(request, 'test')
      expect(saved).toMatchObject({ status: 'saved' })
      expect(await store.patch(request, 'test')).toEqual(saved)
      const reloaded = accounting(await store.load())
      expect(reloaded.projectChanges).toHaveLength(4)
      expect(reloaded.lines.map((line) => line.plannedQuantity).sort()).toEqual(
        [2, 8],
      )
      expect(
        reloaded.materialRequests[0]?.projectCancellations?.[0]?.quantity,
      ).toBe(2)
    })
    it('rejects competing revisions and unrecorded edits', async () => {
      await store.importWorkspace(toWorkspaceSnapshot(projectChangeFixture()))
      const loaded = await store.load()
      const results = await Promise.all([
        store.patch(patch(loaded, revise(accounting(loaded), 8)), 'one'),
        store.patch(patch(loaded, revise(accounting(loaded), 6, '3')), 'two'),
      ])
      expect(results.map((row) => row.status).sort()).toEqual([
        'conflict',
        'saved',
      ])
      const current = await store.load(),
        bad = structuredClone(accounting(current))
      bad.lines[0]!.plannedQuantity = 100
      expect(await store.patch(patch(current, bad), 'test')).toMatchObject({
        status: 'rejected',
      })
    })
    it('rejects adding a new position outside the cipher history and incomplete baselines', async () => {
      const fixture = projectChangeFixture()
      fixture.lines.push({
        ...fixture.lines[0]!,
        id: 'second',
        projectMaterialName: 'Другая позиция',
        plannedQuantity: 3,
      })
      await store.importWorkspace(toWorkspaceSnapshot(fixture))
      const loaded = await store.load(),
        valid = revise(accounting(loaded), 8)
      const badBaseline = structuredClone(valid)
      badBaseline.projectChanges![0]!.items =
        badBaseline.projectChanges![0]!.items.filter(
          (item) => item.after.id !== 'second',
        )
      badBaseline.projectChanges![1]!.items =
        badBaseline.projectChanges![1]!.items.filter(
          (item) => item.after.id !== 'second',
        )
      badBaseline.lines = badBaseline.lines.map((line) =>
        line.id === 'second' ? fixture.lines[1]! : line,
      )
      expect(
        await store.patch(patch(loaded, badBaseline), 'test'),
      ).toMatchObject({ status: 'rejected' })
      expect(await store.patch(patch(loaded, valid), 'test')).toMatchObject({
        status: 'saved',
      })
      const current = await store.load(),
        bad = structuredClone(accounting(current))
      bad.lines.push({
        ...bad.lines[0]!,
        id: 'untracked',
        projectMaterialName: 'Добавление без ИЗМ',
      })
      expect(await store.patch(patch(current, bad), 'test')).toMatchObject({
        status: 'rejected',
      })
    })
    it('prevents a transfer and issue from spending the same physical quantity', async () => {
      const fixture = projectChangeFixture()
      fixture.lines.push({
        ...fixture.lines[0]!,
        id: 'target',
        cipher: 'ТКМ6',
        plannedQuantity: 4,
      })
      fixture.materialRequests.push({
        id: 'target-request',
        projectLineId: 'target',
        quantity: 4,
        date: localToday(),
        number: 'ЗП-2',
      })
      await store.importWorkspace(toWorkspaceSnapshot(fixture))
      let loaded = await store.load()
      expect(
        await store.patch(patch(loaded, revise(accounting(loaded), 8)), 'test'),
      ).toMatchObject({ status: 'saved' })
      loaded = await store.load()
      const baseline = accounting(loaded)
      const moved = prepareStockTransfer(baseline, {
        receiptId: 'receipt',
        fromProjectLineId: 'line',
        toProjectLineId: 'target',
        quantity: 2,
        date: localToday(),
        projectChangeId: baseline.projectChanges!.at(-1)!.id,
        author: 'Тест',
        note: '',
      })
      const issued = {
        ...baseline,
        materialIssues: [
          {
            id: 'issue',
            receiptId: 'receipt',
            projectLineId: 'line',
            quantity: 9,
            date: localToday(),
            document: 'ВЫД-1',
            projectUnit: 'шт',
          },
        ],
      }
      const results = await Promise.all([
        store.patch(patch(loaded, moved), 'transfer'),
        store.patch(patch(loaded, issued), 'issue'),
      ])
      expect(results.filter((row) => row.status === 'saved')).toHaveLength(1)
      expect(results.filter((row) => row.status === 'conflict')).toHaveLength(1)
    })
  },
)
