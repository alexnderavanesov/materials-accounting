import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCollaborativeSaver } from './workspace-collaboration'
import {
  emptyWorkspace,
  recordKey,
  workspaceEntities,
} from './workspace-protocol'
import type { EditJournal } from './workspace-collaboration'
import type {
  PatchResult,
  StoredEntity,
  WorkspaceChanges,
  WorkspacePatch,
} from './workspace-protocol'
import type { WorkspaceSnapshot } from './workspace-snapshot'

const initial = (): WorkspaceSnapshot => ({
  ...emptyWorkspace(),
  lines: [
    { id: 'a', plannedQuantity: 10 },
    { id: 'b', plannedQuantity: 20 },
  ],
})
const edit = (workspace: WorkspaceSnapshot, id: string, quantity: number) => ({
  ...workspace,
  lines: workspace.lines.map((line) =>
    line.id === id ? { ...line, plannedQuantity: quantity } : line,
  ),
})
const record = (
  id: string,
  quantity: number | null,
  version: number,
): StoredEntity => ({
  collection: 'lines',
  id,
  value: quantity === null ? null : { id, plannedQuantity: quantity },
  version,
  position: id === 'a' ? 0 : 1,
})
const saved = (patch: WorkspacePatch, revision = 2): PatchResult => ({
  status: 'saved',
  revision: `pg:${revision}`,
  records: patch.changes.map((change) => ({ ...change, version: revision })),
  groups: {},
})
const savers: Array<ReturnType<typeof createCollaborativeSaver>> = []
function setup(
  workspace = initial(),
  revision = 1,
  canApplyRemote?: () => boolean,
) {
  let state = workspace
  let journal: EditJournal | null = null
  const save = vi
    .fn<(patch: WorkspacePatch) => Promise<PatchResult>>()
    .mockImplementation(async (patch) => saved(patch))
  const changes = vi
    .fn<(revision: string) => Promise<WorkspaceChanges>>()
    .mockImplementation(async (cursor) => ({
      revision: cursor,
      records: [],
      groups: {},
      hasMore: false,
    }))
  const onStatus = vi.fn()
  const saver = createCollaborativeSaver({
    initial: workspace,
    revision: `pg:${revision}`,
    versions: Object.fromEntries(
      [...workspaceEntities(workspace).values()].map((item) => [
        recordKey(item),
        { version: revision, position: item.position },
      ]),
    ),
    groups: {},
    save,
    changes,
    onStatus,
    canApplyRemote,
    onWorkspace: (value) => {
      state = value
    },
    writeJournal: (value) => {
      journal = value
    },
  })
  savers.push(saver)
  return {
    saver,
    save,
    changes,
    onStatus,
    state: () => state,
    journal: () => journal,
  }
}
afterEach(() => {
  savers.splice(0).forEach((saver) => saver.dispose())
})

describe('collaborative outbox', () => {
  it('does not save on load and sends only the edited record', async () => {
    const app = setup(),
      workspace = initial()
    app.saver.update(workspace)
    await app.saver.flush()
    expect(app.save).not.toHaveBeenCalled()
    app.saver.update(edit(workspace, 'a', 15))
    await app.saver.flush()
    expect(app.save).toHaveBeenCalledTimes(1)
    expect(app.save.mock.calls[0]![0].changes).toEqual([
      {
        collection: 'lines',
        id: 'a',
        value: { id: 'a', plannedQuantity: 15 },
        expectedVersion: 1,
        position: 0,
      },
    ])
    expect(app.journal()).toBeNull()
  })
  it('queues a second edit while the first save is awaiting its response', async () => {
    const app = setup()
    let finish!: (result: PatchResult) => void
    app.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    app.saver.update(edit(initial(), 'a', 11))
    const pending = app.saver.flush()
    app.saver.update(edit(initial(), 'a', 12))
    finish(saved(app.save.mock.calls[0]![0]))
    await pending
    expect(app.save).toHaveBeenCalledTimes(2)
    expect(app.save.mock.calls[1]![0].changes[0]).toMatchObject({
      expectedVersion: 2,
      value: { plannedQuantity: 12 },
    })
  })
  it('keeps the same mutation ID after losing a response, including edits made offline', async () => {
    const app = setup()
    app.save.mockRejectedValueOnce(new Error('offline'))
    app.saver.update(edit(initial(), 'a', 11))
    await app.saver.flush()
    const first = app.save.mock.calls[0]![0]
    app.saver.update(edit(initial(), 'a', 12))
    await app.saver.retry()
    expect(app.save.mock.calls[1]![0]).toEqual(first)
    expect(app.save.mock.calls[2]![0].mutationId).not.toBe(first.mutationId)
    expect(app.save.mock.calls[2]![0].changes[0]).toMatchObject({
      expectedVersion: 2,
      value: { plannedQuantity: 12 },
    })
    expect(app.journal()).toBeNull()
  })
  it('loads remote edits without resaving them or replacing other row references', async () => {
    const workspace = initial(),
      app = setup(workspace)
    app.changes.mockResolvedValueOnce({
      revision: 'pg:2',
      records: [record('b', 35, 2)],
      groups: {},
      hasMore: false,
    })
    await app.saver.poll()
    expect(app.state().lines[0]).toBe(workspace.lines[0])
    expect(app.state().lines[1]!.plannedQuantity).toBe(35)
    app.saver.update(app.state())
    await app.saver.flush()
    expect(app.save).not.toHaveBeenCalled()
  })
  it('shows both values and rechecks the latest version when keeping a conflicting edit', async () => {
    const app = setup()
    app.save.mockResolvedValueOnce({
      status: 'conflict',
      message: 'changed',
      conflicts: [{ key: 'lines/a', current: record('a', 18, 2) }],
    })
    app.saver.update(edit(initial(), 'a', 15))
    await app.saver.flush()
    expect(app.onStatus).toHaveBeenLastCalledWith('conflict', 'changed', [
      expect.objectContaining({
        before: { id: 'a', plannedQuantity: 10 },
        mine: { id: 'a', plannedQuantity: 15 },
        theirs: { id: 'a', plannedQuantity: 18 },
      }),
    ])
    app.changes.mockResolvedValueOnce({
      revision: 'pg:2',
      records: [record('a', 18, 2)],
      groups: {},
      hasMore: false,
    })
    app.save.mockImplementationOnce(async (patch) => saved(patch, 3))
    await app.saver.resolve('mine')
    expect(app.save.mock.calls[1]![0].changes[0]).toMatchObject({
      expectedVersion: 2,
      value: { plannedQuantity: 15 },
    })
    expect(app.saver.hasPending()).toBe(false)
  })
  it('accepts the server value only for conflicting records and retains other pending edits', async () => {
    const app = setup()
    app.save.mockResolvedValueOnce({
      status: 'conflict',
      message: 'changed',
      conflicts: [{ key: 'lines/a', current: record('a', 18, 2) }],
    })
    app.saver.update(edit(edit(initial(), 'a', 15), 'b', 25))
    await app.saver.flush()
    app.changes.mockResolvedValueOnce({
      revision: 'pg:2',
      records: [record('a', 18, 2)],
      groups: {},
      hasMore: false,
    })
    await app.saver.resolve('server')
    expect(app.state().lines[0]!.plannedQuantity).toBe(18)
    expect(
      app.save.mock.calls[1]![0].changes.map((change) => change.id),
    ).toEqual(['b'])
    expect(app.state().lines[1]!.plannedQuantity).toBe(25)
  })
  it('restores an offline draft without overwriting a newer server value', async () => {
    const app = setup(edit(initial(), 'a', 30), 3)
    await app.saver.restore({
      request: null,
      groups: {},
      before: { 'lines/a': { id: 'a', plannedQuantity: 10 } },
      changes: [
        {
          collection: 'lines',
          id: 'a',
          value: { id: 'a', plannedQuantity: 15 },
          expectedVersion: 1,
          position: 0,
        },
      ],
    })
    expect(app.save).not.toHaveBeenCalled()
    expect(app.state().lines[0]!.plannedQuantity).toBe(15)
    expect(app.onStatus.mock.lastCall?.[0]).toBe('conflict')
    expect(app.onStatus.mock.lastCall?.[2][0].theirs.plannedQuantity).toBe(30)
  })
  it('recovers a lost response and then saves the newer queued draft once', async () => {
    const request: WorkspacePatch = {
      mutationId: crypto.randomUUID(),
      groups: {},
      changes: [
        {
          collection: 'lines',
          id: 'a',
          value: { id: 'a', plannedQuantity: 11 },
          expectedVersion: 1,
          position: 0,
        },
      ],
    }
    const app = setup(edit(initial(), 'a', 11), 2)
    app.save
      .mockImplementationOnce(async () => saved(request, 2))
      .mockImplementationOnce(async (patch) => saved(patch, 3))
    await app.saver.restore({
      request,
      groups: {},
      before: { 'lines/a': { id: 'a', plannedQuantity: 10 } },
      changes: [
        { ...request.changes[0]!, value: { id: 'a', plannedQuantity: 12 } },
      ],
    })
    expect(app.save.mock.calls[0]![0]).toEqual(request)
    expect(app.save.mock.calls[1]![0].changes[0]).toMatchObject({
      expectedVersion: 2,
      value: { plannedQuantity: 12 },
    })
    expect(app.saver.hasPending()).toBe(false)
  })
  it('does not resurrect a deleted record while catching up with older events', async () => {
    const app = setup()
    app.save.mockImplementationOnce(async (patch) => saved(patch, 4))
    app.saver.update({ ...initial(), lines: [initial().lines[1]!] })
    await app.saver.flush()
    app.changes
      .mockResolvedValueOnce({
        revision: 'pg:3',
        records: [record('a', 99, 3)],
        groups: {},
        hasMore: true,
      })
      .mockResolvedValueOnce({
        revision: 'pg:4',
        records: [record('a', null, 4)],
        groups: {},
        hasMore: false,
      })
    await app.saver.poll()
    expect(app.saver.getLatest().lines.map((line) => line.id)).toEqual(['b'])
    expect(app.saver.hasPending()).toBe(false)
  })
  it('does not send untouched history when saving one cell in a large workspace', async () => {
    const workspace = initial()
    workspace.lines = Array.from({ length: 50000 }, (_, index) => ({
      id: String(index),
      plannedQuantity: 10,
    }))
    const app = setup(workspace)
    app.saver.update(edit(workspace, '25000', 20))
    await app.saver.flush()
    expect(app.save.mock.calls[0]![0].changes).toHaveLength(1)
    expect(JSON.stringify(app.save.mock.calls[0]![0]).length).toBeLessThan(500)
    expect(app.saver.getLatest().lines[0]).toBe(workspace.lines[0])
  })
  it('preserves the order of a newly created document batch', async () => {
    const app = setup()
    app.saver.update({
      ...initial(),
      materialRequests: ['first', 'second', 'third'].map((id) => ({
        id,
        quantity: 1,
      })),
    })
    await app.saver.flush()
    expect(
      [...app.save.mock.calls[0]![0].changes]
        .sort((a, b) => a.position - b.position)
        .map((item) => item.id),
    ).toEqual(['first', 'second', 'third'])
  })
  it('defers a remote response when the user opens a form while the request is in flight', async () => {
    let editing = false
    const app = setup(initial(), 1, () => !editing)
    let complete!: (result: WorkspaceChanges) => void
    app.changes.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const polling = app.saver.poll()
    editing = true
    const result = {
      revision: 'pg:2',
      records: [record('a', 35, 2)],
      groups: {},
      hasMore: false,
    }
    complete(result)
    await polling
    expect(app.state().lines[0]!.plannedQuantity).toBe(10)
    editing = false
    app.changes.mockResolvedValueOnce(result)
    await app.saver.poll()
    expect(app.changes.mock.calls[1]![0]).toBe('pg:1')
    expect(app.state().lines[0]!.plannedQuantity).toBe(35)
  })
})
