import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import {
  createDefaultPrintWorkbook,
  describePrintSheet,
  readPrintWorkbook,
  validatePrintConfig,
} from './request-print-excel.server'
import {
  defaultPrintConfig,
  maxTemplateBytes,
  printConfigSchema,
} from './request-print'
import type { PrintConfig, PrintTemplate } from './request-print'

export class PrintError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}
const storedSchema = z
  .object({
    fileName: z.string().min(1).max(200),
    base64: z.string().max(Math.ceil(maxTemplateBytes / 3) * 4),
    config: printConfigSchema,
  })
  .strict()
const queues = new Map<string, Promise<unknown>>()
let builtin: Promise<PrintTemplate> | undefined
export function builtinPrintTemplate() {
  return (builtin ??= (async () => {
    const bytes = await createDefaultPrintWorkbook()
    return {
      fileName: 'Шаблон заявки.xlsx',
      base64: bytes.toString('base64'),
      config: defaultPrintConfig,
      revision: 'builtin-v2',
      sheet: describePrintSheet(await readPrintWorkbook(bytes)),
    }
  })())
}
export function decodeTemplate(base64: string) {
  if (
    !base64 ||
    base64.length > Math.ceil(maxTemplateBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    throw new PrintError('Некорректный файл шаблона или размер больше 5 МБ.')
  return Buffer.from(base64, 'base64')
}
export function createPrintTemplateStore(directory: string) {
  const folder = join(resolve(directory), 'print-templates'),
    file = join(folder, 'request.json')
  async function load(): Promise<PrintTemplate> {
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return builtinPrintTemplate()
      throw new PrintError(
        'Не удалось прочитать шаблон. Сохранённый файл не изменён.',
        500,
      )
    }
    try {
      const data = storedSchema.parse(JSON.parse(raw))
      const book = await readPrintWorkbook(decodeTemplate(data.base64))
      validatePrintConfig(book, data.config)
      return {
        ...data,
        sheet: describePrintSheet(book),
        revision: createHash('sha256').update(raw).digest('hex'),
      }
    } catch {
      throw new PrintError(
        'Сохранённый шаблон повреждён. Файл не заменён образцом.',
        500,
      )
    }
  }
  async function save(
    input: { fileName: string; base64: string; config: PrintConfig },
    expectedRevision: string,
  ) {
    const data = storedSchema.parse(input)
    const book = await readPrintWorkbook(decodeTemplate(data.base64))
    validatePrintConfig(book, data.config)
    const operation = (queues.get(file) ?? Promise.resolve()).then(async () => {
      const current = await load()
      const raw = JSON.stringify(data)
      const revision = createHash('sha256').update(raw).digest('hex')
      if (revision === current.revision) return current
      if (current.revision !== expectedRevision)
        throw new PrintError(
          'Шаблон изменён в другой вкладке. Загрузите сохранённую версию и повторите изменения.',
          409,
        )
      await mkdir(folder, { recursive: true, mode: 0o700 })
      const temp = join(folder, `${randomUUID()}.tmp`)
      try {
        await writeFile(temp, raw, { flag: 'wx', mode: 0o600 })
        await rename(temp, file)
      } finally {
        await rm(temp, { force: true })
      }
      return { ...data, revision, sheet: describePrintSheet(book) }
    })
    const settled = operation.catch(() => {})
    queues.set(file, settled)
    void settled.then(() => {
      if (queues.get(file) === settled) queues.delete(file)
    })
    return operation
  }
  return { load, save }
}
export const requestPrintTemplateStore = createPrintTemplateStore(
  process.env.MATERIALS_WORKSPACE_DIR ??
    resolve(process.cwd(), '.materials-workspace'),
)
