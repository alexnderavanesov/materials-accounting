import { formatCalendarDate, localDateInputValue } from './calendar-date'
import { RowActionButton, RowActions } from '#/components/ui/row-action'
import { lazy, Suspense, useMemo, useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Plus, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AppSelect } from '#/components/ui/app-select'
import { OperationsGrid } from './operations-grid'
import {
  OperationDisplayProvider,
  useOperationDisplay,
} from './operation-display'
import { normalizeOperationSearch } from './operation-list-view'
import { receiptDocumentLabel } from './receipt-documents'
import type { ReceiptDocument } from './receipt-documents'
import { buildM15Accounting } from './m15-independent'
import { M15DocumentPreview } from './m15-document-preview'
import type { M15Workspace, M15Reconciliation } from './m15-reconciliation'
import { withoutM15Composition } from './m15-composition-removal'
import { WorkflowDialog } from './workflow-dialog'

const Editor = lazy(() =>
  import('./m15-reconciliation-ui').then((module) => ({
    default: module.M15ReconciliationEditor,
  })),
)
export type M15Access = {
  focusId?: string
  workspace: M15Workspace
  save: (
    value: M15Reconciliation,
    baseline: M15Reconciliation | undefined,
    document?: ReceiptDocument,
    receiptIds?: string[],
  ) => Promise<void>
  removeComposition?: (
    baseline: M15Reconciliation,
    lineId?: string,
  ) => Promise<void>
  hasPendingSave?: (id: string) => boolean
  syncFeedback?: ReactNode
}
export function M15Section(props: M15Access) {
  return (
    <OperationDisplayProvider id="m15">
      <M15Register {...props} />
    </OperationDisplayProvider>
  )
}
function M15Register({
  focusId,
  workspace,
  save,
  removeComposition,
  hasPendingSave,
  syncFeedback,
}: M15Access) {
  const { mode, setMode } = useOperationDisplay()
  const [removal, setRemoval] = useState<{
    document: ReceiptDocument
    baseline: M15Reconciliation
    lineId?: string
  }>()
  const [removalError, setRemovalError] = useState('')
  const [removing, setRemoving] = useState(false)
  const [notice, setNotice] = useState('')
  const removalInFlight = useRef(false)
  let removalBlock = ''
  if (removal) {
    try {
      withoutM15Composition(workspace, removal.baseline, removal.lineId)
    } catch (cause) {
      removalBlock =
        cause instanceof Error ? cause.message : 'Удаление недоступно.'
    }
  }
  function confirmRemoval(
    document: ReceiptDocument,
    baseline: M15Reconciliation,
    lineId?: string,
  ) {
    setNotice('')
    setRemovalError('')
    setRemoval({ document, baseline: structuredClone(baseline), lineId })
  }
  async function remove() {
    if (!removal || !removeComposition || removalInFlight.current) return
    removalInFlight.current = true
    setRemoving(true)
    setRemovalError('')
    try {
      await removeComposition(removal.baseline, removal.lineId)
      setNotice(
        removal.lineId
          ? 'Позиция удалена из состава М-15.'
          : 'Состав М-15 удалён.',
      )
      setRemoval(undefined)
    } catch (cause) {
      setRemovalError(
        cause instanceof Error
          ? cause.message
          : 'Не удалось удалить состав М-15.',
      )
    } finally {
      setRemoving(false)
      removalInFlight.current = false
    }
  }
  const [query, setQuery] = useState(''),
    [cipher, setCipher] = useState(''),
    [materialType, setMaterialType] = useState(''),
    [waiting, setWaiting] = useState(false)
  const focused = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (focusId && focused.current !== focusId) {
      focused.current = focusId
      setNewDocument(undefined)
      setDocumentId(focusId)
    }
  }, [focusId])
  const [documentId, setDocumentId] = useState<string | null>(null),
    [newDocument, setNewDocument] = useState<ReceiptDocument>()
  const accounting = useMemo(() => buildM15Accounting(workspace), [workspace])
  const [preview, setPreview] = useState<ReceiptDocument>()
  const records = useMemo(
    () => new Map(workspace.m15Reconciliations?.map((row) => [row.id, row])),
    [workspace.m15Reconciliations],
  )
  const documents =
    workspace.qualityWorkflow?.receiptDocuments?.filter(
      (doc) => doc.kind === 'm15',
    ) ?? []
  const projectById = new Map(
    workspace.lines?.map((line) => [String(line.id), line]),
  )
  const typeOf = (id: string | undefined) => {
    const line = id ? projectById.get(id) : undefined
    return String(line?.materialType ?? line?.category ?? '')
  }
  const materialTypes = [
    ...new Set(
      [...projectById.values()]
        .map((line) => typeOf(String(line.id)))
        .filter(Boolean),
    ),
  ].sort()
  const allCiphers = [
    ...new Set(
      [...records.values()]
        .map((record) => record.cipher)
        .concat(accounting.map((row) => row.cipher))
        .filter((value): value is string => !!value),
    ),
  ].sort()
  const normalized = normalizeOperationSearch(query)
  // The document catalog appends new invoices and retains their position when
  // the composition is edited. Display creation order, not the invoice date.
  const rows = [...documents]
    .reverse()
    .map((document) => {
      const record = records.get(document.id)
      const lines = record?.lines ?? []
      return {
        document,
        record,
        lines,
        cipher: record?.cipher ?? '',
      }
    })
    .filter(
      (row) =>
        (!cipher || row.cipher === cipher) &&
        (!materialType ||
          row.lines.some(
            (line) => typeOf(line.projectLineId) === materialType,
          )) &&
        normalizeOperationSearch(
          [
            receiptDocumentLabel(row.document),
            row.cipher,
            ...row.lines.map((line) => line.name),
          ].join(' '),
        ).includes(normalized),
    )
  const materialRows = accounting.filter(
    (row) =>
      (!cipher || row.cipher === cipher) &&
      (!materialType || row.materialType === materialType) &&
      normalizeOperationSearch(
        `${row.name} ${row.cipher} ${row.documents.map((item) => receiptDocumentLabel(item.document)).join(' ')}`,
      ).includes(normalized),
  )
  const waitingRows = materialRows.filter(
    (row) => row.shortage > 0 || row.needsConversion,
  )
  const open = (id: string) => {
    setNotice('')
    setNewDocument(undefined)
    setDocumentId(id)
  }
  return (
    <section
      aria-label="Реестр М-15"
      data-display="table"
      className="operation-section operation-table-fill mt-2 min-w-0 gap-2"
    >
      <p className="sr-only">Сверка АПП и М-15 по материалу и шифру.</p>
      {syncFeedback}
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <div className="operation-section-toolbar flex shrink-0 flex-wrap items-center gap-2">
        <Input
          className="min-w-0 flex-1 basis-64"
          aria-label="Поиск М-15"
          placeholder="Номер, материал или шифр"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          onClick={() => {
            setNotice('')
            const document: ReceiptDocument = {
              id: crypto.randomUUID(),
              kind: 'm15',
              number: '',
              date: localDateInputValue(),
            }
            setNewDocument(document)
            setDocumentId(document.id)
          }}
        >
          <Plus size={16} />
          Добавить М-15
        </Button>
      </div>
      <div className="operation-section-toolbar flex shrink-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-40 sm:max-w-72">
          <AppSelect
            label="Шифр"
            value={cipher}
            onChange={setCipher}
            options={[
              { value: '', label: 'Все шифры' },
              ...allCiphers.map((value) => ({ value, label: value })),
            ]}
          />
        </div>
        <div className="min-w-0 flex-1 basis-40 sm:max-w-60">
          <AppSelect
            label="Тип материала"
            value={materialType}
            onChange={setMaterialType}
            options={[
              { value: '', label: 'Все типы материала' },
              ...materialTypes.map((value) => ({ value, label: value })),
            ]}
          />
        </div>
        <div
          role="group"
          aria-label="Вид раздела М-15"
          className="inline-flex shrink-0 gap-1 rounded-md border border-slate-200 bg-white p-0.5"
        >
          {(['list', 'table'] as const).map((value) => (
            <Button
              key={value}
              variant={mode === value && !waiting ? 'secondary' : 'ghost'}
              aria-pressed={mode === value && !waiting}
              onClick={() => {
                setWaiting(false)
                setMode(value)
              }}
            >
              {value === 'list' ? 'Накладные' : 'Сверка по материалам'}
            </Button>
          ))}
        </div>
        <Button
          variant={waiting ? 'default' : 'outline'}
          aria-pressed={waiting}
          onClick={() => setWaiting(!waiting)}
        >
          Не хватает М-15 · {waitingRows.length}
        </Button>
        <span className="text-sm text-slate-500">Накладных: {rows.length}</span>
      </div>
      {waiting || mode === 'table' ? (
        <OperationsGrid
          key={`m15-accounting:${mode}`}
          id="m15-accounting"
          fillHeight
          label="Сверка АПП и М-15"
          rows={waiting ? waitingRows : materialRows}
          rowId={(row) => row.id}
          columns={[
            {
              id: 'material',
              title: 'Материал',
              value: (row) => row.name,
              width: 300,
            },
            { id: 'cipher', title: 'Шифр', value: (row) => row.cipher },
            {
              id: 'unit',
              title: 'Единица',
              value: (row) => row.unit,
              width: 100,
            },
            {
              id: 'app',
              title: 'По АПП с учётом возвратов',
              value: (row) => row.app,
              numeric: true,
              width: 170,
            },
            {
              id: 'quantity',
              width: 120,
              title: 'По М-15',
              value: (row) => (row.needsConversion ? null : row.documented),
              numeric: true,
            },
            {
              id: 'shortage',
              width: 140,
              title: 'Не хватает М-15',
              value: (row) => (row.needsConversion ? null : row.shortage),
              numeric: true,
            },
            {
              id: 'excess',
              width: 100,
              title: 'Сверх АПП',
              value: (row) => (row.needsConversion ? null : row.excess),
              numeric: true,
            },
            {
              id: 'documents',
              title: 'Состав М-15',
              width: 280,
              value: (row) =>
                row.documents
                  .map((item) => receiptDocumentLabel(item.document))
                  .join('; '),
              renderInTable: true,
              render: (row) => (
                <div className="flex w-full min-w-0 flex-col items-start gap-1 whitespace-normal">
                  {row.documents.map(({ document }) => (
                    <button
                      key={document.id}
                      className="max-w-full whitespace-normal break-words text-left text-blue-700 underline underline-offset-2"
                      onClick={() => setPreview(document)}
                    >
                      {receiptDocumentLabel(document)}
                    </button>
                  ))}
                  {row.needsConversion && <span>Нужен пересчёт единиц</span>}
                </div>
              ),
            },
            {
              id: 'actions',
              title: 'Действия',
              value: () => '',
              actions: true,
              width: 110,
              render: (row) => (
                <RowActions>
                  {row.documents.map(({ document }) => (
                    <RowActionButton
                      key={document.id}
                      iconOnly
                      aria-label={`Открыть карточку ${receiptDocumentLabel(document)}`}
                      onClick={() => open(document.id)}
                    >
                      <FolderOpen size={14} />
                    </RowActionButton>
                  ))}
                </RowActions>
              ),
            },
          ]}
        />
      ) : (
        <OperationsGrid
          key="m15-register"
          id="m15-register"
          label="Накладные М-15"
          fillHeight
          rows={rows}
          rowId={(row) => row.document.id}
          columns={[
            {
              id: 'document',
              title: 'Номер М-15',
              value: (row) => row.document.number,
              verticallyCentered: true,
              width: 260,
              minWidth: 220,
              flex: 1,
              render: (row) => (
                <div className="grid justify-items-start gap-1">
                  <span className="max-w-full whitespace-normal break-words font-medium text-slate-800">
                    №{row.document.number}
                  </span>
                  <span className="text-xs text-slate-500">
                    от {formatCalendarDate(row.document.date)}
                  </span>
                  {hasPendingSave?.(row.document.id) && (
                    <span className="text-sm text-amber-800">
                      Сохранение не подтверждено
                    </span>
                  )}
                </div>
              ),
            },
            {
              id: 'cipher',
              title: 'Шифр',
              value: (row) => row.cipher,
              verticallyCentered: true,
              width: 420,
              minWidth: 240,
              flex: 2,
            },
            {
              id: 'materials',
              title: 'Количество материалов',
              value: (row) => row.lines.length,
              numeric: true,
              centered: true,
              headerCentered: true,
              width: 190,
              minWidth: 180,
            },
            {
              id: 'actions',
              title: 'Действия',
              value: () => '',
              actions: true,
              width: 148,
              centered: true,
              headerCentered: true,
              render: (row) => (
                <RowActions className="w-full justify-center">
                  <RowActionButton
                    iconOnly
                    aria-label="Открыть М-15"
                    onClick={() => setPreview(row.document)}
                  >
                    <FolderOpen size={14} aria-hidden="true" />
                  </RowActionButton>
                  <RowActionButton
                    iconOnly
                    aria-label="Редактировать М-15"
                    onClick={() => open(row.document.id)}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </RowActionButton>
                  {removeComposition && row.record && row.lines.length > 0 && (
                    <RowActionButton
                      iconOnly
                      danger
                      aria-label="Удалить состав М-15"
                      onClick={() => confirmRemoval(row.document, row.record!)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </RowActionButton>
                  )}
                </RowActions>
              ),
            },
          ]}
        />
      )}
      {removal && (
        <WorkflowDialog
          compact
          title={
            removal.lineId ? 'Удалить позицию М-15?' : 'Удалить состав М-15?'
          }
          onClose={() => setRemoval(undefined)}
          busy={removing}
          footer={
            <>
              <Button
                variant="outline"
                disabled={removing}
                onClick={() => setRemoval(undefined)}
              >
                Отмена
              </Button>
              <Button
                className="bg-red-700 text-white hover:bg-red-800"
                disabled={removing || !!removalBlock}
                onClick={() => void remove()}
              >
                {removing
                  ? 'Удаление…'
                  : removal.lineId
                    ? 'Удалить позицию'
                    : 'Удалить состав'}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 text-sm">
            <p className="font-medium">
              {receiptDocumentLabel(removal.document)}
            </p>
            <p>
              {removal.lineId
                ? `Будет удалена позиция «${removal.baseline.lines.find((line) => line.id === removal.lineId)?.name}».`
                : `Будет удалён весь состав (${removal.baseline.lines.length} поз.).`}
            </p>
            <p className="text-slate-600">
              Номер, дата и сканы М-15, заявки и сами получения сохранятся.
            </p>
            {(removalBlock || removalError) && (
              <p
                role="alert"
                className="rounded-md bg-amber-50 p-3 text-amber-900"
              >
                {removalBlock || removalError}
              </p>
            )}
          </div>
        </WorkflowDialog>
      )}
      {preview && (
        <M15DocumentPreview
          key={preview.id}
          document={preview}
          composition={records.get(preview.id)}
          onClose={() => setPreview(undefined)}
          onEdit={() => {
            open(preview.id)
            setPreview(undefined)
          }}
        />
      )}
      {documentId && (
        <Suspense fallback={<p role="status">Открытие М-15…</p>}>
          <Editor
            key={documentId}
            documentId={documentId}
            newDocument={newDocument}
            workspace={workspace}
            onSave={save}
            onSaved={() => setNotice('М-15 сохранена.')}
            onClose={() => setDocumentId(null)}
            hasPendingSave={() => hasPendingSave?.(documentId) ?? false}
            syncFeedback={syncFeedback}
          />
        </Suspense>
      )}
    </section>
  )
}
