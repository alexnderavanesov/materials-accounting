import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocumentFileStore } from './document-files.server'
import { createDocumentsHandler } from './documents-api.server'
import { buildDocumentRegistry } from './document-registry'
import { buildDocumentArchive } from './document-archive.server'
import { documentRegistryFixture } from './document-registry.fixtures'
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
    ).toHaveLength(2)
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
      'Заявки/ЗП-10-26-0002-Соединительные детали трубопроводов от 28.10.2026'
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
