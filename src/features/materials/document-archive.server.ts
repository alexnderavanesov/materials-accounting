import { extname } from 'node:path'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { documentCategories } from './document-registry'
import type {
  DocumentFileManifest,
  DocumentRegistry,
  DocumentTarget,
  RegistryDocument,
} from './document-registry'
import type { WorkspaceSnapshot } from './workspace-snapshot'
import {
  decodeTemplate,
  PrintError,
  requestPrintTemplateStore,
} from './request-print-store.server'
import { qualityTemplateStores } from './quality-print-store.server'
import { buildRequestPrintData } from './request-print-data'
import { buildQualityPrintData } from './quality-print-data'
import { fillPrintWorkbook } from './request-print-excel.server'
import { fillQualityPrintWorkbook } from './quality-print-excel.server'
import { convertRequestPdf } from './request-print-pdf.server'
import { safeDocumentFilename } from './document-files.server'

export async function createDocumentRenderer(
  workspace: WorkspaceSnapshot,
  targets: DocumentTarget[],
) {
  const kinds = new Set(targets.map((target) => target.kind))
  const failure = (error: unknown) =>
    error instanceof Error ? error : new Error('Не удалось прочитать шаблон.')
  const [request, zni, avk] = await Promise.all([
    kinds.has('request')
      ? requestPrintTemplateStore.load().catch(failure)
      : null,
    kinds.has('zni') ? qualityTemplateStores.zni.load().catch(failure) : null,
    kinds.has('avk') ? qualityTemplateStores.avk.load().catch(failure) : null,
  ])
  return async (target: DocumentTarget) => {
    if (target.kind === 'request' && request) {
      if (request instanceof Error) throw request
      return fillPrintWorkbook(
        decodeTemplate(request.base64),
        request.config,
        buildRequestPrintData(workspace, target.entryId),
      )
    }
    const template = target.kind === 'zni' ? zni : avk
    if (template instanceof Error) throw template
    if (target.kind !== 'request' && template)
      return fillQualityPrintWorkbook(
        decodeTemplate(template.base64),
        template.config,
        buildQualityPrintData(
          workspace,
          target.caseId,
          target.revision,
          target.kind,
        ),
      )
    throw new PrintError('Шаблон документа не найден.', 404)
  }
}

export const archiveLimits = {
  documents: 500,
  generated: 100,
  bytes: 150 * 1024 * 1024,
  milliseconds: 180000,
}
type ArchiveInput = {
  registry: DocumentRegistry
  manifest: DocumentFileManifest
  materialIds: string[]
  documentIds: string[]
  render: (target: DocumentTarget) => Promise<Buffer>
  readFile: (id: string) => Promise<{ bytes: Buffer }>
  convert?: (bytes: Buffer, timeout: number) => Promise<Buffer>
  signal?: AbortSignal
}
export function selectRegistryDocuments(
  registry: DocumentRegistry,
  materialIds: string[],
  documentIds: string[],
) {
  const selected = new Set(materialIds),
    requested = new Set(documentIds)
  const available = new Set(registry.materials.map((row) => row.id))
  if (
    !selected.size ||
    !requested.size ||
    [...selected].some((id) => !available.has(id))
  )
    throw new PrintError(
      'Выберите материалы и документы из актуального реестра.',
    )
  const docs = registry.documents.filter(
    (doc) =>
      requested.has(doc.id) && doc.materialIds.some((id) => selected.has(id)),
  )
  if (docs.length !== requested.size)
    throw new PrintError(
      'Некоторые документы больше не относятся к выбранным материалам. Обновите список.',
      409,
    )
  if (
    docs.length > archiveLimits.documents ||
    docs.filter((doc) => doc.target).length > archiveLimits.generated
  )
    throw new PrintError(
      'За один раз можно скачать до 500 документов, включая до 100 печатных форм. Уменьшите выбор.',
      413,
    )
  return docs
}

/** The ZIP and generated forms exist in memory only; conversion cleans up its temporary directory. */
export async function buildDocumentArchive(input: ArchiveInput) {
  const selected = new Set(input.materialIds)
  const docs = selectRegistryDocuments(
    input.registry,
    input.materialIds,
    input.documentIds,
  )
  const documentIds = new Set(docs.map((doc) => doc.id))
  const files = input.manifest.files.filter((file) =>
    documentIds.has(file.documentId),
  )
  if (files.reduce((sum, file) => sum + file.size, 0) > archiveLimits.bytes)
    throw new PrintError(
      'Оригиналы превышают 150 МБ. Скачайте их несколькими архивами.',
      413,
    )
  const filesByDoc = new Map<string, typeof files>()
  for (const file of files)
    filesByDoc.set(file.documentId, [
      ...(filesByDoc.get(file.documentId) ?? []),
      file,
    ])
  const zip = new JSZip(),
    warnings: string[] = []
  const paths = new Map<string, string[]>(),
    statuses = new Map<string, string[]>()
  const reservedPaths = new Set<string>()
  const reservePaths = (
    folder: string,
    label: string,
    extensions: string[],
  ) => {
    // Leave room for extensions and duplicate suffixes on filesystems with a 255-byte limit.
    let name = ''
    for (const character of safeDocumentFilename(label)) {
      if (Buffer.byteLength(name + character) > 220) break
      name += character
    }
    name = name.replace(/[. ]+$/, '') || 'Документ'
    let counter = 1
    let candidates: string[]
    do {
      const suffix = counter === 1 ? '' : ` (${counter})`
      candidates = extensions.map(
        (extension) => `${folder}/${name}${suffix}${extension}`,
      )
      counter++
    } while (
      candidates.some((path) => reservedPaths.has(path.toLocaleLowerCase('ru')))
    )
    for (const path of candidates)
      reservedPaths.add(path.toLocaleLowerCase('ru'))
    return candidates
  }
  let bytesUsed = 0
  const deadline = Date.now() + archiveLimits.milliseconds
  const put = (path: string, bytes: Buffer) => {
    bytesUsed += bytes.length
    if (bytesUsed > archiveLimits.bytes)
      throw new PrintError('Архив превышает 150 МБ. Уменьшите выбор.', 413)
    zip.file(path, bytes)
  }
  const warning = (doc: RegistryDocument, message: string) => {
    warnings.push(`${doc.label}: ${message}`)
    statuses.get(doc.id)!.push(message)
  }
  for (const doc of docs) {
    if (input.signal?.aborted) throw new PrintError('Скачивание отменено.', 499)
    const folder = documentCategories[doc.kind]
    const docPaths: string[] = []
    paths.set(doc.id, docPaths)
    statuses.set(doc.id, [])
    if (doc.target) {
      // Reserve the pair together so PDF and Excel keep matching document names.
      const [excelPath, pdfPath] = reservePaths(folder, doc.label, [
        '.xlsx',
        '.pdf',
      ]) as [string, string]
      let excel: Buffer | null = null
      try {
        excel = await input.render(doc.target)
      } catch (error) {
        warning(
          doc,
          `Не удалось сформировать Excel: ${error instanceof Error ? error.message : 'ошибка шаблона'}`,
        )
      }
      if (excel) {
        put(excelPath, excel)
        docPaths.push(excelPath)
        let pdf: Buffer | null = null
        try {
          const remaining = deadline - Date.now()
          if (remaining < 1000)
            throw new Error(
              'Достигнут лимит времени. PDF можно скачать отдельно из карточки документа.',
            )
          pdf = await (
            input.convert ??
            ((buffer, timeout) => convertRequestPdf(buffer, { timeout }))
          )(excel, Math.min(45000, remaining))
        } catch (error) {
          warning(
            doc,
            `PDF не сформирован: ${error instanceof Error ? error.message : 'ошибка конвертера'}`,
          )
        }
        if (pdf) {
          put(pdfPath, pdf)
          docPaths.push(pdfPath)
        }
      }
    }
    for (const file of filesByDoc.get(doc.id) ?? []) {
      let original: Buffer
      try {
        original = (await input.readFile(file.id)).bytes
      } catch {
        warning(doc, `Оригинал недоступен: ${file.name}`)
        continue
      }
      const [path] = reservePaths(
        folder,
        `${doc.label}${doc.target ? ' — оригинал' : ''}`,
        [extname(safeDocumentFilename(file.name)).toLowerCase()],
      ) as [string]
      put(path, original)
      docPaths.push(path)
    }
    if (!doc.target && !docPaths.length)
      warning(doc, 'Оригинал не прикреплён; сохранены только реквизиты.')
  }
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet('Реестр документов')
  sheet.columns = [
    { header: 'Материал', key: 'name', width: 65 },
    { header: 'Шифр', key: 'cipher', width: 35 },
    { header: 'Тип документа', key: 'kind', width: 24 },
    { header: 'Документ', key: 'label', width: 65 },
    { header: 'Файлы в архиве', key: 'paths', width: 80 },
    { header: 'Примечание', key: 'status', width: 65 },
  ]
  const byMaterial = new Map(
    input.registry.materials.map((row) => [row.id, row]),
  )
  for (const doc of docs)
    for (const id of doc.materialIds.filter((materialId) =>
      selected.has(materialId),
    )) {
      const material = byMaterial.get(id)!
      sheet.addRow({
        name: material.name.slice(0, 32000),
        cipher: material.cipher.slice(0, 32000),
        kind: documentCategories[doc.kind],
        label: doc.label.slice(0, 32000),
        paths: paths.get(doc.id)!.join('\n').slice(0, 32000),
        status: statuses.get(doc.id)!.join('\n').slice(0, 32000),
      })
    }
  sheet.autoFilter = { from: 'A1', to: 'F1' }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.getRow(1).font = { bold: true }
  sheet.eachRow((row) => {
    row.alignment = { wrapText: true, vertical: 'top' }
  })
  put('Реестр.xlsx', Buffer.from(await book.xlsx.writeBuffer()))
  zip.file(
    'О составе архива.txt',
    `Документы целиком, включая материалы вне текущего выбора. Общие документы включены один раз.\nPDF и Excel сформированы по сохранённым данным и текущим шаблонам.\n\n${warnings.length ? warnings.join('\n') : 'Все выбранные документы включены.'}`,
  )
  return {
    bytes: await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'STORE',
    }),
    warnings,
  }
}
