import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ColDef, GridApi, ICellRendererParams } from 'ag-grid-community'
import {
  Download,
  LoaderCircle,
  Paperclip,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { MaterialsGridView, materialsGridTheme } from './materials-grid'
import { materialsColumnFilter } from './materials-column-filter'
import { projectGridLocale } from './project-grid-locale'
import { readDataGridState, saveDataGridState } from './project-grid-state'
import {
  documentCategories,
  documentCategoryKeys,
  externalDocumentCategories,
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
type DocumentSelection = { materialIds: string[]; category?: DocumentCategory }
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
}: {
  title: string
  children: ReactNode
  onClose: () => void
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
      onCancel={(event) => {
        event.preventDefault()
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
            aria-label="Закрыть документы"
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
  const [onlyWithDocuments, setOnlyWithDocuments] = useState(false)
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([])
  const [selection, setSelection] = useState<DocumentSelection | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [uploadDocument, setUploadDocument] = useState<
    RegistryDocument | 'new' | null
  >(null)
  const [uploadKind, setUploadKind] = useState<DocumentCategory>('passport')
  const [uploadLabel, setUploadLabel] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [bundle, setBundle] = useState<PrintBundle | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const grid = useRef<GridApi<DocumentMaterial> | null>(null)
  const [initialGridState] = useState(() => ({
    ...readDataGridState('documents-registry'),
    partialColumnState: true,
  }))
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
    (materialIds: string[], category?: DocumentCategory) => {
      const ids = new Set(materialIds)
      setSelection({ materialIds, category })
      setCheckedIds(
        new Set(
          catalogRef.current?.documents
            .filter(
              (doc) =>
                (!category || doc.kind === category) &&
                doc.materialIds.some((id) => ids.has(id)),
            )
            .map((doc) => doc.id),
        ),
      )
      setUploadDocument(null)
      setConfirmRemove(null)
      setError('')
      setNotice('')
    },
    [],
  )
  const columns = useMemo<ColDef<DocumentMaterial>[]>(
    () => [
      {
        field: 'name',
        headerName: 'Материал',
        width: 340,
        pinned: 'left',
        minWidth: 200,
      },
      {
        field: 'type',
        headerName: 'Тип материала',
        width: 230,
        initialHide: true,
      },
      {
        field: 'cipher',
        headerName: 'Шифр',
        width: 220,
      },
      {
        field: 'standard',
        headerName: 'Нормативный документ',
        width: 220,
        initialHide: true,
      },
      ...documentCategoryKeys.map(
        (kind): ColDef<DocumentMaterial> => ({
          colId: kind,
          headerName: documentCategories[kind],
          width: ['app', 'm15', 'zni', 'avk', 'arvk'].includes(kind)
            ? 170
            : 190,
          valueGetter: ({ data }) =>
            data
              ? docsForRow(data, kind)
                  .map((doc) => doc.label)
                  .join('\n')
              : '',
          cellRenderer: ({ data }: ICellRendererParams<DocumentMaterial>) => {
            if (!data) return null
            const docs = docsForRow(data, kind)
            return docs.length ? (
              <button
                type="button"
                className="w-full cursor-pointer text-left text-blue-700 hover:underline"
                onClick={() => openDocuments([data.id], kind)}
                title={docs.map((doc) => doc.label).join('\n')}
                aria-label={`${documentCategories[kind]}: ${data.name}`}
              >
                <span className="block truncate">
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
    [docsForRow, openDocuments],
  )
  const rows = useMemo(
    () =>
      (catalog?.materials ?? []).filter(
        (row) => !onlyWithDocuments || row.documentIds.length > 0,
      ),
    [catalog, onlyWithDocuments],
  )
  const shownDocuments = useMemo(() => {
    if (!selection) return []
    const ids = new Set(selection.materialIds)
    return (catalog?.documents ?? []).filter(
      (doc) =>
        (!selection.category || selection.category === doc.kind) &&
        doc.materialIds.some((id) => ids.has(id)),
    )
  }, [catalog, selection])
  const selectedRows = useMemo(() => {
    const ids = new Set(selection?.materialIds ?? selectedMaterials)
    return (catalog?.materials ?? []).filter((row) => ids.has(row.id))
  }, [catalog, selection, selectedMaterials])
  function startUpload(doc: RegistryDocument | 'new') {
    setUploadDocument(doc)
    setUploadFile(null)
    setUploadLabel('')
    setUploadKind(
      selection?.category &&
        externalDocumentCategories.includes(selection.category)
        ? selection.category
        : 'passport',
    )
  }
  async function upload() {
    if (!uploadFile || !uploadDocument) return
    if (uploadFile.size > 20 * 1024 * 1024)
      throw new Error('Максимальный размер файла — 20 МБ.')
    await post({
      action: 'upload',
      name: uploadFile.name,
      base64: await fileBase64(uploadFile),
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
    setUploadDocument(null)
    await refresh()
    setNotice('Оригинал прикреплён.')
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
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <label className="relative min-w-60 flex-1">
          <Search size={17} className="absolute left-3 top-3 text-slate-400" />
          <Input
            aria-label="Поиск документов"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Материал, шифр или номер документа"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyWithDocuments}
            onChange={(event) => setOnlyWithDocuments(event.target.checked)}
          />
          С документами
        </label>
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
          onClick={() => openDocuments(selectedMaterials)}
        >
          <Download size={16} />
          Скачать архив
          {selectedMaterials.length ? ` · ${selectedMaterials.length}` : ''}
        </Button>
      </div>
      {!selection && status}
      <div className="operations-grid documents-grid min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <MaterialsGridView<DocumentMaterial>
          gridId="documents-registry"
          initialState={initialGridState}
          onStateUpdated={({ state }) =>
            saveDataGridState('documents-registry', state)
          }
          onFilterChanged={({ api }) =>
            setHasFilters(api.isColumnFilterPresent())
          }
          statusBar={{ statusPanels: [] }}
          theme={materialsGridTheme}
          localeText={projectGridLocale}
          columnDefs={columns}
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
            cellRenderer: ({
              value,
            }: ICellRendererParams<DocumentMaterial>) => (
              <span className="line-clamp-2">{value}</span>
            ),
            tooltipValueGetter: ({ value }) => String(value ?? ''),
            suppressHeaderMenuButton: false,
          }}
          tooltipShowDelay={300}
          onGridReady={({ api }) => {
            grid.current = api
          }}
          onSelectionChanged={({ api }) =>
            setSelectedMaterials(api.getSelectedRows().map((row) => row.id))
          }
        />
      </div>
      {selectedMaterials.length > 0 && (
        <div className="flex shrink-0 gap-3 text-sm text-slate-500">
          <span>Выбрано материалов: {selectedMaterials.length}</span>
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
              ? 'Прикрепить оригинал'
              : selection.category
                ? documentCategories[selection.category]
                : 'Документы выбранных материалов'
          }
          onClose={() => {
            if (!busy) {
              setSelection(null)
              setUploadDocument(null)
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
                        value={uploadLabel}
                        onChange={(event) => setUploadLabel(event.target.value)}
                        placeholder="Например: Паспорт №221"
                      />
                    </label>
                  </>
                ) : (
                  <p>{uploadDocument.label}</p>
                )}
                <label className="grid gap-2 text-sm">
                  Файл оригинала
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx"
                    onChange={(event) =>
                      setUploadFile(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
                <p className="text-xs text-slate-500">
                  PDF, PNG, JPEG, Excel или Word · до 20 МБ
                </p>
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
                    Добавить документ
                  </Button>
                </div>
                {!shownDocuments.length && (
                  <p className="py-8 text-center text-slate-500">
                    Документов пока нет. Можно прикрепить оригинал.
                  </p>
                )}
                {shownDocuments.map((doc) => (
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
                        <span className="break-words text-sm">{doc.label}</span>
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
                    {!filesByDocument.get(doc.id)?.length && (
                      <p className="pl-7 text-xs text-slate-500">
                        {doc.target
                          ? 'PDF и Excel формируются при скачивании'
                          : 'Оригинал не прикреплён'}
                      </p>
                    )}
                    {(filesByDocument.get(doc.id) ?? []).map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-2 pl-7 text-sm"
                      >
                        <a
                          className="min-w-0 flex-1 break-words text-blue-700 hover:underline"
                          href={`${endpoint}?file=${encodeURIComponent(file.id)}`}
                          download
                        >
                          {file.name}
                        </a>
                        {confirmRemove === file.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                void run('Удаление файла…', async () => {
                                  await post({
                                    action: 'remove',
                                    fileId: file.id,
                                  })
                                  setConfirmRemove(null)
                                  await refresh()
                                })
                              }
                            >
                              Удалить файл
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmRemove(null)}
                            >
                              Отмена
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Удалить файл ${file.name}`}
                            disabled={Boolean(busy)}
                            onClick={() => setConfirmRemove(file.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
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
                    !uploadFile ||
                    (uploadDocument === 'new' && !uploadLabel.trim())
                  }
                  onClick={() => void run('Загрузка оригинала…', upload)}
                >
                  Прикрепить
                </Button>
              </>
            ) : (
              <>
                <span className="mr-auto text-xs text-slate-500">
                  PDF + Excel + оригиналы · документы целиком
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
        </DocumentDialog>
      )}
    </section>
  )
}
