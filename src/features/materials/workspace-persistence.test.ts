import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkspaceStore } from './workspace-snapshot.server'
import { createWorkspaceSaver } from './workspace-saver'
import {
  readWorkspaceCache,
  toWorkspaceSnapshot,
  workspaceSnapshotSchema,
  workspaceStorageKey,
  writeWorkspaceCache,
} from './workspace-snapshot'
import type { SaveWorkspaceResult } from './workspace-snapshot'

export function fixture(quantity = 1) {
  return workspaceSnapshotSchema.parse({
    configuredAlloys: [],
    configuredCiphers: ['ТЕСТ'],
    configuredDocuments: [],
    configuredUnits: ['м'],
    lines: [{ id: 'line-1', quantity }],
    materialTypeSettings: [],
    materialIssues: [],
    materialReceipts: [],
    materialRequests: [],
    qualityControls: [],
  })
}
const directories: string[] = []
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  )
})
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'materials-unit-'))
  directories.push(dir)
  return { dir, store: createWorkspaceStore(dir) }
}
function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
  }
}

describe('workspace file safety', () => {
  it('loads an absent workspace without creating a file; preserves the legacy JSON shape', async () => {
    const { dir, store } = await setup()
    expect(await store.load()).toEqual({ workspace: null, revision: null })
    await expect(readFile(join(dir, 'workspace.json'))).rejects.toThrow()
    await writeFile(join(dir, 'workspace.json'), JSON.stringify(fixture()))
    expect((await store.load()).workspace).toEqual(fixture())
  })
  it('rejects corrupted or incomplete data instead of returning an empty workspace or overwriting it', async () => {
    const { dir, store } = await setup()
    for (const broken of ['{broken', '{}', 'null', '{"lines":[]}']) {
      await writeFile(join(dir, 'workspace.json'), broken)
      await expect(store.load()).rejects.toThrow('повреждён')
      await expect(store.save(fixture(), null)).rejects.toThrow('повреждён')
      expect(await readFile(join(dir, 'workspace.json'), 'utf8')).toBe(broken)
    }
  })
  it('reports file access errors instead of treating them as a missing file', async () => {
    const { dir } = await setup()
    const file = join(dir, 'not-a-directory')
    await writeFile(file, 'keep')
    await expect(createWorkspaceStore(file).load()).rejects.toThrow('прочитать')
  })
  it('serializes competing saves, rejects stale revisions, and permits idempotent retry', async () => {
    const { dir, store } = await setup()
    await store.save(fixture(), null)
    const base = await store.load()
    const results = await Promise.all([
      store.save(fixture(2), base.revision),
      createWorkspaceStore(dir).save(fixture(3), base.revision),
    ])
    expect(results.map((r) => r.status)).toEqual(['saved', 'conflict'])
    expect((await store.load()).workspace).toEqual(fixture(2))
    expect((await store.save(fixture(2), base.revision)).status).toBe('saved')
    expect((await store.save(fixture(3), base.revision)).status).toBe(
      'conflict',
    )
  })
  it('keeps the file valid throughout repeated atomic replacements', async () => {
    const { dir, store } = await setup()
    await store.save(fixture(), null)
    for (let quantity = 2; quantity <= 12; quantity++) {
      const base = await store.load()
      const writing = store.save(fixture(quantity), base.revision)
      const reads = await Promise.all(
        Array.from({ length: 8 }, () =>
          readFile(join(dir, 'workspace.json'), 'utf8'),
        ),
      )
      for (const raw of reads)
        expect(workspaceSnapshotSchema.safeParse(JSON.parse(raw)).success).toBe(
          true,
        )
      await writing
    }
    expect((await store.load()).workspace).toEqual(fixture(12))
  })
  it('rejects incomplete save payloads', () => {
    expect(workspaceSnapshotSchema.safeParse({ lines: [] }).success).toBe(false)
    expect(
      workspaceSnapshotSchema.safeParse({ ...fixture(), lines: [null] })
        .success,
    ).toBe(false)
  })
})

describe('browser recovery', () => {
  it('uses the server and preserves a different legacy browser copy', () => {
    const storage = memoryStorage()
    storage.setItem(workspaceStorageKey, JSON.stringify(fixture(1)))
    const result = readWorkspaceCache(
      { workspace: fixture(2), revision: 'two' },
      storage,
    )
    expect(result.workspace).toEqual(fixture(2))
    expect(JSON.parse(result.recovery!)).toEqual(fixture(1))
    const recoveryKey = Array.from({ length: storage.length }, (_, i) =>
      storage.key(i),
    ).find((key) => key?.includes('.recovery.'))!
    expect(JSON.parse(storage.getItem(recoveryKey)!)).toEqual(fixture(1))
  })
  it('restores pending offline edits only if the server revision has not changed', () => {
    const storage = memoryStorage()
    writeWorkspaceCache(storage, fixture(2), 'one', true)
    expect(
      readWorkspaceCache({ workspace: fixture(), revision: 'one' }, storage)
        .workspace,
    ).toEqual(fixture(2))
    expect(
      readWorkspaceCache({ workspace: fixture(3), revision: 'three' }, storage)
        .workspace,
    ).toEqual(fixture(3))
  })
  it('keeps the original cache when quota prevents creating a recovery copy', () => {
    const storage = memoryStorage()
    storage.setItem(workspaceStorageKey, JSON.stringify(fixture()))
    storage.setItem = () => {
      throw Error('QuotaExceededError')
    }
    const result = readWorkspaceCache(
      { workspace: fixture(2), revision: 'two' },
      storage,
    )
    expect(result.cacheEnabled).toBe(false)
    expect(JSON.parse(storage.getItem(workspaceStorageKey)!)).toEqual(fixture())
    expect(result.workspace).toEqual(fixture(2))
  })
})

describe('save ordering and request counts', () => {
  it('does not save on mount, batches rapid edits behind one request, and never rolls back the cache', async () => {
    let finish!: (result: SaveWorkspaceResult) => void
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValue({ status: 'saved', revision: 'latest' })
    const cache = vi.fn()
    const saver = createWorkspaceSaver({
      initial: fixture(),
      revision: 'one',
      save,
      cache,
      onStatus: vi.fn(),
    })
    saver.update(fixture())
    saver.update(fixture())
    expect(save).not.toHaveBeenCalled()
    saver.update(fixture(2))
    for (let i = 3; i <= 1000; i++) saver.update(fixture(i))
    expect(save).toHaveBeenCalledTimes(1)
    finish({ status: 'saved', revision: 'two' })
    await saver.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]).toEqual([fixture(1000), 'two'])
    expect(cache.mock.calls.at(-1)).toEqual([fixture(1000), 'latest', false])
    expect(cache.mock.calls.filter((call) => call[2] === false)).toHaveLength(1)
  })
  it('saves to the server even if localStorage throws', async () => {
    const save = vi.fn().mockResolvedValue({ status: 'saved', revision: 'two' })
    const onStatus = vi.fn()
    const saver = createWorkspaceSaver({
      initial: fixture(),
      revision: 'one',
      save,
      cache: () => {
        throw Error('quota')
      },
      onStatus,
    })
    saver.update(fixture(2))
    await saver.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenLastCalledWith('saved')
  })
  it('reports failures without an automatic retry loop and retries the latest edit on request', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(Error('offline'))
      .mockResolvedValue({ status: 'saved', revision: 'three' })
    const onStatus = vi.fn()
    const saver = createWorkspaceSaver({
      initial: fixture(),
      revision: 'one',
      save,
      cache: vi.fn(),
      onStatus,
    })
    saver.update(fixture(2))
    await saver.flush()
    saver.update(fixture(3))
    await saver.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenLastCalledWith('error')
    await saver.retry()
    expect(save.mock.calls[1]).toEqual([fixture(3), 'one'])
    expect(onStatus).toHaveBeenLastCalledWith('saved')
  })
  it('blocks later autosaves after a conflict without discarding local edits', async () => {
    const save = vi.fn().mockResolvedValue({ status: 'conflict' })
    const onStatus = vi.fn()
    const saver = createWorkspaceSaver({
      initial: fixture(),
      revision: 'one',
      save,
      cache: vi.fn(),
      onStatus,
    })
    saver.update(fixture(2))
    await saver.flush()
    saver.update(fixture(3))
    await saver.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(saver.getLatest()).toEqual(fixture(3))
    expect(onStatus).toHaveBeenLastCalledWith('conflict')
  })
})

it('serializes optional undefined properties before validating client state', () => {
  const state = {
    ...fixture(),
    materialRequests: [
      {
        id: 'request-1',
        sourceCipher: undefined,
        sourceQuantity: undefined,
        altQuantity: null,
      },
    ],
  }
  expect(toWorkspaceSnapshot(state).materialRequests).toEqual([
    { id: 'request-1', altQuantity: null },
  ])
})
it('marks restored offline edits for retry on mount', () => {
  const storage = memoryStorage()
  writeWorkspaceCache(storage, fixture(2), 'one', true)
  expect(
    readWorkspaceCache({ workspace: fixture(), revision: 'one' }, storage)
      .pending,
  ).toBe(true)
})

it('preserves another tabs pending cache when a prior save acknowledgement arrives', () => {
  const storage = memoryStorage()
  writeWorkspaceCache(storage, fixture(2), 'one', true, 'tab-a')
  writeWorkspaceCache(storage, fixture(3), 'one', true, 'tab-b')
  writeWorkspaceCache(storage, fixture(2), 'two', false, 'tab-a')
  const recovered = Array.from({ length: storage.length }, (_, i) =>
    storage.key(i),
  )
    .filter((key) => key?.includes('.recovery.'))
    .map((key) => JSON.parse(storage.getItem(key!)!))
  expect(recovered).toContainEqual(fixture(3))
})
