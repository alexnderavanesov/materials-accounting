import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authenticatedWorkspaceResponse,
  checkWorkspaceOrigin,
  currentWorkspaceUser,
  hashPassword,
  loginWorkspace,
  logoutWorkspace,
  requireWorkspaceUser,
  sessionCookie,
  verifyPassword,
} from './workspace-auth.server'
import {
  workspaceSessionHash,
  workspaceSessionMaxAge,
} from './workspace-session.server'

const { sql } = vi.hoisted(() => {
  const query = vi.fn<(...args: unknown[]) => Promise<unknown[]>>()
  return {
    sql: Object.assign(query, {
      begin: async (run: (tx: typeof query) => Promise<void>) => run(query),
    }),
  }
})
vi.mock('../../db/connection.server', () => ({ workspaceSql: () => sql }))

beforeEach(() => {
  sql.mockReset()
  vi.stubEnv('APP_ORIGIN', '')
})

afterEach(() => vi.unstubAllEnvs())
describe('workspace authentication boundary', () => {
  it('hashes passwords with a distinct salt and verifies without storing plaintext', async () => {
    const [first, second] = await Promise.all([
      hashPassword('test-password-one'),
      hashPassword('test-password-one'),
    ])
    expect(first).not.toBe(second)
    expect(first).not.toContain('test-password')
    expect(await verifyPassword('test-password-one', first)).toBe(true)
    expect(await verifyPassword('incorrect', first)).toBe(false)
    expect(await verifyPassword('incorrect', 'malformed')).toBe(false)
  })
  it('rejects missing and foreign Origin on writes', () => {
    vi.stubEnv('APP_ORIGIN', 'https://materials.example.com')
    for (const origin of [
      undefined,
      'https://evil.example.com',
      'http://materials.example.com',
    ])
      expect(() =>
        checkWorkspaceOrigin(
          new Request('https://materials.example.com/api/documents', {
            method: 'POST',
            headers: origin ? { origin } : {},
          }),
        ),
      ).toThrow('другого сайта')
    expect(() =>
      checkWorkspaceOrigin(
        new Request('https://materials.example.com/api/documents', {
          method: 'POST',
          headers: { origin: 'https://materials.example.com' },
        }),
      ),
    ).not.toThrow()
  })
  it('requires HTTPS for a public origin and leaves local development usable', () => {
    vi.stubEnv('APP_ORIGIN', 'http://materials.example.com')
    expect(() =>
      checkWorkspaceOrigin(new Request('http://materials.example.com/')),
    ).toThrow('HTTPS')
    vi.stubEnv('APP_ORIGIN', '')
    expect(() =>
      checkWorkspaceOrigin(new Request('http://127.0.0.1:43187/')),
    ).not.toThrow()
    expect(() =>
      checkWorkspaceOrigin(new Request('http://unexpected-domain.example/')),
    ).toThrow('APP_ORIGIN')
  })
  it('uses HttpOnly, SameSite and Secure cookies for internet sessions', () => {
    vi.stubEnv('APP_ORIGIN', 'https://materials.example.com')
    const request = new Request('https://materials.example.com/')
    expect(sessionCookie('token', request)).toContain(
      'HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000; Secure',
    )
    expect(sessionCookie('', request, true)).toContain('Max-Age=0; Secure')
  })
  it('persists the local browser cookie and explicitly removes it on logout', () => {
    const request = new Request('http://127.0.0.1:43187/')
    expect(sessionCookie('token', request)).toBe(
      'materials_session=token; HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000',
    )
    expect(sessionCookie('', request, true)).toBe(
      'materials_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    )
  })
  it('creates a persistent session and restores the same user from a new request after module reload', async () => {
    const user = {
      id: 'test-user',
      login: 'user',
      name: 'User',
      role: 'editor',
    }
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([
        {
          ...user,
          disabled: 0,
          password_hash: await hashPassword('test-pass'),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const login = await loginWorkspace(
      new Request('http://127.0.0.1:43187/', {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:43187' },
      }),
      'USER',
      'test-pass',
    )
    expect(login.user).toEqual(user)
    const insert = sql.mock.calls.at(-1)!
    expect((insert[0] as TemplateStringsArray).join('')).toContain(
      'insert into workspace_sessions',
    )
    expect(insert.slice(1)).toEqual([
      workspaceSessionHash(login.token),
      user.id,
      workspaceSessionMaxAge,
    ])
    expect(workspaceSessionMaxAge).toBeGreaterThan(8 * 60 * 60)
    const cookie = sessionCookie(
      login.token,
      new Request('http://127.0.0.1:43187/'),
    ).split(';')[0]!
    vi.resetModules()
    const reloaded = await import('./workspace-auth.server')
    sql.mockResolvedValueOnce([user])
    expect(
      await reloaded.currentWorkspaceUser(
        new Request('http://127.0.0.1:43187/', {
          headers: { cookie },
        }),
      ),
    ).toEqual(user)
    expect(sql.mock.calls.at(-1)![1]).toBe(insert[1])
  })
  it('revokes the saved session hash on logout and rejects a revoked cookie at the API boundary', async () => {
    const token = 'a'.repeat(64)
    const request = new Request('http://127.0.0.1:43187/', {
      method: 'POST',
      headers: {
        cookie: `materials_session=${token}`,
        origin: 'http://127.0.0.1:43187',
      },
    })
    sql.mockResolvedValue([])
    await logoutWorkspace(request)
    expect((sql.mock.calls[0]![0] as TemplateStringsArray).join('')).toContain(
      'delete from workspace_sessions',
    )
    expect(sql.mock.calls[0]![1]).toBe(workspaceSessionHash(token))
    const handler = vi.fn(async () => Response.json({ private: true }))
    expect(
      (await authenticatedWorkspaceResponse(request, handler)).status,
    ).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })
  it('does not accept legacy unbound sessions or let an editor use admin-only actions', async () => {
    const token = 'b'.repeat(64)
    const request = new Request('http://127.0.0.1:43187/', {
      headers: { cookie: `materials_session=${token}` },
    })
    sql.mockResolvedValueOnce([])
    expect(await currentWorkspaceUser(request)).toBeNull()
    expect(sql.mock.calls[0]![1]).not.toBe(
      createHash('sha256').update(token).digest('hex'),
    )
    sql.mockResolvedValueOnce([
      { id: 'user', login: 'user', name: 'User', role: 'editor' },
    ])
    await expect(requireWorkspaceUser(request, true)).rejects.toThrow(
      'права администратора',
    )
  })
  it('rejects direct unauthenticated API access before the handler sees data', async () => {
    vi.stubEnv('APP_ORIGIN', '')
    const request = new Request('http://127.0.0.1:43187/api/documents')
    const handler = vi.fn(async () => Response.json({ private: true }))
    expect(await currentWorkspaceUser(request)).toBeNull()
    await expect(requireWorkspaceUser(request)).rejects.toThrow('Войдите снова')
    const result = await authenticatedWorkspaceResponse(request, handler)
    expect(result.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    expect(result.headers.get('Cache-Control')).toBe('no-store')
  })
})
