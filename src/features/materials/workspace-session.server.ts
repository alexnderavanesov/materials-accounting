import { createHmac, randomBytes } from 'node:crypto'

// Persistent cookies survive browser restarts. A server restart revokes them
// earlier by losing this process's key; PostgreSQL still handles explicit revocation.
export const workspaceSessionMaxAge = 400 * 24 * 60 * 60
const keyId = Symbol.for('materials.workspace-session-key.v1')
const runtime = globalThis as typeof globalThis & { [keyId]?: Buffer }

export function workspaceSessionHash(token: string) {
  // Keep the key through module reloads, but never persist it to disk or the DB.
  const key = (runtime[keyId] ??= randomBytes(32))
  return createHmac('sha256', key).update(token).digest('hex')
}
