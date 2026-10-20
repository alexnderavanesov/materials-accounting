import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  builtinQualityTemplate,
  createQualityTemplateStore,
} from './quality-print-store.server'
import {
  fillQualityPrintWorkbook,
  validateQualityPrintConfig,
} from './quality-print-excel.server'
import { readPrintWorkbook } from './request-print-excel.server'
import {
  sampleQualityPrintData,
  buildQualityPrintData,
} from './quality-print-data'
import { createQualityPrintHandler } from './quality-print-api.server'
import { createWorkspaceStore } from './workspace-snapshot.server'
import {
  acceptFixture,
  materialInspectionFixture,
} from './quality-workflow.fixtures'
import { currentInspection, newInspectionAct } from './quality-workflow'
import { convertRequestPdf } from './request-print-pdf.server'

const directories: Array<string> = []
async function temp() {
  const path = await mkdtemp(join(tmpdir(), 'materials-quality-test-'))
  directories.push(path)
  return path
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  )
})
describe('quality templates and PDF endpoint', () => {
  it.each(['zni', 'avk'] as const)(
    'fills %s for selected materials without an APP and preserves the workspace',
    async (kind) => {
      const workspace = materialInspectionFixture(2.5)
      const entry = workspace.qualityWorkflow.cases[0]!
      currentInspection(entry).avk = newInspectionAct()
      const before = JSON.stringify(workspace)
      const data = buildQualityPrintData(workspace, entry.id, 1, kind)
      const template = await builtinQualityTemplate(kind)
      const filled = await fillQualityPrintWorkbook(
        Buffer.from(template.base64, 'base64'),
        template.config,
        data,
      )
      if (process.env.MATERIALS_QUALITY_PDF_QA) {
        const directory = process.env.MATERIALS_QUALITY_PDF_QA
        await mkdir(directory, { recursive: true })
        await writeFile(
          join(directory, `${kind}-materials.pdf`),
          await convertRequestPdf(filled),
        )
      }
      const sheet = (await readPrintWorkbook(filled)).worksheets[0]!
      if (kind === 'zni') {
        expect(sheet.getCell('C11').text).toContain(
          'Входной контроль материалов: Клапан',
        )
        expect(sheet.getCell('C11').text).toContain('2,5 шт')
        expect(sheet.getCell('C11').text).toContain('зав. №123')
      } else {
        const row = template.config.tables.find(
          (table) => table.kind === 'materials',
        )!.row
        expect(sheet.getCell(`M${row}`).value).toBe(2.5)
        expect(sheet.getCell(`O${row}`).text).toBe('')
        expect(sheet.getCell(`P${row}`).text).toBe('')
      }
      expect(JSON.stringify(workspace)).toBe(before)
    },
    60000,
  )
  it.each(['zni', 'avk'] as const)(
    'loads normalized %s sample and produces a filled workbook without formulas',
    async (kind) => {
      const template = await builtinQualityTemplate(kind)
      const filled = await fillQualityPrintWorkbook(
        Buffer.from(template.base64, 'base64'),
        template.config,
        sampleQualityPrintData,
      )
      const book = await readPrintWorkbook(filled)
      expect(book.worksheets).toHaveLength(1)
      expect(
        book.worksheets[0]!.getCell(kind === 'zni' ? 'F7' : 'I2').text,
      ).toBe('1')
      if (kind === 'zni') {
        expect(book.worksheets[0]!.getImages()).toHaveLength(3)
        expect(book.worksheets[0]!.columnCount).toBe(7)
        expect(book.worksheets[0]!.pageSetup.printArea).toBe('A1:G38')
      }
    },
  )
  it('expands both AVK tables independently, moves signatures and the manual page break', async () => {
    const template = await builtinQualityTemplate('avk')
    const data = structuredClone(sampleQualityPrintData)
    data.materials = Array.from({ length: 35 }, (_, index) => ({
      ...data.materials[0]!,
      index: index + 1,
      quantity: 0.125,
      name: `Клапан запорный, сталь 15ХМ, позиция ${index + 1}`,
    }))
    data.documents = Array.from({ length: 4 }, (_, index) => ({
      ...data.documents[0]!,
      index: index + 1,
    }))
    data.fields.chairmanName = 'Иванов И.И.'
    const filled = await fillQualityPrintWorkbook(
      Buffer.from(template.base64, 'base64'),
      template.config,
      data,
    )
    const book = await readPrintWorkbook(filled)
    const sheet = book.worksheets[0]!
    expect(sheet.getCell('M36').value).toBe(0.125)
    expect(sheet.getCell('N125').value).toBe('Иванов И.И.')
    expect(sheet.pageSetup.printArea).toBe('A1:P136')
    expect(sheet.model.rowBreaks.some((item) => item.id === 96)).toBe(true)
    expect(sheet.model.merges).toContain('D36:J36')
  })
  it.skipIf(!process.env.MATERIALS_QUALITY_PDF_QA)(
    'renders reference documents and a multi-page AVK through LibreOffice',
    async () => {
      const directory = process.env.MATERIALS_QUALITY_PDF_QA!
      await mkdir(directory, { recursive: true })
      const workspace = acceptFixture(),
        id = workspace.qualityWorkflow.cases[0]!.id
      for (const kind of ['zni', 'avk'] as const) {
        const template = await builtinQualityTemplate(kind),
          data = buildQualityPrintData(workspace, id, 1, kind)
        data.fields.chairmanName = 'Иванов Иван Иванович'
        data.fields.project =
          'Строительство комплекса переработки нефтяного сырья'
        data.fields.contractorRepresentative = 'Соловьёв Олег Георгиевич'
        const bytes = await fillQualityPrintWorkbook(
          Buffer.from(template.base64, 'base64'),
          template.config,
          data,
        )
        await writeFile(join(directory, `${kind}.xlsx`), bytes)
        await writeFile(
          join(directory, `${kind}.pdf`),
          await convertRequestPdf(bytes),
        )
        if (kind === 'avk') {
          data.materials = Array.from({ length: 40 }, (_, index) => ({
            ...data.materials[0]!,
            index: index + 1,
            name: `Клапан запорный фланцевый Ду 25 Ру 160, исполнение J-J, сталь 15ХМ, позиция ${index + 1}`,
            quantity: 0.125,
          }))
          data.documents = Array.from({ length: 8 }, (_, index) => ({
            ...data.documents[0]!,
            index: index + 1,
          }))
          const many = await fillQualityPrintWorkbook(
            Buffer.from(template.base64, 'base64'),
            template.config,
            data,
          )
          await writeFile(
            join(directory, 'avk-many.pdf'),
            await convertRequestPdf(many),
          )
        } else {
          data.fields.remarks = Array.from(
            { length: 8 },
            (_, index) =>
              `Позиция ${index + 1}: предъявлено 10 шт; принято 8 шт; не принято 2 шт. Замечания к состоянию покрытия.`,
          ).join('\n')
          await writeFile(
            join(directory, 'zni-remarks.pdf'),
            await convertRequestPdf(
              await fillQualityPrintWorkbook(
                Buffer.from(template.base64, 'base64'),
                template.config,
                data,
              ),
            ),
          )
        }
      }
    },
    120000,
  )
  it('rejects damaged workbooks, invalid or overlapping bindings and merged table rows', async () => {
    await expect(readPrintWorkbook(Buffer.from('broken'))).rejects.toThrow()
    const template = await builtinQualityTemplate('avk'),
      book = await readPrintWorkbook(Buffer.from(template.base64, 'base64'))
    const config = structuredClone(template.config)
    config.fields.number = ['M2']
    expect(() => validateQualityPrintConfig(book, config)).toThrow(
      'начало объединения',
    )
    config.fields.number = ['I2']
    config.fields.date = ['I2']
    expect(() => validateQualityPrintConfig(book, config)).toThrow(
      'разные поля',
    )
    config.fields.date = []
    config.tables[0]!.row = 21
    expect(() => validateQualityPrintConfig(book, config)).toThrow()
  })
  it('persists templates atomically, restores them on restart and rejects stale saves', async () => {
    const path = await temp(),
      store = createQualityTemplateStore(path, 'zni'),
      original = await store.load()
    const saved = await store
      .save({ ...original, fileName: 'Наш бланк.xlsx' }, original.revision)
      .catch(() => null)
    // Store accepts only persisted fields, not the preview metadata.
    expect(saved).toBeNull()
    const next = await store.save(
      {
        base64: original.base64,
        config: original.config,
        fileName: 'Наш бланк.xlsx',
      },
      original.revision,
    )
    expect(
      (await createQualityTemplateStore(path, 'zni').load()).revision,
    ).toBe(next.revision)
    await expect(
      store.save(
        {
          base64: original.base64,
          config: original.config,
          fileName: 'Старое.xlsx',
        },
        original.revision,
      ),
    ).rejects.toThrow('другой вкладке')
  })
  it('prints the selected saved revision, leaves workspace bytes intact and rejects stale revisions', async () => {
    const path = await temp(),
      store = createWorkspaceStore(path),
      workspace = acceptFixture()
    const saved = await store.save(workspace, null),
      before = await readFile(join(path, 'workspace.json'))
    const templates = {
        zni: createQualityTemplateStore(path, 'zni'),
        avk: createQualityTemplateStore(path, 'avk'),
      },
      convert = vi.fn(async () => Buffer.from('%PDF-test'))
    const handle = createQualityPrintHandler({
      workspace: store,
      templates,
      convert,
    })
    const body = {
      action: 'print',
      kind: 'avk',
      caseId: workspace.qualityWorkflow.cases[0]!.id,
      revision: 1,
      workspaceRevision: saved.status === 'saved' ? saved.revision : '',
      templateRevision: (await templates.avk.load()).revision,
    }
    const request = (patch = {}) =>
      new Request('http://127.0.0.1:43187/api/quality-print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, ...patch }),
      })
    expect((await handle(request())).status).toBe(200)
    expect((await handle(request({ workspaceRevision: 'stale' }))).status).toBe(
      409,
    )
    expect((await handle(request({ templateRevision: 'stale' }))).status).toBe(
      409,
    )
    expect(convert).toHaveBeenCalledTimes(1)
    expect(await readFile(join(path, 'workspace.json'))).toEqual(before)
  })
})
