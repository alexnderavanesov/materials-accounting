import type {
  M15Allocation,
  M15Line,
  M15Reconciliation,
  M15Workspace,
} from './m15-reconciliation'
import { m15Precise, m15Remaining, m15Unit } from './m15-quantity'

export const sameM15Amount = (a: number, b: number) =>
  Number.isFinite(a) &&
  Number.isFinite(b) &&
  Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b))
const exceeds = (a: number, b: number) => a > b && !sameM15Amount(a, b)
export const m15LinkQuantity = (link: M15Allocation) =>
  link.documentQuantity ??
  m15Precise(link.quantity * (link.conversion?.factor ?? 1))
export function linkedM15(
  id: string,
  saved?: M15Reconciliation,
): M15Reconciliation {
  return saved?.mode === 'linked'
    ? structuredClone(saved)
    : {
        id,
        mode: 'linked',
        cipher: saved?.cipher,
        lines: saved?.lines.map((line) => ({ ...line })) ?? [],
        allocations: [],
      }
}
export function indexM15Links(records: readonly M15Reconciliation[] = []) {
  const byReceipt = new Map<
    string,
    Array<{ documentId: string; link: M15Allocation; line: M15Line }>
  >()
  const byLine = new Map<string, number>()
  const byReceiptTotal = new Map<string, number>()
  for (const record of records) {
    if (record.mode !== 'linked') continue
    const lines = new Map(record.lines.map((line) => [line.id, line]))
    for (const link of record.allocations) {
      const line = lines.get(link.lineId)
      if (!line) continue
      const entries = byReceipt.get(link.receiptId) ?? []
      entries.push({ documentId: record.id, link, line })
      byReceipt.set(link.receiptId, entries)
      byReceiptTotal.set(
        link.receiptId,
        m15Precise((byReceiptTotal.get(link.receiptId) ?? 0) + link.quantity),
      )
      const key = JSON.stringify([record.id, link.lineId])
      byLine.set(
        key,
        m15Precise((byLine.get(key) ?? 0) + m15LinkQuantity(link)),
      )
    }
  }
  return { byReceipt, byLine, byReceiptTotal }
}
export function validateLinkedM15Workspace(
  next: M15Workspace,
  previous?: M15Workspace | null,
) {
  const records = next.m15Reconciliations ?? []
  const receipts = new Map(
    next.materialReceipts.map((row) => [String(row.id), row]),
  )
  const requests = new Map(
    next.materialRequests.map((row) => [String(row.id), row]),
  )
  const requestByLine = new Map(
    next.materialRequests.map((row) => [String(row.projectLineId), row]),
  )
  const projectLines = new Map(next.lines?.map((row) => [String(row.id), row]))
  const documents = new Map(
    next.qualityWorkflow?.receiptDocuments?.map((doc) => [doc.id, doc]),
  )
  const totals = new Map<string, number>()
  for (const record of records) {
    if (record.mode !== 'linked') continue
    if (documents.get(record.id)?.kind !== 'm15')
      throw new Error('М-15 не найдена.')
    if (!record.cipher?.trim()) throw new Error('Выберите один шифр М-15.')
    if (!record.lines.length)
      throw new Error('Добавьте хотя бы один материал в М-15.')
    const lines = new Map(record.lines.map((line) => [line.id, line]))
    if (lines.size !== record.lines.length)
      throw new Error('Повторяются ID строк М-15.')
    const lineTotals = new Map<string, number>(),
      pairs = new Set<string>()
    for (const line of record.lines) {
      if (!line.projectLineId)
        throw new Error(
          `Выберите проектный материал для строки «${line.name}».`,
        )
      const projectLine = projectLines.get(line.projectLineId)
      const request = requestByLine.get(line.projectLineId)
      if (
        (!projectLine && !request) ||
        (projectLine?.cipher ?? request?.cipher) !== record.cipher
      )
        throw new Error(`Материал «${line.name}» не относится к шифру М-15.`)
      if (!Number.isFinite(line.quantity) || line.quantity <= 0)
        throw new Error('Количество по М-15 должно быть положительным.')
    }
    for (const link of record.allocations) {
      const receipt = receipts.get(link.receiptId),
        line = lines.get(link.lineId)
      if (!receipt || !line)
        throw new Error(
          'Связанное получение или строка М-15 удалены. Сначала исправьте связи.',
        )
      const request = requests.get(String(receipt.requestId))
      if (
        receipt.projectLineId !== line.projectLineId ||
        request?.cipher !== record.cipher
      )
        throw new Error(
          'Материал получения отсутствует в М-15 или относится к другому шифру.',
        )
      if (!Number.isFinite(link.quantity) || link.quantity <= 0)
        throw new Error('Укажите положительное количество связи с получением.')
      if (m15Unit(String(receipt.projectUnit)) !== m15Unit(link.receiptUnit))
        throw new Error('Единица получения изменилась. Обновите связь М-15.')
      const converted =
        m15Unit(String(receipt.projectUnit)) !== m15Unit(line.unit)
      if (
        converted &&
        (!link.conversion ||
          m15Unit(link.conversion.fromUnit) !==
            m15Unit(String(receipt.projectUnit)) ||
          m15Unit(link.conversion.toUnit) !== m15Unit(line.unit) ||
          !Number.isFinite(link.conversion.factor) ||
          link.conversion.factor <= 0)
      )
        throw new Error('Укажите пересчёт из единицы получения в единицу М-15.')
      const factor = converted ? link.conversion!.factor : 1
      if (
        !sameM15Amount(
          m15LinkQuantity(link),
          m15Precise(link.quantity * factor),
        )
      )
        throw new Error('Количество по М-15 не соответствует пересчёту единиц.')
      const pair = JSON.stringify([link.lineId, link.receiptId])
      if (pairs.has(pair))
        throw new Error('Получение повторно связано с той же строкой М-15.')
      pairs.add(pair)
      totals.set(
        link.receiptId,
        m15Precise((totals.get(link.receiptId) ?? 0) + link.quantity),
      )
      lineTotals.set(
        line.id,
        m15Precise((lineTotals.get(line.id) ?? 0) + m15LinkQuantity(link)),
      )
    }
    for (const line of record.lines)
      if (exceeds(lineTotals.get(line.id) ?? 0, line.quantity))
        throw new Error(
          `Связано больше, чем указано в М-15 для «${line.name}». Уменьшите количество связи.`,
        )
  }
  for (const [id, total] of totals)
    if (exceeds(total, Number(receipts.get(id)?.quantity)))
      throw new Error(
        'Это количество получения уже подтверждено другой М-15. Обновите доступный остаток.',
      )
  // Once a quantitative basis has been used for inspection, its coverage is reserved.
  // Historical single-id bases are retained as history, never converted into allocations.
  const previousLinked = new Set(
    previous?.m15Reconciliations
      ?.filter((row) => row.mode === 'linked')
      .map((row) => row.id),
  )
  const nextLinks = indexM15Links(records)
  const previousLinks = indexM15Links(previous?.m15Reconciliations)
  const used = new Map<
    string,
    { documentId: string; receiptId: string; quantity: number }
  >()
  for (const entry of next.qualityWorkflow?.cases ?? []) {
    if (entry.basis.kind !== 'm15' || !previousLinked.has(entry.basis.id))
      continue
    const caseAmounts = new Map<string, number>()
    for (const revision of entry.revisions) {
      if (!revision.zni.signedOn && revision !== entry.revisions.at(-1))
        continue
      for (const row of revision.zni.rows)
        caseAmounts.set(
          row.receiptId,
          Math.max(caseAmounts.get(row.receiptId) ?? 0, row.presented),
        )
    }
    for (const [receiptId, quantity] of caseAmounts) {
      const key = JSON.stringify([entry.basis.id, receiptId])
      used.set(key, {
        documentId: entry.basis.id,
        receiptId,
        quantity: m15Precise((used.get(key)?.quantity ?? 0) + quantity),
      })
    }
  }
  for (const item of used.values()) {
    const previousCovered = (previousLinks.byReceipt.get(item.receiptId) ?? [])
      .filter((link) => link.documentId === item.documentId)
      .reduce((sum, link) => m15Precise(sum + link.link.quantity), 0)
    const covered = (nextLinks.byReceipt.get(item.receiptId) ?? [])
      .filter((link) => link.documentId === item.documentId)
      .reduce((sum, link) => m15Precise(sum + link.link.quantity), 0)
    // Old inspections may predate quantitative links. Preserve their history
    // without inventing retroactive coverage; reserve only existing coverage.
    if (exceeds(Math.min(item.quantity, previousCovered), covered))
      throw new Error(
        'М-15 используется в ЗНИ. Сначала исправьте зависимые документы: подтверждённое количество нельзя уменьшить ниже предъявленного.',
      )
  }
  // Unchanged historical rows remain readable; new/edited receipts must have full documentary coverage.
  const oldReceipts = new Map(
    previous?.materialReceipts.map((row) => [String(row.id), row]),
  )
  const oldCoverage = previousLinks.byReceiptTotal
  const linkedIds = new Set(
    records.filter((row) => row.mode === 'linked').map((row) => row.id),
  )
  for (const receipt of next.materialReceipts) {
    const id = String(receipt.id),
      total = totals.get(id) ?? 0
    const old = oldReceipts.get(id)
    const changed =
      !old ||
      JSON.stringify(old) !== JSON.stringify(receipt) ||
      !sameM15Amount(oldCoverage.get(id) ?? 0, total)
    if (!changed || receipt.appDocumentId) continue
    if (
      !previous &&
      receipt.m15DocumentId &&
      !linkedIds.has(String(receipt.m15DocumentId)) &&
      !total
    )
      continue
    if (!sameM15Amount(Number(receipt.quantity), total)) {
      // Legacy references are preserved only for existing untouched receipts.
      if (
        old &&
        !!receipt.m15DocumentId &&
        !(oldCoverage.get(id) ?? 0) &&
        !linkedIds.has(String(receipt.m15DocumentId)) &&
        JSON.stringify(old) === JSON.stringify(receipt) &&
        !total
      )
        continue
      throw new Error(
        'Без АПП всё количество получения должно быть подтверждено М-15. Добавьте АПП для остатка, ожидающего М-15.',
      )
    }
  }
}
export function m15Uncovered(quantity: number, linked: number) {
  return Math.max(0, m15Remaining(quantity, linked))
}

/** Convert a receipt form's selected M-15 into explicit links. Never invent composition. */
export function prepareReceiptM15<
  T extends {
    id: string
    quantity: number
    projectLineId: string
    requestId: string
    projectUnit: string
    actualName: string
    m15DocumentId?: string
    altUnit?: string
    altUnitFactor?: number | null
  },
>(entries: T[], workspace: M15Workspace, source: readonly M15Reconciliation[]) {
  const records = source.map((record) => ({
    ...record,
    allocations: [...record.allocations],
  }))
  const requests = new Map(
    workspace.materialRequests.map((row) => [String(row.id), row]),
  )
  const totals = indexM15Links(records)
  for (const receipt of entries) {
    if (!receipt.m15DocumentId) continue
    const record = records.find((row) => row.id === receipt.m15DocumentId)
    if (!record || record.mode !== 'linked')
      throw new Error(
        'Сначала заполните шифр и состав М-15. Один номер накладной не подтверждает получение.',
      )
    if (record.cipher !== requests.get(receipt.requestId)?.cipher)
      throw new Error('М-15 относится к другому шифру.')
    const matches = record.lines.filter(
      (line) => line.projectLineId === receipt.projectLineId,
    )
    if (!matches.length)
      throw new Error(`Материала «${receipt.actualName}» нет в выбранной М-15.`)
    if (record.allocations.some((link) => link.receiptId === receipt.id))
      continue
    // Ambiguous composition is resolved explicitly on the coverage step.
    if (matches.length > 1) continue
    const line = matches[0]!
    const factor =
      m15Unit(receipt.projectUnit) === m15Unit(line.unit)
        ? 1
        : m15Unit(receipt.altUnit ?? '') === m15Unit(line.unit)
          ? receipt.altUnitFactor
          : null
    if (!factor || factor <= 0) continue
    const key = JSON.stringify([record.id, line.id])
    const available = Math.min(
      m15Uncovered(
        receipt.quantity,
        totals.byReceiptTotal.get(receipt.id) ?? 0,
      ),
      m15Uncovered(line.quantity, totals.byLine.get(key) ?? 0) / factor,
    )
    if (available <= 0) continue
    record.allocations.push({
      lineId: line.id,
      receiptId: receipt.id,
      quantity: m15Precise(available),
      receiptQuantity: receipt.quantity,
      receiptUnit: receipt.projectUnit,
      receiptName: receipt.actualName,
      receiptRequestId: receipt.requestId,
      documentQuantity: m15Precise(available * factor),
      ...(factor !== 1 || m15Unit(receipt.projectUnit) !== m15Unit(line.unit)
        ? {
            conversion: {
              fromUnit: receipt.projectUnit,
              toUnit: line.unit,
              factor,
            },
          }
        : {}),
    })
    totals.byReceiptTotal.set(
      receipt.id,
      m15Precise((totals.byReceiptTotal.get(receipt.id) ?? 0) + available),
    )
    totals.byLine.set(
      key,
      m15Precise((totals.byLine.get(key) ?? 0) + available * factor),
    )
  }
  return {
    records,
    entries: entries.map(({ m15DocumentId: _legacy, ...receipt }) => receipt),
  }
}
