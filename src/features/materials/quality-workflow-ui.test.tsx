import { useState } from 'react'
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
import { InspectionWorkspace } from './quality-workflow-ui'
import { QualityPrintButton } from './quality-print-ui'
import {
  acceptFixture,
  documentInspectionFixture,
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
    typeof InspectionWorkspace
  >[0]['receipts']
const linesOf = (value: ReturnType<typeof inspectionFixture>) =>
  value.lines as unknown as Array<SubobjectMaterialMetric>
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

it('creates a partial material ZNI from M-15, validates quantity and writes only after saving documents', () => {
  const fixture = materialInspectionFixture()
  fixture.qualityWorkflow.cases = []
  fixture.qualityWorkflow.receiptDocuments = [
    { id: 'm15', kind: 'm15', number: '15', date: '2026-10-22' },
  ]
  fixture.materialReceipts[0]!.m15DocumentId = 'm15'
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
  fireEvent.change(screen.getByLabelText('Документ получения для ЗНИ'), {
    target: { value: 'm15' },
  })
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
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'Создать АВК на принятые позиции',
    }).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить документы' }))
  expect(onChange).toHaveBeenCalledTimes(1)
  const entry = onChange.mock.calls[0]![0].cases[0]
  expect(entry.appId).toBeUndefined()
  expect(currentInspection(entry).zni.rows).toMatchObject([
    { receiptId: 'receipt', presented: 2.5 },
  ])
  expect(currentInspection(entry).avk).toBeNull()
  expect(entry.processVersion).toBe(2)
  expect(entry.basis?.kind).toBe('m15')
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
  fireEvent.change(screen.getByLabelText('Документ получения для ЗНИ'), {
    target: { value: 'app' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Выбрать все позиции документа' }),
  )
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
  fireEvent.change(screen.getByLabelText('Документ получения для ЗНИ'), {
    target: { value: 'app' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Выбрать все позиции документа' }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Продолжить с выбранными материалами' }),
  )
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
  expect(revision.avk).toBeNull()
  expect(revision.zni.documents).toHaveLength(1)
})

it('offers only the unallocated quantity within the selected document', () => {
  const fixture = materialInspectionFixture(4)
  fixture.materialReceipts.push({
    ...fixture.materialReceipts[0]!,
    id: 'other-document',
    appDocumentId: 'other-app',
    actualName: 'Другой документ',
  })
  render(
    <InspectionWorkspace
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      onChange={vi.fn()}
      prepare={async () => 'revision'}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Создать ЗНИ' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(
    dialog.getByRole<HTMLOptionElement>('option', { name: /АПП №/ }).disabled,
  ).toBe(false)
  fireEvent.change(dialog.getByLabelText('Документ получения для ЗНИ'), {
    target: { value: 'app' },
  })
  expect(dialog.getAllByRole('checkbox')).toHaveLength(1)
  expect(dialog.queryByText('Другой документ')).toBeNull()
  fireEvent.click(dialog.getByRole('checkbox'))
  expect(
    dialog.getByLabelText<HTMLInputElement>(/Количество для ЗНИ/).value,
  ).toBe('6')
})

it('records only an actual return, supports fractions and keeps the form open on a rejected save', () => {
  const workspace = documentInspectionFixture()
  const changes = vi.fn()
  let rejectSave = true
  function Harness() {
    const [workflow, setWorkflow] = useState(workspace.qualityWorkflow)
    return (
      <InspectionWorkspace
        value={workflow}
        receipts={receiptsOf(workspace)}
        lines={linesOf(workspace)}
        onChange={(next) => {
          if (rejectSave) throw new Error('Ошибка сохранения: конфликт вкладок')
          validateQualityWorkspace(
            { ...workspace, qualityWorkflow: next },
            { ...workspace, qualityWorkflow: workflow },
          )
          changes(next)
          setWorkflow(next)
        }}
        prepare={async () => 'revision'}
      />
    )
  }
  render(<Harness />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Оформить возврат заказчику' }),
  )
  let dialog = screen.getByRole('dialog', { name: 'Возврат заказчику' })
  fireEvent.change(within(dialog).getByLabelText('Возвратить: Клапан'), {
    target: { value: '2' },
  })
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'Сохранить фактический возврат',
    }),
  )
  expect(changes).not.toHaveBeenCalled()
  fireEvent.change(within(dialog).getByLabelText('Возвратить: Клапан'), {
    target: { value: '0,4' },
  })
  expect(within(dialog).getByText('1 кг')).toBeTruthy()
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'Сохранить фактический возврат',
    }),
  )
  expect(within(dialog).getByRole('alert').textContent).toContain(
    'конфликт вкладок',
  )
  rejectSave = false
  const save = within(dialog).getByRole('button', {
    name: 'Сохранить фактический возврат',
  })
  fireEvent.click(save)
  fireEvent.click(save)
  expect(changes).toHaveBeenCalledTimes(1)
  expect(changes.mock.calls[0]![0].customerReturns[0].quantity).toBe(0.4)
  expect(
    screen.queryByRole('button', { name: 'Повторная проверка' }),
  ).toBeNull()
  fireEvent.click(
    screen.getByRole('button', { name: 'Оформить возврат заказчику' }),
  )
  dialog = screen.getByRole('dialog', { name: 'Возврат заказчику' })
  expect(within(dialog).getByText(/к возврату 0.6 шт/)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
  expect(changes).toHaveBeenCalledTimes(1)
})

it('paginates inspection cases and opens a linked inspection on another page', async () => {
  const fixture = inspectionFixture()
  const original = fixture.qualityWorkflow.cases[0]!
  fixture.qualityWorkflow.cases = Array.from({ length: 32 }, (_, i) => ({
    ...structuredClone(original),
    id: `case-${i}`,
    revisions: original.revisions.map((revision) => ({
      ...structuredClone(revision),
      zni: { ...structuredClone(revision.zni), number: `ЗНИ-${i}` },
    })),
  }))
  const onChange = vi.fn()
  const props = {
    value: fixture.qualityWorkflow,
    receipts: receiptsOf(fixture),
    lines: linesOf(fixture),
    onChange,
    prepare: async () => 'revision',
  }
  const view = render(<InspectionWorkspace {...props} />)
  expect(document.querySelectorAll('article')).toHaveLength(25)
  view.rerender(
    <InspectionWorkspace {...props} focusId="inspection:case-30:1" />,
  )
  expect(document.querySelectorAll('article')).toHaveLength(7)
  expect(screen.getAllByText('Страница 2 из 2')).toHaveLength(2)
  const grid = await operationGridApi('inspection:case-30:1')
  expect(grid.getDisplayedRowCount()).toBe(1)
  view.rerender(<InspectionWorkspace {...props} search="ЗНИ-5" />)
  expect(document.querySelectorAll('article')).toHaveLength(1)
  expect(onChange).not.toHaveBeenCalled()
})
