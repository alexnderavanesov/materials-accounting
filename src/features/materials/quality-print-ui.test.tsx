// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QualityPrintSettings } from './quality-print-ui'
import { defaultQualityPrintConfig } from './quality-print'
import type { QualityPrintKind, QualityPrintTemplate } from './quality-print'

const fetchMock = vi.fn<typeof fetch>()
const makeTemplate = (kind: QualityPrintKind): QualityPrintTemplate => ({
  base64: 'dGVtcGxhdGU=',
  fileName: `${kind}.xlsx`,
  revision: 'saved-v1',
  config: defaultQualityPrintConfig(kind),
  sheet: {
    name: kind,
    rows: 38,
    columns: 7,
    cells: [{ address: 'A1', text: 'Бланк' }],
    merges: ['C11:G11'],
  },
})
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
}, 15_000)

it('lets users find a field, repeat it in several cells, remove one destination and explicitly save the draft', async () => {
  fetchMock.mockImplementation(async () => Response.json(makeTemplate('zni')))
  render(<QualityPrintSettings kind="zni" />)
  fireEvent.click(await screen.findByLabelText('Вставить: Номер документа'))
  fireEvent.click(screen.getByLabelText('Ячейка F8'))
  expect(
    screen.getByText('Номер документа → F8 · вместо «Дата документа»'),
  ).toBeTruthy()
  fireEvent.click(screen.getByLabelText('Ячейка A2'))
  fireEvent.click(screen.getByLabelText('Убрать Номер документа из F8'))
  expect(screen.getByLabelText('Ячейка F7').textContent).toContain(
    'Номер документа',
  )
  expect(screen.getByLabelText('Ячейка A2').textContent).toContain(
    'Номер документа',
  )
  fireEvent.change(screen.getByLabelText('Найти поле'), {
    target: { value: 'Дата документа' },
  })
  expect(screen.queryByLabelText('Вставить: Номер документа')).toBeNull()
  fireEvent.click(screen.getByLabelText('Вставить: Дата документа'))
  fireEvent.click(screen.getByLabelText('Ячейка F8'))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаблон' }))
  await screen.findByText('Шаблон сохранён.')
  expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toMatchObject({
    action: 'save',
    kind: 'zni',
    expectedRevision: 'saved-v1',
    config: { fields: { number: ['F7', 'A2'], date: ['F8'] } },
  })
}, 15_000)

it('sets an optional material table row explicitly and discards changes without writing', async () => {
  fetchMock.mockImplementation(async () => Response.json(makeTemplate('zni')))
  render(<QualityPrintSettings kind="zni" />)
  await screen.findByLabelText('Вставить: Номер документа')
  fireEvent.click(screen.getByRole('button', { name: 'Таблица материалов' }))
  fireEvent.click(screen.getByLabelText('Выводить отдельной таблицей'))
  fireEvent.click(screen.getByRole('button', { name: 'Изменить строку' }))
  fireEvent.click(screen.getByLabelText('Ячейка A18'))
  fireEvent.click(screen.getByLabelText('Вставить: Предъявленное количество'))
  fireEvent.click(screen.getByLabelText('Ячейка B19'))
  expect(screen.getByRole('alert').textContent).toContain('строке 18')
  fireEvent.click(screen.getByLabelText('Ячейка B18'))
  expect(screen.getByLabelText('Ячейка B18').textContent).toContain(
    'Предъявленное количество',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }))
  await screen.findByText('Загружен сохранённый шаблон.')
  fireEvent.click(screen.getByRole('button', { name: 'Таблица материалов' }))
  expect(
    screen.getByLabelText<HTMLInputElement>('Выводить отдельной таблицей')
      .checked,
  ).toBe(false)
  expect(fetchMock.mock.calls.every((call) => !call[1]?.method)).toBe(true)
}, 15_000)

it('shows AVK accepted quantity and targets the master cell of a merged area', async () => {
  fetchMock.mockImplementation(async () => Response.json(makeTemplate('avk')))
  render(<QualityPrintSettings kind="avk" />)
  fireEvent.click(await screen.findByLabelText('Вставить: Номер документа'))
  expect(screen.queryByLabelText('Ячейка D11')).toBeNull()
  fireEvent.click(screen.getByLabelText('Ячейка C11'))
  expect(screen.getByLabelText('Ячейка C11').textContent).toContain(
    'Номер документа',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Таблица материалов' }))
  expect(screen.getByLabelText('Вставить: Принятое количество')).toBeTruthy()
})

it('keeps custom mappings when reuploading a restyled workbook, without saving until requested', async () => {
  const stored = makeTemplate('zni')
  stored.config.fields.number = ['A4']
  fetchMock.mockImplementation(async (_url, options) => {
    if (
      options?.method === 'POST' &&
      JSON.parse(String(options.body)).action === 'inspect'
    )
      return Response.json({
        sheet: stored.sheet,
        config: defaultQualityPrintConfig('zni'),
      })
    return Response.json(stored)
  })
  render(<QualityPrintSettings kind="zni" />)
  await screen.findByLabelText('Вставить: Номер документа')
  fireEvent.change(screen.getByLabelText('Загрузить шаблон zni'), {
    target: {
      files: [
        new File(['changed workbook'], 'Новый бланк.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ],
    },
  })
  await screen.findByText(/Бланк загружен/)
  expect(screen.getByLabelText('Ячейка A4').textContent).toContain(
    'Номер документа',
  )
  expect(fetchMock).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаблон' }))
  await screen.findByText('Шаблон сохранён.')
  expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body))).toMatchObject({
    action: 'save',
    fileName: 'Новый бланк.xlsx',
    expectedRevision: 'saved-v1',
    config: { fields: { number: ['A4'] } },
  })
})
