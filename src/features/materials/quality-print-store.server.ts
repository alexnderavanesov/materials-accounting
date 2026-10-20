import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import zniTemplate from './print-templates/zni.json'
import avkTemplate from './print-templates/avk.json'
import {
  defaultQualityPrintConfig,
  qualityPrintConfigSchema,
} from './quality-print'
import type { QualityPrintKind, QualityPrintTemplate } from './quality-print'
import { decodeTemplate, PrintError } from './request-print-store.server'
import {
  describePrintSheet,
  readPrintWorkbook,
} from './request-print-excel.server'
import { validateQualityPrintConfig } from './quality-print-excel.server'
import { maxTemplateBytes } from './request-print'

const schema = z
  .object({
    fileName: z.string().min(1).max(200),
    base64: z.string().max(Math.ceil(maxTemplateBytes / 3) * 4),
    config: qualityPrintConfigSchema,
  })
  .strict()
const queues = new Map<string, Promise<unknown>>()
export async function builtinQualityTemplate(
  kind: QualityPrintKind,
): Promise<QualityPrintTemplate> {
  const base64 = (kind === 'zni' ? zniTemplate : avkTemplate).base64
  const book = await readPrintWorkbook(decodeTemplate(base64)),
    config = defaultQualityPrintConfig(kind)
  validateQualityPrintConfig(book, config)
  return {
    base64,
    config,
    fileName: `Шаблон ${kind === 'zni' ? 'ЗНИ' : 'АВК'}.xlsx`,
    revision: 'builtin-quality-v1',
    sheet: describePrintSheet(book),
  }
}
export function createQualityTemplateStore(
  directory: string,
  kind: QualityPrintKind,
) {
  const folder = join(resolve(directory), 'print-templates'),
    file = join(folder, `${kind}.json`)
  async function load(): Promise<QualityPrintTemplate> {
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
        return builtinQualityTemplate(kind)
      throw new PrintError(
        'Не удалось прочитать шаблон. Сохранённый файл не изменён.',
        500,
      )
    }
    try {
      const data = schema.parse(JSON.parse(raw)),
        book = await readPrintWorkbook(decodeTemplate(data.base64))
      validateQualityPrintConfig(book, data.config)
      return {
        ...data,
        revision: createHash('sha256').update(raw).digest('hex'),
        sheet: describePrintSheet(book),
      }
    } catch {
      throw new PrintError(
        'Сохранённый шаблон повреждён. Он не заменён образцом.',
        500,
      )
    }
  }
  async function save(input: z.infer<typeof schema>, expectedRevision: string) {
    const data = schema.parse(input),
      book = await readPrintWorkbook(decodeTemplate(data.base64))
    validateQualityPrintConfig(book, data.config)
    const operation = (queues.get(file) ?? Promise.resolve()).then(async () => {
      const current = await load(),
        raw = JSON.stringify(data),
        revision = createHash('sha256').update(raw).digest('hex')
      if (revision === current.revision) return current
      if (expectedRevision !== current.revision)
        throw new PrintError(
          'Шаблон изменён в другой вкладке. Загрузите сохранённую версию.',
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
const directory =
  process.env.MATERIALS_WORKSPACE_DIR ??
  resolve(process.cwd(), '.materials-workspace')
export const qualityTemplateStores = {
  zni: createQualityTemplateStore(directory, 'zni'),
  avk: createQualityTemplateStore(directory, 'avk'),
}
