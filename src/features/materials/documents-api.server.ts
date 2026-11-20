import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  buildDocumentRegistry,
  documentCategoryKeys,
} from './document-registry'
import {
  documentFileStore,
  maxDocumentFileBytes,
} from './document-files.server'
import {
  buildDocumentArchive,
  buildDocumentPhotosArchive,
  archiveFileStem,
  createDocumentRenderer,
  selectRegistryDocuments,
} from './document-archive.server'
import { projectWorkspaceStore } from './workspace-snapshot.server'
import { PrintError } from './request-print-store.server'
import { convertRequestPdf } from './request-print-pdf.server'
import { printOutput } from './print-output.server'
import type { WorkspaceSnapshot } from './workspace-snapshot'
import type { DocumentTarget } from './document-registry'
import {
  maxDocumentUploadBytes,
  maxDocumentUploadFiles,
} from './document-file-limits'

const revision = z.string().min(1).max(200)
const id = z.string().min(1).max(10000)
const common = { workspaceRevision: revision, filesRevision: revision }
const uploadFileSchema = z
  .object({
    name: z.string().min(1).max(250),
    base64: z
      .string()
      .min(1)
      .max(Math.ceil(maxDocumentFileBytes / 3) * 4),
  })
  .strict()
const uploadDocumentSchema = z
  .object({
    kind: z.enum(documentCategoryKeys),
    label: z.string().trim().min(1).max(500),
    date: z.string().max(10),
    lineIds: z.array(id).min(1).max(10000),
  })
  .strict()
const bodySchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('photos-archive'), ...common, documentId: id })
    .strict(),
  z
    .object({
      action: z.literal('archive'),
      ...common,
      materialIds: z.array(id).min(1).max(10000),
      documentIds: z.array(id).min(1).max(500),
    })
    .strict(),
  z
    .object({ action: z.literal('preview'), ...common, documentId: id })
    .strict(),
  z
    .object({ action: z.literal('remove'), ...common, fileId: z.uuid() })
    .strict(),
  z
    .object({
      action: z.literal('upload'),
      ...common,
      documentId: id.optional(),
      ...uploadFileSchema.shape,
      document: uploadDocumentSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('upload-files'),
      ...common,
      documentId: id.optional(),
      document: uploadDocumentSchema.optional(),
      files: z.array(uploadFileSchema).min(1).max(maxDocumentUploadFiles),
      expectedFileIds: z.array(z.uuid()).max(10000).optional(),
      replaceFileIds: z.array(z.uuid()).max(10000).optional(),
    })
    .strict(),
])
async function readBody(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin)
    throw new PrintError('Запрос должен поступать из приложения.', 403)
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new PrintError('Ожидается JSON.', 415)
  const reader = request.body?.getReader()
  if (!reader) throw new PrintError('Пустой запрос.')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > Math.ceil(maxDocumentUploadBytes / 3) * 4 + 1024 * 1024) {
        await reader.cancel()
        throw new PrintError(
          'Общий размер запроса с файлами превышает допустимый.',
          413,
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  try {
    return bodySchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } catch {
    throw new PrintError('Некорректные параметры запроса.')
  }
}
const download = (
  bytes: Buffer,
  name: string,
  type: string,
  extra: Record<string, string> = {},
) =>
  new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  })
type Dependencies = {
  workspace: Pick<typeof projectWorkspaceStore, 'load'>
  files: typeof documentFileStore
  renderer: (
    workspace: WorkspaceSnapshot,
    targets: DocumentTarget[],
  ) => Promise<(target: DocumentTarget) => Promise<Buffer>>
  convert: typeof convertRequestPdf
}
export function createDocumentsHandler(
  deps: Dependencies = {
    workspace: projectWorkspaceStore,
    files: documentFileStore,
    renderer: createDocumentRenderer,
    convert: convertRequestPdf,
  },
) {
  let rendering = false
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.searchParams.has('file')) {
        const fileId = z.uuid().safeParse(url.searchParams.get('file'))
        if (!fileId.success)
          throw new PrintError('Неверный идентификатор файла.')
        const { file, bytes } = await deps.files.read(fileId.data)
        if (url.searchParams.get('preview') === '1') {
          const extension = file.name.toLowerCase().split('.').pop()
          let content = bytes
          let type =
            extension === 'pdf'
              ? 'application/pdf'
              : extension === 'png'
                ? 'image/png'
                : ['jpg', 'jpeg'].includes(extension ?? '')
                  ? 'image/jpeg'
                  : ''
          if (extension === 'xlsx' || extension === 'docx') {
            if (rendering)
              throw new PrintError(
                'Уже формируется другой документ. Повторите просмотр после завершения.',
                429,
              )
            rendering = true
            try {
              content = await deps.convert(bytes, { inputFormat: extension })
              type = 'application/pdf'
            } finally {
              rendering = false
            }
          }
          if (!type)
            throw new PrintError(
              'Предпросмотр этого формата не поддерживается.',
              415,
            )
          const name =
            type === 'application/pdf'
              ? file.name.replace(/\.[^.]+$/, '.pdf')
              : file.name
          return download(content, name, type, {
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
          })
        }
        return download(bytes, file.name, 'application/octet-stream')
      }
      if (!['GET', 'POST'].includes(request.method))
        throw new PrintError('Метод не поддерживается.', 405)
      const body = request.method === 'POST' ? await readBody(request) : null
      const [saved, manifest] = await Promise.all([
        deps.workspace.load(),
        deps.files.load(),
      ])
      if (!saved.workspace || !saved.revision)
        throw new PrintError('Сначала сохраните проектную базу.', 409)
      const registry = buildDocumentRegistry(
        saved.workspace,
        manifest.documents,
      )
      const catalog = () =>
        Response.json(
          { ...registry, manifest, workspaceRevision: saved.revision },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      if (!body) return catalog()
      if (
        body.workspaceRevision !== saved.revision ||
        body.filesRevision !== manifest.revision
      )
        throw new PrintError(
          'Данные изменились. Обновите реестр и повторите действие.',
          409,
        )
      if (body.action === 'remove')
        return Response.json(
          await deps.files.remove(body.fileId, manifest.revision),
        )
      if (body.action === 'upload' || body.action === 'upload-files') {
        if (Boolean(body.documentId) === Boolean(body.document))
          throw new PrintError(
            'Выберите существующий документ или создайте новый.',
          )
        let doc = body.document
          ? { ...body.document, id: `manual:${randomUUID()}` }
          : undefined
        if (doc) {
          const lineIds = new Set(
            registry.materials.flatMap((row) => row.lineIds),
          )
          if (doc.lineIds.some((lineId) => !lineIds.has(lineId)))
            throw new PrintError(
              'Материал больше не существует. Обновите реестр.',
              409,
            )
        } else {
          const existing = registry.documents.find(
            (entry) => entry.id === body.documentId,
          )
          if (!existing) throw new PrintError('Документ не найден.', 404)
          // Retain the original's association if its source operation is later removed.
          const materials = new Set(existing.materialIds)
          doc = {
            id: existing.id,
            kind: existing.kind,
            label: existing.label,
            date: existing.date,
            lineIds: registry.materials
              .filter((row) => materials.has(row.id))
              .flatMap((row) => row.lineIds),
          }
        }
        const uploads = body.action === 'upload' ? [body] : body.files
        if (body.action === 'upload-files' && body.expectedFileIds) {
          const expected = new Set(body.expectedFileIds)
          const currentFiles = manifest.files.filter(
            (file) => file.documentId === doc.id,
          )
          if (
            expected.size !== currentFiles.length ||
            currentFiles.some((file) => !expected.has(file.id))
          )
            throw new PrintError(
              'Файлы документа изменились. Откройте скрепку и подтвердите загрузку заново.',
              409,
            )
        }
        const files = uploads.map((file) => {
          if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))
            throw new PrintError(`Файл повреждён: ${file.name}`)
          const bytes = Buffer.from(file.base64, 'base64')
          if (bytes.toString('base64') !== file.base64)
            throw new PrintError(`Файл повреждён: ${file.name}`)
          return { name: file.name, bytes }
        })
        return Response.json(
          await deps.files.addMany({
            documentId: doc.id,
            document: doc,
            files,
            expectedRevision: manifest.revision,
            replaceFileIds:
              body.action === 'upload-files' ? body.replaceFileIds : undefined,
          }),
        )
      }
      if (rendering)
        throw new PrintError(
          'Уже формируется другой документ или архив. Повторите после завершения.',
          429,
        )
      rendering = true
      try {
        if (body.action === 'photos-archive') {
          const doc = registry.documents.find(
            (entry) => entry.id === body.documentId,
          )
          if (!doc)
            throw new PrintError('Документ не найден. Обновите реестр.', 404)
          const bytes = await buildDocumentPhotosArchive({
            documentId: doc.id,
            manifest,
            readFile: deps.files.read,
            signal: request.signal,
          })
          return download(
            bytes,
            `${archiveFileStem(`Фотографии — ${doc.label}`)}.zip`,
            'application/zip',
          )
        }
        if (body.action === 'preview') {
          const doc = registry.documents.find(
            (entry) => entry.id === body.documentId,
          )
          if (!doc?.target)
            throw new PrintError(
              'У этого документа нет печатного шаблона. Прикрепите оригинал.',
            )
          const render = await deps.renderer(saved.workspace, [doc.target])
          return await printOutput(
            await render(doc.target),
            deps.convert,
            doc.label,
            'bundle',
          )
        }
        const documents = selectRegistryDocuments(
          registry,
          body.materialIds,
          body.documentIds,
        )
        const render = await deps.renderer(
          saved.workspace,
          documents.flatMap((doc) => (doc.target ? [doc.target] : [])),
        )
        const archive = await buildDocumentArchive({
          registry,
          manifest,
          materialIds: body.materialIds,
          documentIds: body.documentIds,
          render,
          readFile: deps.files.read,
          signal: request.signal,
          convert: (bytes, timeout) => deps.convert(bytes, { timeout }),
        })
        return download(archive.bytes, 'Документы.zip', 'application/zip', {
          'X-Archive-Warnings': String(archive.warnings.length),
        })
      } finally {
        rendering = false
      }
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Не удалось выполнить действие.',
        },
        {
          status: error instanceof PrintError ? error.status : 500,
          headers: { 'Cache-Control': 'no-store' },
        },
      )
    }
  }
}
export const handleDocuments = createDocumentsHandler()
