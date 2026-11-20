import { changeField, reviewWorkflow } from './workflow-test-support'
import { useState } from 'react'
// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { operationGridApi } from './project-grid-test-support'
import { OperationDisplayProvider } from './operation-display'
import { InspectionWorkspace as InspectionWorkspaceView } from './quality-workflow-ui'
import { QualityPrintButton } from './quality-print-ui'
import { DocumentNumberingContext } from './document-numbering-context'
import { emptyNumberHistory, initialNumbering } from './document-numbering'
import {
  acceptFixture,
  historicalReinspection,
  documentInspectionFixture,
  inspectionFixture,
  materialInspectionFixture,
} from './quality-workflow.fixtures'
import {
  correctInspectionAct,
  currentInspection,
  localToday,
  rejectInspectionAct,
  validateQualityWorkspace,
} from './quality-workflow'
import type { SubobjectMaterialMetric } from './types'

// Controlled section mirrors the two independent sidebar destinations.
function InspectionWorkspace(
  props: Parameters<typeof InspectionWorkspaceView>[0],
) {
  const [kind, setKind] = useState<'zni' | 'avk'>(() =>
    sessionStorage.getItem('qa-quality-section') === 'avk' ? 'avk' : 'zni',
  )
  return (
    <>
      <nav aria-label="Разделы операций">
        {(['zni', 'avk'] as const).map((section) => (
          <button
            key={section}
            aria-current={kind === section ? 'page' : undefined}
            onClick={() => {
              setKind(section)
              sessionStorage.setItem('qa-quality-section', section)
            }}
          >
            {section === 'zni' ? 'ЗНИ' : 'АВК'}
          </button>
        ))}
      </nav>
      <InspectionWorkspaceView {...props} kind={kind} onKindChange={setKind} />
    </>
  )
}

vi.setConfig({ testTimeout: 15000 })

beforeEach(() => {
  sessionStorage.clear()
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const receiptsOf = (value: ReturnType<typeof inspectionFixture>) =>
  value.materialReceipts as unknown as Parameters<
    typeof InspectionWorkspace
  >[0]['receipts']
const linesOf = (value: ReturnType<typeof inspectionFixture>) =>
  value.lines as unknown as Array<SubobjectMaterialMetric>

const documentBadge = (label: string) =>
  within(
    screen.getByRole('group', { name: 'Сортировка: Входной контроль' }),
  ).getByRole('button', { name: new RegExp(`^${label}\\s*\\d`) })

it('separates ZNI and AVK lists and creation, remembers the selected section without saving data', () => {
  const fixture = acceptFixture()
  const noAct = structuredClone(fixture.qualityWorkflow.cases[0]!)
  noAct.id = 'without-act'
  currentInspection(noAct).zni.number = 'Без акта'
  currentInspection(noAct).avk = null
  const olderAct = historicalReinspection(
    structuredClone(fixture.qualityWorkflow.cases[0]!),
  )
  olderAct.id = 'older-act'
  olderAct.revisions[0]!.avk!.number = 'Архивный акт'
  fixture.qualityWorkflow.cases.push(noAct, olderAct)
  const onChange = vi.fn()
  const props = {
    value: fixture.qualityWorkflow,
    receipts: receiptsOf(fixture),
    lines: linesOf(fixture),
    prepare: async () => 'revision',
    onChange,
  }
  const view = render(<InspectionWorkspace {...props} />)
  expect(screen.getByRole('button', { name: 'Создать ЗНИ' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Создать АВК' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  expect(screen.getByRole('heading', { name: 'АВК №АВК-1' })).toBeTruthy()
  expect(
    screen.getByRole('heading', { name: 'АВК №Архивный акт' }),
  ).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'ЗНИ №Без акта' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Создать ЗНИ' })).toBeNull()
  view.unmount()
  render(<InspectionWorkspace {...props} />)
  expect(
    screen.getByRole('button', { name: /^АВК/ }).getAttribute('aria-current'),
  ).toBe('page')
  expect(onChange).not.toHaveBeenCalled()
})

it.each(['list', 'table'] as const)(
  'keeps independent same-day creation order in the %s view after switching and reopening sections',
  async (mode) => {
    const fixture = acceptFixture()
    const first = fixture.qualityWorkflow.cases[0]!
    first.id = 'first'
    const second = structuredClone(first)
    second.id = 'second'
    currentInspection(first).zni.number = 'ЗНИ-1'
    currentInspection(second).zni.number = 'ЗНИ-2'
    currentInspection(first).zni.createdAt = '2026-11-20T10:00:00.000Z'
    currentInspection(second).zni.createdAt = '2026-11-20T10:01:00.000Z'
    currentInspection(first).avk!.createdAt = '2026-11-20T10:03:00.000Z'
    currentInspection(second).avk!.createdAt = '2026-11-20T10:02:00.000Z'
    fixture.qualityWorkflow.cases.push(second)
    const onChange = vi.fn()
    sessionStorage.setItem(
      'materials.workspaceView.v1:operations.displays',
      JSON.stringify({ qa: mode }),
    )
    const content = (
      <OperationDisplayProvider id="qa">
        <InspectionWorkspace
          value={fixture.qualityWorkflow}
          receipts={receiptsOf(fixture)}
          lines={linesOf(fixture)}
          prepare={async () => 'revision'}
          onChange={onChange}
        />
      </OperationDisplayProvider>
    )
    let view = render(content)
    const order = async (kind: 'zni' | 'avk') => {
      if (mode === 'list')
        return Array.from(document.querySelectorAll('article'), (card) =>
          card.id.replace('inspection-case-', ''),
        )
      const api = await operationGridApi(`quality-${kind}-flat:table`)
      return Array.from(
        { length: api.getDisplayedRowCount() },
        (_, index) => api.getDisplayedRowAtIndex(index)?.id?.split(':')[0],
      )
    }
    expect(await order('zni')).toEqual(['second', 'first'])
    if (mode === 'table') {
      const api = await operationGridApi('quality-zni-flat:table')
      act(() => {
        api.applyColumnState({ state: [{ colId: 'document', sort: 'asc' }] })
      })
      expect(await order('zni')).toEqual(['first', 'second'])
    }
    fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
    expect(await order('avk')).toEqual(['first', 'second'])
    if (mode === 'table') {
      const api = await operationGridApi('quality-avk-flat:table')
      expect(api.getColumnState().some((column) => column.sort)).toBe(false)
    }
    fireEvent.click(screen.getByRole('button', { name: /^ЗНИ$/ }))
    if (mode === 'table') {
      expect(await order('zni')).toEqual(['first', 'second'])
      const api = await operationGridApi('quality-zni-flat:table')
      act(() => {
        api.applyColumnState({ defaultState: { sort: null } })
      })
    }
    expect(await order('zni')).toEqual(['second', 'first'])
    view.unmount()
    view = render(content)
    expect(await order('zni')).toEqual(['second', 'first'])
    expect(onChange).not.toHaveBeenCalled()
  },
)

it('remembers indicator sorting independently for ZNI and AVK', () => {
  const fixture = acceptFixture()
  const props = {
    value: fixture.qualityWorkflow,
    receipts: receiptsOf(fixture),
    lines: linesOf(fixture),
    prepare: async () => 'revision',
    onChange: vi.fn(),
  }
  const view = render(<InspectionWorkspace {...props} />)
  fireEvent.click(documentBadge('Подписано ЗНИ'))
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  expect(documentBadge('Подписано ЗНИ').getAttribute('aria-pressed')).toBe(
    'false',
  )
  fireEvent.click(documentBadge('Подписано АВК'))
  fireEvent.click(screen.getByRole('button', { name: /^ЗНИ$/ }))
  expect(documentBadge('Подписано ЗНИ').getAttribute('aria-pressed')).toBe(
    'true',
  )
  expect(documentBadge('Подписано АВК').getAttribute('aria-pressed')).toBe(
    'false',
  )
  view.unmount()
  render(<InspectionWorkspace {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  expect(documentBadge('Подписано АВК').getAttribute('aria-pressed')).toBe(
    'true',
  )
  expect(props.onChange).not.toHaveBeenCalled()
})

function RejectionHarness({ save }: { save: (workspace: unknown) => void }) {
  const [workspace, setWorkspace] = useState(() => {
    const fixture = acceptFixture()
    currentInspection(fixture.qualityWorkflow.cases[0]!).avk!.signedOn = null
    return fixture
  })
  return (
    <InspectionWorkspace
      value={workspace.qualityWorkflow}
      receipts={receiptsOf(workspace)}
      lines={linesOf(workspace)}
      prepare={async () => 'revision'}
      onChange={(qualityWorkflow) => {
        const next = { ...workspace, qualityWorkflow }
        validateQualityWorkspace(next, workspace)
        save(next)
        setWorkspace(next)
      }}
    />
  )
}
const openActMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: /^Действия АВК/ }))

function ActionsHarness({
  fixture,
  save,
}: {
  fixture: ReturnType<typeof inspectionFixture>
  save: (workspace: ReturnType<typeof inspectionFixture>) => void
}) {
  const [workspace, setWorkspace] = useState(fixture)
  return (
    <InspectionWorkspace
      value={workspace.qualityWorkflow}
      receipts={receiptsOf(workspace)}
      lines={linesOf(workspace)}
      prepare={async () => 'revision'}
      onChange={(qualityWorkflow) => {
        const next = { ...workspace, qualityWorkflow }
        validateQualityWorkspace(next, workspace)
        save(next)
        setWorkspace(next)
      }}
    />
  )
}
function chooseAction(kind: 'ЗНИ' | 'АВК', label: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${kind}`) }))
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(`^Действия ${kind}`) }),
  )
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
}

it('edits and previews the ZNI name addition, saves it separately and restores it on reopening', () => {
  const fixture = inspectionFixture()
  const save = vi.fn()
  render(<ActionsHarness fixture={fixture} save={save} />)
  chooseAction('ЗНИ', 'Редактировать ЗНИ')
  const field = screen.getByLabelText<HTMLTextAreaElement>(
    'Дополнение к наименованию',
  )
  changeField(field, { target: { value: 'с покрытием' } })
  expect(
    screen.getByText('Наименование в документе:').parentElement!.textContent,
  ).toContain('Клапан, с покрытием')
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить ЗНИ' }))
  const saved = save.mock.calls[0]![0]
  expect(
    currentInspection(saved.qualityWorkflow.cases[0]).zni.rows[0],
  ).toMatchObject({ name: 'Клапан', nameAddition: 'с покрытием' })
  expect(saved.materialReceipts).toEqual(fixture.materialReceipts)
  chooseAction('ЗНИ', 'Редактировать ЗНИ')
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Дополнение к наименованию')
      .value,
  ).toBe('с покрытием')
  changeField(screen.getByLabelText('Дополнение к наименованию'), {
    target: { value: '' },
  })
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: 'Выйти без сохранения' }))
  chooseAction('ЗНИ', 'Редактировать ЗНИ')
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Дополнение к наименованию')
      .value,
  ).toBe('с покрытием')
  expect(save).toHaveBeenCalledTimes(1)
})

it('inherits, overrides and clears the AVK addition without editing the signed ZNI', () => {
  const fixture = acceptFixture(10)
  const original = currentInspection(fixture.qualityWorkflow.cases[0]!)
  original.zni.rows[0]!.nameAddition = 'из ЗНИ'
  original.avk!.signedOn = null
  const save = vi.fn()
  render(<ActionsHarness fixture={fixture} save={save} />)
  chooseAction('АВК', 'Редактировать АВК')
  const field = screen.getByLabelText<HTMLTextAreaElement>(
    'Дополнение к наименованию',
  )
  expect(field.value).toBe('из ЗНИ')
  changeField(field, { target: { value: 'для АВК' } })
  expect(
    screen.getByText('Наименование в документе:').parentElement!.textContent,
  ).toContain('Клапан, для АВК')
  changeField(field, { target: { value: 'из ЗНИ' } })
  expect(screen.queryByRole('button', { name: 'Сохранить АВК' })).toBeNull()
  changeField(field, { target: { value: 'для АВК' } })
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить АВК' }))
  chooseAction('АВК', 'Редактировать АВК')
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Дополнение к наименованию')
      .value,
  ).toBe('для АВК')
  changeField(screen.getByLabelText('Дополнение к наименованию'), {
    target: { value: '' },
  })
  expect(
    screen.getByText('Наименование в документе:').parentElement!.textContent,
  ).toBe('Наименование в документе: Клапан')
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить АВК' }))
  const saved = save.mock.calls[1]![0]
  const revision = currentInspection(saved.qualityWorkflow.cases[0])
  expect(revision.avk!.nameAdditions).toEqual({ receipt: '' })
  expect(revision.zni).toEqual(original.zni)
  chooseAction('ЗНИ', 'Просмотр ЗНИ')
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Дополнение к наименованию')
      .disabled,
  ).toBe(true)
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Дополнение к наименованию')
      .value,
  ).toBe('из ЗНИ')
})

it('protects unsaved fields on Escape and X, preserves edits when continuing and saves only actual changes', () => {
  const fixture = acceptFixture(10)
  currentInspection(fixture.qualityWorkflow.cases[0]!).avk!.signedOn = null
  const save = vi.fn()
  render(<ActionsHarness fixture={fixture} save={save} />)
  chooseAction('АВК', 'Редактировать АВК')
  const original = screen.getByLabelText<HTMLInputElement>('Покупатель').value
  expect(screen.queryByRole('button', { name: 'Сохранить АВК' })).toBeNull()
  changeField(screen.getByLabelText('Покупатель'), {
    target: { value: 'Новый покупатель' },
  })
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(
    screen.getByRole('dialog', { name: 'Несохранённые изменения' }),
  ).toBeTruthy()
  fireEvent.click(
    screen.getByRole('button', { name: 'Продолжить редактирование' }),
  )
  expect(screen.getByLabelText<HTMLInputElement>('Покупатель').value).toBe(
    'Новый покупатель',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть документ' }))
  fireEvent.click(screen.getByRole('button', { name: 'Выйти без сохранения' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(save).not.toHaveBeenCalled()
  chooseAction('АВК', 'Редактировать АВК')
  expect(screen.getByLabelText<HTMLInputElement>('Покупатель').value).toBe(
    original,
  )
  changeField(screen.getByLabelText('Покупатель'), {
    target: { value: 'Сохранённый покупатель' },
  })
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить АВК' }))
  expect(save).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).toBeNull()
  chooseAction('АВК', 'Редактировать АВК')
  expect(screen.getByLabelText<HTMLInputElement>('Покупатель').value).toBe(
    'Сохранённый покупатель',
  )
  changeField(screen.getByLabelText('Покупатель'), {
    target: { value: 'Временное значение' },
  })
  changeField(screen.getByLabelText('Покупатель'), {
    target: { value: 'Сохранённый покупатель' },
  })
  expect(screen.queryByRole('button', { name: 'Сохранить АВК' })).toBeNull()
  const cleanUnload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(cleanUnload)
  expect(cleanUnload.defaultPrevented).toBe(false)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(save).toHaveBeenCalledTimes(1)
})

it('keeps reinspection in a draft until save and never writes from signed ZNI viewing or cancellation', () => {
  const fixture = acceptFixture(10)
  const entry = fixture.qualityWorkflow.cases[0]!
  currentInspection(entry).avk = null
  const original = structuredClone(currentInspection(entry))
  const save = vi.fn()
  render(<ActionsHarness fixture={fixture} save={save} />)
  chooseAction('ЗНИ', 'Просмотр ЗНИ')
  expect(
    screen
      .getByRole('dialog')
      .querySelectorAll('input:enabled, textarea:enabled, select:enabled'),
  ).toHaveLength(0)
  expect(screen.queryByRole('button', { name: /^Сохранить/ })).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Создать АВК на принятые позиции' }),
  ).toBeNull()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  chooseAction('ЗНИ', 'Повторная проверка')
  expect(save).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: 'Выйти без сохранения' }))
  expect(save).not.toHaveBeenCalled()
  chooseAction('ЗНИ', 'Повторная проверка')
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить ЗНИ' }))
  expect(save).toHaveBeenCalledTimes(1)
  const saved = save.mock.calls[0]![0].qualityWorkflow.cases[0]
  expect(saved.revisions).toHaveLength(2)
  expect(saved.revisions[0]).toEqual(original)
  expect(saved.revisions[1].zni.signedOn).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('explains why signing is unavailable and enables it after the required result is saved', () => {
  const save = vi.fn()
  render(<ActionsHarness fixture={inspectionFixture()} save={save} />)
  chooseAction('ЗНИ', 'Подписать ЗНИ')
  const sign = screen.getByRole('menuitem', { name: 'Подписать ЗНИ' })
  expect(sign.getAttribute('aria-disabled')).toBe('true')
  expect(
    document.getElementById(sign.getAttribute('aria-describedby')!)!
      .textContent,
  ).toContain('заполните результаты всех позиций ЗНИ')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Редактировать ЗНИ' }))
  fireEvent.click(screen.getByRole('combobox', { name: 'Результат' }))
  fireEvent.click(screen.getByRole('option', { name: 'Принято' }))
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить ЗНИ' }))
  chooseAction('ЗНИ', 'Подписать ЗНИ')
  expect(screen.getByRole('dialog', { name: 'Подписание ЗНИ' })).toBeTruthy()
  fireEvent.click(
    screen.getByRole('button', { name: 'Подтвердить подписание' }),
  )
  expect(save).toHaveBeenCalledTimes(2)
  expect(
    currentInspection(save.mock.calls[1]![0].qualityWorkflow.cases[0]).zni
      .signedOn,
  ).toBeTruthy()
})

it('scopes actions and editions to the document and links a corrected AVK to its original signed ZNI', () => {
  const fixture = acceptFixture(10)
  const entry = fixture.qualityWorkflow.cases[0]!
  currentInspection(entry).avk!.signedOn = null
  fixture.qualityWorkflow.cases[0] = correctInspectionAct(
    rejectInspectionAct(entry, 'document', localToday(), 'Исправить реквизиты'),
  )
  const save = vi.fn()
  render(<ActionsHarness fixture={fixture} save={save} />)
  fireEvent.click(screen.getByRole('button', { name: /^Действия ЗНИ/ }))
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual(['Просмотр ЗНИ', 'Печать ЗНИ'])
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: /^Открыть АВК №/ }))
  expect(screen.getByLabelText<HTMLInputElement>('Покупатель').disabled).toBe(
    false,
  )
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  openActMenu()
  expect(screen.queryByRole('menuitem', { name: 'Печать ЗНИ' })).toBeNull()
  expect(screen.queryByRole('menuitem', { name: 'Удалить АВК' })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Редакции · 2' }))
  const history = screen.getByRole('dialog', { name: 'Редакции АВК' })
  expect(
    within(history).getAllByRole('button', { name: 'Печать АВК' }),
  ).toHaveLength(2)
  expect(
    within(history).queryByRole('button', { name: 'Печать ЗНИ' }),
  ).toBeNull()
  fireEvent.keyDown(history, { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: /^Открыть ЗНИ №/ }))
  expect(screen.getByRole('dialog').getAttribute('aria-label')).toContain(
    'ревизия 1',
  )
  expect(screen.getByLabelText<HTMLInputElement>('Номер ЗНИ').disabled).toBe(
    true,
  )
  expect(screen.queryByRole('button', { name: /^Сохранить/ })).toBeNull()
  expect(save).not.toHaveBeenCalled()
})

it('rejects an AVK document with a required reason, corrects it in a new edition and signs that edition', () => {
  const save = vi.fn()
  render(<RejectionHarness save={save} />)
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  openActMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Отклонить АВК' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Подтвердить отклонение' }),
  )
  expect(save).not.toHaveBeenCalled()
  expect(
    within(screen.getByRole('dialog')).getByRole('alert').textContent,
  ).toContain('причину')
  changeField(screen.getByLabelText('Причина отклонения'), {
    target: { value: 'Исправить реквизиты' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Подтвердить отклонение' }),
  )
  const rejected = save.mock.calls[0]![0]
  expect(documentBadge('Отклонено АВК').textContent).toContain('1 док.')
  openActMenu()
  expect(screen.queryByRole('menuitem', { name: 'Подписать АВК' })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Исправить АВК' }))
  expect(save).toHaveBeenCalledTimes(1)
  changeField(screen.getByLabelText('Покупатель'), {
    target: { value: 'Исправленный покупатель' },
  })
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ }))
  const corrected = save.mock.calls[1]![0].qualityWorkflow.cases[0]
  expect(corrected.revisions).toHaveLength(2)
  expect(corrected.revisions[0]).toEqual(
    rejected.qualityWorkflow.cases[0].revisions[0],
  )
  expect(corrected.revisions[1].zni).toEqual(corrected.revisions[0].zni)
  openActMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Подписать АВК' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Подтвердить подписание' }),
  )
  expect(documentBadge('Подписано АВК').textContent).toContain('1 док.')
  expect(documentBadge('Отклонено АВК').textContent).toContain('0 док.')
})

it('rejects the material and lets the user record the actual return separately', async () => {
  const save = vi.fn()
  render(<RejectionHarness save={save} />)
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  openActMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Отклонить АВК' }))
  changeField(screen.getByLabelText('Вид отклонения'), {
    target: { value: 'materials' },
  })
  changeField(screen.getByLabelText('Причина отклонения'), {
    target: { value: 'Несоответствие материала' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Подтвердить отклонение' }),
  )
  expect(save.mock.calls[0]![0].qualityWorkflow.customerReturns ?? []).toEqual(
    [],
  )
  openActMenu()
  expect(screen.queryByRole('menuitem', { name: 'Исправить АВК' })).toBeNull()
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Оформить возврат заказчику' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  changeField(await screen.findByLabelText('Возвратить: Клапан'), {
    target: { value: '10' },
  })
  reviewWorkflow()
  fireEvent.click(
    screen.getByRole('button', { name: 'Сохранить фактический возврат' }),
  )
  expect(
    save.mock.calls[1]![0].qualityWorkflow.customerReturns.reduce(
      (sum: number, item: { quantity: number }) => sum + item.quantity,
      0,
    ),
  ).toBe(10)
})

it('keeps a partially accepted AVK editable and signable while returning only the rejected quantities', async () => {
  const save = vi.fn()
  render(<RejectionHarness save={save} />)
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  openActMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Отклонить АВК' }))
  changeField(screen.getByLabelText('Вид отклонения'), {
    target: { value: 'materials' },
  })
  changeField(screen.getByLabelText('Не принято по АВК: Клапан, шт'), {
    target: { value: '4' },
  })
  changeField(screen.getByLabelText('Причина отклонения'), {
    target: { value: 'Повреждены 4 шт.' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Подтвердить отклонение' }),
  )
  expect(documentBadge('Осталось подписать АВК').textContent).toContain(
    '1 док.',
  )
  expect(documentBadge('Отклонено АВК').textContent).toContain('0 док.')
  openActMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Редактировать АВК' }))
  expect(screen.getByText(/Клапан: 4 шт/)).toBeTruthy()
  changeField(screen.getByLabelText('Заключение комиссии'), {
    target: { value: 'Принято 4 шт., отклонено 4 шт.' },
  })
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ }))
  openActMenu()
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Оформить возврат заказчику' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  changeField(await screen.findByLabelText('Возвратить: Клапан'), {
    target: { value: '6' },
  })
  reviewWorkflow()
  fireEvent.click(
    screen.getByRole('button', { name: 'Сохранить фактический возврат' }),
  )
  expect(
    save.mock.calls
      .at(-1)![0]
      .qualityWorkflow.customerReturns.map(
        (item: { rejectedAt: string; quantity: number }) => [
          item.rejectedAt,
          item.quantity,
        ],
      ),
  ).toEqual([
    ['zni', 2],
    ['avk', 4],
  ])
  openActMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Подписать АВК' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Подтвердить подписание' }),
  )
  expect(documentBadge('Подписано АВК').textContent).toContain('1 док.')
})

it('shows prefixed numbers once and hides redundant history for a single edition', () => {
  const fixture = acceptFixture()
  const rev = currentInspection(fixture.qualityWorkflow.cases[0]!)
  rev.zni.number = '№ №221'
  rev.avk!.number = '№222'
  const before = structuredClone(fixture)
  const onChange = vi.fn()
  render(
    <InspectionWorkspace
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      prepare={async () => 'revision'}
      onChange={onChange}
    />,
  )
  expect(screen.getByRole('heading', { name: 'ЗНИ №221' })).toBeTruthy()
  expect(screen.getByText(/АВК №222 · подписан/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^Действия ЗНИ/ }))
  expect(screen.queryByRole('menuitem', { name: /^Редакции ·/ })).toBeNull()
  expect(fixture).toEqual(before)
  expect(onChange).not.toHaveBeenCalled()
})

it('deletes AVK then ZNI from the menu with confirmation, preserving receipts', () => {
  const fixture = acceptFixture()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const saved = vi.fn()
  function Harness() {
    const [workspace, setWorkspace] = useState(fixture)
    return (
      <InspectionWorkspace
        value={workspace.qualityWorkflow}
        receipts={receiptsOf(workspace)}
        lines={linesOf(workspace)}
        issues={workspace.materialIssues}
        prepare={async () => 'revision'}
        onChange={(qualityWorkflow) => {
          const next = { ...workspace, qualityWorkflow }
          validateQualityWorkspace(next, workspace)
          saved(next)
          setWorkspace(next)
        }}
      />
    )
  }
  render(<Harness />)
  expect(documentBadge('Создано ЗНИ').textContent).toContain('1 док.')
  expect(documentBadge('Подписано АВК').textContent).toContain('1 док.')
  const openMenu = (kind = 'АВК') => {
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${kind}`) }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^Действия ${kind}`) }),
    )
  }
  openMenu()
  expect(
    screen.queryByRole('menuitem', { name: 'Повторная проверка' }),
  ).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить АВК' }))
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(saved).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить АВК' }))
  expect(
    currentInspection(saved.mock.calls[0]![0].qualityWorkflow.cases[0]).avk,
  ).toBeNull()
  expect(documentBadge('Создано АВК').textContent).toContain('0 док.')
  expect(documentBadge('Подписано АВК').textContent).toContain('0 док.')
  expect(documentBadge('Осталось создать АВК').textContent).toContain('1 док.')
  openMenu('ЗНИ')
  expect(
    screen.getByRole('menuitem', { name: 'Повторная проверка' }),
  ).toBeTruthy()
  expect(screen.queryByRole('menuitem', { name: 'Удалить АВК' })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить ЗНИ' }))
  expect(saved.mock.calls[1]![0].qualityWorkflow.cases).toEqual([])
  expect(saved.mock.calls[1]![0].materialReceipts).toEqual(
    fixture.materialReceipts,
  )
  expect(screen.queryByRole('button', { name: /^Действия ЗНИ/ })).toBeNull()
  expect(documentBadge('Создано ЗНИ').textContent).toContain('0 док.')
  expect(documentBadge('Осталось создать АВК').textContent).toContain('0 док.')
})

it('prioritizes document stages before pagination, restores the choice and keeps totals independent of search', () => {
  const fixture = acceptFixture()
  const original = fixture.qualityWorkflow.cases[0]!
  fixture.qualityWorkflow.cases = Array.from({ length: 32 }, (_, i) => {
    const entry = structuredClone(original)
    entry.id = `case-${i}`
    const revision = currentInspection(entry)
    revision.zni.number = `ЗНИ-${i}`
    revision.zni.date = i < 30 ? '2026-11-05' : '2026-11-04'
    if (i >= 30) revision.avk!.signedOn = null
    return entry
  })
  const before = structuredClone(fixture)
  const onChange = vi.fn()
  const props = {
    value: fixture.qualityWorkflow,
    receipts: receiptsOf(fixture),
    lines: linesOf(fixture),
    onChange,
    prepare: async () => 'revision',
  }
  let view = render(<InspectionWorkspace {...props} />)
  const cards = () =>
    Array.from(document.querySelectorAll('article'), (card) => card.id)
  expect(documentBadge('Создано ЗНИ').textContent).toContain('32 док.')
  expect(documentBadge('Подписано АВК').textContent).toContain('30 док.')
  expect(documentBadge('Осталось подписать АВК').textContent).toContain(
    '2 док.',
  )
  expect(cards()[0]).toBe('inspection-case-case-0')
  fireEvent.click(screen.getByRole('button', { name: 'Последняя страница' }))
  expect(cards()).toHaveLength(7)
  fireEvent.click(documentBadge('Осталось подписать АВК'))
  expect(cards()).toHaveLength(25)
  expect(cards().slice(0, 3)).toEqual([
    'inspection-case-case-30',
    'inspection-case-case-31',
    'inspection-case-case-0',
  ])
  fireEvent.click(documentBadge('Осталось подписать АВК'))
  expect(cards()[0]).toBe('inspection-case-case-0')
  fireEvent.click(documentBadge('Осталось подписать АВК'))
  view.unmount()
  view = render(<InspectionWorkspace {...props} />)
  expect(
    documentBadge('Осталось подписать АВК').getAttribute('aria-pressed'),
  ).toBe('true')
  expect(cards()[0]).toBe('inspection-case-case-30')
  view.rerender(<InspectionWorkspace {...props} search="ЗНИ-31" />)
  expect(cards()).toEqual(['inspection-case-case-31'])
  expect(documentBadge('Создано ЗНИ').textContent).toContain('32 док.')
  expect(documentBadge('Осталось подписать АВК').textContent).toContain(
    '2 док.',
  )
  expect(onChange).not.toHaveBeenCalled()
  expect(fixture).toEqual(before)
})

it('hides AVK deletion when an issue already depends on it', () => {
  const fixture = acceptFixture()
  const onChange = vi.fn()
  const confirm = vi.spyOn(window, 'confirm')
  render(
    <InspectionWorkspace
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      issues={[{ receiptId: 'receipt' }]}
      prepare={async () => 'revision'}
      onChange={onChange}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  openActMenu()
  expect(screen.queryByRole('menuitem', { name: 'Удалить АВК' })).toBeNull()
  expect(confirm).not.toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalled()
})
it('paginates 1001 inspection candidates while preserving selection across pages and search', () => {
  const fixture = inspectionFixture()
  fixture.qualityWorkflow.cases = []
  fixture.materialReceipts = Array.from({ length: 1001 }, (_, index) => ({
    ...fixture.materialReceipts[0],
    id: `receipt-${index}`,
    actualName: `Материал ${index}`,
    factoryNumber: String(index),
  }))
  const onChange = vi.fn()
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
  changeField(screen.getByLabelText('Документ получения для ЗНИ'), {
    target: { value: 'app' },
  })
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getAllByRole('checkbox')).toHaveLength(25)
  fireEvent.click(within(dialog).getAllByRole('checkbox')[0]!)
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Последняя страница' }),
  )
  expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1)
  fireEvent.click(within(dialog).getByRole('checkbox'))
  changeField(within(dialog).getByLabelText('Поиск материалов для ЗНИ'), {
    target: { value: 'Материал 500' },
  })
  expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1)
  expect(within(dialog).getByText(/Выбрано поступлений: 2/)).toBeTruthy()
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'Продолжить с выбранными материалами',
    }),
  )
  expect(onChange).not.toHaveBeenCalled()
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ }))
  const workflow = onChange.mock.calls[0]![0]
  expect(currentInspection(workflow.cases[0]).zni.createdAt).toEqual(
    expect.any(String),
  )
  expect(
    currentInspection(workflow.cases[0]).zni.rows.map((item) => item.receiptId),
  ).toEqual(['receipt-0', 'receipt-1000'])
  validateQualityWorkspace({ ...fixture, qualityWorkflow: workflow })
})
it('shows the effective signed revision during reinspection and keeps history read-only', async () => {
  const fixture = acceptFixture(),
    onChange = vi.fn()
  fixture.qualityWorkflow.cases[0] = historicalReinspection(
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
  fireEvent.click(screen.getByRole('button', { name: /^Действия ЗНИ/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^Редакции ·/ }))
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

it('creates a partial material ZNI from APP, validates quantity and writes only after saving documents', () => {
  const fixture = materialInspectionFixture()
  fixture.qualityWorkflow.cases = []
  fixture.qualityWorkflow.receiptDocuments = [
    { id: 'app', kind: 'app', number: '15', date: '2026-10-22' },
  ]
  fixture.materialReceipts[0]!.certificate = '221'
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
  changeField(screen.getByLabelText('Документ получения для ЗНИ'), {
    target: { value: 'app' },
  })
  fireEvent.click(screen.getByRole('checkbox', { name: /Клапан/ }))
  changeField(screen.getByLabelText(/Количество для ЗНИ/), {
    target: { value: '11' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Продолжить с выбранными материалами' }),
  )
  expect(screen.getByRole('alert').textContent).toContain('доступный остаток')
  changeField(screen.getByLabelText(/Количество для ЗНИ/), {
    target: { value: '2,5' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Продолжить с выбранными материалами' }),
  )
  expect(screen.getByText(/Предъявлено: 2,5 шт/)).toBeTruthy()
  expect(screen.getByLabelText<HTMLInputElement>('Наименование').value).toBe(
    'Паспорт / сертификат',
  )
  expect(screen.getByLabelText<HTMLInputElement>('Номер').value).toBe('221')
  expect(onChange).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('button', { name: 'Создать АВК на принятые позиции' }),
  ).toBeNull()
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ }))
  expect(onChange).toHaveBeenCalledTimes(1)
  const entry = onChange.mock.calls[0]![0].cases[0]
  expect(entry.appId).toBeUndefined()
  expect(currentInspection(entry).zni.rows).toMatchObject([
    { receiptId: 'receipt', presented: 2.5 },
  ])
  expect(currentInspection(entry).avk).toBeNull()
  expect(entry.processVersion).toBe(2)
  expect(entry.basis?.kind).toBe('app')
  expect(currentInspection(entry).zni.documents).toMatchObject([
    { name: 'Паспорт / сертификат', number: '221' },
  ])
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
  changeField(screen.getByLabelText('Документ получения для ЗНИ'), {
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
  changeField(screen.getByLabelText('Поиск материалов для ЗНИ'), {
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
  changeField(screen.getByLabelText('Документ получения для ЗНИ'), {
    target: { value: 'app' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Выбрать все позиции документа' }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Продолжить с выбранными материалами' }),
  )
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ }))
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
  fireEvent.click(dialog.getByLabelText('Документ получения для ЗНИ'))
  expect(
    screen.getByRole<HTMLButtonElement>('option', { name: /АПП №/ }).disabled,
  ).toBe(false)
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
  changeField(dialog.getByLabelText('Документ получения для ЗНИ'), {
    target: { value: 'app' },
  })
  expect(dialog.getAllByRole('checkbox')).toHaveLength(1)
  expect(dialog.queryByText('Другой документ')).toBeNull()
  fireEvent.click(dialog.getByRole('checkbox'))
  expect(
    dialog.getByLabelText<HTMLInputElement>(/Количество для ЗНИ/).value,
  ).toBe('6')
})

it('records only an actual return, supports fractions and keeps the form open on a rejected save', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: /^Действия ЗНИ/ }))
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Оформить возврат заказчику' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  let dialog = screen.getByRole('dialog', { name: 'Возврат заказчику' })
  changeField(await within(dialog).findByLabelText('Возвратить: Клапан'), {
    target: { value: '2' },
  })
  reviewWorkflow()
  expect(within(dialog).getByRole('alert').textContent).toContain(
    'Проверьте количество',
  )
  expect(changes).not.toHaveBeenCalled()
  changeField(await within(dialog).findByLabelText('Возвратить: Клапан'), {
    target: { value: '0,4' },
  })
  expect(within(dialog).getByText('1 кг')).toBeTruthy()
  reviewWorkflow()
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
  fireEvent.click(screen.getByRole('button', { name: /^Действия ЗНИ/ }))
  expect(
    screen.queryByRole('menuitem', { name: 'Повторная проверка' }),
  ).toBeNull()
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Оформить возврат заказчику' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  dialog = screen.getByRole('dialog', { name: 'Возврат заказчику' })
  expect(
    await within(dialog).findByRole('gridcell', { name: '0,6' }),
  ).toBeTruthy()
  expect(within(dialog).getByRole('gridcell', { name: 'шт' })).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: /^Закрыть:/ }))
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
  expect(screen.getAllByText('Страница 2 из 2')).toHaveLength(1)
  const grid = await operationGridApi('inspection:case-30:1')
  expect(grid.getDisplayedRowCount()).toBe(1)
  view.rerender(<InspectionWorkspace {...props} search="ЗНИ-5" />)
  expect(document.querySelectorAll('article')).toHaveLength(1)
  expect(onChange).not.toHaveBeenCalled()
})

it('keeps a new AVK unsaved until confirmation, updates automatic date tokens and preserves manual numbers', () => {
  const fixture = acceptFixture()
  currentInspection(fixture.qualityWorkflow.cases[0]!).avk = null
  const before = structuredClone(fixture)
  const history = emptyNumberHistory(),
    settings = initialNumbering(history),
    onChange = vi.fn()
  settings.avk = { pattern: 'АКТ/{год}/{номер}', padding: 2, lastValue: 6 }
  render(
    <DocumentNumberingContext value={{ settings, history }}>
      <InspectionWorkspace
        value={fixture.qualityWorkflow}
        receipts={receiptsOf(fixture)}
        lines={linesOf(fixture)}
        onChange={onChange}
        prepare={async () => 'revision'}
      />
    </DocumentNumberingContext>,
  )
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Создать АВК' }))
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: /^ЗНИ №/ }),
  )
  changeField(screen.getByLabelText('Дата АВК'), {
    target: { value: '2025-12-01' },
  })
  expect(screen.getByLabelText<HTMLInputElement>('Номер АВК').value).toBe(
    'АКТ/2025/07',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть документ' }))
  fireEvent.click(screen.getByRole('button', { name: 'Выйти без сохранения' }))
  expect(onChange).not.toHaveBeenCalled()
  expect(fixture).toEqual(before)
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Создать АВК' }))
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: /^ЗНИ №/ }),
  )
  expect(screen.getByLabelText<HTMLInputElement>('Номер АВК').value).toMatch(
    /^АКТ\/\d{4}\/07$/,
  )
  changeField(screen.getByLabelText('Номер АВК'), {
    target: { value: 'Мой номер' },
  })
  changeField(screen.getByLabelText('Дата АВК'), {
    target: { value: '2025-12-01' },
  })
  expect(screen.getByLabelText<HTMLInputElement>('Номер АВК').value).toBe(
    'Мой номер',
  )
  reviewWorkflow()
  fireEvent.click(screen.getByRole('button', { name: /^Сохранить (ЗНИ|АВК)$/ }))
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(
    currentInspection(onChange.mock.calls[0]![0].cases[0]).avk?.number,
  ).toBe('Мой номер')
  expect(
    currentInspection(onChange.mock.calls[0]![0].cases[0]).avk?.createdAt,
  ).toEqual(expect.any(String))
})

it('offers APP only and respects previously presented quantities', () => {
  const fixture = materialInspectionFixture(4)
  fixture.qualityWorkflow.receiptDocuments!.push({
    id: 'm15',
    kind: 'm15',
    number: '15',
    date: '2026-10-22',
  })
  const onChange = vi.fn()
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
  const dialog = within(screen.getByRole('dialog'))
  const document = dialog.getByLabelText<HTMLSelectElement>(
    'Документ получения для ЗНИ',
  )
  expect(document.disabled).toBe(false)
  expect(dialog.queryByRole('checkbox')).toBeNull()
  fireEvent.click(document)
  expect(screen.getAllByRole('option')).toHaveLength(2)
  expect(screen.queryByRole('option', { name: /М-15 №/ })).toBeNull()
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
  changeField(document, { target: { value: 'app' } })
  fireEvent.click(dialog.getByRole('checkbox'))
  expect(
    dialog.getByLabelText<HTMLInputElement>(/Количество для ЗНИ/).value,
  ).toBe('6')
  expect(dialog.queryByRole('radio')).toBeNull()
  changeField(dialog.getByLabelText(/Количество для ЗНИ/), {
    target: { value: '7' },
  })
  fireEvent.click(
    dialog.getByRole('button', { name: 'Продолжить с выбранными материалами' }),
  )
  expect(dialog.getByRole('alert').textContent).toContain('доступный остаток')
  expect(onChange).not.toHaveBeenCalled()
})

it('offers only signed accepted ZNI without an AVK, searches all cases and opens the accepted act directly', () => {
  const fixture = acceptFixture(8)
  const eligible = fixture.qualityWorkflow.cases[0]!
  eligible.id = 'eligible'
  currentInspection(eligible).zni.number = 'Готовая-42'
  currentInspection(eligible).avk = null
  const draft = inspectionFixture().qualityWorkflow.cases[0]!
  draft.id = 'draft'
  const rejected = acceptFixture(0).qualityWorkflow.cases[0]!
  rejected.id = 'rejected'
  const withAct = acceptFixture().qualityWorkflow.cases[0]!
  withAct.id = 'with-act'
  fixture.qualityWorkflow.cases.push(draft, rejected, withAct)
  const before = structuredClone(fixture)
  const onChange = vi.fn()
  render(
    <InspectionWorkspace
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      onChange={onChange}
      prepare={async () => 'revision'}
      search="nothing matches"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Создать АВК' }))
  const picker = within(screen.getByRole('dialog', { name: 'Создать АВК' }))
  expect(picker.getAllByRole('button', { name: /^ЗНИ №/ })).toHaveLength(1)
  changeField(picker.getByLabelText('Поиск ЗНИ для АВК'), {
    target: { value: 'отсутствует' },
  })
  expect(picker.getByText('ЗНИ по запросу не найдены.')).toBeTruthy()
  changeField(picker.getByLabelText('Поиск ЗНИ для АВК'), {
    target: { value: 'Готовая-42' },
  })
  fireEvent.click(picker.getByRole('button', { name: /^ЗНИ №Готовая-42/ }))
  const editor = within(screen.getByRole('dialog'))
  expect(editor.getByLabelText('Номер АВК')).toBeTruthy()
  expect(editor.getByText('Клапан: 8 шт')).toBeTruthy()
  expect(editor.queryByLabelText('Номер ЗНИ')).toBeNull()
  expect(editor.queryByRole('button', { name: 'ЗНИ' })).toBeNull()
  fireEvent.click(editor.getByRole('button', { name: 'Закрыть документ' }))
  expect(onChange).not.toHaveBeenCalled()
  expect(fixture).toEqual(before)
})

it('shows why an AVK cannot be created when no signed accepted ZNI exists', () => {
  const fixture = acceptFixture(0)
  render(
    <InspectionWorkspace
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      onChange={vi.fn()}
      prepare={async () => 'revision'}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Создать АВК' }))
  expect(
    within(screen.getByRole('dialog')).getByText(
      /для которой акт ещё не создан/,
    ),
  ).toBeTruthy()
  expect(
    within(screen.getByRole('dialog')).queryByRole('button', {
      name: /^ЗНИ №/,
    }),
  ).toBeNull()
})

it('keeps actions in a keyboard-accessible menu and opens print preview after the menu closes', async () => {
  const fixture = acceptFixture()
  const onChange = vi.fn()
  const prepare = vi.fn(async () => 'saved-revision')
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ revision: 'template-revision' }))
    .mockResolvedValueOnce(
      Response.json({
        name: 'АВК-1',
        excel: 'eGxzeA==',
        pdfError: 'Конвертер недоступен.',
      }),
    )
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:test-excel')
      static revokeObjectURL = vi.fn()
    },
  )
  render(
    <InspectionWorkspace
      value={fixture.qualityWorkflow}
      receipts={receiptsOf(fixture)}
      lines={linesOf(fixture)}
      onChange={onChange}
      prepare={prepare}
    />,
  )
  const trigger = screen.getByRole('button', { name: /^Действия ЗНИ/ })
  expect(screen.queryByRole('menuitem')).toBeNull()
  fireEvent.click(trigger)
  let menu = screen.getByRole('menu')
  expect(document.activeElement).toBe(
    within(menu).getByRole('menuitem', { name: 'Просмотр ЗНИ' }),
  )
  expect(
    within(menu).queryByRole('menuitem', { name: 'Подписать ЗНИ' }),
  ).toBeNull()
  expect(
    within(menu).queryByRole('menuitem', { name: 'Удалить АВК' }),
  ).toBeNull()
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(
    within(menu).getByRole('menuitem', { name: 'Печать ЗНИ' }),
  )
  fireEvent.keyDown(menu, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  fireEvent.click(trigger)
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).toBeNull()
  fireEvent.click(trigger)
  menu = screen.getByRole('menu')
  fireEvent.keyDown(menu, { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: /^АВК/ }))
  openActMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Печать АВК' }))
  expect(screen.queryByRole('menu')).toBeNull()
  const preview = within(
    await screen.findByRole('dialog', { name: 'Предпросмотр PDF' }),
  )
  expect(preview.getByRole('button', { name: 'Скачать Excel' })).toBeTruthy()
  expect(preview.getByRole('alert').textContent).toContain(
    'Конвертер недоступен',
  )
  expect(prepare).toHaveBeenCalledTimes(1)
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toMatchObject({
    kind: 'avk',
    caseId: fixture.qualityWorkflow.cases[0]!.id,
    revision: 1,
    workspaceRevision: 'saved-revision',
    templateRevision: 'template-revision',
  })
  fireEvent.click(preview.getByRole('button', { name: 'Закрыть PDF' }))
  expect(document.activeElement).toBe(trigger)
  expect(onChange).not.toHaveBeenCalled()
})
