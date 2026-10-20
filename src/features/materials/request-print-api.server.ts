import { z } from 'zod'
import { buildRequestPrintData } from './request-print-data'
import {
  describePrintSheet,
  fillPrintWorkbook,
  readPrintWorkbook,
  validatePrintConfig,
} from './request-print-excel.server'
import { convertRequestPdf } from './request-print-pdf.server'
import {
  builtinPrintTemplate,
  decodeTemplate,
  PrintError,
  requestPrintTemplateStore,
} from './request-print-store.server'
import {
  defaultPrintConfig,
  maxTemplateBytes,
  printConfigSchema,
  samplePrintData,
} from './request-print'
import { projectWorkspaceStore } from './workspace-snapshot.server'

const payload = z
  .object({
    action: z.enum(['inspect', 'save', 'preview', 'print']),
    base64: z
      .string()
      .max(Math.ceil(maxTemplateBytes / 3) * 4)
      .optional(),
    fileName: z.string().min(1).max(200).optional(),
    config: printConfigSchema.optional(),
    expectedRevision: z.string().optional(),
    entryId: z.string().max(500).optional(),
    workspaceRevision: z.string().nullable().optional(),
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
  try {
    return payload.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } catch {
    throw new PrintError('Некорректные параметры шаблона или печати.')
  }
}

export function createRequestPrintHandler(
  deps = {
    templates: requestPrintTemplateStore,
    workspace: projectWorkspaceStore,
    convert: convertRequestPdf,
  },
) {
  let queue = Promise.resolve(),
    pending = 0
  async function convert(bytes: Buffer) {
    if (pending >= 5)
      throw new PrintError(
        'Уже формируется несколько PDF. Повторите через минуту.',
        429,
      )
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
        const sample = new URL(request.url).searchParams.get('sample') === '1'
        return Response.json(
          sample ? await builtinPrintTemplate() : await deps.templates.load(),
          { headers: { 'Cache-Control': 'no-store' } },
        )
      }
      const body = await readBody(request)
      if (body.action === 'print') {
        if (!body.entryId || !body.templateRevision || !body.workspaceRevision)
          throw new PrintError('Сначала сохраните заявку.')
        const [saved, template] = await Promise.all([
          deps.workspace.load(),
          deps.templates.load(),
        ])
        if (!saved.workspace || saved.revision !== body.workspaceRevision)
          throw new PrintError(
            'Данные изменились. Обновите страницу перед печатью.',
            409,
          )
        if (template.revision !== body.templateRevision)
          throw new PrintError(
            'Шаблон изменился. Повторите печать с новым шаблоном.',
            409,
          )
        const data = buildRequestPrintData(saved.workspace, body.entryId)
        const pdf = await convert(
          await fillPrintWorkbook(
            decodeTemplate(template.base64),
            template.config,
            data,
          ),
        )
        return pdfResponse(pdf, `Заявка ${data.headers.number}.pdf`)
      }
      if (!body.base64) throw new PrintError('Загрузите Excel-шаблон.')
      const bytes = decodeTemplate(body.base64),
        book = await readPrintWorkbook(bytes)
      if (body.action === 'inspect')
        return Response.json({
          sheet: describePrintSheet(book),
          config: {
            ...defaultPrintConfig,
            sheetName: book.worksheets[0]!.name,
          },
        })
      const config = validatePrintConfig(book, body.config)
      if (body.action === 'save') {
        if (
          !body.expectedRevision ||
          !body.fileName?.toLowerCase().endsWith('.xlsx')
        )
          throw new PrintError('Укажите файл .xlsx и версию шаблона.')
        return Response.json(
          await deps.templates.save(
            { base64: body.base64, fileName: body.fileName, config },
            body.expectedRevision,
          ),
        )
      }
      return pdfResponse(
        await convert(await fillPrintWorkbook(bytes, config, samplePrintData)),
        'Предпросмотр заявки.pdf',
      )
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Не удалось выполнить печать.',
        },
        {
          status: error instanceof PrintError ? error.status : 400,
          headers: { 'Cache-Control': 'no-store' },
        },
      )
    }
  }
}
function pdfResponse(pdf: Buffer, filename: string) {
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="request.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
export const handleRequestPrint = createRequestPrintHandler()
