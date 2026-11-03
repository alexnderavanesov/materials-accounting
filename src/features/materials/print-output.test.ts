import { expect, it, vi } from 'vitest'
import { printOutput } from './print-output.server'
import { readPrintBundle } from './print-output'

it('bundles Excel and PDF from exactly the same filled workbook', async () => {
  const excel = Buffer.from('filled workbook'),
    convert = vi.fn(async () => Buffer.from('%PDF-result'))
  const response = await printOutput(excel, convert, 'АВК №1', 'bundle')
  expect(convert).toHaveBeenCalledExactlyOnceWith(excel)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  const bundle = await readPrintBundle(response)
  expect(bundle.name).toBe('АВК №1')
  expect(await bundle.excel.text()).toBe('filled workbook')
  expect(await bundle.pdf!.text()).toBe('%PDF-result')
})
it('keeps Excel downloadable when conversion fails or times out, while PDF-only requests fail', async () => {
  const convert = vi.fn(async () => {
    throw new Error('LibreOffice недоступен.')
  })
  const bundle = await readPrintBundle(
    await printOutput(Buffer.from('xlsx'), convert, 'ЗНИ №1', 'bundle'),
  )
  expect(await bundle.excel.text()).toBe('xlsx')
  expect(bundle.pdf).toBeNull()
  expect(bundle.pdfError).toBe('LibreOffice недоступен.')
  await expect(
    printOutput(Buffer.from('xlsx'), convert, 'ЗНИ №1'),
  ).rejects.toThrow('LibreOffice')
})
it('downloads XLSX without invoking the PDF converter', async () => {
  const convert = vi.fn()
  const response = await printOutput(
    Buffer.from('xlsx'),
    convert,
    'Заявка №2',
    'xlsx',
  )
  expect(response.headers.get('content-type')).toContain('spreadsheetml')
  expect(response.headers.get('content-disposition')).toContain(
    "filename*=UTF-8''",
  )
  expect(await response.text()).toBe('xlsx')
  expect(convert).not.toHaveBeenCalled()
})
