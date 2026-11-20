import { getMaterialIdentityKey } from './project-material-data'
import {
  customerReturnTotals,
  receivedByRequest,
  rejectedStockTotals,
} from './quality-workflow'
import { receiptQuantityWithinRequest } from './receipt-overage'
import type { SubobjectMaterialMetric } from './types'
import { availableAssignedStock, stockAssignments } from './stock-assignments'
import type { AssignmentWorkspace } from './stock-assignments'
import {
  cancelledRequestQuantity,
  effectiveRequestQuantity,
  preciseProjectQuantity as precise,
  projectChangeSchema,
  projectPositionSchema,
  requestCancellationSchema,
  stockAssignmentKey,
  stockTransferSchema,
} from './project-change-types'
import type {
  ProjectAccounting,
  ProjectChange,
  ProjectPosition,
  RequestCancellation,
  StockTransfer,
} from './project-change-types'

export type ProjectRequest = {
  id: string
  projectLineId: string
  quantity: number
  date: string
  number?: string
  projectCancellations?: RequestCancellation[]
}
export type ProjectChangeWorkspace = ProjectAccounting &
  AssignmentWorkspace & {
    lines: SubobjectMaterialMetric[]
    materialRequests: ProjectRequest[]
    materialReceipts: Array<
      AssignmentWorkspace['materialReceipts'][number] & { requestId: string }
    >
  }
function fail(message: string): never {
  throw new Error(message)
}
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
export const cipherKey = (project: string, cipher: string) =>
  JSON.stringify([project, cipher])
export function projectPosition(
  line: SubobjectMaterialMetric,
): ProjectPosition {
  const {
    id,
    project,
    cipher,
    category,
    projectMaterialName,
    materialId,
    materialType,
    normativeDocument,
    material,
    unit,
    plannedQuantity,
    unitWeight,
    alternativeUnit,
    alternativeUnitFactor,
  } = line
  return projectPositionSchema.parse({
    id,
    project,
    cipher,
    category,
    projectMaterialName: projectMaterialName || material,
    materialId,
    materialType,
    normativeDocument,
    material,
    unit,
    plannedQuantity,
    unitWeight,
    alternativeUnit,
    alternativeUnitFactor,
  })
}
export function positionLine(
  position: ProjectPosition,
): SubobjectMaterialMetric {
  return {
    ...position,
    requested: 0,
    received: 0,
    qcPending: 0,
    accepted: 0,
    issued: 0,
    returned: 0,
    writtenOff: 0,
  }
}
export function latestProjectChange(
  changes: ProjectChange[] | undefined,
  project: string,
  cipher: string,
) {
  return changes
    ?.filter((item) => item.project === project && item.cipher === cipher)
    .at(-1)
}
export function currentChangeNumber(
  changes: ProjectChange[] | undefined,
  project: string,
  cipher: string,
) {
  return (
    changes
      ?.filter(
        (item) =>
          item.project === project &&
          item.cipher === cipher &&
          item.kind === 'revision',
      )
      .at(-1)?.number ?? ''
  )
}
export function projectConsequences(workspace: ProjectChangeWorkspace) {
  const assignments = stockAssignments(workspace)
  const rejected = rejectedStockTotals(workspace.qualityWorkflow)
  const totals = new Map<
    string,
    {
      retained: number
      rejected: number
      issued: number
      stock: number
      approved: number
    }
  >()
  for (const owner of assignments.values()) {
    const row = totals.get(owner.projectLineId) ?? {
      retained: 0,
      rejected: 0,
      issued: 0,
      stock: 0,
      approved: 0,
    }
    row.retained = precise(row.retained + owner.retained)
    row.issued = precise(row.issued + owner.issued)
    row.stock = precise(row.stock + owner.stock)
    row.approved = precise(
      row.approved +
        Math.max(0, Math.min(owner.stock - owner.quarantined, owner.approved)),
    )
    totals.set(owner.projectLineId, row)
  }
  for (const receipt of workspace.materialReceipts) {
    const row = totals.get(receipt.projectLineId)
    if (row)
      row.rejected = precise(row.rejected + (rejected.get(receipt.id) ?? 0))
  }
  const received = receivedByRequest(
    workspace.materialReceipts,
    workspace.qualityWorkflow,
  )
  const outstanding = new Map<string, number>()
  for (const request of workspace.materialRequests)
    outstanding.set(
      request.projectLineId,
      precise(
        (outstanding.get(request.projectLineId) ?? 0) +
          Math.max(
            0,
            effectiveRequestQuantity(request) - (received.get(request.id) ?? 0),
          ),
      ),
    )
  const heads = new Map(
    (workspace.projectChanges ?? []).map((change) => [
      cipherKey(change.project, change.cipher),
      change,
    ]),
  )
  return workspace.lines.map((line) => {
    const total = totals.get(line.id!) ?? {
      retained: 0,
      rejected: 0,
      issued: 0,
      stock: 0,
      approved: 0,
    }
    const surplus = Math.max(
      0,
      precise(total.retained - total.rejected - line.plannedQuantity),
    )
    const need = Math.max(0, precise(line.plannedQuantity - total.retained))
    return {
      line,
      ...total,
      surplus,
      need,
      outstanding: outstanding.get(line.id!) ?? 0,
      toRequest: Math.max(0, precise(need - (outstanding.get(line.id!) ?? 0))),
      fromSite: Math.max(
        0,
        precise(surplus - Math.max(0, total.stock - total.rejected)),
      ),
      change: heads.get(cipherKey(line.project, line.cipher)),
    }
  })
}

/** Persist reductions as append-only entries. No old document quantity is rewritten. */
export function reconcileProjectRequests<T extends ProjectRequest>(
  workspace: Omit<ProjectChangeWorkspace, 'materialRequests'> & {
    materialRequests: T[]
  },
  date: string,
): T[] {
  const consequences = new Map(
    projectConsequences(workspace).map((row) => [row.line.id, row]),
  )
  const received = receivedByRequest(
    workspace.materialReceipts,
    workspace.qualityWorkflow,
  )
  const byLine = new Map<string, T[]>()
  for (const request of workspace.materialRequests) {
    const rows = byLine.get(request.projectLineId) ?? []
    rows.push(request)
    byLine.set(request.projectLineId, rows)
  }
  const latestTransfers = new Map(
    (workspace.stockTransfers ?? []).map((item) => [
      item.toProjectLineId,
      item,
    ]),
  )
  const updated = new Map<string, T>()
  for (const [lineId, requests] of byLine) {
    const row = consequences.get(lineId)
    const transfer = latestTransfers.get(lineId)
    if (!row || (!row.change && !transfer)) continue
    let excess = Math.max(0, precise(row.outstanding - row.need))
    if (!excess) continue
    const useTransfer =
      transfer && (!row.change || transfer.date >= row.change.date)
    for (const request of [...requests].sort(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
    )) {
      const amount = Math.min(
        excess,
        Math.max(
          0,
          precise(
            effectiveRequestQuantity(request) - (received.get(request.id) ?? 0),
          ),
        ),
      )
      if (!amount) continue
      const cancellation: RequestCancellation = {
        id: crypto.randomUUID(),
        quantity: amount,
        date,
        basisId: useTransfer ? transfer.id : row.change!.id,
        basisKind: useTransfer ? 'transfer' : 'project-change',
      }
      updated.set(request.id, {
        ...request,
        projectCancellations: [
          ...(request.projectCancellations ?? []),
          cancellation,
        ],
      })
      excess = precise(excess - amount)
    }
  }
  return workspace.materialRequests.map((row) => updated.get(row.id) ?? row)
}
export type ProjectChangeInput = {
  project: string
  cipher: string
  kind: 'revision' | 'correction'
  number: string
  date: string
  reason: string
  author: string
  positions: ProjectPosition[]
  replacements?: Record<string, string>
}
export function prepareProjectChange<T extends ProjectChangeWorkspace>(
  workspace: T,
  input: ProjectChangeInput,
): T {
  const existing = workspace.lines.filter(
    (line) => line.project === input.project && line.cipher === input.cipher,
  )
  const positions = input.positions.map((position) =>
    projectPositionSchema.parse(position),
  )
  if (new Set(positions.map((row) => row.id)).size !== positions.length)
    fail('Повторяющиеся позиции изменения.')
  if (
    positions.some(
      (row) => row.project !== input.project || row.cipher !== input.cipher,
    )
  )
    fail('Одно ИЗМ относится к одному шифру.')
  const nextPositions = new Map(positions.map((row) => [row.id, row]))
  for (const old of existing)
    if (!nextPositions.has(old.id!))
      nextPositions.set(old.id!, {
        ...projectPosition(old),
        plannedQuantity: 0,
      })
  const previousById = new Map(existing.map((row) => [row.id, row]))
  const items: ProjectChange['items'] = [...nextPositions.values()].flatMap(
    (after) => {
      const old = previousById.get(after.id)
      const before = old ? projectPosition(old) : null
      return same(before, after)
        ? []
        : [
            {
              id: crypto.randomUUID(),
              before,
              after,
              ...(input.replacements?.[after.id]
                ? { replacesLineId: input.replacements[after.id] }
                : {}),
            },
          ]
    },
  )
  if (!items.length) fail('Состав и количества не изменились.')
  const changes = [...(workspace.projectChanges ?? [])]
  let previous = latestProjectChange(changes, input.project, input.cipher)
  if (!previous) {
    previous = projectChangeSchema.parse({
      id: crypto.randomUUID(),
      project: input.project,
      cipher: input.cipher,
      kind: 'baseline',
      number: '',
      date: input.date,
      author: input.author,
      reason: 'Исходный состав перед первым изменением',
      previousId: null,
      items: existing.map((row) => ({
        id: crypto.randomUUID(),
        before: null,
        after: projectPosition(row),
      })),
    })
    changes.push(previous)
  }
  const {
    positions: _positions,
    replacements: _replacements,
    ...metadata
  } = input
  const change = projectChangeSchema.parse({
    id: crypto.randomUUID(),
    ...metadata,
    previousId: previous.id,
    items,
  })
  // Input-only properties are omitted from the persistent event.
  changes.push(change)
  const affectedIds = new Set(existing.map((row) => row.id))
  const next = {
    ...workspace,
    projectChanges: changes,
    lines: [
      ...workspace.lines.filter((row) => !affectedIds.has(row.id)),
      ...[...nextPositions.values()].map((position) => ({
        ...positionLine(position),
        ...(previousById.get(position.id) ?? {}),
        ...position,
        changeNumber:
          input.kind === 'revision'
            ? input.number
            : previousById.get(position.id)?.changeNumber,
      })),
    ],
  }
  next.materialRequests = reconcileProjectRequests(next, input.date)
  validateProjectChanges(next, workspace)
  return next
}

export function prepareStockTransfer<T extends ProjectChangeWorkspace>(
  workspace: T,
  input: Omit<StockTransfer, 'id' | 'sequence'>,
): T {
  const transfer = stockTransferSchema.parse({
    ...input,
    id: crypto.randomUUID(),
    sequence:
      Math.max(
        0,
        ...(workspace.stockTransfers ?? [])
          .filter((row) => row.receiptId === input.receiptId)
          .map((row) => row.sequence),
      ) + 1,
  })
  const next = {
    ...workspace,
    stockTransfers: [...(workspace.stockTransfers ?? []), transfer],
  }
  next.materialRequests = reconcileProjectRequests(next, transfer.date)
  validateProjectChanges(next, workspace)
  return next
}

export function validateProjectChanges(
  next: ProjectChangeWorkspace,
  previous?: ProjectChangeWorkspace | null,
) {
  const changes = next.projectChanges ?? [],
    transfers = next.stockTransfers ?? []
  if (
    !changes.length &&
    !transfers.length &&
    !(previous?.projectChanges?.length || previous?.stockTransfers?.length) &&
    !next.materialRequests.some((row) => row.projectCancellations?.length) &&
    !next.qualityWorkflow?.customerReturns?.some(
      (row) => row.projectLineId || row.projectChangeId,
    )
  )
    return
  const ids = new Set<string>()
  for (const item of [...changes, ...transfers]) {
    if (ids.has(item.id)) fail('Повторяющийся ID изменения/переноса.')
    ids.add(item.id)
  }
  const lines = new Map(next.lines.map((row) => [row.id, row]))
  const oldLines = new Map(previous?.lines.map((row) => [row.id, row]))
  const changesById = new Map(changes.map((row) => [row.id, row]))
  const transfersById = new Map(transfers.map((row) => [row.id, row]))
  const firstNewItems = new Map<string, ProjectChange['items'][number]>()
  const oldChanges = new Map(
    previous?.projectChanges?.map((row) => [row.id, row]),
  )
  const oldTransfers = new Map(
    previous?.stockTransfers?.map((row) => [row.id, row]),
  )
  for (const old of previous?.projectChanges ?? [])
    if (!same(changesById.get(old.id), old))
      fail('Сохранённая история ИЗМ защищена от изменения и удаления.')
  for (const old of previous?.stockTransfers ?? [])
    if (!same(transfersById.get(old.id), old))
      fail('Фактический перенос защищён от изменения и удаления.')
  const heads = new Map<string, ProjectChange>()
  const snapshots = new Map<string, ProjectPosition>()
  const numbers = new Set<string>()
  const newChangedIds = new Set<string>()
  for (const raw of changes) {
    const change = projectChangeSchema.parse(raw)
    const key = cipherKey(change.project, change.cipher)
    const head = heads.get(key)
    if (
      change.previousId !== (head?.id ?? null) ||
      (change.kind === 'baseline') !== !head
    )
      fail('История шифра изменилась. Обновите предпросмотр ИЗМ.')
    if (change.kind === 'revision') {
      if (!change.number.trim()) fail('Укажите номер ИЗМ.')
      const numberKey = JSON.stringify([
        key,
        change.number.trim().toLocaleLowerCase('ru'),
      ])
      if (numbers.has(numberKey)) fail('Номер ИЗМ уже существует в этом шифре.')
      numbers.add(numberKey)
    } else if (change.number) fail('Номер указывается только для ИЗМ.')
    if (change.kind === 'baseline' && !oldChanges.has(change.id) && previous) {
      const expected = previous.lines.filter(
        (row) => row.project === change.project && row.cipher === change.cipher,
      )
      const baselineIds = new Set(change.items.map((item) => item.after.id))
      if (
        expected.length !== change.items.length ||
        expected.some((row) => !baselineIds.has(row.id!))
      )
        fail('Исходный состав должен содержать все позиции шифра.')
    }
    const itemIds = new Set<string>()
    for (const item of change.items) {
      const after = item.after
      if (itemIds.has(after.id)) fail('Позиция повторяется в одном изменении.')
      itemIds.add(after.id)
      if (
        after.project !== change.project ||
        after.cipher !== change.cipher ||
        (item.before && item.before.id !== after.id)
      )
        fail('Некорректная принадлежность позиции ИЗМ.')
      if (
        change.kind !== 'baseline' &&
        !same(item.before, snapshots.get(after.id) ?? null)
      )
        fail('Исходная позиция изменилась. Обновите предпросмотр.')
      if (!oldChanges.has(change.id) && previous) {
        if (change.kind === 'baseline') {
          const old = oldLines.get(after.id)
          if (!old || !same(projectPosition(old), after))
            fail('Исходный состав не совпадает с сохранённой базой.')
        } else {
          newChangedIds.add(after.id)
          if (!firstNewItems.has(after.id)) firstNewItems.set(after.id, item)
        }
        if (
          item.before &&
          change.kind === 'revision' &&
          getMaterialIdentityKey(positionLine(item.before)) !==
            getMaterialIdentityKey(positionLine(after))
        )
          fail(
            'Изменённый материал оформляется отдельной позицией со связью замены.',
          )
      }
      if (item.replacesLineId) {
        const original =
          oldLines.get(item.replacesLineId) ?? lines.get(item.replacesLineId)
        if (
          !original ||
          original.project !== change.project ||
          original.cipher !== change.cipher ||
          original.id === after.id
        )
          fail('Выберите исходную позицию замены в том же шифре.')
      }
      snapshots.set(after.id, after)
    }
    heads.set(key, change)
  }
  for (const [id, snapshot] of snapshots) {
    const line = lines.get(id)
    if (!line || !same(projectPosition(line), snapshot))
      fail('Измените проект через «Оформить ИЗМ» или «Исправить ошибку».')
  }
  for (const line of next.lines)
    if (
      heads.has(cipherKey(line.project, line.cipher)) &&
      !snapshots.has(line.id!)
    )
      fail('Добавьте позицию через ИЗМ или исправление ошибки.')
  if (previous)
    for (const id of newChangedIds) {
      const old = oldLines.get(id)
      const first = firstNewItems.get(id)
      if (old && (!first?.before || !same(projectPosition(old), first.before)))
        fail('Проект изменён другим пользователем. Обновите предпросмотр.')
    }
  const identityGroups = new Map<string, string[]>()
  for (const line of next.lines) {
    const key = JSON.stringify([
      line.project,
      line.cipher,
      getMaterialIdentityKey(line),
    ])
    const entries = identityGroups.get(key) ?? []
    entries.push(line.id!)
    identityGroups.set(key, entries)
  }
  for (const entries of identityGroups.values())
    if (
      entries.length > 1 &&
      entries.some((id) => newChangedIds.has(id) && !oldLines.has(id))
    )
      fail(
        'Такой материал уже есть в шифре. Измените количество существующей позиции; для замены задайте новые характеристики.',
      )
  const receiptById = new Map(next.materialReceipts.map((row) => [row.id, row]))
  let transferBaseline = {
    ...next,
    stockTransfers: previous ? (previous.stockTransfers ?? []) : transfers,
  }
  for (const raw of transfers) {
    const transfer = stockTransferSchema.parse(raw)
    const from = lines.get(transfer.fromProjectLineId),
      to = lines.get(transfer.toProjectLineId)
    const receipt = receiptById.get(transfer.receiptId)
    if (
      !from ||
      !to ||
      !receipt ||
      from.id === to.id ||
      from.project !== to.project ||
      from.cipher === to.cipher ||
      getMaterialIdentityKey(from) !== getMaterialIdentityKey(to)
    )
      fail(
        'Перенос разрешён между разными шифрами одного проекта для одинакового материала и единицы.',
      )
    const change = changesById.get(transfer.projectChangeId)
    if (
      !change ||
      change.project !== from.project ||
      change.cipher !== from.cipher ||
      transfer.date < change.date
    )
      fail(
        'Укажите действительное основание ИЗМ и дату переноса не раньше него.',
      )
    if (oldTransfers.has(transfer.id) || !previous) continue
    if (
      transfer.sequence !==
      Math.max(
        0,
        ...transferBaseline.stockTransfers
          .filter((row) => row.receiptId === transfer.receiptId)
          .map((row) => row.sequence),
      ) +
        1
    )
      fail('Партия уже изменена. Обновите перенос.')
    const consequences = new Map(
      projectConsequences(transferBaseline).map((row) => [row.line.id, row]),
    )
    const available =
      availableAssignedStock(transferBaseline, transfer.date).get(
        stockAssignmentKey(transfer.receiptId, transfer.fromProjectLineId),
      )?.availableApproved ?? 0
    if (
      transfer.quantity >
      Math.min(
        available,
        consequences.get(from.id)?.surplus ?? 0,
        consequences.get(to.id)?.need ?? 0,
      )
    )
      fail(
        'Перенос превышает свободный принятый излишек или потребность принимающего шифра. Обновите предпросмотр.',
      )
    transferBaseline = {
      ...transferBaseline,
      stockTransfers: [...transferBaseline.stockTransfers, transfer],
    }
  }
  const ownedReturns =
    next.qualityWorkflow?.customerReturns?.filter((row) => row.projectLineId) ??
    []
  if (transfers.length || ownedReturns.length) {
    const transferredReceipts = new Set(
      [...transfers, ...ownedReturns].map((row) => row.receiptId),
    )
    stockAssignments(
      {
        ...next,
        materialReceipts: next.materialReceipts.filter((row) =>
          transferredReceipts.has(row.id),
        ),
        materialIssues: next.materialIssues.filter((row) =>
          transferredReceipts.has(row.receiptId),
        ),
      },
      undefined,
      true,
    )
  }
  const previousRequests = new Map(
    previous?.materialRequests.map((row) => [row.id, row]),
  )
  const rejectedReturns = customerReturnTotals(next.qualityWorkflow, 'rejected')
  const receiptEntries: Array<
    ProjectChangeWorkspace['materialReceipts'][number]
  > = next.materialReceipts
  const received = receivedByRequest(
    receiptEntries.map((receipt) => ({
      ...receipt,
      quantity: receiptQuantityWithinRequest(
        receipt,
        rejectedReturns.get(receipt.id),
      ),
    })),
  )
  for (const request of next.materialRequests) {
    const cancellations = (request.projectCancellations ?? []).map((row) =>
      requestCancellationSchema.parse(row),
    )
    const old = previousRequests.get(request.id)
    for (const entry of old?.projectCancellations ?? [])
      if (
        !same(
          cancellations.find((row) => row.id === entry.id),
          entry,
        )
      )
        fail('История сокращения заявки защищена от изменения.')
    if (
      new Set(cancellations.map((row) => row.id)).size !== cancellations.length
    )
      fail('Повторяющееся сокращение заявки.')
    if (cancelledRequestQuantity(request) > request.quantity)
      fail('Сокращение превышает исходное количество заявки.')
    if (
      cancellations.length &&
      (received.get(request.id) ?? 0) > effectiveRequestQuantity(request)
    )
      fail(
        'Получение превышает действующее количество заявки после сокращения.',
      )
    for (const entry of cancellations) {
      const basis =
        entry.basisKind === 'project-change'
          ? changesById.get(entry.basisId)
          : transfersById.get(entry.basisId)
      const line = lines.get(request.projectLineId)
      if (
        !basis ||
        !line ||
        entry.date < basis.date ||
        (entry.basisKind === 'project-change'
          ? (basis as ProjectChange).cipher !== line.cipher ||
            (basis as ProjectChange).project !== line.project
          : (basis as StockTransfer).toProjectLineId !== line.id)
      )
        fail('Некорректное основание сокращения заявки.')
    }
  }
  const nextRequests = new Map(
    next.materialRequests.map((row) => [row.id, row]),
  )
  for (const old of previous?.materialRequests ?? [])
    if (old.projectCancellations?.length && !nextRequests.has(old.id))
      fail('Нельзя удалить заявку с историей сокращений.')
  if (previous) {
    const beforeCancellations = next.materialRequests.map((row) => ({
      ...row,
      projectCancellations: previousRequests.get(row.id)?.projectCancellations,
    }))
    const expected = reconcileProjectRequests(
      { ...next, materialRequests: beforeCancellations },
      '9999-12-31',
    )
    for (const row of expected)
      if (
        cancelledRequestQuantity(row) !==
        cancelledRequestQuantity(nextRequests.get(row.id)!)
      )
        fail(
          'Сокращение ожидания не соответствует текущей потребности. Обновите предпросмотр ИЗМ.',
        )
  }
  const previousReturnIds = new Set(
    previous?.qualityWorkflow?.customerReturns?.map((row) => row.id),
  )
  const additions = (next.qualityWorkflow?.customerReturns ?? []).filter(
    (row) => row.projectChangeId && !previousReturnIds.has(row.id),
  )
  if (previous && additions.length) {
    const newIds = new Set(additions.map((row) => row.id))
    const baseline = {
      ...next,
      qualityWorkflow: {
        ...next.qualityWorkflow!,
        customerReturns: next.qualityWorkflow!.customerReturns!.filter(
          (row) => !newIds.has(row.id),
        ),
      },
    }
    const surplus = new Map(
      projectConsequences(baseline).map((row) => [row.line.id, row.surplus]),
    )
    for (const back of additions) {
      const lineId =
        back.projectLineId ?? receiptById.get(back.receiptId)?.projectLineId
      const available = surplus.get(lineId) ?? 0
      if (back.quantity > available)
        fail('Возврат по ИЗМ превышает текущий излишек шифра. Обновите список.')
      surplus.set(lineId, precise(available - back.quantity))
    }
  }
  for (const back of next.qualityWorkflow?.customerReturns ?? [])
    if (back.projectChangeId) {
      const change = changesById.get(back.projectChangeId)
      const line = lines.get(
        back.projectLineId ??
          receiptById.get(back.receiptId)?.projectLineId ??
          '',
      )
      if (
        !change ||
        !line ||
        change.project !== line.project ||
        change.cipher !== line.cipher ||
        back.date < change.date ||
        back.kind !== 'surplus' ||
        !back.projectChangeItemId ||
        !change.items.some(
          (row) =>
            row.id === back.projectChangeItemId && row.after.id === line.id,
        )
      )
        fail('Некорректная связь возврата с позицией ИЗМ.')
    }
}

/** Boundary adapter: snapshot envelopes keep legacy operation records open-ended. */
export function validateProjectAccounting(next: unknown, previous?: unknown) {
  validateProjectChanges(
    next as ProjectChangeWorkspace,
    previous as ProjectChangeWorkspace | undefined,
  )
}
