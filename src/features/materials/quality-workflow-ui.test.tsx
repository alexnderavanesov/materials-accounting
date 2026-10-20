// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { operationGridApi } from './project-grid-test-support'
import { InspectionWorkspace, TransferActs } from './quality-workflow-ui'
import { QualityPrintButton } from './quality-print-ui'
import {
  acceptFixture,
  inspectionFixture,
  materialInspectionFixture,
} from './quality-workflow.fixtures'
import {
  currentInspection,
  reopenInspection,
  validateQualityWorkspace,
} from './quality-workflow'
import type { SubobjectMaterialMetric } from './types'

vi.setConfig({ testTimeout: 15000 })

beforeEach(() => {
  sessionStorage.clear()
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const receiptsOf = (value: ReturnType<typeof inspectionFixture>) =>
  value.materialReceipts as unknown as Parameters<
    typeof TransferActs
  >[0]['receipts']
const linesOf = (value: ReturnType<typeof inspectionFixture>) =>
  value.lines as unknown as Array<SubobjectMaterialMetric>
it('cancels an APP without writing anything and reports an empty selection', () => {
  const fixture = inspectionFixture(),
    onChange = vi.fn((qualityWorkflow) =>
      validateQualityWorkspace({ ...fixture, qualityWorkflow }),
    )
  fixture.qualityWorkflow.apps = []
  fixture.qualityWorkflow.cases = []
  render(
    <TransferActs
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      onChange={onChange}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Оформить АПП' }))
  fireEvent.change(screen.getByLabelText('Номер АПП'), {
    target: { value: 'АПП-12' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть документ' }))
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Оформить АПП' }))
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить АПП' }))
  expect(screen.getByRole('alert').textContent).toContain(
    'хотя бы одно получение',
  )
  expect(screen.getByRole('dialog')).toBeTruthy()
})
it('shows the effective signed revision during reinspection and keeps history read-only', async () => {
  const fixture = acceptFixture(),
    onChange = vi.fn()
  fixture.qualityWorkflow.cases[0] = reopenInspection(
    fixture.qualityWorkflow.cases[0]!,
  )
  const revision = currentInspection(fixture.qualityWorkflow.cases[0])
  revision.zni.rows[0]!.accepted = 10
  revision.zni.rows[0]!.result = 'accepted'
  render(
    <InspectionWorkspace
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      onChange={onChange}
      prepare={async () => 'revision'}
    />,
  )
  expect(screen.getByText(/Действует АВК ревизии 1/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'История' }))
  const dialog = screen.getByRole('dialog')
  const grids = []
  for (const rev of fixture.qualityWorkflow.cases[0].revisions) {
    grids.push(
      await operationGridApi(
        `inspection-history:${fixture.qualityWorkflow.cases[0].id}:${rev.revision}`,
      ),
    )
  }

  expect(
    grids.map((grid) =>
      grid.getCellValue({
        rowNode: grid.getDisplayedRowAtIndex(0)!,
        colKey: 'accepted',
      }),
    ),
  ).toEqual([8, 10])
  for (const grid of grids)
    expect(
      grid
        .getColumns()!
        .every(
          (column) => !column.isCellEditable(grid.getDisplayedRowAtIndex(0)!),
        ),
    ).toBe(true)
  expect(dialog.querySelectorAll('.ag-cell input')).toHaveLength(0)
  expect(onChange).not.toHaveBeenCalled()
})
it('does not start PDF generation when saving fails', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(
    <QualityPrintButton
      kind="zni"
      caseId="case"
      revision={2}
      prepare={async () => {
        throw new Error('Не удалось сохранить данные')
      }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Печать ЗНИ' }))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'Не удалось сохранить данные',
    ),
  )
  expect(fetch).not.toHaveBeenCalled()
})

it('creates a partial material ZNI without APP, validates quantity and writes only after saving documents', () => {
  const fixture = materialInspectionFixture()
  fixture.qualityWorkflow.cases = []
  const onChange = vi.fn((qualityWorkflow) =>
    validateQualityWorkspace({ ...fixture, qualityWorkflow }),
  )
  render(
    <InspectionWorkspace
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      onChange={onChange}
      prepare={async () => 'revision'}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Создать ЗНИ' }))
  expect(screen.queryByLabelText('Выбрать весь АПП')).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: /Клапан/ }))
  fireEvent.change(screen.getByLabelText(/Количество для ЗНИ/), {
    target: { value: '11' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Продолжить с выбранными материалами' }),
  )
  expect(screen.getByRole('alert').textContent).toContain('доступный остаток')
  fireEvent.change(screen.getByLabelText(/Количество для ЗНИ/), {
    target: { value: '2,5' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Продолжить с выбранными материалами' }),
  )
  expect(screen.getByText(/Предъявлено: 2,5 шт/)).toBeTruthy()
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Добавить черновик АВК' }))
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить документы' }))
  expect(onChange).toHaveBeenCalledTimes(1)
  const entry = onChange.mock.calls[0]![0].cases[0]
  expect(entry.appId).toBeUndefined()
  expect(currentInspection(entry).zni.rows).toMatchObject([
    { receiptId: 'receipt', presented: 2.5 },
  ])
  expect(currentInspection(entry).avk).not.toBeNull()
})

it('selects a whole APP, keeps separate batches and selection during search, and cancels without writing', () => {
  const fixture = inspectionFixture()
  fixture.qualityWorkflow.cases = []
  fixture.materialReceipts.push({
    ...fixture.materialReceipts[0]!,
    id: 'second',
    heatBatch: 'Партия 2',
    factoryNumber: '456',
  })
  fixture.qualityWorkflow.apps[0]!.receiptIds.push('second')
  const onChange = vi.fn((qualityWorkflow) =>
    validateQualityWorkspace({ ...fixture, qualityWorkflow }),
  )
  render(
    <InspectionWorkspace
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      onChange={onChange}
      prepare={async () => 'revision'}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Создать ЗНИ' }))
  fireEvent.change(screen.getByLabelText(/Выбрать весь АПП/), {
    target: { value: 'app' },
  })
  expect(
    screen
      .getAllByRole<HTMLInputElement>('checkbox')
      .every((item) => item.checked),
  ).toBe(true)
  expect(screen.getAllByLabelText(/Количество для ЗНИ/)).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('Поиск материалов для ЗНИ'), {
    target: { value: '456' },
  })
  expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  fireEvent.click(
    screen.getByRole('button', { name: 'Продолжить с выбранными материалами' }),
  )
  expect(screen.getAllByText(/Предъявлено: 10 шт/)).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть документ' }))
  expect(onChange).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Создать ЗНИ' }))
  fireEvent.change(screen.getByLabelText(/Выбрать весь АПП/), {
    target: { value: 'app' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Продолжить с выбранными материалами' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Добавить черновик АВК' }))
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить документы' }))
  const revision = currentInspection(onChange.mock.calls[0]![0].cases[0])
  expect(
    revision.zni.rows.map((row) => [
      row.receiptId,
      row.presented,
      row.factoryNumber,
    ]),
  ).toEqual([
    ['receipt', 10, '123'],
    ['second', 10, '456'],
  ])
  expect(revision.avk?.documents).toEqual(revision.zni.documents)
  expect(revision.avk?.documents).toHaveLength(1)
})

it('offers only the unallocated quantity and excludes receipts with legacy quality control', () => {
  const fixture = materialInspectionFixture(4)
  fixture.qualityWorkflow.apps = inspectionFixture().qualityWorkflow.apps
  fixture.materialReceipts.push({
    ...fixture.materialReceipts[0]!,
    id: 'legacy',
    actualName: 'Старый ВК',
  })
  render(
    <InspectionWorkspace
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      legacyReceiptIds={['legacy']}
      onChange={vi.fn()}
      prepare={async () => 'revision'}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Создать ЗНИ' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(
    dialog.getByRole<HTMLOptionElement>('option', { name: /АПП №/ }).disabled,
  ).toBe(true)
  expect(dialog.getAllByRole('checkbox')).toHaveLength(1)
  expect(dialog.queryByText('Старый ВК')).toBeNull()
  fireEvent.click(dialog.getByRole('checkbox'))
  expect(
    dialog.getByLabelText<HTMLInputElement>(/Количество для ЗНИ/).value,
  ).toBe('6')
})
