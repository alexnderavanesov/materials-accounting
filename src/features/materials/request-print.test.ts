import { execFile } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDefaultPrintWorkbook,
  fillPrintWorkbook,
  readPrintWorkbook,
  validatePrintConfig,
} from './request-print-excel.server'
import {
  builtinPrintTemplate,
  createPrintTemplateStore,
} from './request-print-store.server'
import { buildRequestPrintData } from './request-print-data'
import { createRequestPrintHandler } from './request-print-api.server'
import { convertRequestPdf } from './request-print-pdf.server'
import {
  defaultPrintConfig,
  printConfigSchema,
  samplePrintData,
} from './request-print'
import { createWorkspaceStore } from './workspace-snapshot.server'
import { createWorkspaceSaver } from './workspace-saver'
import { workspaceSnapshotSchema } from './workspace-snapshot'
import type { SaveWorkspaceResult } from './workspace-snapshot'

const directories: Array<string> = []
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), 'materials-print-test-'))
  directories.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  )
})
async function workbook(bytes: Buffer) {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  return book
}
function fixture() {
  return workspaceSnapshotSchema.parse({
    configuredAlloys: [],
    configuredCiphers: [],
    configuredDocuments: [],
    configuredUnits: [],
    materialTypeSettings: [],
    materialReceipts: [],
    materialIssues: [],
    qualityControls: [],
    lines: [
      {
        id: 'line',
        unit: 'шт',
        material: '09Г2С',
        materialType: 'Отводы',
        normativeDocument: 'ГОСТ',
        alternativeUnit: 'кг',
        alternativeUnitFactor: 2.5,
      },
    ],
    materialRequests: [
      {
        id: 'one',
        number: 'ЗП-1',
        date: '2026-10-16',
        projectLineId: 'line',
        projectMaterialName: 'Отвод',
        projectUnit: 'шт',
        quantity: 3,
        cipher: 'ТК1',
        requester: 'Иванов',
        note: 'Для монтажа',
        altUnit: 'т',
        altQuantity: 99,
        altUnitFactor: 33,
      },
      {
        id: 'two',
        number: 'ЗП-1',
        date: '2026-10-16',
        projectLineId: 'deleted',
        projectMaterialName: 'Удалённый материал',
        projectUnit: 'м',
        quantity: 1.5,
        cipher: 'ТК1',
        altUnit: 'кг',
        altQuantity: 0,
        altUnitFactor: 2,
      },
      {
        id: 'three',
        number: 'ЗП-2',
        date: '2026-10-16',
        projectLineId: 'line',
        projectMaterialName: 'Другая заявка',
        projectUnit: 'шт',
        quantity: 100,
        altUnit: '',
        altQuantity: null,
      },
    ],
  })
}
function apiRequest(body: unknown) {
  return new Request('http://127.0.0.1:43187/api/request-print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Excel print template', () => {
  it('fills every request row, keeps merged footer and typed decimal quantities, updates print area', async () => {
    const data = {
      ...samplePrintData,
      rows: Array.from({ length: 45 }, (_, i) => ({
        ...samplePrintData.rows[0]!,
        index: i + 1,
        quantity: 1.25,
        name: `Длинное русское наименование материала № ${i + 1} с дополнительными характеристиками`,
      })),
    }
    const filled = await workbook(
      await fillPrintWorkbook(
        await createDefaultPrintWorkbook(),
        defaultPrintConfig,
        data,
      ),
    )
    const sheet = filled.worksheets[0]!
    expect(sheet.getCell('A6').value).toBe(
      `№${data.headers.number} от ${data.headers.date}г.`,
    )
    expect(sheet.getCell('B52').value).toBe(
      `${data.rows[44]!.name} ГОСТ 17375-2001 09Г2С`,
    )
    expect(sheet.getCell('E52').value).toBe(1.25)
    expect(sheet.getCell('F52').value).toBe(6)
    expect(sheet.getCell('H52').value).toBe('ТК1')
    expect(sheet.getCell('B53').text).toContain('Заявитель')
    expect(sheet.getCell('H53').value).toBe(data.headers.requester)
    expect(sheet.getCell('H54').value).toBe('Филенко М.А.')
    expect(sheet.getCell('B57').text).toContain('Принял')
    expect(sheet.model.merges).toContain('B53:G53')
    expect(sheet.model.merges).toContain('C7:D7')
    expect(sheet.model.merges).toContain('E7:F7')
    expect(sheet.pageSetup.printArea).toBe('A1:I57')
    expect(sheet.pageSetup.printTitlesRow).toBe('7:7')
    expect(sheet.getRow(8).height).toBeGreaterThan(33)
    expect(sheet.getCell('B52').border.bottom?.style).toBe('thin')
    expect(sheet.getCell('G52').value).toBeNull()
    expect(sheet.getCell('B2').value).toBe('ООО "Югмонтажстрой"')
    expect(sheet.getCell('A5').text).toContain(
      'Договор № 25/НИ260 от 19.08.2025г.',
    )
  })
  it('prints all mixed request positions and an optional common note without changing existing template mappings', async () => {
    const workspace = fixture()
    Object.assign(workspace.materialRequests[0]!, {
      requestNote: 'Доставить вместе на участок',
      materialType: 'Детали',
    })
    Object.assign(workspace.materialRequests[1]!, {
      requestNote: 'Доставить вместе на участок',
      materialType: 'Трубы',
    })
    const data = buildRequestPrintData(workspace, 'one')
    expect(data.rows).toHaveLength(2)
    expect(data.headers.materialType).toContain('Детали')
    expect(data.headers.materialType).toContain('Трубы')
    expect(data.headers.requestNote).toBe('Доставить вместе на участок')
    expect(defaultPrintConfig.fields.requestNote).toBe('')
    const config = structuredClone(defaultPrintConfig)
    config.fields.requestNote = 'A4'
    const custom = await workbook(await createDefaultPrintWorkbook())
    custom.worksheets[0]!.mergeCells('A4:I4')
    const bytes = await fillPrintWorkbook(
      Buffer.from(await custom.xlsx.writeBuffer()),
      config,
      data,
    )
    const sheet = (await workbook(bytes)).worksheets[0]!
    expect(sheet.getCell('A4').text).toBe(data.headers.requestNote)
    expect(sheet.getCell('B8').text).toContain('Отвод')
    expect(sheet.getCell('B9').text).toContain('Удалённый материал')
    if (process.env.MATERIALS_TEST_PDF && process.env.MATERIALS_PRINT_QA_DIR)
      await writeFile(
        join(process.env.MATERIALS_PRINT_QA_DIR, 'request-mixed.pdf'),
        await convertRequestPdf(bytes),
      )
  })
  it('keeps one-row requests and moves mappings and PNG anchors below a growing table', async () => {
    const source = await workbook(await createDefaultPrintWorkbook()),
      sheet = source.worksheets[0]!
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
      'base64',
    )
    const id = source.addImage({
      buffer: png as unknown as ExcelJS.Buffer,
      extension: 'png',
    })
    sheet.addImage(id, {
      tl: { row: 12, col: 7 },
      ext: { width: 15, height: 15 },
    })
    const bytes = Buffer.from(await source.xlsx.writeBuffer())
    const config = {
      ...defaultPrintConfig,
      fields: { ...defaultPrintConfig.fields, requester: 'A12' },
    }
    const one = (
      await workbook(
        await fillPrintWorkbook(bytes, config, {
          ...samplePrintData,
          rows: samplePrintData.rows.slice(0, 1),
        }),
      )
    ).worksheets[0]!
    expect(one.getCell('A12').value).toBe(samplePrintData.headers.requester)
    const two = (
      await workbook(await fillPrintWorkbook(bytes, config, samplePrintData))
    ).worksheets[0]!
    expect(two.getCell('A13').value).toBe(samplePrintData.headers.requester)
    expect(two.getImages()[0]!.range.tl.row).toBe(13)
    expect(two.getImages()).toHaveLength(1)
  })
  it('validates addresses, required mappings, merged masters and repeated-header boundaries', async () => {
    const book = await readPrintWorkbook(await createDefaultPrintWorkbook())
    expect(() =>
      validatePrintConfig(book, {
        ...defaultPrintConfig,
        fields: { ...defaultPrintConfig.fields, number: 'D6' },
      }),
    ).toThrow('A6')
    expect(() =>
      validatePrintConfig(book, {
        ...defaultPrintConfig,
        columns: { ...defaultPrintConfig.columns, unit: 'B' },
      }),
    ).toThrow('несколькими')
    expect(() =>
      validatePrintConfig(book, {
        ...defaultPrintConfig,
        columns: { ...defaultPrintConfig.columns, quantity: '' },
      }),
    ).toThrow('количества')
    expect(() =>
      validatePrintConfig(book, { ...defaultPrintConfig, headerRows: '7:8' }),
    ).toThrow('выше')
    expect(() =>
      validatePrintConfig(book, { ...defaultPrintConfig, printArea: 'A1:D14' }),
    ).toThrow('области печати')
    expect(() =>
      validatePrintConfig(book, {
        ...defaultPrintConfig,
        fields: { ...defaultPrintConfig.fields, number: 'I8' },
      }),
    ).toThrow()
  })
  it('rejects fixed-size images that cover the repeat row from above', async () => {
    const book = await workbook(await createDefaultPrintWorkbook())
    const id = book.addImage({
      base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
      extension: 'png',
    })
    book.worksheets[0]!.addImage(id, {
      tl: { col: 0, row: 7 },
      ext: { width: 40, height: 200 },
    })
    expect(() => validatePrintConfig(book, defaultPrintConfig)).toThrow(
      'пересекает строку материалов',
    )
  })
  it('rejects corrupt files, formulas, extra sheets, and unsupported OOXML objects', async () => {
    await expect(readPrintWorkbook(Buffer.from('broken'))).rejects.toThrow(
      'исправный',
    )
    const formula = await workbook(await createDefaultPrintWorkbook())
    formula.worksheets[0]!.getCell('F9').value = { formula: '1+1', result: 2 }
    await expect(
      readPrintWorkbook(Buffer.from(await formula.xlsx.writeBuffer())),
    ).rejects.toThrow('Формулы')
    formula.worksheets[0]!.getCell('F9').value = null
    formula.addWorksheet('Скрытый', { state: 'hidden' })
    await expect(
      readPrintWorkbook(Buffer.from(await formula.xlsx.writeBuffer())),
    ).rejects.toThrow('один лист')
    for (const file of [
      'xl/vbaProject.bin',
      'xl/charts/chart1.xml',
      'xl/externalLinks/link1.xml',
    ]) {
      const zip = await JSZip.loadAsync(await createDefaultPrintWorkbook())
      zip.file(file, '<unsupported/>')
      await expect(
        readPrintWorkbook(await zip.generateAsync({ type: 'nodebuffer' })),
      ).rejects.toThrow('объекты')
    }
  })
})

describe('request print data', () => {
  it('prints the complete group, recalculates current and historical coefficients without changing saved data', () => {
    const workspace = fixture(),
      before = JSON.stringify(workspace)
    const data = buildRequestPrintData(workspace, 'two')
    expect(data.headers).toMatchObject({
      number: 'ЗП-1',
      date: '16.10.2026',
      requester: 'Иванов',
    })
    expect(data.rows).toHaveLength(2)
    expect(data.rows[0]).toMatchObject({
      quantity: 3,
      altUnit: 'кг',
      altQuantity: 7.5,
      document: 'ГОСТ',
      alloy: '09Г2С',
      cipher: 'ТК1',
    })
    expect(data.rows[1]).toMatchObject({
      name: 'Удалённый материал',
      quantity: 1.5,
      altQuantity: 3,
    })
    expect(JSON.stringify(workspace)).toBe(before)
  })
  it('preserves legacy alternatives without inventing a coefficient, rejects missing or invalid requests', () => {
    const workspace = fixture()
    delete workspace.materialRequests[1]!.altUnitFactor
    workspace.materialRequests[1]!.altQuantity = 8
    expect(buildRequestPrintData(workspace, 'one').rows[1]!.altQuantity).toBe(8)
    expect(() => buildRequestPrintData(workspace, 'missing')).toThrow(
      'не найдена',
    )
    workspace.materialRequests[0]!.quantity = -1
    expect(() => buildRequestPrintData(workspace, 'one')).toThrow(
      'некорректные',
    )
  })
})

describe('template persistence and print API', () => {
  it('keeps saved v1 templates with separate fields readable and does not replace their layout', async () => {
    const dir = await directory(),
      book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Заявка')
    sheet.getCell('A14').value = 'Мои подписи'
    const legacyConfig = {
      version: 1,
      sheetName: 'Заявка',
      repeatRow: 9,
      printArea: 'A1:I14',
      headerRows: '8:8',
      fields: {
        number: 'C3',
        date: 'G3',
        requester: 'C4',
        cipher: 'C5',
        materialType: 'C6',
      },
      columns: {
        index: 'A',
        name: 'B',
        document: 'C',
        alloy: 'D',
        unit: 'E',
        quantity: 'F',
        altUnit: 'G',
        altQuantity: 'H',
        note: 'I',
      },
    }
    const raw = JSON.stringify({
      fileName: 'Старый бланк.xlsx',
      config: legacyConfig,
      base64: Buffer.from(await book.xlsx.writeBuffer()).toString('base64'),
    })
    await mkdir(join(dir, 'print-templates'))
    await writeFile(join(dir, 'print-templates/request.json'), raw)
    const template = await createPrintTemplateStore(dir).load()
    expect(template.config).toEqual(printConfigSchema.parse(legacyConfig))
    expect(template.config.fields.numberAndDate).toBe('')
    expect(template.config.columns.nameWithDetails).toBe('')
    const result = (
      await workbook(
        await fillPrintWorkbook(
          Buffer.from(template.base64, 'base64'),
          template.config,
          samplePrintData,
        ),
      )
    ).worksheets[0]!
    expect(result.getCell('C3').value).toBe(samplePrintData.headers.number)
    expect(result.getCell('G3').value).toBe(samplePrintData.headers.date)
    expect(result.getCell('B9').value).toBe(samplePrintData.rows[0]!.name)
    expect(result.getCell('C9').value).toBe(samplePrintData.rows[0]!.document)
    expect(result.getCell('A15').value).toBe('Мои подписи')
    expect(
      await readFile(join(dir, 'print-templates/request.json'), 'utf8'),
    ).toBe(raw)
  })
  it('loads the builtin without writes; saves atomically and detects concurrent stale edits after restart', async () => {
    const dir = await directory(),
      store = createPrintTemplateStore(dir),
      original = await store.load()
    expect(await readdir(dir)).toEqual([])
    const input = {
      fileName: 'Мой.xlsx',
      base64: original.base64,
      config: original.config,
    }
    await expect(store.save(input, 'builtin-v1')).rejects.toThrow(
      'другой вкладке',
    )
    expect(await readdir(dir)).toEqual([])
    const saved = await store.save(input, original.revision)
    expect((await createPrintTemplateStore(dir).load()).revision).toBe(
      saved.revision,
    )
    expect((await store.save(input, original.revision)).revision).toBe(
      saved.revision,
    )
    await expect(
      store.save({ ...input, fileName: 'Другой.xlsx' }, original.revision),
    ).rejects.toThrow('другой вкладке')
    expect(await readdir(join(dir, 'print-templates'))).toEqual([
      'request.json',
    ])
    await writeFile(join(dir, 'print-templates/request.json'), '{broken')
    await expect(store.load()).rejects.toThrow('повреждён')
    expect(
      await readFile(join(dir, 'print-templates/request.json'), 'utf8'),
    ).toBe('{broken')
  })
  it('validates on save before replacing the working template', async () => {
    const dir = await directory(),
      store = createPrintTemplateStore(dir),
      original = await store.load()
    await expect(
      store.save(
        { ...original, config: { ...original.config, repeatRow: 1 } },
        original.revision,
      ),
    ).rejects.toThrow()
    expect(await readdir(dir)).toEqual([])
  })
  it('reads server data, rejects revision conflicts, previews drafts and never writes the workspace while printing', async () => {
    const dir = await directory(),
      workspace = createWorkspaceStore(dir),
      templates = createPrintTemplateStore(dir)
    await workspace.save(fixture(), null)
    const saved = await workspace.load(),
      original = await templates.load()
    const convert = vi.fn(async (_bytes: Buffer) => Buffer.from('%PDF-test'))
    const handler = createRequestPrintHandler({ workspace, templates, convert })
    const before = await readFile(join(dir, 'workspace.json'))
    const print = {
      action: 'print',
      entryId: 'one',
      workspaceRevision: saved.revision,
      templateRevision: original.revision,
    }
    expect(
      (await handler(apiRequest({ ...print, workspaceRevision: 'stale' })))
        .status,
    ).toBe(409)
    expect(
      (await handler(apiRequest({ ...print, templateRevision: 'stale' })))
        .status,
    ).toBe(409)
    expect(convert).not.toHaveBeenCalled()
    const response = await handler(apiRequest(print))
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.status).toBe(200)
    const printed = await workbook(convert.mock.calls[0]![0])
    expect(printed.worksheets[0]!.getCell('F8').value).toBe(7.5)
    expect(printed.worksheets[0]!.getCell('B9').value).toBe(
      'Удалённый материал',
    )
    expect(
      (
        await handler(
          apiRequest({
            action: 'preview',
            base64: original.base64,
            config: original.config,
          }),
        )
      ).status,
    ).toBe(200)
    expect(await readdir(dir)).toEqual(['workspace.json'])
    expect(await readFile(join(dir, 'workspace.json'))).toEqual(before)
  })
})

describe('waiting for saved request data', () => {
  it('waits for coalesced edits and returns the final server revision', async () => {
    let finish: (value: SaveWorkspaceResult) => void = () => {}
    const save = vi.fn(
      () =>
        new Promise<SaveWorkspaceResult>((resolve) => {
          finish = resolve
        }),
    )
    const saver = createWorkspaceSaver({
      initial: fixture(),
      revision: 'old',
      save,
      cache: () => {},
      onStatus: () => {},
    })
    const change = fixture()
    change.configuredUnits = ['шт']
    saver.update(change)
    const next = fixture()
    next.configuredUnits = ['кг']
    saver.update(next)
    const waiting = saver.waitUntilSaved()
    let resolved = false
    void waiting.then(() => {
      resolved = true
    })
    finish({ status: 'saved', revision: 'first' })
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(resolved).toBe(false)
    finish({ status: 'saved', revision: 'last' })
    expect(await waiting).toBe('last')
  })
  it('blocks printing after a save failure or revision conflict', async () => {
    for (const save of [
      async (): Promise<SaveWorkspaceResult> => {
        throw Error('offline')
      },
      async (): Promise<SaveWorkspaceResult> => ({ status: 'conflict' }),
    ]) {
      const saver = createWorkspaceSaver({
        initial: fixture(),
        revision: 'old',
        save,
        cache: () => {},
        onStatus: () => {},
      })
      const changed = fixture()
      changed.configuredUnits = ['кг']
      saver.update(changed)
      await expect(saver.waitUntilSaved()).rejects.toThrow('сохранения')
    }
  })
})

describe('PDF converter', () => {
  it('reports a missing converter and cleans temporary files', async () => {
    const dir = await directory()
    await expect(
      convertRequestPdf(await createDefaultPrintWorkbook(), {
        executable: join(dir, 'missing-soffice'),
        tempRoot: dir,
      }),
    ).rejects.toThrow('LibreOffice')
    expect(await readdir(dir)).toEqual([])
  })
  it('terminates a stalled conversion and cleans up its temporary profile', async () => {
    const dir = await directory(),
      executable = join(dir, 'slow-converter')
    await writeFile(executable, '#!/bin/sh\nexec sleep 5\n', { mode: 0o700 })
    await expect(
      convertRequestPdf(await createDefaultPrintWorkbook(), {
        executable,
        timeout: 100,
        tempRoot: dir,
      }),
    ).rejects.toThrow('слишком много времени')
    expect(await readdir(dir)).toEqual(['slow-converter'])
  })
  it.skipIf(!process.env.MATERIALS_TEST_PDF)(
    'renders Cyrillic one-page and multi-page PDFs with a real LibreOffice',
    async () => {
      const template = await builtinPrintTemplate(),
        dir = await directory(),
        exec = promisify(execFile)
      for (const count of [1, 65]) {
        const data = {
          ...samplePrintData,
          rows: Array.from({ length: count }, (_, i) => ({
            ...samplePrintData.rows[0]!,
            index: i + 1,
            name: `Отвод ${i + 1}. Стальная соединительная деталь трубопровода с длинным наименованием`,
            quantity: 1.25,
            altQuantity: 2.5,
          })),
        }
        const pdf = await convertRequestPdf(
          await fillPrintWorkbook(
            Buffer.from(template.base64, 'base64'),
            template.config,
            data,
          ),
        )
        const file = join(dir, `${count}.pdf`)
        await writeFile(file, pdf)
        if (process.env.MATERIALS_PRINT_QA_DIR)
          await writeFile(
            join(process.env.MATERIALS_PRINT_QA_DIR, `request-${count}.pdf`),
            pdf,
          )
        const { stdout } = await exec(
          process.env.MATERIALS_PDF_PYTHON ?? 'python3',
          [
            '-c',
            'from pypdf import PdfReader; import json, sys; print(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages], ensure_ascii=False))',
            file,
          ],
        )
        const pages = JSON.parse(stdout) as Array<string>
        const text = pages.join('\n')
        expect(text).toContain('Согласовано')
        expect(text).toContain(`Отвод ${count}.`)
        expect(text).toMatch(/1[.,]25/)
        expect(count === 1 ? pages.length === 1 : pages.length > 1).toBe(true)
        for (const page of pages.slice(1))
          expect(page).toContain('Наименование')
        if (process.env.MATERIALS_PRINT_QA_DIR)
          await writeFile(
            join(process.env.MATERIALS_PRINT_QA_DIR, `request-${count}.pdf`),
            pdf,
          )
      }
    },
    120000,
  )
})
