// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { operationGridApi } from './project-grid-test-support'
import { InspectionWorkspace, TransferActs } from './quality-workflow-ui'
import { QualityPrintButton } from './quality-print-ui'
import { acceptFixture, inspectionFixture } from './quality-workflow.fixtures'
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
