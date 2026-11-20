import { FolderOpen } from 'lucide-react'
import { RowActionButton } from '#/components/ui/row-action'
import { Button } from '#/components/ui/button'
import { OperationsGrid } from './operations-grid'
import {
  documentsForReceipt,
  indexReceiptDocuments,
  receiptDocumentLabel,
} from './receipt-documents'
import {
  customerReturnReason,
  rejectedReturnAllocations,
} from './quality-workflow'
import type { QualityWorkflow } from './quality-workflow'
import { getOperationAlternative, getOperationConversion } from './domain'
import {
  matchesOperationMaterial,
  operationMaterial,
} from './operation-list-view'
import type { OperationListView } from './operation-list-view'
import type { SubobjectMaterialMetric } from './types'
import type { SiteReturnsWorkspace } from './site-returns'
import type { ReturnsWorkspace } from './returns-workspace'
import { formatCalendarDate } from './calendar-date'

type Props = {
  workflow?: QualityWorkflow
  receipts: Parameters<typeof ReturnsWorkspace>[0]['receipts']
  issues: Parameters<typeof SiteReturnsWorkspace>[0]['issues']
  requests: Parameters<typeof ReturnsWorkspace>[0]['requests']
  lines: SubobjectMaterialMetric[]
  search: string
  view: OperationListView
  onCreate: () => void
  onOpen: (tab: 'receipts' | 'issues', id: string) => void
}
export function ReturnsTable({
  workflow,
  receipts,
  issues,
  requests,
  lines,
  search,
  view,
  onCreate,
  onOpen,
}: Props) {
  const receiptById = new Map(receipts.map((row) => [row.id, row]))
  const requestById = new Map(requests.map((row) => [row.id, row]))
  const lineById = new Map(lines.map((row) => [row.id, row]))
  const caseById = new Map(workflow?.cases.map((row) => [row.id, row]))
  const documentIndex = indexReceiptDocuments(workflow)
  const allocation = workflow ? rejectedReturnAllocations(workflow) : new Map()
  function context(receiptId: string, projectLineId?: string) {
    const receipt = receiptById.get(receiptId),
      line = lineById.get(projectLineId ?? receipt?.projectLineId ?? ''),
      request = requestById.get(receipt?.requestId ?? '')
    return {
      receipt,
      line,
      request: request?.number ?? '',
      name: receipt?.actualName || line?.projectMaterialName || 'Материал',
      unit: receipt?.projectUnit ?? line?.unit ?? '',
      documents: receipt
        ? documentsForReceipt(receipt, workflow, documentIndex)
            .map(receiptDocumentLabel)
            .join('; ')
        : '',
      ...operationMaterial(line, request),
    }
  }
  const customer = (workflow?.customerReturns ?? []).map((item) => {
    const ctx = context(item.receiptId, item.projectLineId)
    const alternative = getOperationAlternative(
      item.quantity,
      getOperationConversion(ctx.line, ctx.unit, ctx.receipt),
      ctx.receipt,
    )
    const entry = item.caseId ? caseById.get(item.caseId) : undefined
    return {
      ...ctx,
      id: `customer:${item.id}`,
      date: item.date,
      document: item.documentNumber,
      direction: 'Заказчику',
      quantity: item.quantity,
      altQuantity: alternative.altQuantity,
      altUnit: alternative.altUnit,
      reason: customerReturnReason(item, entry, allocation.get(item.id)),
      zni:
        entry?.revisions.find((rev) => rev.revision === item.revision)?.zni
          .number ?? '',
      sourceDocument: '',
      receiver: 'Заказчик',
      note: item.note,
      restored: item.kind === 'surplus' ? 0 : item.quantity,
      sourceTab: 'receipts' as const,
      sourceId: item.receiptId,
    }
  })
  const site = issues.flatMap((issue) =>
    (issue.siteReturns ?? []).map((item) => {
      const ctx = context(issue.receiptId, issue.projectLineId)
      const alternative = getOperationAlternative(
        item.quantity,
        getOperationConversion(ctx.line, ctx.unit, issue),
        issue,
      )
      return {
        ...ctx,
        id: `site:${item.id}`,
        date: item.date,
        document: item.document,
        direction: 'С площадки',
        quantity: item.quantity,
        altQuantity: alternative.altQuantity,
        altUnit: alternative.altUnit,
        reason:
          item.condition === 'good'
            ? 'Без повреждений'
            : 'Требует проверки / повреждён',
        zni: '',
        sourceDocument: issue.document,
        receiver: issue.receiver,
        note: item.note,
        restored: 0,
        sourceTab: 'issues' as const,
        sourceId: issue.id,
      }
    }),
  )
  const query = search.trim().toLocaleLowerCase('ru')
  const rows = [...customer, ...site]
    .filter(
      (row) =>
        matchesOperationMaterial(row, view) &&
        [
          row.name,
          row.cipher,
          row.materialType,
          row.document,
          row.date,
          formatCalendarDate(row.date),
          row.direction,
          row.request,
          row.documents,
          row.zni,
          row.sourceDocument,
          row.receiver,
          row.note,
        ]
          .join(' ')
          .toLocaleLowerCase('ru')
          .includes(query),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div className="operation-table-fill min-w-0 gap-2 p-2">
      <div className="flex justify-end">
        <Button onClick={onCreate}>Оформить возврат</Button>
      </div>
      <OperationsGrid
        id="returns-flat"
        fillHeight
        label="Все возвраты"
        rows={rows}
        rowId={(row) => row.id}
        pagination
        columns={[
          {
            id: 'name',
            title: 'Материал',
            value: (row) => row.name,
            width: 300,
          },
          { id: 'date', date: true, title: 'Дата', value: (row) => row.date },
          { id: 'document', title: 'Документ', value: (row) => row.document },
          { id: 'cipher', title: 'Шифр', value: (row) => row.cipher },
          {
            id: 'direction',
            title: 'Направление',
            value: (row) => row.direction,
          },
          {
            id: 'quantity',
            title: 'Возвращено',
            value: (row) => row.quantity,
            numeric: true,
          },
          { id: 'unit', title: 'Единица', value: (row) => row.unit },
          {
            id: 'altQuantity',
            title: 'Доп. количество',
            value: (row) => row.altQuantity,
            numeric: true,
          },
          { id: 'altUnit', title: 'Доп. единица', value: (row) => row.altUnit },
          {
            id: 'restored',
            title: 'Снова к получению',
            value: (row) => row.restored,
            numeric: true,
          },
          {
            id: 'reason',
            title: 'Причина / состояние',
            value: (row) => row.reason,
          },
          { id: 'request', title: 'Заявка', value: (row) => row.request },
          {
            id: 'documents',
            title: 'АПП / М-15',
            value: (row) => row.documents,
          },
          { id: 'zni', title: 'ЗНИ', value: (row) => row.zni },
          {
            id: 'sourceDocument',
            title: 'Исходная выдача',
            value: (row) => row.sourceDocument,
          },
          {
            id: 'receiver',
            title: 'Получатель / направление',
            value: (row) => row.receiver,
          },
          { id: 'note', title: 'Примечание', value: (row) => row.note },
          {
            id: 'actions',
            title: 'Действия',
            value: () => '',
            actions: true,
            width: 96,
            render: (row) => (
              <RowActionButton
                iconOnly
                aria-label="Открыть основание"
                onClick={() => onOpen(row.sourceTab, row.sourceId)}
              >
                <FolderOpen size={14} aria-hidden="true" />
              </RowActionButton>
            ),
          },
        ]}
      />
    </div>
  )
}
