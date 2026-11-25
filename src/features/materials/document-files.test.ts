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

it('atomically replaces only the chosen document files, preserving all originals on failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'materials-replace-'))
  try {
    const store = createDocumentFileStore(directory)
    const bytes = Buffer.from('%PDF-original')
    const first = await store.add({
      documentId: 'app',
      name: 'APP.pdf',
      bytes,
      expectedRevision: (await store.load()).revision,
    })
    const before = await store.add({
      documentId: 'other',
      name: 'Other.pdf',
      bytes,
      expectedRevision: first.revision,
    })
    const input = {
      documentId: 'app',
      files: [{ name: 'New.pdf', bytes: Buffer.from('%PDF-new') }],
      expectedRevision: before.revision,
      replaceFileIds: [first.files[0]!.id],
    }
    fault.manifest = true
    await expect(store.addMany(input)).rejects.toThrow('disk write failed')
    expect(await store.load()).toEqual(before)
    expect((await store.read(first.files[0]!.id)).bytes).toEqual(bytes)
    fault.manifest = false
    await expect(
      store.addMany({ ...input, replaceFileIds: [before.files[1]!.id] }),
    ).rejects.toThrow('не принадлежит')
    const after = await store.addMany(input)
    expect(after.files.map((file) => file.name)).toEqual([
      'Other.pdf',
      'New.pdf',
    ])
    expect((await store.read(before.files[1]!.id)).bytes).toEqual(bytes)
    expect(await readdir(join(directory, 'document-files'))).not.toContain(
      `${first.files[0]!.id}.bin`,
    )
    await expect(store.addMany(input)).rejects.toThrow('другой вкладке')
  } finally {
    fault.manifest = false
    await rm(directory, { recursive: true, force: true })
  }
})

it('stores identical bytes once across materials, retries and documents, retaining shared originals on removal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'materials-shared-original-'))
  try {
    const store = createDocumentFileStore(directory)
    const bytes = Buffer.from('%PDF-shared-original')
    let manifest = await store.addMany({
      documentId: 'm15',
      files: [
        { name: 'one.pdf', bytes },
        { name: 'copy.pdf', bytes },
        { name: 'one.pdf', bytes },
      ],
      expectedRevision: (await store.load()).revision,
    })
    expect(manifest.files.map((file) => file.name)).toEqual([
      'one.pdf',
      'copy.pdf',
    ])
    const first = manifest.files[0]!
    const copy = manifest.files[1]!
    manifest = await store.add({
      documentId: 'm15',
      name: 'one.pdf',
      bytes,
      expectedRevision: manifest.revision,
    })
    expect(manifest.files).toHaveLength(2)
    expect(manifest.files[0]!.id).toBe(first.id)
    manifest = await store.add({
      documentId: 'another-document',
      name: 'shared.pdf',
      bytes,
      expectedRevision: manifest.revision,
    })
    expect(manifest.files).toHaveLength(3)
    expect(
      (await readdir(join(directory, 'document-files'))).filter((name) =>
        name.endsWith('.bin'),
      ),
    ).toHaveLength(1)
    const second = manifest.files.find(
      (file) => file.documentId === 'another-document',
    )!
    manifest = await store.remove(first.id, manifest.revision)
    expect((await store.read(copy.id)).bytes).toEqual(bytes)
    manifest = await store.remove(copy.id, manifest.revision)
    expect((await store.read(second.id)).bytes).toEqual(bytes)
    await store.remove(second.id, manifest.revision)
    expect(
      (await readdir(join(directory, 'document-files'))).filter((name) =>
        name.endsWith('.bin'),
      ),
    ).toHaveLength(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
