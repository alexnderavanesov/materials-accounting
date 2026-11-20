import type { ScanSelection } from './document-scans'
import { DateInput } from '#/components/ui/date-input'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Download, FileInput, Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { FilterModel } from 'ag-grid-community'
import { Button } from '#/components/ui/button'
import { DecimalInput } from '#/components/ui/decimal-input'
import { Input } from '#/components/ui/input'
import { AppSelect } from '#/components/ui/app-select'
import { WorkflowDialog } from './workflow-dialog'
import { OperationsGrid } from './operations-grid'
import { M15MaterialsGrid } from './m15-materials-grid'
import type { M15MaterialRow } from './m15-materials-grid'
import { getMaterialIdentityKey } from './project-material-data'
import type { SubobjectMaterialMetric } from './types'
import { parseProjectQuantity } from './project-grid-state'
import { jsonEqual } from './workspace-protocol'
import {
  receiptDocumentLabel,
  receiptDocumentSchema,
} from './receipt-documents'
import type { ReceiptDocument } from './receipt-documents'
import { withM15Document } from './m15-document'
import { M15Scans, uploadM15Scans } from './m15-scans'
import { documentFileSelectionError } from './document-file-limits'
import {
  independentM15,
  buildM15Accounting,
  m15ProjectFactor,
} from './m15-independent'
import { m15Unit } from './m15-quantity'
import { m15Precise, validateM15Reconciliation } from './m15-reconciliation'
import type {
  M15Reconciliation,
  M15Workspace,
  M15Line,
} from './m15-reconciliation'
import { normalizeOperationSearch } from './operation-list-view'
import { matchM15ProjectMaterials } from './m15-project-materials'
import type { M15ProjectMaterial } from './m15-project-materials'

const ImportPanel = lazy(() => import('./m15-import-ui'))
export function M15ReconciliationEditor({
  documentId,
  workspace,
  onSave,
  onSaved,
  onClose,
  syncFeedback,
  hasPendingSave,
  newDocument,
  embedded = false,
  initialCipher = '',
  requestEntries,
}: {
  documentId: string
  workspace: M15Workspace
  newDocument?: ReceiptDocument
  syncFeedback?: ReactNode
  hasPendingSave?: () => boolean
  embedded?: boolean
  initialCipher?: string
  requestEntries?: readonly {
    projectLineId: string
    quantity: number
    projectUnit: string
  }[]
  onSave: (
    value: M15Reconciliation,
    baseline: M15Reconciliation | undefined,
    document?: ReceiptDocument,
    receiptIds?: string[],
  ) => Promise<void>
  onClose: () => void
  onSaved?: () => void
}) {
  const existing = workspace.m15Reconciliations?.find(
    (row) => row.id === documentId,
  )
  const document = workspace.qualityWorkflow?.receiptDocuments?.find(
    (row) => row.id === documentId,
  )
  const [baseline, setBaseline] = useState(existing)
  const [draft, setDraft] = useState(() => ({
    ...independentM15(documentId, existing),
    cipher: existing?.cipher ?? initialCipher,
  }))
  const [documentDraft, setDocumentDraft] = useState<ReceiptDocument>(
    newDocument ??
      document ?? { id: documentId, kind: 'm15', number: '', date: '' },
  )
  const [step, setStep] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [files, setFiles] = useState<File[]>([])
  const [scanPolicy, setScanPolicy] = useState<Omit<
    ScanSelection,
    'files'
  > | null>(null)
  const [scanRevision, setScanRevision] = useState(0),
    [showScans, setShowScans] = useState(false),
    [importing, setImporting] = useState(false)
  const [query, setQuery] = useState('')
  const [detailLine, setDetailLine] = useState('')
  const [quantityTexts, setQuantityTexts] = useState<Record<string, string>>({})
  const [filledOnly, setFilledOnly] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchButton = useRef<HTMLButtonElement>(null)
  const [filterModel, setFilterModel] = useState<FilterModel | null>(null)
  const [expandedNames, setExpandedNames] = useState<Record<string, boolean>>(
    {},
  )
  const [editingMaterial, setEditingMaterial] = useState('')
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const saving = useRef(false)
  const accounting = useMemo(() => buildM15Accounting(workspace), [workspace])
  const candidates = useMemo(() => {
    const result = new Map<string, M15ProjectMaterial>()
    for (const line of workspace.lines ?? [])
      result.set(String(line.id), {
        id: String(line.id),
        cipher: String(line.cipher ?? ''),
        name: String(line.projectMaterialName || line.material || ''),
        unit: String(line.unit ?? ''),
      })
    for (const request of workspace.materialRequests)
      if (!result.has(String(request.projectLineId)))
        result.set(String(request.projectLineId), {
          id: String(request.projectLineId),
          cipher: String(request.cipher ?? ''),
          name: String(request.projectMaterialName ?? ''),
          unit: String(request.projectUnit ?? ''),
        })
    return [...result.values()]
  }, [workspace.lines, workspace.materialRequests])
  const projectOptions = useMemo(
    () => candidates.filter((row) => row.cipher === draft.cipher),
    [candidates, draft.cipher],
  )
  const projectById = useMemo(
    () => new Map(projectOptions.map((row) => [row.id, row])),
    [projectOptions],
  )
  const projectSelectOptions = useMemo(
    () => [
      { value: '', label: 'Выберите материал шифра' },
      ...projectOptions.map((row) => ({
        value: row.id,
        label: `${row.name} · ${row.unit}`,
      })),
    ],
    [projectOptions],
  )
  const projectMetadata = useMemo(
    () =>
      new Map((workspace.lines ?? []).map((line) => [String(line.id), line])),
    [workspace.lines],
  )
  const projectQuantities = useMemo(() => {
    const totals = new Map<string, number>()
    const identities = new Map<string, string>()
    for (const line of workspace.lines ?? []) {
      const key = getMaterialIdentityKey(line as SubobjectMaterialMetric)
      identities.set(String(line.id), key)
      if (typeof line.plannedQuantity === 'number')
        totals.set(
          key,
          m15Precise((totals.get(key) ?? 0) + line.plannedQuantity),
        )
    }
    return new Map(
      [...identities].map(([id, key]) => [id, totals.get(key) ?? null]),
    )
  }, [workspace.lines])
  const receivedQuantities = useMemo(
    () => new Map(accounting.map((row) => [row.projectLineId, row.appUnits])),
    [accounting],
  )
  const preparedDraft = useMemo(
    () => ({
      ...draft,
      lines: draft.lines.filter((line) => line.quantity !== 0),
    }),
    [draft],
  )
  const requestMaterials = useMemo(() => {
    const materials = new Map<string, M15MaterialRow['requested']>()
    for (const entry of requestEntries ?? []) {
      const totals = materials.get(entry.projectLineId) ?? []
      const total = totals.find((item) => item.unit === entry.projectUnit)
      if (total) total.quantity = m15Precise(total.quantity + entry.quantity)
      else totals.push({ quantity: entry.quantity, unit: entry.projectUnit })
      materials.set(entry.projectLineId, totals)
    }
    return materials
  }, [requestEntries])
  const gridRows = useMemo(() => {
    const byProject = new Map<string, M15Line[]>()
    for (const line of draft.lines) {
      if (!line.projectLineId || !projectById.has(line.projectLineId)) continue
      const group = byProject.get(line.projectLineId) ?? []
      group.push(line)
      byProject.set(line.projectLineId, group)
    }
    const row = (
      id: string,
      project?: M15ProjectMaterial,
      line?: M15Line,
    ): M15MaterialRow => {
      const metadata = project ? projectMetadata.get(project.id) : undefined
      return {
        id,
        lineId: line?.id,
        projectLineId: project?.id ?? line?.projectLineId,
        inRequest: requestMaterials.has(
          project?.id ?? line?.projectLineId ?? '',
        ),
        requested:
          requestMaterials.get(project?.id ?? line?.projectLineId ?? '') ?? [],
        received:
          receivedQuantities.get(project?.id ?? line?.projectLineId ?? '') ??
          [],
        projectQuantity: project
          ? (projectQuantities.get(project.id) ?? null)
          : null,
        projectUnit: String(metadata?.unit ?? ''),
        name: project?.name ?? line?.name ?? '',
        invoiceName: line?.name ?? project?.name ?? '',
        unit: line?.unit ?? project?.unit ?? '',
        composition: String(metadata?.material ?? ''),
        normativeDocument: String(metadata?.normativeDocument ?? ''),
        materialType: String(
          metadata?.materialType || metadata?.category || '',
        ),
        quantity: line
          ? (quantityTexts[line.id] ??
            (line.quantity ? String(line.quantity) : ''))
          : '',
        needsMatch: !!line && !project,
      }
    }
    return [
      ...projectOptions.flatMap((project) => {
        const lines = byProject.get(project.id)
        return lines?.length
          ? lines.map((line, index) =>
              row(
                index ? `line:${line.id}` : `project:${project.id}`,
                project,
                line,
              ),
            )
          : [row(`project:${project.id}`, project)]
      }),
      ...draft.lines
        .filter(
          (line) => !line.projectLineId || !projectById.has(line.projectLineId),
        )
        .map((line) => row(`line:${line.id}`, undefined, line)),
    ]
  }, [
    draft.lines,
    projectOptions,
    projectById,
    projectMetadata,
    quantityTexts,
    requestMaterials,
    projectQuantities,
    receivedQuantities,
  ])
  const filledRows = gridRows.filter(
    (row) => (parseProjectQuantity(row.quantity) ?? -1) !== 0,
  )
  const visibleRows = useMemo(() => {
    const search = normalizeOperationSearch(query)
    return gridRows.filter(
      (row) =>
        (!filledOnly || (parseProjectQuantity(row.quantity) ?? -1) !== 0) &&
        (!search ||
          normalizeOperationSearch(
            `${row.name} ${row.invoiceName} ${row.normativeDocument} ${row.composition} ${row.materialType}`,
          ).includes(search)),
    )
  }, [gridRows, filledOnly, query])
  function addGridLine(row: M15MaterialRow, quantity: number) {
    const line: M15Line = {
      id: crypto.randomUUID(),
      projectLineId: row.projectLineId,
      position: '',
      name: row.invoiceName,
      unit: row.unit,
      quantity,
    }
    setDraft((current) => ({ ...current, lines: [...current.lines, line] }))
    return line.id
  }
  function changeQuantity(row: M15MaterialRow, text: string) {
    const quantity = parseProjectQuantity(text) ?? Number.NaN
    if (row.lineId) updateLine(row.lineId, { quantity })
    const lineId =
      row.lineId ?? (quantity !== 0 ? addGridLine(row, quantity) : undefined)
    if (lineId) setQuantityTexts((current) => ({ ...current, [lineId]: text }))
  }
  function openDetails(row: M15MaterialRow) {
    setDetailLine(row.lineId ?? addGridLine(row, 0))
  }
  function closeSearch() {
    setQuery('')
    setSearchOpen(false)
    searchButton.current?.focus()
  }
  const dirty =
    !jsonEqual(
      draft,
      baseline?.mode === 'independent'
        ? baseline
        : independentM15(documentId, baseline),
    ) ||
    files.length > 0 ||
    (!!newDocument && !saved)
  const changedRemotely =
    !jsonEqual(existing, baseline) && !jsonEqual(existing, draft)
  function updateLine(id: string, patch: Partial<M15Line>) {
    setError('')
    setDraft((value) => ({
      ...value,
      lines: value.lines.map((row) =>
        row.id === id
          ? (() => {
              const next = { ...row, ...patch }
              const project = projectMetadata.get(next.projectLineId ?? '')
              if (
                project &&
                (patch.unit !== undefined || patch.projectLineId !== undefined)
              ) {
                next.projectConversion = undefined
                if (
                  m15Unit(next.unit) ===
                    m15Unit(String(project.alternativeUnit ?? '')) &&
                  Number(project.alternativeUnitFactor) > 0
                )
                  next.projectConversion = {
                    fromUnit: next.unit,
                    toUnit: String(project.unit),
                    factor: 1 / Number(project.alternativeUnitFactor),
                  }
              }
              return next
            })()
          : row,
      ),
    }))
  }
  async function downloadTemplate() {
    setDownloadingTemplate(true)
    setError('')
    try {
      const { downloadM15ImportTemplate } = await import('./m15-import')
      downloadM15ImportTemplate(projectOptions)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Не удалось скачать шаблон.',
      )
    } finally {
      setDownloadingTemplate(false)
    }
  }
  function validate(nextStep: number) {
    setError('')
    try {
      if (!receiptDocumentSchema.safeParse(documentDraft).success)
        throw new Error('Укажите номер и корректную дату М-15.')
      if (!draft.cipher) throw new Error('Выберите шифр М-15.')
      if (nextStep >= 2)
        validateM15Reconciliation(
          preparedDraft,
          withM15Document(
            workspace,
            newDocument && !saved ? documentDraft : undefined,
          ),
        )
      setStep(nextStep)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Проверьте форму.')
    }
  }
  async function save() {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    let dataSaved = saved
    try {
      if (files.length && !scanPolicy)
        throw new Error(
          'Откройте сканы и выберите: заменить файлы или оставить несколько.',
        )
      const fileError = documentFileSelectionError(files)
      if (fileError) throw new Error(fileError)
      validateM15Reconciliation(
        preparedDraft,
        withM15Document(
          workspace,
          newDocument && !saved ? documentDraft : undefined,
        ),
      )
      if (!saved || !jsonEqual(preparedDraft, baseline) || hasPendingSave?.()) {
        await onSave(
          preparedDraft,
          baseline,
          newDocument && !saved ? documentDraft : undefined,
        )
        setBaseline(structuredClone(preparedDraft))
        setDraft(preparedDraft)
        setQuantityTexts({})
        setSaved(true)
        dataSaved = true
      }
      if (files.length && scanPolicy) {
        await uploadM15Scans(documentId, files, scanPolicy)
        setFiles([])
        setScanRevision((value) => value + 1)
      }
      setNotice(
        embedded ? 'М-15 добавлена в черновик получения.' : 'М-15 сохранена.',
      )
      onSaved?.()
      onClose()
    } catch (cause) {
      setError(
        `${dataSaved && files.length ? 'М-15 сохранена, сканы не загружены. Повторите сохранение. ' : ''}${cause instanceof Error ? cause.message : 'Не удалось сохранить М-15.'}`,
      )
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const title =
    newDocument && !saved ? 'Новая М-15' : receiptDocumentLabel(documentDraft)
  return (
    <WorkflowDialog
      title={title}
      embedded={embedded}
      compact={step === 0}
      fillBody={step === 1 && !importing}
      dirty={dirty}
      busy={busy}
      onClose={onClose}
      step={step}
      onStep={(next) => (next < step ? setStep(next) : validate(next))}
      footer={(close) => (
        <>
          {error && (
            <p
              role="alert"
              className="w-full rounded-md bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => (step ? setStep(step - 1) : close())}
          >
            {step ? 'Назад' : 'Отмена'}
          </Button>
          {step < 2 ? (
            <Button
              disabled={busy || importing}
              onClick={() => validate(step + 1)}
            >
              Далее
            </Button>
          ) : (
            <Button
              disabled={busy || importing || changedRemotely}
              onClick={() => void save()}
            >
              {busy
                ? 'Сохранение…'
                : embedded
                  ? 'Добавить в получение'
                  : 'Сохранить М-15'}
            </Button>
          )}
        </>
      )}
    >
      <fieldset
        disabled={busy}
        className={
          step === 1 && !importing
            ? 'flex min-h-0 min-w-0 flex-1 flex-col gap-3'
            : 'grid min-w-0 gap-4'
        }
      >
        {syncFeedback}
        {notice && (
          <p role="status" className="text-sm text-emerald-700">
            {notice}
          </p>
        )}
        {changedRemotely && (
          <div className="flex flex-wrap items-center gap-3 rounded border border-amber-200 p-3 text-sm">
            М-15 изменена в другой вкладке. Ваш черновик сохранён в форме.
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm('Заменить черновик актуальной М-15?')) {
                  setBaseline(existing)
                  setDraft({
                    ...independentM15(documentId, existing),
                    cipher: existing?.cipher ?? '',
                  })
                  setError('')
                  setQuantityTexts({})
                  setDetailLine('')
                }
              }}
            >
              Загрузить актуальную М-15
            </Button>
          </div>
        )}
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <label className="grid gap-1 text-sm">
              Номер М-15
              <Input
                aria-label="Номер М-15"
                disabled={!newDocument || saved}
                value={documentDraft.number}
                onChange={(event) =>
                  setDocumentDraft({
                    ...documentDraft,
                    number: event.target.value,
                  })
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              Дата М-15
              <DateInput
                aria-label="Дата М-15"
                disabled={!newDocument || saved}
                value={documentDraft.date}
                onValueChange={(value) =>
                  setDocumentDraft({
                    ...documentDraft,
                    date: value,
                  })
                }
              />
            </label>
            <div className="grid gap-1 text-sm sm:col-span-2">
              <span>Шифр</span>
              <AppSelect
                label="Шифр М-15"
                value={draft.cipher}
                disabled={draft.lines.length > 0 && !!draft.cipher}
                options={[
                  { value: '', label: 'Выберите шифр' },
                  ...[
                    ...new Set(
                      candidates.map((row) => row.cipher).filter(Boolean),
                    ),
                  ]
                    .sort()
                    .map((value) => ({ value, label: value })),
                ]}
                onChange={(cipher) => {
                  setDraft({ ...draft, cipher })
                  setQuantityTexts({})
                }}
              />
            </div>
          </div>
        )}
        {step === 1 && (
          <>
            {importing ? (
              <Suspense fallback={<p>Открытие импорта…</p>}>
                <ImportPanel
                  value={draft}
                  materials={projectOptions}
                  onCancel={() => setImporting(false)}
                  onApply={(value) => {
                    setDraft({
                      ...draft,
                      lines: matchM15ProjectMaterials(
                        value.lines,
                        draft.lines,
                        candidates,
                        draft.cipher,
                      ),
                      allocations: value.allocations,
                    })
                    setQuantityTexts({})
                    setDetailLine('')
                    setImporting(false)
                  }}
                />
              </Suspense>
            ) : (
              <>
                <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div className="grid gap-1">
                      <h3 className="text-sm font-medium">
                        Материалы выбранного шифра
                      </h3>
                      <p className="text-xs text-slate-500">
                        Позиций: {gridRows.length}. Заполнено:{' '}
                        {filledRows.length}.
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                      {draft.cipher}
                    </span>
                  </div>
                  <div className="shrink-0 border-b border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {[false, true].map((filled) => (
                        <button
                          key={String(filled)}
                          type="button"
                          aria-pressed={filledOnly === filled}
                          onClick={() => setFilledOnly(filled)}
                          className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs ${filledOnly === filled ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-500'}`}
                        >
                          {filled ? 'Заполненные' : 'Все'}{' '}
                          <span className="rounded-full bg-white/70 px-1.5 py-0.5">
                            {filled ? filledRows.length : gridRows.length}
                          </span>
                        </button>
                      ))}
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <Button
                          ref={searchButton}
                          variant="outline"
                          size="icon"
                          aria-label={
                            searchOpen ? 'Скрыть поиск' : 'Поиск материалов'
                          }
                          title={
                            searchOpen
                              ? 'Скрыть поиск и сбросить запрос'
                              : 'Поиск материалов'
                          }
                          aria-expanded={searchOpen}
                          onClick={() =>
                            searchOpen ? closeSearch() : setSearchOpen(true)
                          }
                        >
                          {searchOpen ? <X size={17} /> : <Search size={17} />}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setImporting(true)}
                        >
                          <FileInput size={16} />
                          Импорт Excel
                        </Button>
                        <Button
                          variant="outline"
                          disabled={
                            downloadingTemplate || !projectOptions.length
                          }
                          onClick={() => void downloadTemplate()}
                          title="Материалы выбранного шифра. Заполните количество для нужных позиций."
                        >
                          <Download size={16} aria-hidden="true" />
                          {downloadingTemplate
                            ? 'Подготовка…'
                            : 'Скачать шаблон Excel'}
                        </Button>
                      </div>
                    </div>
                    {searchOpen && (
                      <Input
                        autoFocus
                        className="mt-3"
                        aria-label="Поиск материалов М-15"
                        placeholder="Наименование, нормативный документ, состав или тип материала"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            event.stopPropagation()
                            closeSearch()
                          }
                        }}
                      />
                    )}
                  </div>
                  <M15MaterialsGrid
                    rows={visibleRows}
                    showRequested={requestEntries !== undefined}
                    onQuantity={changeQuantity}
                    onOpen={openDetails}
                    initialFilterModel={filterModel}
                    onFilterChange={setFilterModel}
                    emptyMessage={
                      filledOnly
                        ? 'Заполненных позиций нет.'
                        : 'Материалы не найдены.'
                    }
                  />
                </section>
                {detailLine && (
                  <WorkflowDialog
                    title="Настройки материала М-15"
                    onClose={() => setDetailLine('')}
                    footer={
                      <Button onClick={() => setDetailLine('')}>Готово</Button>
                    }
                  >
                    {draft.lines
                      .filter((line) => line.id === detailLine)
                      .map((line) => {
                        const project = projectById.get(
                          line.projectLineId ?? '',
                        )
                        const nameExpanded =
                          expandedNames[line.id] ??
                          (!!project && line.name !== project.name)
                        return (
                          <div
                            key={line.id}
                            className="grid gap-3 rounded-lg border border-slate-200 p-4"
                            data-testid="m15-material"
                          >
                            <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_100px_auto]">
                              <div className="grid min-w-0 gap-1 self-center">
                                <span className="text-sm text-slate-500">
                                  Материал
                                </span>
                                <span className="font-medium">
                                  {project?.name ?? line.name}
                                </span>
                                {!nameExpanded &&
                                  project &&
                                  line.name !== project.name && (
                                    <span className="text-sm text-slate-500">
                                      По М-15: {line.name}
                                    </span>
                                  )}
                              </div>
                              <label className="grid gap-1 text-sm">
                                Единица
                                <Input
                                  value={line.unit}
                                  onChange={(event) =>
                                    updateLine(line.id, {
                                      unit: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setDraft({
                                    ...draft,
                                    lines: draft.lines.filter(
                                      (row) => row.id !== line.id,
                                    ),
                                  })
                                  setQuantityTexts((current) => {
                                    const next = { ...current }
                                    delete next[line.id]
                                    return next
                                  })
                                  setDetailLine('')
                                }}
                              >
                                Убрать
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-expanded={nameExpanded}
                                onClick={() =>
                                  setExpandedNames({
                                    ...expandedNames,
                                    [line.id]: !nameExpanded,
                                  })
                                }
                              >
                                Другое название в накладной
                              </Button>
                              {project && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-expanded={editingMaterial === line.id}
                                  onClick={() =>
                                    setEditingMaterial(
                                      editingMaterial === line.id
                                        ? ''
                                        : line.id,
                                    )
                                  }
                                >
                                  Изменить материал
                                </Button>
                              )}
                            </div>
                            {nameExpanded && (
                              <label className="grid gap-1 text-sm">
                                Наименование по М-15
                                <Input
                                  value={line.name}
                                  onChange={(event) =>
                                    updateLine(line.id, {
                                      name: event.target.value,
                                    })
                                  }
                                />
                              </label>
                            )}
                            {(!project || editingMaterial === line.id) && (
                              <div className="grid gap-1 text-sm">
                                <span>Материал проекта</span>
                                <AppSelect
                                  label={`Проектный материал: ${line.name}`}
                                  value={line.projectLineId ?? ''}
                                  options={projectSelectOptions}
                                  onChange={(projectLineId) => {
                                    const next = projectById.get(projectLineId)
                                    updateLine(line.id, {
                                      projectLineId,
                                      name:
                                        next && line.name === project?.name
                                          ? next.name
                                          : line.name,
                                      unit:
                                        next && line.unit === project?.unit
                                          ? next.unit
                                          : line.unit,
                                    })
                                    setEditingMaterial('')
                                  }}
                                />
                              </div>
                            )}
                            {project &&
                              m15Unit(line.unit) !== m15Unit(project.unit) && (
                                <label className="grid gap-1 text-sm">
                                  1 {line.unit} = … {project.unit}
                                  <DecimalInput
                                    aria-label="Пересчёт единицы М-15 в единицу проекта"
                                    value={
                                      m15ProjectFactor(line, project.unit) ?? 0
                                    }
                                    onValue={(factor) =>
                                      updateLine(line.id, {
                                        projectConversion: {
                                          fromUnit: line.unit,
                                          toUnit: project.unit,
                                          factor,
                                        },
                                      })
                                    }
                                  />
                                </label>
                              )}
                          </div>
                        )
                      })}
                  </WorkflowDialog>
                )}
              </>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <p className="text-sm text-slate-600">
              {receiptDocumentLabel(documentDraft)} · {draft.cipher} ·
              Материалов: {preparedDraft.lines.length}.
            </p>
            <OperationsGrid
              id="m15-review"
              label="Состав М-15"
              rows={preparedDraft.lines}
              rowId={(row) => row.id}
              columns={[
                {
                  id: 'material',
                  title: 'Материал',
                  value: (row) => row.name,
                  flex: 1,
                  width: 360,
                },
                { id: 'unit', title: 'Единица', value: (row) => row.unit },
                {
                  id: 'quantity',
                  title: 'По М-15',
                  value: (row) => row.quantity,
                  numeric: true,
                },
              ]}
            />
            {!embedded && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowScans(!showScans)}
                >
                  Сканы М-15{files.length ? ` · ${files.length}` : ''}
                </Button>
                {showScans && (
                  <M15Scans
                    documentId={documentId}
                    saved={!!existing || saved}
                    revision={scanRevision}
                    files={files}
                    onChange={setFiles}
                    policy={scanPolicy}
                    onPolicyChange={setScanPolicy}
                    disabled={busy}
                  />
                )}
              </>
            )}
          </>
        )}
      </fieldset>
    </WorkflowDialog>
  )
}
