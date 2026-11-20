import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import JSZip from 'jszip'
import { documentCategoryKeys } from './document-registry'
import type { DocumentFileManifest, ManualDocument } from './document-registry'
import { PrintError } from './request-print-store.server'
import {
  maxDocumentFileBytes,
  maxDocumentUploadBytes,
  maxDocumentUploadFiles,
} from './document-file-limits'

export { maxDocumentFileBytes } from './document-file-limits'
const manifestSchema = z
  .object({
    files: z.array(
      z
        .object({
          id: z.uuid(),
          blobId: z
            .string()
            .regex(/^(?:[a-f0-9]{64}|[a-f0-9-]{36})$/)
            .optional(),
          sha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          documentId: z.string(),
          name: z.string(),
          size: z.number().int().positive(),
          uploadedAt: z.string(),
        })
        .strict(),
    ),
    documents: z.array(
      z
        .object({
          id: z.string(),
          kind: z.enum(documentCategoryKeys),
          label: z.string(),
          date: z.string(),
          lineIds: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict()
const queues = new Map<string, Promise<unknown>>()
export const safeDocumentFilename = (value: string) =>
  value
    .normalize('NFC')
    .replace(/[\p{Cc}/\\:*?"<>|]/gu, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 160) || 'Документ'

export async function validateDocumentFile(name: string, bytes: Buffer) {
  if (!bytes.length || bytes.length > maxDocumentFileBytes)
    throw new PrintError('Размер файла должен быть от 1 байта до 20 МБ.', 413)
  const extension = name.toLowerCase().split('.').pop()
  const starts = (header: number[]) =>
    header.every((byte, i) => bytes[i] === byte)
  if (extension === 'pdf' && bytes.subarray(0, 5).toString() === '%PDF-') return
  if (extension === 'png' && starts([137, 80, 78, 71, 13, 10, 26, 10])) return
  if (['jpg', 'jpeg'].includes(extension ?? '') && starts([255, 216, 255]))
    return
  if (['xlsx', 'docx'].includes(extension ?? '') && starts([80, 75, 3, 4])) {
    try {
      const zip = await JSZip.loadAsync(bytes)
      if (
        zip.file(extension === 'xlsx' ? 'xl/workbook.xml' : 'word/document.xml')
      )
        return
    } catch {
      /* Invalid Office container. */
    }
  }
  throw new PrintError(
    'Поддерживаются PDF, PNG, JPEG, XLSX и DOCX. Содержимое должно соответствовать расширению файла.',
  )
}

/** Originals only. Generated print files never enter this store. */
export function createDocumentFileStore(directory: string) {
  const folder = join(resolve(directory), 'document-files')
  const manifestPath = join(folder, 'manifest.json')
  async function load(): Promise<DocumentFileManifest> {
    let data: z.infer<typeof manifestSchema>
    try {
      data = manifestSchema.parse(
        JSON.parse(await readFile(manifestPath, 'utf8')),
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new PrintError(
          'Не удалось прочитать реестр файлов. Сохранённые файлы не изменены.',
          500,
        )
      data = { files: [], documents: [] }
    }
    return {
      ...data,
      revision: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    }
  }
  async function write(data: Omit<DocumentFileManifest, 'revision'>) {
    await mkdir(folder, { recursive: true, mode: 0o700 })
    const temporary = join(folder, `${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, JSON.stringify(data), {
        flag: 'wx',
        mode: 0o600,
      })
      await rename(temporary, manifestPath)
    } finally {
      await rm(temporary, { force: true })
    }
  }
  function queued<T>(operation: () => Promise<T>): Promise<T> {
    const task = (queues.get(folder) ?? Promise.resolve()).then(operation)
    const settled = task.catch(() => {})
    queues.set(folder, settled)
    void settled.then(() => {
      if (queues.get(folder) === settled) queues.delete(folder)
    })
    return task
  }
  const checkRevision = (current: DocumentFileManifest, expected: string) => {
    if (current.revision !== expected)
      throw new PrintError(
        'Файлы изменены в другой вкладке. Обновите список и повторите действие.',
        409,
      )
  }
  async function addMany(input: {
    documentId: string
    files: { name: string; bytes: Buffer }[]
    expectedRevision: string
    document?: ManualDocument
    replaceFileIds?: string[]
  }) {
    if (!input.files.length || input.files.length > maxDocumentUploadFiles)
      throw new PrintError(`Выберите от 1 до ${maxDocumentUploadFiles} файлов.`)
    if (
      input.files.reduce((total, file) => total + file.bytes.length, 0) >
      maxDocumentUploadBytes
    )
      throw new PrintError('Общий размер файлов превышает 100 МБ.', 413)
    for (const file of input.files)
      await validateDocumentFile(file.name, file.bytes)
    return queued(async () => {
      const current = await load()
      checkRevision(current, input.expectedRevision)
      const replaced = new Set(input.replaceFileIds ?? [])
      if (
        [...replaced].some(
          (id) =>
            !current.files.some(
              (file) => file.id === id && file.documentId === input.documentId,
            ),
        )
      )
        throw new PrintError(
          'Заменяемый файл больше не принадлежит этому документу. Обновите список.',
          409,
        )
      const sizes = new Set(input.files.map((file) => file.bytes.length))
      const known = await Promise.all(
        current.files.map(async (file) => ({
          ...file,
          ...(file.sha256 || !sizes.has(file.size)
            ? {}
            : {
                sha256: createHash('sha256')
                  .update(
                    await readFile(
                      join(folder, `${file.blobId ?? file.id}.bin`),
                    ),
                  )
                  .digest('hex'),
              }),
        })),
      )
      const blobs = new Map(
        known
          .filter((file) => file.sha256)
          .map((file) => [file.sha256!, file.blobId ?? file.id]),
      )
      const retained = known.filter((file) => !replaced.has(file.id))
      const targetHashes = new Set(
        retained
          .filter((file) => file.documentId === input.documentId)
          .map((file) => file.sha256),
      )
      const files: typeof current.files = []
      const paths: string[] = []
      await mkdir(folder, { recursive: true, mode: 0o700 })
      try {
        for (const incoming of input.files) {
          const hash = createHash('sha256').update(incoming.bytes).digest('hex')
          if (targetHashes.has(hash)) continue
          targetHashes.add(hash)
          const existing = known.find(
            (file) =>
              file.documentId === input.documentId && file.sha256 === hash,
          )
          if (existing) {
            files.push(existing)
            continue
          }
          const blobId = blobs.get(hash) ?? hash
          if (!blobs.has(hash)) {
            const path = join(folder, `${blobId}.bin`)
            try {
              await writeFile(path, incoming.bytes, { flag: 'wx', mode: 0o600 })
              paths.push(path)
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error
              if (!incoming.bytes.equals(await readFile(path)))
                throw new PrintError('Сохранённый оригинал повреждён.', 500)
            }
            blobs.set(hash, blobId)
          }
          files.push({
            id: randomUUID(),
            documentId: input.documentId,
            name: safeDocumentFilename(incoming.name),
            size: incoming.bytes.length,
            uploadedAt: new Date().toISOString(),
            blobId,
            sha256: hash,
          })
        }
        await write({
          files: [...retained, ...files],
          documents:
            input.document &&
            !current.documents.some((doc) => doc.id === input.document!.id)
              ? [...current.documents, input.document]
              : current.documents,
        })
      } catch (error) {
        await Promise.all(paths.map((path) => rm(path, { force: true })))
        throw error
      }
      // The manifest is the commit point. Cleanup must never report a failed upload
      // after the new files have already been published (a retry would duplicate them).
      const usedBlobs = new Set(
        [...retained, ...files].map((file) => file.blobId ?? file.id),
      )
      await Promise.allSettled(
        [
          ...new Set(
            known
              .filter((file) => replaced.has(file.id))
              .map((file) => file.blobId ?? file.id),
          ),
        ]
          .filter((id) => !usedBlobs.has(id))
          .map((id) => rm(join(folder, `${id}.bin`), { force: true })),
      )
      return load()
    })
  }
  return {
    load,
    addMany,
    async read(id: string) {
      const current = await load()
      const file = current.files.find((entry) => entry.id === id)
      if (!file) throw new PrintError('Файл не найден.', 404)
      return {
        file,
        bytes: await readFile(join(folder, `${file.blobId ?? file.id}.bin`)),
      }
    },
    async add(input: {
      documentId: string
      name: string
      bytes: Buffer
      expectedRevision: string
      document?: ManualDocument
    }) {
      return addMany({
        ...input,
        files: [{ name: input.name, bytes: input.bytes }],
      })
    },
    remove(id: string, expectedRevision: string) {
      return queued(async () => {
        const current = await load()
        checkRevision(current, expectedRevision)
        const file = current.files.find((entry) => entry.id === id)
        if (!file) throw new PrintError('Файл уже удалён.', 404)
        const files = current.files.filter((entry) => entry.id !== id)
        await write({
          files,
          documents: current.documents.filter((doc) =>
            files.some((entry) => entry.documentId === doc.id),
          ),
        })
        const blobId = file.blobId ?? file.id
        if (!files.some((entry) => (entry.blobId ?? entry.id) === blobId))
          await rm(join(folder, `${blobId}.bin`), { force: true })
        return load()
      })
    },
  }
}
export const documentFileStore = createDocumentFileStore(
  process.env.MATERIALS_WORKSPACE_DIR ??
    resolve(process.cwd(), '.materials-workspace'),
)
