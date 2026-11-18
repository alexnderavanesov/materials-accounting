import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ColDef, GridApi, ICellRendererParams } from 'ag-grid-community'
import {
  Download,
  FileText,
  Images,
  LoaderCircle,
  Paperclip,
  Printer,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { DocumentFileInput } from './document-file-input'
import { documentFileSelectionError } from './document-file-limits'
import { DocumentAttachments } from './document-attachments'
import { MaterialsGridView, materialsGridTheme } from './materials-grid'
import { materialsColumnFilter } from './materials-column-filter'
import { projectGridLocale } from './project-grid-locale'
import { readDataGridState, saveDataGridState } from './project-grid-state'
import {
  documentCategories,
  documentCategoryKeys,
  externalDocumentCategories,
  isDocumentPhoto,
} from './document-registry'
import type {
  DocumentCategory,
  DocumentFileManifest,
  DocumentMaterial,
  DocumentRegistry,
  RegistryDocument,
} from './document-registry'
import { fileBase64, PdfPreview } from './request-print-ui'
import { readPrintBundle } from './print-output'
import type { PrintBundle } from './print-output'
import './operations-grid.css'
import './documents-section.css'

type Catalog = DocumentRegistry & {
  manifest: DocumentFileManifest
  workspaceRevision: string
}
type DocumentSelection = {
  materialIds: string[]
  category?: DocumentCategory
  documentIds?: string[]
}
type DocumentView = 'all' | DocumentCategory
type DocumentGridRow = DocumentMaterial & {
  materialId: string
  document?: RegistryDocument
}
const documentViews: DocumentView[] = [
  'all',
  'request',
  'issue',
  'm15',
  'app',
  'zni',
  'avk',
  ...documentCategoryKeys.filter(
    (kind) => !['request', 'issue', 'm15', 'app', 'zni', 'avk'].includes(kind),
  ),
]
const endpoint = '/api/documents'
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось выполнить действие.'
async function checked(response: Response) {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error ?? 'Сервер документов недоступен.')
  }
  return response
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function DocumentDialog({
  title,
  children,
  onClose,
  closeLabel = 'Закрыть документы',
}: {
  title: string
  children: ReactNode
  onClose: () => void
  closeLabel?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.showModal()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  return createPortal(
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        // A file input also emits a bubbling cancel event when its picker closes.
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      className="m-auto max-h-[90dvh] w-[min(960px,96vw)] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex max-h-[90dvh] flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 p-4">
          <h2 className="mr-auto text-lg font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        </div>
        {children}
      </div>
    </dialog>,
    document.body,
  )
}

export function DocumentsSection({
  prepare,
}: {
  prepare: () => Promise<string>
}) {
  const prepareRef = useRef(prepare)
  prepareRef.current = prepare
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const catalogRef = useRef(catalog)
  catalogRef.current = catalog
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const pending = useRef(false)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<DocumentView>('all')
  const [onlyWithoutDocuments, setOnlyWithoutDocuments] = useState(false)
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [selection, setSelection] = useState<DocumentSelection | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [uploadDocument, setUploadDocument] = useState<
    RegistryDocument | 'new' | null
  >(null)
  const [uploadKind, setUploadKind] = useState<DocumentCategory>('passport')
  const [uploadLabel, setUploadLabel] = useState('')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [bundle, setBundle] = useState<PrintBundle | null>(null)
  const [attachmentGroup, setAttachmentGroup] = useState<{
    documentId: string
    photos: boolean
  } | null>(null)
  const grid = useRef<GridApi<DocumentGridRow> | null>(null)
  const gridId =
    view === 'all' ? 'documents-registry' : `documents-registry-${view}`
  const initialGridState = useMemo(() => {
    const state = readDataGridState(gridId)
    const order = state.columnOrder?.orderedColIds
    // Add the new name beside the project name in previously saved layouts.
    if (order && !order.includes('receivedNames')) {
      const next = [...order]
      const projectIndex = next.indexOf('name')
      next.splice(
        projectIndex < 0 ? next.length : projectIndex + 1,
        0,
        'receivedNames',
      )
      state.columnOrder = { orderedColIds: next }
    }
    return { ...state, partialColumnState: true }
  }, [gridId])
  const [hasFilters, setHasFilters] = useState(false)
  const loadGeneration = useRef(0)
  const refresh = useCallback(async () => {
    const generation = ++loadGeneration.current
    const revision = await prepareRef.current()
    const next = (await (
      await checked(await fetch(endpoint, { cache: 'no-store' }))
    ).json()) as Catalog
    if (next.workspaceRevision !== revision)
      throw new Error(
        'Данные изменены в другой вкладке. Обновите страницу, чтобы загрузить актуальную версию.',
      )
    if (generation === loadGeneration.current) setCatalog(next)
  }, [])
  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (pending.current) return
      pending.current = true
      setBusy(label)
      setError('')
      setNotice('')
      try {
        await action()
      } catch (cause) {
        setError(errorText(cause))
      } finally {
        pending.current = false
        setBusy('')
      }
    },
    [],
  )
  useEffect(() => {
    void run('Загрузка документов…', refresh)
  }, [refresh, run])
  async function post(body: Record<string, unknown>) {
    const current = catalogRef.current
    if (!current) throw new Error('Реестр ещё не загружен.')
    const revision = await prepareRef.current()
    if (revision !== current.workspaceRevision)
      throw new Error('Рабочие данные изменились. Нажмите «Обновить реестр».')
    return checked(
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          workspaceRevision: revision,
          filesRevision: current.manifest.revision,
        }),
      }),
    )
  }
  const documentsById = useMemo(
    () => new Map(catalog?.documents.map((doc) => [doc.id, doc])),
    [catalog],
  )
  const filesByDocument = useMemo(() => {
    const result = new Map<string, DocumentFileManifest['files']>()
    for (const file of catalog?.manifest.files ?? []) {
      const files = result.get(file.documentId) ?? []
      files.push(file)
      result.set(file.documentId, files)
    }
    return result
  }, [catalog])
  const attachmentDocument = attachmentGroup
    ? documentsById.get(attachmentGroup.documentId)
    : undefined
  const attachmentFiles = attachmentGroup
    ? (filesByDocument.get(attachmentGroup.documentId) ?? []).filter(
        (file) => isDocumentPhoto(file) === attachmentGroup.photos,
      )
    : []
  const docsForRow = useCallback(
    (row: DocumentMaterial, kind?: DocumentCategory) =>
      row.documentIds
        .map((id) => documentsById.get(id))
        .filter((doc): doc is RegistryDocument =>
          Boolean(doc && (!kind || doc.kind === kind)),
        ),
    [documentsById],
  )
  const openDocuments = useCallback(
    (
      materialIds: string[],
      category?: DocumentCategory,
      documentIds?: string[],
    ) => {
      const ids = new Set(materialIds)
      const documents = documentIds ? new Set(documentIds) : null
      setSelection({ materialIds, category, documentIds })
      setCheckedIds(
        new Set(
          catalogRef.current?.documents
            .filter(
              (doc) =>
                (!category || doc.kind === category) &&
                (!documents || documents.has(doc.id)) &&
                doc.materialIds.some((id) => ids.has(id)),
            )
            .map((doc) => doc.id),
        ),
      )
      setUploadDocument(null)
      setAttachmentGroup(null)
      setError('')
      setNotice('')
    },
    [],
  )
  const columns = useMemo<ColDef<DocumentGridRow>[]>(
    () => [
      {
        field: 'name',
        headerName: 'Наименование по проекту',
        initialWidth: 340,
        initialPinned: 'left',
        minWidth: 200,
      },
      {
        colId: 'receivedNames',
        headerName: 'Наименование при получении',
        initialWidth: 340,
        minWidth: 220,
        autoHeight: true,
        valueGetter: ({ data }) =>
          (data?.receivedNames ?? []).map((item) => item.name).join('\n'),
        getQuickFilterText: ({ data, value }) =>
          `${value ?? ''} ${data.receivedNames.some((item) => item.replacement) ? 'замена' : ''}`,
        cellRenderer: ({ data }: ICellRendererParams<DocumentGridRow>) =>
          data?.receivedNames.length ? (
            <div className="grid w-full gap-1">
              {data.receivedNames.map((item) => (
                <div key={item.name} className="flex items-start gap-2">
                  <span
                    className="min-w-0 flex-1 line-clamp-2"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                  {item.replacement && (
                    <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                      Замена
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        field: 'type',
        headerName: 'Тип материала',
        initialWidth: 230,
        initialHide: true,
      },
      {
        field: 'cipher',
        headerName: 'Шифр',
        initialWidth: 220,
      },
      {
        field: 'standard',
        headerName: 'Нормативный документ',
        initialWidth: 220,
        initialHide: true,
      },
      ...(view === 'all' ? documentCategoryKeys : [view]).map(
        (kind): ColDef<DocumentGridRow> => ({
          colId: kind,
          headerName: documentCategories[kind],
          initialWidth:
            view !== 'all'
              ? 380
              : ['app', 'm15', 'zni', 'avk', 'arvk'].includes(kind)
                ? 170
                : 190,
          valueGetter: ({ data }) =>
            data
              ? docsForRow(data, kind)
                  .map((doc) => doc.label)
                  .join('\n')
              : '',
          cellRenderer: ({ data }: ICellRendererParams<DocumentGridRow>) => {
            if (!data) return null
            const docs = docsForRow(data, kind)
            return docs.length ? (
              <button
                type="button"
                className="w-full cursor-pointer text-left text-blue-700 hover:underline"
                onClick={() =>
                  openDocuments(
                    [data.materialId],
                    kind,
                    data.document ? [data.document.id] : undefined,
                  )
                }
                title={docs.map((doc) => doc.label).join('\n')}
                aria-label={`${data.document?.label ?? documentCategories[kind]}: ${data.name}`}
              >
                <span
                  className={view === 'all' ? 'block truncate' : 'line-clamp-2'}
                >
                  {docs.length === 1 ? docs[0]!.label : `${docs.length} док.`}
                </span>
              </button>
            ) : (
              <span className="text-slate-400">—</span>
            )
          },
        }),
      ),
    ],
    [docsForRow, openDocuments, view],
  )
  const rows = useMemo<DocumentGridRow[]>(() => {
    const materials = catalog?.materials ?? []
    if (view === 'all')
      return materials
        .filter((row) =>
          onlyWithoutDocuments
            ? row.documentIds.length === 0
            : row.documentIds.length > 0,
        )
        .map((row) => ({ ...row, materialId: row.id }))
    return materials.flatMap((row) =>
      docsForRow(row, view).map((document) => ({
        ...row,
        id: JSON.stringify([row.id, document.id]),
        materialId: row.id,
        document,
        documentIds: [document.id],
      })),
    )
  }, [catalog, onlyWithoutDocuments, view, docsForRow])
  // Keep the material/document pair visible first, including on narrow screens.
  const displayedColumns = useMemo(
    () =>
      view === 'all'
        ? columns
        : [
            columns[0]!,
            columns[columns.length - 1]!,
            columns[1]!,
            ...columns.slice(2, -1),
          ],
    [columns, view],
  )
  const shownDocuments = useMemo(() => {
    if (!selection) return []
    const ids = new Set(selection.materialIds)
    const documents = selection.documentIds
      ? new Set(selection.documentIds)
      : null
    return (catalog?.documents ?? []).filter(
      (doc) =>
        (!selection.category || selection.category === doc.kind) &&
        (!documents || documents.has(doc.id)) &&
        doc.materialIds.some((id) => ids.has(id)),
    )
  }, [catalog, selection])
  const selectedRows = useMemo(() => {
    const ids = new Set(selection?.materialIds ?? selectedMaterials)
    return (catalog?.materials ?? []).filter((row) => ids.has(row.id))
  }, [catalog, selection, selectedMaterials])
  function changeView(next: DocumentView) {
    if (next === view) return
    setSelectedMaterials([])
    setSelectedDocumentIds([])
    setHasFilters(false)
    grid.current = null
    setView(next)
  }
  function startUpload(doc: RegistryDocument | 'new') {
    setNotice('')
    setUploadDocument(doc)
    setUploadFiles([])
    setUploadLabel('')
    setUploadKind(
      selection?.category &&
        externalDocumentCategories.includes(selection.category)
        ? selection.category
        : 'passport',
    )
  }
  async function upload() {
    if (!uploadFiles.length || !uploadDocument) return
    const selectionError = documentFileSelectionError(uploadFiles)
    if (selectionError) throw new Error(selectionError)
    const files: { name: string; base64: string }[] = []
    for (const [index, file] of uploadFiles.entries()) {
      setBusy(`Подготовка файлов: ${index + 1} из ${uploadFiles.length}…`)
      files.push({ name: file.name, base64: await fileBase64(file) })
    }
    setBusy(`Загрузка файлов: ${files.length}…`)
    await post({
      action: 'upload-files',
      files,
      ...(uploadDocument === 'new'
        ? {
            document: {
              kind: uploadKind,
              label: uploadLabel.trim(),
              date: '',
              lineIds: [...new Set(selectedRows.flatMap((row) => row.lineIds))],
            },
          }
        : { documentId: uploadDocument.id }),
    })
    if (uploadDocument === 'new' && selection?.documentIds) {
      setSelection({ materialIds: selection.materialIds, category: uploadKind })
    }
    setUploadDocument(null)
    setUploadFiles([])
    await refresh()
    setNotice(`Прикреплено файлов: ${files.length}.`)
  }
  async function archive() {
    if (!selection) return
    const response = await post({
      action: 'archive',
      materialIds: selection.materialIds,
      documentIds: shownDocuments
        .filter((doc) => checkedIds.has(doc.id))
        .map((doc) => doc.id),
    })
    const warnings = Number(response.headers.get('X-Archive-Warnings') ?? 0)
    downloadBlob(await response.blob(), 'Документы.zip')
    setNotice(
      warnings
        ? `Архив скачан с замечаниями: ${warnings}. Подробности — в «Реестр.xlsx» и «О составе архива.txt».`
        : 'Архив скачан.',
    )
  }
  const status = (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-md bg-slate-50 p-3 text-sm text-slate-700"
        >
          {notice}
        </p>
      )}
      {busy && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-slate-500"
        >
          <LoaderCircle size={16} className="animate-spin" />
          {busy}
        </p>
      )}
    </>
  )
  return (
    <section
      className="mt-5 flex min-h-0 min-w-0 flex-1 flex-col gap-4"
      aria-label="Документы по материалам"
    >
      <div
        role="group"
        aria-label="Вид документов"
        className="flex shrink-0 flex-wrap gap-2"
      >
        {documentViews.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={view === kind ? 'default' : 'outline'}
            aria-pressed={view === kind}
            onClick={() => changeView(kind)}
          >
            {kind === 'all' ? 'Все документы' : documentCategories[kind]}
          </Button>
        ))}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <label className="relative min-w-60 flex-1">
          <Search size={17} className="absolute left-3 top-3 text-slate-400" />
          <Input
            aria-label="Поиск документов"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Проектное или фактическое наименование, шифр, документ"
          />
        </label>
        {view === 'all' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyWithoutDocuments}
              onChange={(event) =>
                setOnlyWithoutDocuments(event.target.checked)
              }
            />
            Без документов
          </label>
        )}
        <Button
          variant="outline"
          aria-label="Обновить реестр"
          disabled={Boolean(busy)}
          onClick={() => void run('Обновление…', refresh)}
        >
          <RefreshCw size={16} />
        </Button>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => grid.current?.setFilterModel(null)}
          >
            Сбросить фильтры
          </Button>
        )}
        <Button
          variant="outline"
          disabled={!selectedMaterials.length || Boolean(busy)}
          onClick={() => {
            openDocuments(selectedMaterials)
            startUpload('new')
          }}
        >
          <Paperclip size={16} />
          Прикрепить
        </Button>
        <Button
          disabled={!selectedMaterials.length || Boolean(busy)}
          onClick={() =>
            openDocuments(
              selectedMaterials,
              view === 'all' ? undefined : view,
              view === 'all' ? undefined : selectedDocumentIds,
            )
          }
        >
          <Download size={16} />
          Скачать архив
          {selectedMaterials.length
            ? ` · ${view === 'all' ? selectedMaterials.length : selectedDocumentIds.length}`
            : ''}
        </Button>
      </div>
      {!selection && status}
      <div className="operations-grid documents-grid min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <MaterialsGridView<DocumentGridRow>
          key={gridId}
          gridId={gridId}
          initialState={initialGridState}
          onStateUpdated={({ state }) => saveDataGridState(gridId, state)}
          onFilterChanged={({ api }) =>
            setHasFilters(api.isColumnFilterPresent())
          }
          statusBar={{ statusPanels: [] }}
          theme={materialsGridTheme}
          localeText={projectGridLocale}
          columnDefs={displayedColumns}
          rowData={rows}
          getRowId={({ data }) => data.id}
          quickFilterText={query}
          cacheQuickFilter
          includeHiddenColumnsInQuickFilter
          pagination
          paginationPageSize={25}
          paginationPageSizeSelector={[25, 50, 100]}
          rowHeight={60}
          rowSelection={{
            mode: 'multiRow',
            selectAll: 'filtered',
            enableClickSelection: false,
          }}
          selectionColumnDef={{ pinned: 'left', width: 48 }}
          defaultColDef={{
            sortable: true,
            resizable: true,
            filter: materialsColumnFilter,
            floatingFilter: false,
            wrapText: true,
            wrapHeaderText: true,
            autoHeaderHeight: true,
            cellRenderer: ({ value }: ICellRendererParams<DocumentGridRow>) => (
              <span className="line-clamp-2">{value}</span>
            ),
            tooltipValueGetter: ({ value }) => String(value ?? ''),
            suppressHeaderMenuButton: false,
          }}
          tooltipShowDelay={300}
          onGridReady={({ api }) => {
            grid.current = api
          }}
          onSelectionChanged={({ api }) => {
            const selected = api.getSelectedRows()
            setSelectedMaterials([
              ...new Set(selected.map((row) => row.materialId)),
            ])
            setSelectedDocumentIds([
              ...new Set(
                selected.flatMap((row) =>
                  row.document ? [row.document.id] : [],
                ),
              ),
            ])
          }}
        />
      </div>
      {selectedMaterials.length > 0 && (
        <div className="flex shrink-0 gap-3 text-sm text-slate-500">
          <span>
            {view === 'all' ? 'Выбрано материалов' : 'Материалов'}:{' '}
            {selectedMaterials.length}
            {view !== 'all' &&
              ` · Выбрано документов: ${selectedDocumentIds.length}`}
          </span>
          <button
            type="button"
            className="hover:underline"
            onClick={() => grid.current?.deselectAll()}
          >
            Снять выбор
          </button>
        </div>
      )}
      {selection && (
        <DocumentDialog
          title={
            uploadDocument
              ? 'Прикрепить файлы'
              : selection.category
                ? documentCategories[selection.category]
                : 'Документы выбранных материалов'
          }
          onClose={() => {
            if (!busy) {
              setSelection(null)
              setUploadDocument(null)
              setAttachmentGroup(null)
            }
          }}
        >
          <div className="grid gap-3 overflow-y-auto p-4">
            {status}
            <p className="text-sm text-slate-500">
              {selectedRows.length === 1
                ? selectedRows[0]!.name
                : `Материалов: ${selectedRows.length}`}
            </p>
            {uploadDocument ? (
              <>
                {uploadDocument === 'new' ? (
                  <>
                    <label className="grid gap-1 text-sm">
                      Тип документа
                      <select
                        disabled={Boolean(busy)}
                        className="rounded-md border border-slate-200 bg-white p-2"
                        value={uploadKind}
                        onChange={(event) =>
                          setUploadKind(event.target.value as DocumentCategory)
                        }
                      >
                        {externalDocumentCategories.map((kind) => (
                          <option key={kind} value={kind}>
                            {documentCategories[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Наименование и номер
                      <Input
                        disabled={Boolean(busy)}
                        value={uploadLabel}
                        onChange={(event) => setUploadLabel(event.target.value)}
                        placeholder="Например: Паспорт №221"
                      />
                    </label>
                  </>
                ) : (
                  <p>{uploadDocument.label}</p>
                )}
                <DocumentFileInput
                  files={uploadFiles}
                  onChange={setUploadFiles}
                  disabled={Boolean(busy)}
                />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="mr-auto flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={
                        shownDocuments.length > 0 &&
                        shownDocuments.every((doc) => checkedIds.has(doc.id))
                      }
                      onChange={(event) =>
                        setCheckedIds(
                          new Set(
                            event.target.checked
                              ? shownDocuments.map((doc) => doc.id)
                              : [],
                          ),
                        )
                      }
                    />
                    Все документы
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(busy)}
                    onClick={() => startUpload('new')}
                  >
                    <Paperclip size={14} />
                    {selectedRows.length === 1
                      ? 'Добавить документ к материалу'
                      : 'Добавить документ к материалам'}
                  </Button>
                </div>
                {!shownDocuments.length && (
                  <p className="py-8 text-center text-slate-500">
                    Документов пока нет. Можно прикрепить оригинал.
                  </p>
                )}
                {shownDocuments.map((doc) => {
                  const files = filesByDocument.get(doc.id) ?? []
                  const photoCount = files.filter(isDocumentPhoto).length
                  const otherCount = files.length - photoCount
                  return (
                    <div
                      key={doc.id}
                      className="grid gap-2 rounded-lg border border-slate-200 p-3"
                    >
                      <div className="flex items-start gap-3">
                        <label className="flex min-w-0 flex-1 items-start gap-3">
                          <input
                            className="mt-1"
                            type="checkbox"
                            checked={checkedIds.has(doc.id)}
                            onChange={(event) =>
                              setCheckedIds((current) => {
                                const next = new Set(current)
                                if (event.target.checked) next.add(doc.id)
                                else next.delete(doc.id)
                                return next
                              })
                            }
                          />
                          <span className="break-words text-sm">
                            {doc.label}
                          </span>
                        </label>
                        {doc.target && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Предпросмотр PDF и Excel"
                            aria-label={`Просмотр: ${doc.label}`}
                            disabled={Boolean(busy)}
                            onClick={() =>
                              void run('Формирование документа…', async () => {
                                const next = await readPrintBundle(
                                  await post({
                                    action: 'preview',
                                    documentId: doc.id,
                                  }),
                                )
                                setBundle(next)
                              })
                            }
                          >
                            <Printer size={16} />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Прикрепить оригинал"
                          aria-label={`Прикрепить: ${doc.label}`}
                          disabled={Boolean(busy)}
                          onClick={() => startUpload(doc)}
                        >
                          <Paperclip size={16} />
                        </Button>
                      </div>
                      {files.length > 0 ? (
                        <div className="flex flex-wrap gap-2 pl-7">
                          {photoCount > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setAttachmentGroup({
                                  documentId: doc.id,
                                  photos: true,
                                })
                              }
                            >
                              <Images size={15} /> Фотографии · {photoCount}
                            </Button>
                          )}
                          {otherCount > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setAttachmentGroup({
                                  documentId: doc.id,
                                  photos: false,
                                })
                              }
                            >
                              <FileText size={15} /> Другие файлы · {otherCount}
                            </Button>
                          )}
                        </div>
                      ) : !doc.target ? (
                        <p className="pl-7 text-xs text-slate-500">
                          Оригинал не прикреплён
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 p-4">
            {uploadDocument ? (
              <>
                <Button
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => setUploadDocument(null)}
                >
                  Назад
                </Button>
                <Button
                  disabled={
                    Boolean(busy) ||
                    !uploadFiles.length ||
                    Boolean(documentFileSelectionError(uploadFiles)) ||
                    (uploadDocument === 'new' && !uploadLabel.trim())
                  }
                  onClick={() => void run('Подготовка файлов…', upload)}
                >
                  Прикрепить
                  {uploadFiles.length ? ` (${uploadFiles.length})` : ''}
                </Button>
              </>
            ) : (
              <>
                <span className="mr-auto text-xs text-slate-500">
                  PDF и Excel формируются при скачивании. Все вложения включены.
                </span>
                <Button
                  disabled={
                    Boolean(busy) ||
                    !shownDocuments.some((doc) => checkedIds.has(doc.id))
                  }
                  onClick={() => void run('Формирование архива…', archive)}
                >
                  <Download size={16} />
                  Скачать выбранные (
                  {
                    shownDocuments.filter((doc) => checkedIds.has(doc.id))
                      .length
                  }
                  )
                </Button>
              </>
            )}
          </div>
          {bundle && (
            <PdfPreview
              {...bundle}
              portalTarget={document.querySelector('dialog[open]') ?? undefined}
              onClose={() => setBundle(null)}
            />
          )}
          {attachmentGroup && attachmentDocument && !uploadDocument && (
            <DocumentDialog
              title={attachmentGroup.photos ? 'Фотографии' : 'Другие файлы'}
              closeLabel="Закрыть вложения"
              onClose={() => {
                if (!busy) setAttachmentGroup(null)
              }}
            >
              <div className="grid gap-4 overflow-y-auto p-4">
                {status}
                <p className="text-sm text-stone-600">
                  {attachmentDocument.label}
                </p>
                <DocumentAttachments
                  key={`${attachmentGroup.documentId}:${attachmentGroup.photos}`}
                  files={attachmentFiles}
                  photos={attachmentGroup.photos}
                  busy={Boolean(busy)}
                  onRemove={(file) =>
                    run('Удаление файла…', async () => {
                      await post({ action: 'remove', fileId: file.id })
                      await refresh()
                    })
                  }
                />
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-stone-200 p-4">
                <span className="mr-auto text-sm text-stone-500">
                  Всего: {attachmentFiles.length}
                </span>
                {attachmentGroup.photos && (
                  <Button
                    variant="outline"
                    disabled={Boolean(busy) || !attachmentFiles.length}
                    onClick={() =>
                      void run('Собираем фотографии…', async () => {
                        const response = await post({
                          action: 'photos-archive',
                          documentId: attachmentDocument.id,
                        })
                        const filename = response.headers
                          .get('Content-Disposition')
                          ?.match(/filename\*=UTF-8''(.+)/i)?.[1]
                        downloadBlob(
                          await response.blob(),
                          filename
                            ? decodeURIComponent(filename)
                            : 'Фотографии.zip',
                        )
                        setNotice('Архив фотографий скачан.')
                      })
                    }
                  >
                    <Download size={16} /> Скачать все фото
                  </Button>
                )}
                <Button
                  disabled={Boolean(busy)}
                  onClick={() => startUpload(attachmentDocument)}
                >
                  <Paperclip size={16} /> Добавить файлы
                </Button>
              </div>
            </DocumentDialog>
          )}
        </DocumentDialog>
      )}
    </section>
  )
}
