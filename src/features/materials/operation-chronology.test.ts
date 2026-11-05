import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acceptFixture } from './quality-workflow.fixtures'
import {
  currentInspection,
  reopenInspection,
  signInspection,
  validateQualityWorkspace,
} from './quality-workflow'
import {
  receiptChronologyError,
  validateWorkspaceChronology,
} from './operation-chronology'
import { createWorkspaceStore } from './workspace-snapshot.server'

function fixture() {
  const workspace = acceptFixture(10)
  workspace.materialRequests = [
    { id: 'request', number: 'ЗП-1', quantity: 10, date: '2026-10-25' },
  ]
  workspace.materialReceipts[0]!.date = '2026-10-26'
  const entry = workspace.qualityWorkflow.cases[0]!
  entry.basis.date = '2026-10-26'
  workspace.qualityWorkflow.receiptDocuments![0]!.date = '2026-10-26'
  const rev = currentInspection(entry)
  Object.assign(rev.zni, {
    date: '2026-10-27',
    inspectionDate: '2026-10-28',
    signedOn: '2026-10-28',
  })
  Object.assign(rev.avk!, { date: '2026-10-29', signedOn: '2026-10-30' })
  return workspace
}
type Workspace = ReturnType<typeof fixture>
function issue(workspace: Workspace, date: string, quantity = 1, id = 'issue') {
  workspace.materialIssues.push({
    id,
    document: id,
    receiptId: 'receipt',
    date,
    quantity,
  })
}
const dirs: Array<string> = []
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true })
})

describe('operation calendar chronology', () => {
  it('allows the entire chain, issues and returns on the same day', () => {
    const w = fixture()
    w.materialRequests[0]!.date = '2026-10-26'
    const rev = currentInspection(w.qualityWorkflow.cases[0]!)
    Object.assign(rev.zni, {
      date: '2026-10-26',
      inspectionDate: '2026-10-26',
      signedOn: '2026-10-26',
    })
    Object.assign(rev.avk!, { date: '2026-10-26', signedOn: '2026-10-26' })
    issue(w, '2026-10-26', 8)
    w.qualityWorkflow.customerReturns = [
      {
        id: 'return',
        kind: 'surplus',
        source: 'accepted',
        caseId: w.qualityWorkflow.cases[0]!.id,
        revision: 1,
        receiptId: 'receipt',
        date: '2026-10-26',
        quantity: 2,
        documentNumber: '',
        note: '',
      },
    ]
    expect(() => validateQualityWorkspace(w)).not.toThrow()
  })

  it('rejects receipt on the 23rd for a request on the 25th, including moving the parent date', () => {
    const previous = fixture()
    const w = structuredClone(previous)
    w.materialReceipts[0]!.date = '2026-10-23'
    expect(() => validateQualityWorkspace(w, previous)).toThrow(
      /Получение.*раньше заявки.*23.10.2026.*25.10.2026/,
    )
    expect(
      receiptChronologyError(w.materialRequests[0]!, '23.10.2026'),
    ).toContain('25.10.2026')
    w.materialReceipts[0]!.date = '2026-10-26'
    w.materialRequests[0]!.date = '2026-10-27'
    expect(() => validateQualityWorkspace(w, previous)).toThrow(/раньше заявки/)
  })

  it.each([
    [
      'ЗНИ до получения',
      (w: Workspace) => {
        w.materialReceipts[0]!.date = '2026-10-28'
      },
      /раньше получения/,
    ],
    [
      'ЗНИ до основания',
      (w: Workspace) => {
        w.qualityWorkflow.cases[0]!.basis.date = '2026-10-28'
        w.qualityWorkflow.receiptDocuments![0]!.date = '2026-10-28'
      },
      /раньше АПП/,
    ],
    [
      'инспекция до ЗНИ',
      (w: Workspace) => {
        currentInspection(w.qualityWorkflow.cases[0]!).zni.inspectionDate =
          '2026-10-26'
      },
      /инспекции.*раньше даты ЗНИ/,
    ],
    [
      'подписание до инспекции',
      (w: Workspace) => {
        currentInspection(w.qualityWorkflow.cases[0]!).zni.signedOn =
          '2026-10-27'
      },
      /подписания ЗНИ.*раньше даты инспекции/,
    ],
    [
      'АВК до подписания ЗНИ',
      (w: Workspace) => {
        currentInspection(w.qualityWorkflow.cases[0]!).avk!.date = '2026-10-26'
      },
      /Дата АВК.*раньше подписания ЗНИ/,
    ],
    [
      'подписание до АВК',
      (w: Workspace) => {
        currentInspection(w.qualityWorkflow.cases[0]!).avk!.signedOn =
          '2026-10-28'
      },
      /подписания АВК.*раньше даты АВК/,
    ],
    [
      'выдача до АВК',
      (w: Workspace) => {
        issue(w, '2026-10-29')
      },
      /по подписанным АВК 0/,
    ],
  ] as const)('rejects %s', (_name, change, message) => {
    const w = fixture()
    change(w)
    expect(() => validateQualityWorkspace(w)).toThrow(message)
  })

  it('checks inspection dates while signing, and keeps a later M-15 independent of the original ZNI', () => {
    const w = fixture(),
      rev = currentInspection(w.qualityWorkflow.cases[0]!)
    rev.zni.signedOn = null
    rev.avk = null
    expect(() => signInspection(rev, 'zni', '2026-10-27')).toThrow(
      'раньше даты инспекции',
    )
    const previous = fixture()
    const next = structuredClone(previous)
    next.qualityWorkflow.receiptDocuments!.push({
      id: 'm15',
      kind: 'm15',
      number: '15',
      date: '2026-11-05',
    })
    next.materialReceipts[0]!.m15DocumentId = 'm15'
    expect(() => validateQualityWorkspace(next, previous)).not.toThrow()
    expect(next.qualityWorkflow.cases).toEqual(previous.qualityWorkflow.cases)
    const m15Case = next.qualityWorkflow.cases[0]!
    m15Case.basis = { ...next.qualityWorkflow.receiptDocuments![1]! }
    expect(() => validateWorkspaceChronology(next)).toThrow(/раньше М-15/)
  })

  it('checks every request and receipt within a shared delivery/inspection', () => {
    const w = fixture()
    w.materialRequests.push({
      id: 'second',
      number: 'ЗП-2',
      date: '2026-10-27',
      quantity: 10,
    })
    w.materialReceipts.push({
      ...w.materialReceipts[0]!,
      id: 'second',
      requestId: 'second',
    })
    expect(() => validateQualityWorkspace(w)).toThrow(/раньше заявки «ЗП-2»/)
    w.materialReceipts[1]!.date = '2026-10-28'
    const rev = currentInspection(w.qualityWorkflow.cases[0]!)
    rev.zni.rows.push({ ...rev.zni.rows[0]!, receiptId: 'second' })
    expect(() => validateQualityWorkspace(w)).toThrow(/раньше получения/)
  })

  it('requires sufficient signed quantity on each issue date and accounts for earlier issues', () => {
    const w = fixture(),
      first = w.qualityWorkflow.cases[0]!
    const second = structuredClone(first)
    second.id = 'second'
    const r1 = currentInspection(first),
      r2 = currentInspection(second)
    Object.assign(r1.zni.rows[0]!, { presented: 4, accepted: 4 })
    r1.avk!.signedOn = '2026-10-29'
    Object.assign(r2.zni.rows[0]!, { presented: 6, accepted: 6 })
    r2.zni.number = '2'
    r2.avk!.number = 'АВК-2'
    w.qualityWorkflow.cases.push(second)
    issue(w, '2026-10-29', 4)
    issue(w, '2026-10-29', 1, 'issue-2')
    expect(() => validateQualityWorkspace(w)).toThrow(
      /на 29.10.2026.*по подписанным АВК 0/,
    )
    w.materialIssues[1]!.date = '2026-10-30'
    expect(() => validateQualityWorkspace(w)).not.toThrow()
  })

  it('preserves earlier approvals through reinspection without applying increases retroactively', () => {
    const w = fixture(),
      entry = w.qualityWorkflow.cases[0]!
    const first = currentInspection(entry)
    Object.assign(first.zni.rows[0]!, {
      accepted: 6,
      result: 'remarks',
      remarks: 'Частично',
    })
    first.avk!.signedOn = '2026-10-29'
    const next = structuredClone(first)
    next.revision = 2
    Object.assign(next.zni, {
      inspectionDate: '2026-10-30',
      signedOn: '2026-10-30',
    })
    Object.assign(next.zni.rows[0]!, { accepted: 10, result: 'accepted' })
    Object.assign(next.avk!, { date: '2026-10-31', signedOn: '2026-10-31' })
    entry.revisions.push(next)
    issue(w, '2026-10-29', 6)
    expect(() => validateQualityWorkspace(w)).not.toThrow()
    w.materialIssues[0]!.quantity = 7
    expect(() => validateQualityWorkspace(w)).toThrow(/по подписанным АВК 6/)
    w.materialIssues[0]!.quantity = 6
    next.zni.inspectionDate = '2026-10-28'
    expect(() => validateQualityWorkspace(w)).toThrow(/повторная инспекция/)
    const reopened = reopenInspection(entry)
    expect(currentInspection(reopened).zni.inspectionDate >= '2026-10-31').toBe(
      true,
    )
  })

  it('uses the accounting precision for fractional issue capacity', () => {
    const w = fixture()
    Object.assign(currentInspection(w.qualityWorkflow.cases[0]!).zni.rows[0]!, {
      presented: 0.1 + 0.2,
      accepted: 0.1 + 0.2,
    })
    issue(w, '2026-10-30', 0.1 + 0.2)
    expect(() => validateQualityWorkspace(w)).not.toThrow()
    w.materialIssues[0]!.quantity = 0.301
    expect(() => validateWorkspaceChronology(w)).toThrow(/по подписанным АВК/)
  })

  it.each(['request', 'receipt', 'issue'] as const)(
    'rejects a missing/invalid %s date',
    (kind) => {
      const w = fixture()
      issue(w, '2026-10-30')
      const item =
        kind === 'request'
          ? w.materialRequests[0]!
          : kind === 'receipt'
            ? w.materialReceipts[0]!
            : w.materialIssues[0]!
      for (const date of ['', '2026-02-30', undefined]) {
        if (date === undefined) delete item.date
        else item.date = date
        expect(() => validateQualityWorkspace(w)).toThrow('корректную дату')
      }
    },
  )

  it('prevents returns before receipt or signed ZNI and deducts accepted returns from dated issue capacity', () => {
    const w = fixture(),
      entry = w.qualityWorkflow.cases[0]!
    const returned = {
      id: 'return',
      kind: 'surplus' as const,
      source: 'accepted' as const,
      caseId: entry.id,
      revision: 1,
      receiptId: 'receipt',
      date: '2026-10-27',
      quantity: 2,
      documentNumber: '',
      note: '',
    }
    w.qualityWorkflow.customerReturns = [returned]
    expect(() => validateQualityWorkspace(w)).toThrow(
      /Возврат не может предшествовать/,
    )
    returned.date = '2026-10-28' // Accepted stock may be returned before the AVK is signed.
    issue(w, '2026-10-30', 8)
    expect(() => validateQualityWorkspace(w)).not.toThrow()
    w.materialIssues[0]!.quantity = 9
    expect(() => validateQualityWorkspace(w)).toThrow(/за вычетом возвратов/)
    w.materialIssues = []
    w.qualityWorkflow.cases = []
    w.qualityWorkflow.customerReturns = [
      {
        ...returned,
        source: 'uninspected',
        caseId: undefined,
        revision: undefined,
        date: '2026-10-25',
      },
    ]
    expect(() => validateQualityWorkspace(w)).toThrow(
      /Возврат не может предшествовать/,
    )
  })

  it('tolerates unchanged historical violations but rejects changed dates and new copies', () => {
    const previous = fixture()
    previous.materialReceipts[0]!.date = '2026-10-24'
    const next = structuredClone(previous)
    next.materialRequests[0]!.note = 'Новое примечание'
    expect(() => validateQualityWorkspace(next, previous)).not.toThrow()
    next.materialRequests[0]!.date = '2026-10-26'
    expect(() => validateQualityWorkspace(next, previous)).toThrow(
      /раньше заявки/,
    )
    next.materialRequests[0]!.date = '2026-10-25'
    next.materialReceipts.push({
      ...next.materialReceipts[0]!,
      id: 'new',
      quantity: 0.1,
    })
    expect(() => validateWorkspaceChronology(next, previous)).toThrow(
      /раньше заявки/,
    )
  })

  it('does not let old chronological errors authorize a new AVK, issue or return before the request', () => {
    const previous = fixture()
    previous.materialRequests[0]!.date = '2026-11-02'
    const next = structuredClone(previous)
    const avk = currentInspection(next.qualityWorkflow.cases[0]!).avk
    currentInspection(previous.qualityWorkflow.cases[0]!).avk = null
    expect(() => validateQualityWorkspace(next, previous)).toThrow(
      /АВК.*раньше заявки/,
    )
    currentInspection(previous.qualityWorkflow.cases[0]!).avk = avk
    issue(next, '2026-11-01')
    expect(() => validateQualityWorkspace(next, previous)).toThrow(
      /по подписанным АВК 0/,
    )
    next.materialIssues[0]!.date = '2026-11-02'
    expect(() => validateQualityWorkspace(next, previous)).not.toThrow()
    next.qualityWorkflow.customerReturns = [
      {
        id: 'return',
        kind: 'surplus',
        source: 'accepted',
        caseId: next.qualityWorkflow.cases[0]!.id,
        revision: 1,
        receiptId: 'receipt',
        date: '2026-11-01',
        quantity: 1,
        documentNumber: '',
        note: '',
      },
    ]
    expect(() => validateQualityWorkspace(next, previous)).toThrow(
      /Дата возврата.*раньше заявки/,
    )
  })

  it('checks chronology on the server atomically, preserves history on read and still protects revisions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'materials-chronology-'))
    dirs.push(dir)
    const store = createWorkspaceStore(dir)
    const initial = fixture()
    // Existing signed history may have a bad date; opening it must never rewrite it.
    initial.qualityWorkflow.cases[0]!.basis.date = '2026-10-28'
    initial.qualityWorkflow.receiptDocuments![0]!.date = '2026-10-28'
    const file = join(dir, 'workspace.json')
    await writeFile(file, JSON.stringify(initial))
    const loaded = await store.load(),
      original = await readFile(file, 'utf8')
    expect(await readFile(file, 'utf8')).toBe(original)
    const next = structuredClone(initial)
    next.materialRequests[0]!.date = '2026-10-29'
    await expect(store.save(next, loaded.revision)).rejects.toThrow(
      /раньше заявки/,
    )
    expect(await readFile(file, 'utf8')).toBe(original)
    next.materialRequests[0]!.date = '2026-10-25'
    next.materialRequests[0]!.note = 'Дополнение'
    expect((await store.save(next, loaded.revision)).status).toBe('saved')
    expect(await store.save(initial, loaded.revision)).toEqual({
      status: 'conflict',
    })
  })
})
