import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it, vi } from 'vitest'
import { workspaceSessionHash } from './workspace-session.server'

it('keeps a session valid through module reloads in the same server runtime', async () => {
  const token = 'test-session-token'
  const before = workspaceSessionHash(token)
  vi.resetModules()
  const reloaded = await import('./workspace-session.server')
  expect(reloaded.workspaceSessionHash(token)).toBe(before)
  expect(reloaded.workspaceSessionHash('another-session')).not.toBe(before)
})

it('makes the same browser token invalid when the server process restarts', async () => {
  // Separate real Node processes, without importing DB code or touching working sessions.
  const run = () =>
    promisify(execFile)(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import { workspaceSessionHash } from './src/features/materials/workspace-session.server.ts';
     console.log(JSON.stringify([workspaceSessionHash('test-token'), workspaceSessionHash('test-token')]));`,
      ],
      { cwd: process.cwd(), timeout: 10000 },
    )
  const first = JSON.parse((await run()).stdout) as string[]
  const restarted = JSON.parse((await run()).stdout) as string[]
  expect(first[0]).toMatch(/^[a-f0-9]{64}$/)
  expect(first[0]).toBe(first[1])
  expect(restarted[0]).toBe(restarted[1])
  expect(restarted[0]).not.toBe(first[0])
})
