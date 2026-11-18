// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  editJournalKey,
  workspaceClientIdentity,
} from './workspace-collaboration'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('client journals after removing login', () => {
  it('recovers pending edits from this tab’s former account without removing the original', () => {
    sessionStorage.setItem('materials.client.former-user', 'old-client')
    localStorage.setItem(editJournalKey('old-client'), '{"pending":true}')
    const client = workspaceClientIdentity()
    expect(client).not.toBe('old-client')
    expect(sessionStorage.getItem('materials.client.local')).toBe(client)
    expect(localStorage.getItem(editJournalKey(client))).toBe(
      '{"pending":true}',
    )
    expect(localStorage.getItem(editJournalKey('old-client'))).toBe(
      '{"pending":true}',
    )
  })

  it('prefers the current local journal on subsequent reloads', () => {
    sessionStorage.setItem('materials.client.former-user', 'old-client')
    localStorage.setItem(editJournalKey('old-client'), 'old')
    sessionStorage.setItem('materials.client.local', 'local-client')
    localStorage.setItem(editJournalKey('local-client'), 'current')
    const client = workspaceClientIdentity()
    expect(localStorage.getItem(editJournalKey(client))).toBe('current')
  })

  it('does not combine different accounts’ journals or delete them', () => {
    for (const id of ['one', 'two']) {
      sessionStorage.setItem(`materials.client.${id}`, id)
      localStorage.setItem(editJournalKey(id), id)
    }
    const client = workspaceClientIdentity()
    expect(localStorage.getItem(editJournalKey(client))).toBeNull()
    expect(localStorage.getItem(editJournalKey('one'))).toBe('one')
    expect(localStorage.getItem(editJournalKey('two'))).toBe('two')
  })
})
