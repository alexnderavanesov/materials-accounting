import { z } from 'zod'
import {
  buildQualityPrintData,
  sampleQualityPrintData,
} from './quality-print-data'
import {
  defaultQualityPrintConfig,
  qualityPrintConfigSchema,
} from './quality-print'
import {
  builtinQualityTemplate,
  qualityTemplateStores,
} from './quality-print-store.server'
import { decodeTemplate, PrintError } from './request-print-store.server'
import {
  fillQualityPrintWorkbook,
  validateQualityPrintConfig,
} from './quality-print-excel.server'
import {
  describePrintSheet,
  readPrintWorkbook,
} from './request-print-excel.server'
import { convertRequestPdf } from './request-print-pdf.server'
import { projectWorkspaceStore } from './workspace-snapshot.server'
import { maxTemplateBytes } from './request-print'

const payload = z
  .object({
    action: z.enum(['inspect', 'preview', 'save', 'print']),
    kind: z.enum(['zni', 'avk']),
    base64: z
      .string()
      .max(Math.ceil(maxTemplateBytes / 3) * 4)
      .optional(),
    fileName: z.string().max(200).optional(),
    config: qualityPrintConfigSchema.optional(),
    expectedRevision: z.string().optional(),
    caseId: z.string().max(500).optional(),
    revision: z.number().int().positive().optional(),
    workspaceRevision: z.string().optional(),
    templateRevision: z.string().optional(),
  })
  .strict()
async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new PrintError('Ожидается JSON.', 415)
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin)
    throw new PrintError('Запрос должен поступать из приложения.', 403)
  const reader = request.body?.getReader()
  if (!reader) throw new PrintError('Пустой запрос.')
  const chunks: Array<Uint8Array> = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > 8 * 1024 * 1024) {
        await reader.cancel()
        throw new PrintError('Размер запроса превышает 8 МБ.', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return payload.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
}
export function createQualityPrintHandler(
  deps = {
    templates: qualityTemplateStores,
    workspace: projectWorkspaceStore,
    convert: convertRequestPdf,
  },
) {
  let queue = Promise.resolve(),
    pending = 0
  async function convert(bytes: Buffer) {
    if (pending >= 5)
      throw new PrintError('Очередь печати заполнена. Повторите позже.', 429)
    pending++
    const job = queue.then(() => deps.convert(bytes))
    queue = job
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        pending--
      })
    return job
  }
  return async (request: Request) => {
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url),
          kind = z.enum(['zni', 'avk']).parse(url.searchParams.get('kind'))
        return Response.json(
          url.searchParams.get('sample') === '1'
            ? await builtinQualityTemplate(kind)
            : await deps.templates[kind].load(),
          { headers: { 'Cache-Control': 'no-store' } },
        )
      }
      const body = await readBody(request)
      let pdf: Buffer
      if (body.action === 'print') {
        if (
          !body.workspaceRevision ||
          !body.templateRevision ||
          !body.caseId ||
          !body.revision
        )
          throw new PrintError('Сначала сохраните документ и укажите ревизию.')
        const [saved, template] = await Promise.all([
          deps.workspace.load(),
          deps.templates[body.kind].load(),
        ])
        if (!saved.workspace || saved.revision !== body.workspaceRevision)
          throw new PrintError(
            'Данные изменились. Обновите страницу перед печатью.',
            409,
          )
        if (template.revision !== body.templateRevision)
          throw new PrintError('Шаблон изменился. Повторите печать.', 409)
        const data = buildQualityPrintData(
          saved.workspace,
          body.caseId,
          body.revision,
          body.kind,
        )
        pdf = await convert(
          await fillQualityPrintWorkbook(
            decodeTemplate(template.base64),
            template.config,
            data,
          ),
        )
      } else {
        if (!body.base64) throw new PrintError('Загрузите файл .xlsx.')
        const bytes = decodeTemplate(body.base64),
          book = await readPrintWorkbook(bytes)
        if (body.action === 'inspect')
          return Response.json({
            sheet: describePrintSheet(book),
            config: {
              ...defaultQualityPrintConfig(body.kind),
              sheetName: book.worksheets[0]!.name,
            },
          })
        const config = validateQualityPrintConfig(book, body.config)
        if (body.action === 'save') {
          if (
            !body.fileName?.toLowerCase().endsWith('.xlsx') ||
            !body.expectedRevision
          )
            throw new PrintError('Укажите имя .xlsx и ревизию шаблона.')
          return Response.json(
            await deps.templates[body.kind].save(
              { base64: body.base64, fileName: body.fileName, config },
              body.expectedRevision,
            ),
          )
        }
        pdf = await convert(
          await fillQualityPrintWorkbook(bytes, config, sampleQualityPrintData),
        )
      }
      return new Response(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${body.kind}.pdf"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (cause) {
      return Response.json(
        {
          error:
            cause instanceof z.ZodError
              ? 'Проверьте настройки ячеек, даты и ревизию документа.'
              : cause instanceof Error
                ? cause.message
                : 'Ошибка формирования документа.',
        },
        {
          status: cause instanceof PrintError ? cause.status : 400,
          headers: { 'Cache-Control': 'no-store' },
        },
      )
    }
  }
}
export const handleQualityPrint = createQualityPrintHandler()
