import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import JSZip from 'jszip'
import { documentCategoryKeys } from './document-registry'
import type { DocumentFileManifest, ManualDocument } from './document-registry'
import { PrintError } from './request-print-store.server'

export const maxDocumentFileBytes = 20 * 1024 * 1024
const manifestSchema = z
  .object({
    files: z.array(
      z
        .object({
          id: z.uuid(),
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
  return {
    load,
    async read(id: string) {
      const current = await load()
      const file = current.files.find((entry) => entry.id === id)
      if (!file) throw new PrintError('Файл не найден.', 404)
      return { file, bytes: await readFile(join(folder, `${file.id}.bin`)) }
    },
    async add(input: {
      documentId: string
      name: string
      bytes: Buffer
      expectedRevision: string
      document?: ManualDocument
    }) {
      await validateDocumentFile(input.name, input.bytes)
      return queued(async () => {
        const current = await load()
        checkRevision(current, input.expectedRevision)
        const file = {
          id: randomUUID(),
          documentId: input.documentId,
          name: safeDocumentFilename(input.name),
          size: input.bytes.length,
          uploadedAt: new Date().toISOString(),
        }
        await mkdir(folder, { recursive: true, mode: 0o700 })
        const path = join(folder, `${file.id}.bin`)
        try {
          await writeFile(path, input.bytes, { flag: 'wx', mode: 0o600 })
          await write({
            files: [...current.files, file],
            documents:
              input.document &&
              !current.documents.some((doc) => doc.id === input.document!.id)
                ? [...current.documents, input.document]
                : current.documents,
          })
        } catch (error) {
          await rm(path, { force: true })
          throw error
        }
        return load()
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
        await rm(join(folder, `${file.id}.bin`), { force: true })
        return load()
      })
    },
  }
}
export const documentFileStore = createDocumentFileStore(
  process.env.MATERIALS_WORKSPACE_DIR ??
    resolve(process.cwd(), '.materials-workspace'),
)
