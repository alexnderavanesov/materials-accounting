import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workspaceResponse } from './workspace-access.server'
import { emptyWorkspace } from './workspace-protocol'
import {
  loadProjectWorkspaceChanges,
  loadProjectWorkspaceSnapshot,
  saveProjectWorkspaceChanges,
  saveProjectWorkspaceSnapshot,
} from './functions'

const mocks = vi.hoisted(() => ({
  request: vi.fn<() => Request>(),
  header: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  patch: vi.fn(),
  changes: vi.fn(),
}))
// Invoke the real handlers with validated input and mocked storage, without a DB.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    let schema: { parse: (data: unknown) => unknown } | undefined
    const builder = {
      validator(value: typeof schema) {
        schema = value
        return builder
      },
      handler(run: (input: { data: unknown }) => Promise<unknown>) {
        return (input?: { data: unknown }) =>
          run({ data: schema ? schema.parse(input?.data) : input?.data })
      },
    }
    return builder
  },
}))
vi.mock('@tanstack/react-start/server', () => ({
  getRequest: mocks.request,
  setResponseHeader: mocks.header,
}))
vi.mock('./workspace-snapshot.server', () => ({
  projectWorkspaceStore: { load: mocks.load, save: mocks.save },
}))
vi.mock('./workspace-postgres.server', () => ({
  postgresWorkspaceStore: () => ({
    patch: mocks.patch,
    changes: mocks.changes,
  }),
}))
vi.mock('./workspace-auth.server', () => {
  throw new Error('Application access must not load account/session code')
})

const origin = 'http://127.0.0.1:43187'
const patch = {
  mutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  changes: [
    {
      collection: 'lines' as const,
      id: 'line',
      value: { id: 'line' },
      expectedVersion: null,
      position: 0,
    },
  ],
  groups: {},
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('APP_ORIGIN', '')
  mocks.request.mockReturnValue(new Request(origin))
})
afterEach(() => vi.unstubAllEnvs())

describe('workspace access without login', () => {
  it('loads the workspace without a cookie or authentication flags', async () => {
    const stored = { workspace: emptyWorkspace(), revision: 'pg:1' }
    mocks.load.mockResolvedValue(stored)
    expect(await loadProjectWorkspaceSnapshot()).toEqual(stored)
    expect(mocks.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it('reads collaborative changes without a cookie', async () => {
    const changes = {
      revision: 'pg:2',
      records: [],
      groups: {},
      hasMore: false,
    }
    mocks.changes.mockResolvedValue(changes)
    expect(
      await loadProjectWorkspaceChanges({ data: { revision: 'pg:1' } }),
    ).toEqual(changes)
    expect(mocks.changes).toHaveBeenCalledWith('pg:1')
  })

  it('saves changes without a cookie and records a local author', async () => {
    mocks.request.mockReturnValue(
      new Request(origin, { method: 'POST', headers: { origin } }),
    )
    mocks.patch.mockResolvedValue({
      status: 'saved',
      revision: 'pg:2',
      records: [],
      groups: {},
    })
    await saveProjectWorkspaceChanges({ data: patch })
    expect(mocks.patch).toHaveBeenCalledWith(
      patch,
      'local:Локальный пользователь',
    )
    const workspace = emptyWorkspace()
    await saveProjectWorkspaceSnapshot({
      data: { workspace, expectedRevision: 'pg:1' },
    })
    expect(mocks.save).toHaveBeenCalledWith(workspace, 'pg:1')
  })

  it.each([undefined, 'https://other.example'])(
    'rejects writes with origin %s before touching storage',
    async (requestOrigin) => {
      mocks.request.mockReturnValue(
        new Request(origin, {
          method: 'POST',
          headers: requestOrigin ? { origin: requestOrigin } : {},
        }),
      )
      await expect(
        saveProjectWorkspaceChanges({ data: patch }),
      ).rejects.toThrow('другого сайта')
      await expect(
        saveProjectWorkspaceSnapshot({
          data: { workspace: emptyWorkspace(), expectedRevision: null },
        }),
      ).rejects.toThrow('другого сайта')
      expect(mocks.patch).not.toHaveBeenCalled()
      expect(mocks.save).not.toHaveBeenCalled()
    },
  )

  it.each(['GET', 'POST'])(
    'allows document handlers without a cookie (%s)',
    async (method) => {
      const request = new Request(`${origin}/api/documents`, {
        method,
        headers: method === 'POST' ? { origin } : {},
      })
      const handler = vi.fn(async () => Response.json({ ok: true }))
      const response = await workspaceResponse(request, handler)
      expect(response.status).toBe(200)
      expect(handler).toHaveBeenCalledWith(request)
    },
  )

  it('rejects foreign document writes with 403 and never invokes the handler', async () => {
    const handler = vi.fn(async () => new Response())
    const response = await workspaceResponse(
      new Request(`${origin}/api/documents`, {
        method: 'POST',
        headers: { origin: 'https://other.example' },
      }),
      handler,
    )
    expect(response.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })
})
