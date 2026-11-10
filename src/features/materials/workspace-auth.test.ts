import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authenticatedWorkspaceResponse,
  checkWorkspaceOrigin,
  currentWorkspaceUser,
  hashPassword,
  requireWorkspaceUser,
  sessionCookie,
  verifyPassword,
} from './workspace-auth.server'

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
      'HttpOnly; SameSite=Lax; Path=/; Max-Age=28800; Secure',
    )
    expect(sessionCookie('', request, true)).toContain('Max-Age=0; Secure')
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
