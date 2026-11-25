import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocumentFileStore } from './document-files.server'
import { createDocumentsHandler } from './documents-api.server'
import { buildDocumentRegistry } from './document-registry'
import {
  archiveLimits,
  buildDocumentArchive,
  buildDocumentPhotosArchive,
} from './document-archive.server'
import { documentRegistryFixture } from './document-registry.fixtures'
import { withM15Document } from './m15-document'
import { buildRequestPrintData } from './request-print-data'
import { builtinPrintTemplate } from './request-print-store.server'
import {
  fillPrintWorkbook,
  readPrintWorkbook,
} from './request-print-excel.server'

const directories: string[] = []
const pdf = Buffer.from('%PDF-1.4\nfixture')
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'materials-documents-test-'))
  directories.push(directory)
  const files = createDocumentFileStore(directory),
    workspace = documentRegistryFixture()
  const render = vi.fn(async () => Buffer.from('Excel fixture'))
  const renderer = vi.fn(async () => render),
    convert = vi.fn(async () => pdf)
  const load = vi.fn(async () => ({ workspace, revision: 'workspace-1' }))
  const handle = createDocumentsHandler({
    workspace: { load },
    files,
    renderer,
    convert,
  })
  const get = () => handle(new Request('http://localhost/api/documents'))
  const post = async (
    body: Record<string, unknown>,
    origin = 'http://localhost',
  ) =>
    handle(
      new Request('http://localhost/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({
          workspaceRevision: 'workspace-1',
          filesRevision: (await files.load()).revision,
          ...body,
        }),
      }),
    )
  return {
    directory,
    files,
    workspace,
    render,
    renderer,
    convert,
    load,
    handle,
    get,
    post,
  }
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('document originals and on-demand archives', () => {
  it('uploads and archives scans for M-15 before receipts, retaining them after the receipt is linked', async () => {
    const f = await fixture()
    Object.assign(
      f.workspace,
      withM15Document(f.workspace, {
        id: 'new-m15',
        kind: 'm15',
        number: '15-NEW',
        date: '2026-11-18',
      }),
    )
    f.workspace.m15Reconciliations = [
      { id: 'new-m15', mode: 'automatic', lines: [], allocations: [] },
    ]
    const source = buildDocumentRegistry(f.workspace).documents.find(
      (doc) => doc.receiptDocumentId === 'new-m15',
    )!
    expect(source.materialIds).toEqual([])
    const uploaded = await f.post({
      action: 'upload',
      documentId: source.id,
      name: 'Скан М-15.pdf',
      base64: pdf.toString('base64'),
    })
    expect(uploaded.status).toBe(200)
    const response = await f.post({
      action: 'archive',
      materialIds: [source.id],
      documentIds: [source.id],
    })
    expect(response.status).toBe(200)
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    const originals = Object.values(zip.files).filter(
      (file) => !file.dir && file.name.endsWith('.pdf'),
    )
    expect(originals).toHaveLength(1)
    expect(await originals[0]!.async('nodebuffer')).toEqual(pdf)
    expect(
      (
        await f.post({
          action: 'archive',
          materialIds: ['unknown'],
          documentIds: [source.id],
        })
      ).status,
    ).not.toBe(200)
    f.workspace.m15Reconciliations[0]!.lines = [
      {
        id: 'l',
        projectLineId: 'line',
        name: 'Клапан',
        unit: 'шт',
        position: '',
        quantity: 1,
      },
    ]
    const linked = buildDocumentRegistry(f.workspace).documents.find(
      (doc) => doc.id === source.id,
    )!
    expect(linked.materialIds).toHaveLength(1)
    expect(
      (
        await f.post({
          action: 'archive',
          materialIds: linked.materialIds,
          documentIds: [source.id],
        })
      ).status,
    ).toBe(200)
    expect((await f.files.load()).files).toHaveLength(1)
  })
  it('downloads only this document’s 20 original photos with distinct flat names and no rendering', async () => {
    const f = await fixture()
    const docs = buildDocumentRegistry(f.workspace).documents
    const avk = docs.find((doc) => doc.kind === 'avk')!
    const zni = docs.find((doc) => doc.kind === 'zni')!
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    const photos = Array.from({ length: 20 }, (_, i) => ({
      name: i < 2 ? 'Фото.png' : `Фото ${i}.PNG`,
      bytes: Buffer.concat([png, Buffer.from([i])]),
    }))
    await f.files.addMany({
      documentId: avk.id,
      expectedRevision: (await f.files.load()).revision,
      files: [...photos, { name: 'Паспорт.pdf', bytes: pdf }],
    })
    await f.files.add({
      documentId: zni.id,
      expectedRevision: (await f.files.load()).revision,
      name: 'Фото ЗНИ.png',
      bytes: png,
    })
    const before = await f.files.load()
    const response = await f.post({
      action: 'photos-archive',
      documentId: avk.id,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/zip')
    expect(
      decodeURIComponent(response.headers.get('Content-Disposition')!),
    ).toContain('Фотографии — АВК')
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    const names = Object.keys(zip.files)
    expect(names).toHaveLength(20)
    expect(names).toContain('Фото.png')
    expect(names).toContain('Фото (2).png')
    expect(
      names.every((name) => !name.includes('/') && /\.png$/i.test(name)),
    ).toBe(true)
    for (const entry of Object.values(zip.files))
      expect((await entry.async('nodebuffer')).subarray(0, 8)).toEqual(png)
    expect(f.renderer).not.toHaveBeenCalled()
    expect(f.convert).not.toHaveBeenCalled()
    expect(await f.files.load()).toEqual(before)
  })
  it('rejects an empty, missing or stale photo selection and does not silently skip missing originals', async () => {
    const f = await fixture()
    const doc = buildDocumentRegistry(f.workspace).documents.find(
      (entry) => entry.kind === 'avk',
    )!
    expect(
      (await f.post({ action: 'photos-archive', documentId: doc.id })).status,
    ).toBe(404)
    expect(
      (await f.post({ action: 'photos-archive', documentId: 'missing' }))
        .status,
    ).toBe(404)
    expect(
      (
        await f.post({
          action: 'photos-archive',
          documentId: doc.id,
          filesRevision: 'stale',
        })
      ).status,
    ).toBe(409)
    await f.files.add({
      documentId: doc.id,
      name: 'Фото.png',
      bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      expectedRevision: (await f.files.load()).revision,
    })
    vi.spyOn(f.files, 'read').mockRejectedValueOnce(
      new Error('missing original'),
    )
    const response = await f.post({
      action: 'photos-archive',
      documentId: doc.id,
    })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain(
      'Не удалось прочитать фотографию',
    )
    expect(
      (await f.post({ action: 'photos-archive', documentId: doc.id })).status,
    ).toBe(200)
  })
  it('limits photo archives before reading and honors cancellation', async () => {
    const read = vi.fn(async () => ({ bytes: Buffer.from('photo') }))
    const manifest = {
      revision: 'files',
      documents: [],
      files: [
        {
          id: 'photo',
          documentId: 'avk',
          name: 'Фото.png',
          uploadedAt: '',
          size: archiveLimits.bytes + 1,
        },
      ],
    }
    await expect(
      buildDocumentPhotosArchive({
        manifest,
        documentId: 'avk',
        readFile: read,
      }),
    ).rejects.toMatchObject({ status: 413 })
    manifest.files[0]!.size = 5
    const controller = new AbortController()
    controller.abort()
    await expect(
      buildDocumentPhotosArchive({
        manifest,
        documentId: 'avk',
        readFile: read,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ status: 499 })
    expect(read).not.toHaveBeenCalled()
  })
  it.each(['existing', 'new'])(
    'attaches a batch to one %s document, persists it and rejects stale retries',
    async (target) => {
      const f = await fixture()
      const registry = buildDocumentRegistry(f.workspace)
      const doc = registry.documents.find((entry) => entry.kind === 'avk')!
      const before = (await f.files.load()).revision
      const body = {
        action: 'upload-files',
        filesRevision: before,
        ...(target === 'existing'
          ? { documentId: doc.id }
          : {
              document: {
                kind: 'quality',
                label: 'Фотоматериалы',
                date: '',
                lineIds: registry.materials[0]!.lineIds,
              },
            }),
        files: [1, 2, 3].map((n) => ({
          name: `Фото${n}.pdf`,
          base64: Buffer.concat([pdf, Buffer.from(String(n))]).toString(
            'base64',
          ),
        })),
      }
      const result = await f.post(body)
      expect(result.status).toBe(200)
      const saved = await f.files.load()
      expect(saved.files).toHaveLength(3)
      expect(new Set(saved.files.map((file) => file.documentId)).size).toBe(1)
      expect(saved.documents).toHaveLength(1)
      for (const file of saved.files)
        expect(
          (await f.files.read(file.id)).bytes.subarray(0, pdf.length),
        ).toEqual(pdf)
      expect((await f.post(body)).status).toBe(409)
      expect(await createDocumentFileStore(f.directory).load()).toEqual(saved)
    },
  )
  it('rejects the entire batch before writing if any file is damaged or the batch is oversized', async () => {
    const f = await fixture()
    const doc = buildDocumentRegistry(f.workspace).documents.find(
      (entry) => entry.kind === 'avk',
    )!
    const good = { name: 'Акт.pdf', base64: pdf.toString('base64') }
    const body = {
      action: 'upload-files',
      documentId: doc.id,
      files: [
        good,
        { name: 'Фото.png', base64: Buffer.from('invalid').toString('base64') },
      ],
    }
    expect((await f.post(body)).status).toBe(400)
    expect(await readdir(f.directory)).toEqual([])
    expect(
      (await f.post({ ...body, files: Array.from({ length: 51 }, () => good) }))
        .status,
    ).toBe(400)
    expect(await readdir(f.directory)).toEqual([])
  })
  it('serializes concurrent batches so only one commits against the same revision', async () => {
    const f = await fixture()
    const expectedRevision = (await f.files.load()).revision
    const batch = {
      documentId: 'avk',
      expectedRevision,
      files: [1, 2].map((n) => ({
        name: `${n}.pdf`,
        bytes: Buffer.concat([pdf, Buffer.from(String(n))]),
      })),
    }
    const results = await Promise.allSettled([
      f.files.addMany(batch),
      f.files.addMany(batch),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect((await f.files.load()).files).toHaveLength(2)
    expect(await readdir(join(f.directory, 'document-files'))).toHaveLength(3)
  })
  it.each([
    ['pdf', 'application/pdf', pdf],
    ['png', 'image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['jpg', 'image/jpeg', Buffer.from([255, 216, 255])],
  ])(
    'previews %s inline while preserving the original download and storage',
    async (extension, type, bytes) => {
      const f = await fixture()
      const manifest = await f.files.add({
        documentId: 'avk',
        name: `Файл.${extension}`,
        bytes,
        expectedRevision: (await f.files.load()).revision,
      })
      const url = `http://localhost/api/documents?file=${manifest.files[0]!.id}`
      const response = await f.handle(new Request(`${url}&preview=1`))
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe(type)
      expect(response.headers.get('Content-Disposition')).toMatch(/^inline;/)
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
      const original = await f.handle(new Request(url))
      expect(original.headers.get('Content-Disposition')).toMatch(
        /^attachment;/,
      )
      expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes)
      expect(await f.files.load()).toEqual(manifest)
      expect(f.load).not.toHaveBeenCalled()
      expect(f.convert).not.toHaveBeenCalled()
    },
  )
  it.each(['xlsx', 'docx'] as const)(
    'converts only a temporary %s preview and leaves original bytes intact',
    async (extension) => {
      const f = await fixture()
      const zip = new JSZip()
      zip.file(
        extension === 'xlsx' ? 'xl/workbook.xml' : 'word/document.xml',
        '<fixture/>',
      )
      const bytes = await zip.generateAsync({ type: 'nodebuffer' })
      const manifest = await f.files.add({
        documentId: 'avk',
        name: `Файл.${extension}`,
        bytes,
        expectedRevision: (await f.files.load()).revision,
      })
      const url = `http://localhost/api/documents?file=${manifest.files[0]!.id}`
      const response = await f.handle(new Request(`${url}&preview=1`))
      expect(response.headers.get('Content-Type')).toBe('application/pdf')
      expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf)
      expect(f.convert).toHaveBeenCalledWith(bytes, { inputFormat: extension })
      expect(
        Buffer.from(await (await f.handle(new Request(url))).arrayBuffer()),
      ).toEqual(bytes)
      expect(await f.files.load()).toEqual(manifest)
      f.convert.mockRejectedValueOnce(new Error('Ошибка конвертера'))
      expect((await f.handle(new Request(`${url}&preview=1`))).status).toBe(500)
      expect((await f.handle(new Request(`${url}&preview=1`))).status).toBe(200)
    },
  )
  it('opening the registry generates no forms and creates no files', async () => {
    const f = await fixture(),
      before = JSON.stringify(f.workspace)
    expect((await f.get()).status).toBe(200)
    expect(f.renderer).not.toHaveBeenCalled()
    expect(await readdir(f.directory)).toEqual([])
    expect(JSON.stringify(f.workspace)).toBe(before)
  })
  it('keeps originals after reopening, rejects stale concurrent uploads and uses safe file paths', async () => {
    const f = await fixture(),
      revision = (await f.files.load()).revision
    const input = {
      documentId: 'app',
      name: '../../оригинал.pdf',
      bytes: pdf,
      expectedRevision: revision,
    }
    const results = await Promise.allSettled([
      f.files.add(input),
      f.files.add(input),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const reopened = createDocumentFileStore(f.directory),
      manifest = await reopened.load()
    expect(manifest.files).toHaveLength(1)
    expect(manifest.files[0]!.name).not.toContain('/')
    expect((await reopened.read(manifest.files[0]!.id)).bytes).toEqual(pdf)
    await expect(
      f.files.add({
        ...input,
        name: 'wrong.pdf',
        bytes: Buffer.from('<html>bad</html>'),
        expectedRevision: manifest.revision,
      }),
    ).rejects.toThrow('Содержимое')
    await expect(
      reopened.remove(manifest.files[0]!.id, revision),
    ).rejects.toThrow('другой вкладке')
    await reopened.remove(manifest.files[0]!.id, manifest.revision)
    expect((await reopened.load()).files).toEqual([])
  })
  it('validates ownership, origin, workspace revision and file IDs before writing', async () => {
    const f = await fixture(),
      registry = buildDocumentRegistry(f.workspace),
      doc = registry.documents.find((entry) => entry.kind === 'app')!
    const upload = {
      action: 'upload',
      documentId: doc.id,
      name: 'АПП.pdf',
      base64: pdf.toString('base64'),
    }
    expect((await f.post(upload, 'http://foreign.test')).status).toBe(403)
    expect(
      (await f.post({ ...upload, workspaceRevision: 'stale' })).status,
    ).toBe(409)
    expect((await f.post({ ...upload, documentId: 'invented' })).status).toBe(
      404,
    )
    expect(
      (
        await f.handle(
          new Request(
            'http://localhost/api/documents?file=../../workspace.json',
          ),
        )
      ).status,
    ).toBe(400)
    expect(await readdir(f.directory)).toEqual([])
    expect((await f.post(upload)).status).toBe(200)
    const manifest = await f.files.load()
    expect(manifest.files[0]!.documentId).toBe(doc.id)
    const response = await f.handle(
      new Request(
        `http://localhost/api/documents?file=${manifest.files[0]!.id}`,
      ),
    )
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf)
  })
  it('generates only requested forms on every download; original shared across materials appears once', async () => {
    const f = await fixture()
    f.workspace.lines[1]!.normativeDocument = 'ГОСТ другой'
    const registry = buildDocumentRegistry(f.workspace),
      app = registry.documents.find((doc) => doc.kind === 'app')!,
      zni = registry.documents.find((doc) => doc.kind === 'zni')!
    expect(
      (
        await f.post({
          action: 'upload',
          documentId: app.id,
          name: 'Оригинал.pdf',
          base64: pdf.toString('base64'),
        })
      ).status,
    ).toBe(200)
    const filesBefore = await readdir(join(f.directory, 'document-files'))
    const manifestBefore = await readFile(
      join(f.directory, 'document-files', 'manifest.json'),
    )
    const body = {
      action: 'archive',
      materialIds: registry.materials.map((row) => row.id),
      documentIds: [app.id, zni.id],
    }
    for (let i = 0; i < 2; i++) {
      const response = await f.post(body)
      expect(response.status).toBe(200)
      const zip = await JSZip.loadAsync(await response.arrayBuffer())
      const names = Object.keys(zip.files).filter(
        (name) => !zip.files[name]!.dir,
      )
      expect(names.filter((name) => name.startsWith('АПП/'))).toHaveLength(1)
      expect(names).toContain(`ЗНИ/${zni.label}.pdf`)
      expect(names).toContain(`ЗНИ/${zni.label}.xlsx`)
      expect(names.every((name) => name.split('/').length <= 2)).toBe(true)
      expect(names).toContain('Реестр.xlsx')
    }
    expect(f.render).toHaveBeenCalledTimes(2)
    expect(await readdir(join(f.directory, 'document-files'))).toEqual(
      filesBefore,
    )
    expect(
      await readFile(join(f.directory, 'document-files', 'manifest.json')),
    ).toEqual(manifestBefore)
  })
  it('retains attached originals when their source operation is removed, without generating a replacement', async () => {
    const f = await fixture()
    const doc = buildDocumentRegistry(f.workspace).documents.find(
      (entry) => entry.kind === 'request',
    )!
    const upload = {
      action: 'upload',
      documentId: doc.id,
      name: 'Подписанная заявка.pdf',
      base64: pdf.toString('base64'),
    }
    expect((await f.post(upload)).status).toBe(200)
    expect((await f.post(upload)).status).toBe(200)
    expect((await f.files.load()).documents).toHaveLength(1)
    f.workspace.materialRequests = []
    const catalog = await (await f.get()).json()
    const retained = catalog.documents.find(
      (entry: { id: string }) => entry.id === doc.id,
    )
    expect(retained).toMatchObject({ id: doc.id, label: doc.label })
    expect(retained.target).toBeUndefined()
    const response = await f.post({
      action: 'archive',
      materialIds: retained.materialIds,
      documentIds: [doc.id],
    })
    expect(response.status).toBe(200)
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    expect(
      Object.keys(zip.files).filter((name) => name.endsWith('.pdf')),
    ).toHaveLength(1)
    expect(f.render).not.toHaveBeenCalled()
  })
  it('reports missing originals and PDF errors without hiding a partial archive', async () => {
    const f = await fixture(),
      registry = buildDocumentRegistry(f.workspace)
    f.convert.mockRejectedValue(new Error('Нет LibreOffice'))
    const response = await f.post({
      action: 'archive',
      materialIds: registry.materials.map((row) => row.id),
      documentIds: registry.documents
        .filter((doc) => ['app', 'zni'].includes(doc.kind))
        .map((doc) => doc.id),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Archive-Warnings')).toBe('2')
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    expect(await zip.file('О составе архива.txt')!.async('string')).toContain(
      'Нет LibreOffice',
    )
    expect(await zip.file('О составе архива.txt')!.async('string')).toContain(
      'Оригинал не прикреплён',
    )
  })
  it('prints the entire saved request when only one of its materials was selected', async () => {
    const f = await fixture()
    for (const request of f.workspace.materialRequests) {
      request.number = 'ЗП-10-26-0002-Соединительные детали трубопроводов'
      request.date = '2026-10-28'
    }
    f.workspace.lines[1]!.normativeDocument = 'ГОСТ другой'
    const registry = buildDocumentRegistry(f.workspace),
      doc = registry.documents.find((entry) => entry.kind === 'request')!
    const template = await builtinPrintTemplate()
    const archive = await buildDocumentArchive({
      registry,
      manifest: await f.files.load(),
      materialIds: [registry.materials[0]!.id],
      documentIds: [doc.id],
      render: async (target) => {
        if (target.kind !== 'request') throw new Error('wrong target')
        const data = buildRequestPrintData(f.workspace, target.entryId)
        expect(data.rows).toHaveLength(2)
        return fillPrintWorkbook(
          Buffer.from(template.base64, 'base64'),
          template.config,
          data,
        )
      },
      readFile: f.files.read,
      convert: async () => pdf,
    })
    const zip = await JSZip.loadAsync(archive.bytes)
    const basename =
      'Заявки/ЗП-10-26-0002-Соединительные детали трубопроводов от 28-10-26'
    const workbookFile = `${basename}.xlsx`
    expect(zip.file(`${basename}.pdf`)).not.toBeNull()
    expect(
      (
        await readPrintWorkbook(
          await zip.file(workbookFile)!.async('nodebuffer'),
        )
      ).worksheets[0]!.rowCount,
    ).toBeGreaterThan(2)
  })
  it('keeps colliding document names and multiple originals in flat category folders without overwriting files', async () => {
    const f = await fixture(),
      registry = buildDocumentRegistry(f.workspace)
    const first = registry.documents.find((doc) => doc.kind === 'request')!
    first.label = 'Общий/документ'
    const second = {
      ...first,
      id: 'second-request',
      label: 'общий:документ',
      target: { kind: 'request' as const, entryId: 'second-request' },
    }
    registry.documents = [first, second]
    const archive = await buildDocumentArchive({
      registry,
      manifest: {
        revision: 'test',
        documents: [],
        files: ['original-one', 'original-two'].map((id) => ({
          id,
          documentId: first.id,
          name: 'скан.PDF',
          size: 20,
          uploadedAt: '2026-10-28T12:00:00Z',
        })),
      },
      materialIds: first.materialIds,
      documentIds: [first.id, second.id],
      render: async (target) =>
        Buffer.from(target.kind === 'request' ? target.entryId : ''),
      readFile: async (id) => ({ bytes: Buffer.from(id) }),
      convert: async (bytes) => Buffer.concat([pdf, bytes]),
    })
    const zip = await JSZip.loadAsync(archive.bytes)
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir)
    expect(names.filter((name) => name.startsWith('Заявки/'))).toHaveLength(6)
    expect(names.every((name) => name.split('/').length <= 2)).toBe(true)
    for (const extension of ['pdf', 'xlsx']) {
      expect(zip.file(`Заявки/Общий-документ.${extension}`)).not.toBeNull()
      expect(zip.file(`Заявки/общий-документ (2).${extension}`)).not.toBeNull()
    }
    expect(
      await zip.file('Заявки/общий-документ (2).xlsx')!.async('string'),
    ).toBe('second-request')
    expect(
      await zip.file('Заявки/Общий-документ — оригинал.pdf')!.async('string'),
    ).toBe('original-one')
    expect(
      await zip
        .file('Заявки/Общий-документ — оригинал (2).pdf')!
        .async('string'),
    ).toBe('original-two')
    const index = await readPrintWorkbook(
      await zip.file('Реестр.xlsx')!.async('nodebuffer'),
    )
    index.worksheets[0]!.eachRow((row, number) => {
      if (number === 1) return
      for (const path of String(row.getCell(5).value).split('\n'))
        expect(zip.file(path)).not.toBeNull()
    })
  })
  it('does not export a document outside selected materials', async () => {
    const f = await fixture()
    f.workspace.lines[1]!.normativeDocument = 'Другой ГОСТ'
    const registry = buildDocumentRegistry(f.workspace),
      request = registry.documents.find(
        (doc) => doc.kind === 'request' && doc.label.includes('ЗП-2'),
      )!
    const response = await f.post({
      action: 'archive',
      materialIds: [registry.materials[0]!.id],
      documentIds: [request.id],
    })
    expect(response.status).toBe(409)
    expect(f.renderer).not.toHaveBeenCalled()
  })
})

it('keeps or replaces scans using exact document IDs and rejects unseen concurrent files', async () => {
  const f = await fixture()
  const docs = buildDocumentRegistry(f.workspace).documents
  const app = docs.find((doc) => doc.kind === 'app')!
  const quality = docs.find((doc) => doc.id.includes('receipt-field'))!
  const upload = (documentId: string, name: string, extra = {}) =>
    f.post({
      action: 'upload-files',
      documentId,
      files: [
        {
          name,
          base64: Buffer.concat([pdf, Buffer.from(name)]).toString('base64'),
        },
      ],
      ...extra,
    })
  expect(
    (await upload(app.id, 'APP.pdf', { expectedFileIds: [] })).status,
  ).toBe(200)
  expect(
    (await upload(quality.id, 'Quality.pdf', { expectedFileIds: [] })).status,
  ).toBe(200)
  const initial = await f.files.load()
  const oldApp = initial.files.find((file) => file.documentId === app.id)!
  const originalQuality = initial.files.find(
    (file) => file.documentId === quality.id,
  )!
  expect(
    (await upload(app.id, 'Unexpected.pdf', { expectedFileIds: [] })).status,
  ).toBe(409)
  expect(
    (
      await upload(app.id, 'Page2.pdf', {
        expectedFileIds: [oldApp.id],
        replaceFileIds: [],
      })
    ).status,
  ).toBe(200)
  // Even with a fresh manifest revision, an old replacement decision cannot delete unseen files.
  expect(
    (
      await upload(app.id, 'Wrong.pdf', {
        expectedFileIds: [oldApp.id],
        replaceFileIds: [oldApp.id],
      })
    ).status,
  ).toBe(409)
  const appIds = (await f.files.load()).files
    .filter((file) => file.documentId === app.id)
    .map((file) => file.id)
  expect(
    (
      await upload(app.id, 'New.pdf', {
        expectedFileIds: appIds,
        replaceFileIds: appIds,
      })
    ).status,
  ).toBe(200)
  const catalog = await (await f.get()).json()
  expect(
    catalog.manifest.files
      .filter((file: { documentId: string }) => file.documentId === app.id)
      .map((file: { name: string }) => file.name),
  ).toEqual(['New.pdf'])
  expect(catalog.manifest.files).toContainEqual(originalQuality)
  expect(
    catalog.documents.find((doc: { id: string }) => doc.id === app.id)
      .materialIds,
  ).toEqual(app.materialIds)
})

it('stores required APP/M15 originals before the operation and reuses their stable ID after saving', async () => {
  for (const kind of ['app', 'm15'] as const) {
    const f = await fixture()
    const draft = {
      id: `draft-${kind}`,
      kind,
      number: 'DRAFT-1',
      date: '2026-11-24',
      lineIds: ['line'],
    }
    const documentId = JSON.stringify(['receipt-document', draft.id])
    const body = {
      action: 'upload-files',
      documentId,
      draftDocument: draft,
      files: [{ name: `${kind}.pdf`, base64: pdf.toString('base64') }],
      expectedFileIds: [],
      replaceFileIds: [],
    }
    const response = await f.post(body)
    expect(response.status).toBe(200)
    const original = (await f.files.load()).files[0]!
    expect(
      f.workspace.qualityWorkflow.receiptDocuments?.some(
        (doc) => doc.id === draft.id,
      ),
    ).toBe(false)
    expect(
      (await (await f.get()).json()).documents.some(
        (doc: { id: string }) => doc.id === documentId,
      ),
    ).toBe(true)
    f.workspace.qualityWorkflow.receiptDocuments!.push({
      id: draft.id,
      kind,
      number: draft.number,
      date: draft.date,
    })
    const catalog = await (await f.get()).json()
    expect(
      catalog.documents.filter((doc: { id: string }) => doc.id === documentId),
    ).toHaveLength(1)
    expect(catalog.manifest.files).toEqual([original])
    expect(
      (await f.post({ action: 'remove', fileId: original.id })).status,
    ).toBe(400)
    expect((await f.files.load()).files).toEqual([original])
  }
})

it('enforces one genuine PDF for M15, rejects append and keeps the old file on an invalid replacement', async () => {
  const f = await fixture()
  const doc = buildDocumentRegistry(f.workspace).documents.find(
    (item) => item.kind === 'm15',
  )!
  const upload = (files: { name: string; base64: string }[], extra = {}) =>
    f.post({ action: 'upload-files', documentId: doc.id, files, ...extra })
  const first = { name: 'first.pdf', base64: pdf.toString('base64') }
  expect((await upload([first])).status).toBe(200)
  const stored = (await f.files.load()).files
  const replacement = {
    expectedFileIds: stored.map((file) => file.id),
    replaceFileIds: stored.map((file) => file.id),
  }
  expect((await upload([{ ...first, name: 'second.pdf' }])).status).toBe(400)
  expect((await upload([first, first], replacement)).status).toBe(400)
  expect(
    (
      await upload(
        [{ name: 'scan.png', base64: pdf.toString('base64') }],
        replacement,
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await upload(
        [
          {
            name: 'broken.pdf',
            base64: Buffer.from('not pdf').toString('base64'),
          },
        ],
        replacement,
      )
    ).status,
  ).toBe(400)
  expect((await f.files.load()).files).toEqual(stored)
  expect(
    (await upload([{ ...first, name: 'replaced.pdf' }], replacement)).status,
  ).toBe(200)
  expect((await f.files.load()).files.map((file) => file.name)).toEqual([
    'replaced.pdf',
  ])
})
