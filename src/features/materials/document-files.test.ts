import { mkdtemp, readdir, rm } from 'node:fs/promises'
import type * as FileSystem from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createDocumentFileStore } from './document-files.server'

const fault = vi.hoisted(() => ({ manifest: false }))
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof FileSystem>()
  return {
    ...fs,
    writeFile: (...args: Parameters<typeof fs.writeFile>) => {
      if (fault.manifest && String(args[0]).endsWith('.tmp'))
        return Promise.reject(new Error('Fixture: disk write failed'))
      return fs.writeFile(...args)
    },
  }
})

it('removes all staged files after a manifest write failure and preserves existing originals', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'materials-upload-rollback-'))
  try {
    const store = createDocumentFileStore(directory)
    const bytes = Buffer.from('%PDF-fixture')
    const before = await store.add({
      documentId: 'avk',
      name: 'Прежний.pdf',
      bytes,
      expectedRevision: (await store.load()).revision,
    })
    const names = await readdir(join(directory, 'document-files'))
    fault.manifest = true
    await expect(
      store.addMany({
        documentId: 'avk',
        expectedRevision: before.revision,
        files: [
          { name: 'Первый.pdf', bytes },
          { name: 'Второй.pdf', bytes },
        ],
      }),
    ).rejects.toThrow('disk write failed')
    expect(await store.load()).toEqual(before)
    expect(await readdir(join(directory, 'document-files'))).toEqual(names)
    expect((await store.read(before.files[0]!.id)).bytes).toEqual(bytes)
  } finally {
    fault.manifest = false
    await rm(directory, { recursive: true, force: true })
  }
})
