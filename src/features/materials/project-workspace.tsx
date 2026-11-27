import {
  EscapeLayer,
  EscapeFilters,
  useEscapeAction,
} from '#/components/ui/escape-layer'
import { buildM15Accounting } from './m15-independent'
import { DateInput } from '#/components/ui/date-input'
import { RequestMaterialsGrid } from './request-materials-grid'
import './request-list.css'
import type { RequestMaterialRow } from './request-materials-grid'
import { WorkspaceDock } from './workspace-dock'
import { SelectField } from '#/components/ui/select-field'
import { WorkflowSteps } from './workflow-dialog'
import { ReceiptReview } from './receipt-review'
import {
  OperationDisplayProvider,
  OperationDisplayToggle,
  useOperationDisplay,
} from './operation-display'
import {
  qualityWithM15,
  storedQualityWorkflow as canonicalQualityWorkflow,
  emptyQualityWorkflow,
  currentInspection,
  latestInspectionAct,
  inspectionApprovals,
  customerReturnTotals,
  customerReturnReason,
  rejectedReturnAllocations,
  approvedCustomerReturnTotals,
  validateQualityWorkspace,
} from './quality-workflow'
import { useProjectEditDraft } from './use-project-edit-draft'
import { isReceiptOverageApproved } from './receipt-overage'
import type { ReceiptOverageApproval } from './receipt-overage'
import { ProjectEditReview } from './project-edit-review'
import { projectDraftChanges, updateProjectFields } from './project-edit-draft'
import type { ProjectEditableField } from './project-edit-draft'
import {
  ProjectAccountingContext,
  useProjectAccounting,
} from './project-accounting-context'
import { ProjectChangesPanel, ProjectDialog } from './project-changes-ui'
import type { ProjectReturnTarget } from './project-changes-ui'
import {
  projectConsequences,
  reconcileProjectRequests,
  validateProjectAccounting,
} from './project-changes'
import type { ProjectChangeWorkspace } from './project-changes'
import {
  cancelledRequestQuantity,
  effectiveRequestQuantity,
  stockAssignmentKey,
} from './project-change-types'
import type {
  ProjectChange,
  RequestCancellation,
  StockTransfer,
} from './project-change-types'
import { availableAssignedStock, stockAssignments } from './stock-assignments'
import {
  validateM15Reconciliation,
  validateM15Workspace,
} from './m15-reconciliation'
import type { M15Reconciliation } from './m15-reconciliation'
import { jsonEqual } from './workspace-protocol'
import { SiteReturnForm, SiteReturnsWorkspace } from './site-returns'
import { netIssued, siteReturned } from './material-issues'
import type { IssueMovement, SiteReturn } from './material-issues'
import { AppSelect } from '#/components/ui/app-select'
import { RequestMaterialTypeSelect } from './request-material-type-select'
import { DocumentsSection } from './documents-section'
import { M15Section } from './m15-section'
import { withoutM15Composition } from './m15-composition-removal'
import { withM15Document } from './m15-document'
import {
  WorkspaceNavigationProvider,
  useWorkspaceNavigation,
} from './workspace-navigation'
import type {
  OperationDocumentTab,
  WorkspaceNavigation,
} from './workspace-navigation'
import { DocumentNumberingSettings } from './document-numbering-settings'
import { QualityPrintSettings } from './quality-print-ui'
import {
  DocumentNumberingContext,
  useDocumentNumber,
} from './document-numbering-context'
import {
  consumeDocumentNumbers,
  documentNumberHistory,
  documentKinds,
  documentLabels,
  initialNumbering,
  materialNumberContext,
} from './document-numbering'
import type { DocumentNumbering, NumberHistory } from './document-numbering'
import {
  buildIdentityLineFromImport,
  getMaterialIdentityKey,
  previewMaterialImportRows,
  withStableId,
} from './project-material-data'
import type { MaterialImportPreview } from './project-material-data'
import { MaterialImportChanges } from './material-import-changes'
import {
  isMaterialFullyReceived,
  remainingMaterialQuantity,
} from './material-progress'
import {
  emptyOverviewIndicators,
  assignedOperationIndicators,
  indexOperationIndicators,
  isOverviewSort,
  overviewIndicatorKeys,
  overviewIndicatorLabels,
  prioritizeOverviewRows,
  receiptIndicatorKeys,
  receiptIndicatorsByLine,
  requestRemainingQuantities,
  summarizeOverviewIndicators,
} from './operation-overview-indicators'
import {
  FilterAutocompleteInput,
  OperationIndicatorBadge,
  OperationSearchControls,
} from './operation-list-controls'
import {
  emptyOperationListView,
  isOperationListViews,
  matchesOperationMaterial,
  normalizeOperationSearch as normalizeSearchValue,
  operationMaterial,
  prioritizeReceiptRows,
  receiptPriority,
  sortOperationsNewestFirst,
} from './operation-list-view'
import type {
  OperationListView,
  OperationMaterial,
  ReceiptPriority,
} from './operation-list-view'
import type {
  OverviewIndicators,
  OperationIndicatorIndex,
  OverviewSort,
} from './operation-overview-indicators'
import type { MaterialProgress } from './material-progress'
import { ReturnsWorkspace } from './returns-workspace'
import { ReturnsTable } from './returns-table'
import { ReceiptDocumentInputs } from './receipt-document-inputs'
import { receiptChronologyError } from './operation-chronology'
import { allocateIssue, issueAvailability } from './issue-allocation'
import { ReceiptReferencesDialog } from './receipt-references-dialog'
import { groupReceiptDeliveries } from './receipt-deliveries'
import type { ReceiptDelivery } from './receipt-deliveries'
import {
  bindReceiptDocuments,
  documentsForReceipt,
  receiptDocumentCoverage,
  receiptDocumentCoverageLabel,
  indexReceiptDocuments,
  emptyReceiptDocumentFields,
  receiptDocumentError,
  receiptDocumentFields,
  receiptDocumentLabel,
  receiptDocuments,
} from './receipt-documents'
import type {
  ReceiptDocument,
  ReceiptDocumentFields,
} from './receipt-documents'
import {
  receivedByRequest,
  receiptBalances,
  requestReceiptProgress,
} from './receipt-balances'
import { createPortal, flushSync } from 'react-dom'
import { useReceiptScans } from './receipt-scans'
import { OperationsGrid } from './operations-grid'
import type { DataColumn } from './operations-grid'
import {
  OperationPagination,
  useOperationPagination,
} from './operation-pagination'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FilterModel, GridApi } from 'ag-grid-community'
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  Database,
  ChevronDown,
  Download,
  Pencil,
  FileInput,
  FileSpreadsheet,
  FolderOpen,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  RowActionButton,
  RowActions,
  DocumentActionButton,
  rowActionStyle,
} from '#/components/ui/row-action'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { HoverTooltip } from '#/components/ui/hover-tooltip'
import {
  getAlternativeConversionError,
  getOperationAlternative,
  getOperationConversion,
  recalculateOperationAlternatives,
  validateImportDraft,
} from './domain'
import { buildOperationActivityIndex } from './operation-activity'
import {
  localDateInputValue,
  normalizeCalendarDate,
  formatCalendarDate,
} from './calendar-date'
import {
  isViewExpanded,
  isViewString,
  useWorkspaceViewScroll,
  useWorkspaceViewState,
} from './workspace-view'
import { ProjectMaterialGrid } from './project-material-grid'
import { parseProjectQuantity, readDataGridState } from './project-grid-state'
import type {
  MaterialMatrixRow,
  MaterialHighlight,
  PendingDeleteMaterial,
} from './project-grid-state'
import { useProjectMatrixColumns } from './project-matrix-columns'
import {
  readWorkspaceCache,
  writeWorkspaceCache,
  toWorkspaceSnapshot,
} from './workspace-snapshot'
import type { LoadedWorkspace } from './workspace-snapshot'
import { createWorkspaceSaver } from './workspace-saver'
import {
  createCollaborativeSaver,
  editJournalKey,
  workspaceClientIdentity,
} from './workspace-collaboration'
import type { EditConflict, EditJournal } from './workspace-collaboration'
import { WorkspaceConflicts } from './workspace-conflicts'
import { RequestPrintButton, RequestPrintSettings } from './request-print-ui'
import type { QualityWorkflow } from './quality-workflow'
import { InspectionWorkspace, QualitySettings } from './quality-workflow-ui'
import type { WorkspaceSaveStatus } from './workspace-saver'
import {
  saveProjectWorkspaceSnapshot,
  saveProjectWorkspaceChanges,
  loadProjectWorkspaceChanges,
} from './functions'
import type {
  MaterialReceiptImportRowInput,
  MaterialRequestImportRowInput,
} from './excel'
import type {
  ImportRowInput,
  NormalizedImportRow,
  SubobjectMaterialMetric,
} from './types'

type InspectionApproval = ReturnType<typeof inspectionApprovals>[number]
type OperationActionTab = Exclude<OperationDocumentTab, 'overview' | 'returns'>
type OperationDeletion = {
  title: string
  details: string
} & ({ kind: 'receipts'; ids: Array<string> } | { kind: 'issues'; id: string })
type ReferenceSettingsKey =
  | 'materialTypes'
  | 'ciphers'
  | 'units'
  | 'documents'
  | 'alloys'
type ReferenceSettingsDraft = {
  ciphers: string
  units: string
  documents: string
  alloys: string
}
type MaterialTypeSetting = {
  description: string
  id: string
  name: string
}
type RequestProjectQuantities = {
  projectQuantity: number
  cipherQuantity: number
  unit: string
}
type MaterialRequestEntry = {
  projectCancellations?: RequestCancellation[]
  altQuantity: number | null
  altUnit: string
  altUnitFactor?: number | null
  cipher: string
  date: string
  id: string
  materialId: string
  note: string
  requestNote?: string
  materialType?: string
  number: string
  projectLineId: string
  projectMaterialName: string
  projectUnit: string
  projectQuantitiesAtCreation?: RequestProjectQuantities
  quantity: number
  requester: string
  sourceCipher?: string
  sourceQuantity?: number
}
type RequestDocumentGroup = {
  cipher: string
  date: string
  entries: Array<MaterialRequestEntry>
  number: string
  quantity: number
  requester: string
}
type RequestGroupMeta = {
  group: RequestDocumentGroup
  materialType: string
  searchText: string
  materials: Array<OperationMaterial>
}
type MaterialRequestImportDraftRow = {
  draft: RequestDraft
  errors: Array<string>
  line: SubobjectMaterialMetric | null
  row: MaterialRequestImportRowInput
  status: 'error' | 'ignored' | 'ready'
}
type MaterialRequestImportDraft = {
  rows: Array<MaterialRequestImportDraftRow>
  summary: {
    errors: number
    ignored: number
    ready: number
    total: number
  }
}
type MaterialReceiptEntry = {
  overageApproval?: ReceiptOverageApproval
  appDocumentId?: string
  m15DocumentId?: string
  actualName: string
  altQuantity: number | null
  altUnit: string
  altUnitFactor?: number | null
  certificate: string
  customerArvk: string
  date: string
  factoryNumber: string
  heatBatch: string
  id: string
  manufacturer: string
  note: string
  projectLineId: string
  projectUnit: string
  qualityDocument: string
  quantity: number
  requestId: string
  technicalDecision: string
}
type ReceiptDocumentGroup = {
  actualName: string
  date: string
  firstDate: string
  entries: Array<MaterialReceiptEntry>
  key: string
  quantity: number
  requestNumbers: Array<string>
  replacement: boolean
}
type ReceiptGroupMeta = {
  group: ReceiptDocumentGroup
  searchText: string
  materials: Array<OperationMaterial>
}
type MaterialReceiptImportDraftRow = {
  draft: ReceiptDraft
  errors: Array<string>
  request: MaterialRequestEntry | null
  row: MaterialReceiptImportRowInput
  status: 'error' | 'ignored' | 'ready'
}
type MaterialReceiptImportDraft = {
  rows: Array<MaterialReceiptImportDraftRow>
  summary: {
    errors: number
    ignored: number
    ready: number
    total: number
  }
}
type MaterialIssueEntry = IssueMovement & {
  altQuantity: number | null
  altUnit?: string
  altUnitFactor?: number | null
  projectUnit?: string
  date: string
  document: string
  id: string
  note: string
  projectLineId: string
  quantity: number
  receiptId: string
  receiver: string
}
type StoredProjectWorkspace = {
  projectChanges?: ProjectChange[]
  stockTransfers?: StockTransfer[]
  m15Reconciliations?: M15Reconciliation[]
  documentNumbering?: DocumentNumbering
  qualityWorkflow?: QualityWorkflow
  configuredAlloys?: Array<string>
  configuredCiphers?: Array<string>
  configuredDocuments?: Array<string>
  configuredUnits?: Array<string>
  lines?: Array<SubobjectMaterialMetric>
  materialTypeSettings?: Array<MaterialTypeSetting>
  materialIssues?: Array<MaterialIssueEntry>
  materialReceipts?: Array<MaterialReceiptEntry>
  materialRequests?: Array<MaterialRequestEntry>
}

const defaultMaterialTypeSettings: Array<MaterialTypeSetting> = [
  {
    id: 'equipment',
    name: 'Оборудование',
    description:
      'Насосы, аппараты, емкости, теплообменники, компрессоры, блоки, шкафы, агрегаты.',
  },
  {
    id: 'metal-structures',
    name: 'Металлоконструкции',
    description:
      'Балки, стойки, площадки, лестницы, опоры, рамы, закладные, фермы.',
  },
  {
    id: 'pipe-products',
    name: 'Трубопроводы / трубная продукция',
    description:
      'Труба, трубные заготовки, патрубки, гнутые элементы, трубные узлы.',
  },
  {
    id: 'pipeline-fittings',
    name: 'Соединительные детали трубопроводов',
    description:
      'Отводы, переходы, тройники, заглушки, днища, штуцеры, бобышки.',
  },
  {
    id: 'flange-connections',
    name: 'Фланцы и фланцевые соединения',
    description:
      'Фланцы, прокладки, шпильки, гайки, шайбы, комплекты крепежа для фланцев.',
  },
  {
    id: 'pipeline-valves',
    name: 'Арматура трубопроводная',
    description:
      'Задвижки, клапаны, краны, затворы, обратные клапаны, регуляторы, фильтры.',
  },
  {
    id: 'fasteners',
    name: 'Крепеж и метизы',
    description:
      'Болты, гайки, шпильки, шайбы, анкера, саморезы, хомуты, скобы.',
  },
  {
    id: 'pipe-supports',
    name: 'Опоры и подвески трубопроводов',
    description:
      'Опоры неподвижные и скользящие, подвески, хомутовые опоры, пружинные блоки.',
  },
  {
    id: 'cable-products',
    name: 'Кабельная продукция',
    description: 'Кабели силовые, контрольные, связи, греющие кабели, провода.',
  },
  {
    id: 'electrical-installation',
    name: 'Электромонтажные изделия',
    description:
      'Лотки, короба, трубы ПНД и металлорукав, кабельные муфты, наконечники, клеммы, вводы.',
  },
  {
    id: 'instrumentation',
    name: 'КИПиА',
    description:
      'Датчики, манометры, термометры, преобразователи, клапаны КИП, импульсные трубки, шкафы КИП.',
  },
  {
    id: 'insulation',
    name: 'Изоляционные материалы',
    description:
      'Минвата, цилиндры, маты, кожухи, скорлупа, фольга, лента, проволока для изоляции.',
  },
  {
    id: 'coatings',
    name: 'ЛКМ и защитные покрытия',
    description:
      'Грунт, эмаль, краска, растворитель, мастики, антикоррозионные составы.',
  },
  {
    id: 'consumables',
    name: 'Расходные и вспомогательные материалы',
    description:
      'Абразивы, круги, ленты, ветошь, герметики, смазки, маркировка, временный крепеж.',
  },
  {
    id: 'civil-materials',
    name: 'ЖБИ и строительные материалы',
    description:
      'Бетонные изделия, блоки, цемент, песок, щебень, смеси, анкеровочные составы.',
  },
  {
    id: 'embedded-installation',
    name: 'Закладные и монтажные изделия',
    description:
      'Пластины, гильзы, закладные детали, монтажные вставки, проходки.',
  },
  {
    id: 'assemblies',
    name: 'Комплекты / узлы / сборочные единицы',
    description:
      'Комплекты крепления, узлы трубопровода, монтажные комплекты и другие сборочные единицы.',
  },
  {
    id: 'non-project',
    name: 'Непроектный материал',
    description:
      'Материал, которого нет в проектной спецификации, но который нужно отдельно учесть в системе.',
  },
]

const operationTabMeta: Record<
  OperationDocumentTab,
  {
    action: string
    empty: string
    icon: React.ReactNode
    label: string
  }
> = {
  overview: {
    action: '',
    empty: 'Материалов пока нет.',
    icon: <BarChart3 size={18} />,
    label: 'Общие данные',
  },
  requests: {
    action: 'Создать заявку',
    empty: 'Заявок пока нет.',
    icon: <FileInput size={18} />,
    label: 'Заявки',
  },
  receipts: {
    action: 'Оформить получение',
    empty: 'Заявок и получений пока нет.',
    icon: <PackageCheck size={18} />,
    label: 'Получение',
  },
  quality: {
    action: 'Создать ЗНИ',
    empty: 'Документов входного контроля пока нет.',
    icon: <ClipboardCheck size={18} />,
    label: 'Входной контроль',
  },
  issues: {
    action: 'Выдать в монтаж',
    empty: 'Выдач в монтаж пока нет.',
    icon: <Send size={18} />,
    label: 'Выдача',
  },
  returns: {
    action: 'Оформить возврат',
    empty: 'Возвратов пока нет.',
    icon: <Undo2 size={18} />,
    label: 'Возврат',
  },
}

const emptyNewLine = {
  cipher: '',
  cipherQuantities: {} as Record<string, string>,
  materialType: '',
  materialId: '',
  projectMaterialName: '',
  normativeDocument: '',
  material: '',
  unitWeight: '',
  plannedQuantity: '',
  unit: 'шт',
  alternativeUnit: '',
  alternativeUnitFactor: '',
}

type MaterialImportDraftRow = {
  errors: Array<string>
  identityKey: string
  isExistingCombination: boolean
  row: NormalizedImportRow
  warnings: Array<string>
}
type MaterialImportDraft = {
  rows: Array<MaterialImportDraftRow>
  summary: {
    errorRows: number
    existingRows: number
    missingAlloys: Array<string>
    missingCiphers: Array<string>
    missingDocuments: Array<string>
    missingUnits: Array<string>
    newRows: number
    totalRows: number
    unknownReferenceRows: number
    validRows: number
  }
}

export function ProjectWorkspace({
  navigation,
  initialStoredData,
}: {
  initialStoredData: LoadedWorkspace
  navigation?: WorkspaceNavigation
}) {
  return (
    <WorkspaceNavigationProvider navigation={navigation}>
      <ProjectWorkspaceContent initialStoredData={initialStoredData} />
    </WorkspaceNavigationProvider>
  )
}

function ProjectWorkspaceContent({
  initialStoredData,
}: {
  initialStoredData: LoadedWorkspace
}) {
  const collaborative = initialStoredData.storage === 'postgres'
  const [loadedWorkspace] = useState(() => {
    if (collaborative || typeof window === 'undefined')
      return {
        workspace: initialStoredData.workspace,
        recovery: null,
        cacheEnabled: false,
        pending: false,
      }
    try {
      return readWorkspaceCache(initialStoredData, window.localStorage)
    } catch {
      return {
        workspace: initialStoredData.workspace,
        recovery: null,
        cacheEnabled: false,
        pending: false,
      }
    }
  })
  const [storedWorkspace] = useState(() =>
    normalizeStoredProjectWorkspace(loadedWorkspace.workspace),
  )
  const { view, navigate } = useWorkspaceNavigation()
  const section = view.section
  const setSection = (next: typeof section) => navigate({ section: next })
  const [lines, setLines] = useState<Array<SubobjectMaterialMetric>>(
    () => storedWorkspace.lines?.map(withStableId) ?? [],
  )
  const [selectedLineId, setSelectedLineId] = useWorkspaceViewState(
    'selectedLine',
    lines[0]?.id ?? '',
    isViewString,
  )
  const [cipherFilter, setCipherFilter] = useWorkspaceViewState(
    'database.cipher',
    'all',
    isViewString,
  )
  const [selectedCombinationKey, setSelectedCombinationKey] = useState<
    string | null
  >(null)
  const [importedCombinationKeys, setImportedCombinationKeys] = useState<
    Array<string>
  >([])
  const [materialHighlight, setMaterialHighlight] =
    useState<MaterialHighlight | null>(null)
  const [tableFilterResetVersion, setTableFilterResetVersion] = useState(0)
  const [newLine, setNewLine] = useState(emptyNewLine)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [materialModalOpen, setMaterialModalOpen] = useState(false)
  const [materialSaveError, setMaterialSaveError] = useState('')
  const [materialImportOpen, setMaterialImportOpen] = useState(false)
  const [materialImportDraft, setMaterialImportDraft] =
    useState<MaterialImportDraft | null>(null)
  const [materialImportError, setMaterialImportError] = useState('')
  const [materialImportLoading, setMaterialImportLoading] = useState(false)
  const [pendingDeleteMaterial, setPendingDeleteMaterial] =
    useState<PendingDeleteMaterial | null>(null)
  useEffect(() => {
    setMaterialModalOpen(false)
    setMaterialImportOpen(false)
    setPendingDeleteMaterial(null)
    setExcelMenuOpen(false)
  }, [section])
  const [documentNumbering, setDocumentNumbering] = useState<
    DocumentNumbering | undefined
  >(() => storedWorkspace.documentNumbering)
  const [settingsError, setSettingsError] = useState('')
  const [excelMenuOpen, setExcelMenuOpen] = useState(false)
  const excelMenuRef = useRef<HTMLDivElement>(null)
  const excelMenuButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!excelMenuOpen) return
    function closeOutside(event: Event) {
      if (
        event.target instanceof Node &&
        !excelMenuRef.current?.contains(event.target)
      ) {
        setExcelMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
    }
  }, [excelMenuOpen])
  useEscapeAction({
    kind: 'popup',
    enabled: excelMenuOpen,
    onEscape: () => {
      setExcelMenuOpen(false)
      excelMenuButtonRef.current?.focus()
    },
  })
  const [projectGrid, setProjectGrid] =
    useState<GridApi<MaterialMatrixRow> | null>(null)
  const [configuredCiphers, setConfiguredCiphers] = useState<Array<string>>(
    () => storedWorkspace.configuredCiphers ?? [],
  )
  const [configuredUnits, setConfiguredUnits] = useState<Array<string>>(
    () => storedWorkspace.configuredUnits ?? ['шт', 'м'],
  )
  const [configuredDocuments, setConfiguredDocuments] = useState<Array<string>>(
    () => storedWorkspace.configuredDocuments ?? [],
  )
  const [configuredAlloys, setConfiguredAlloys] = useState<Array<string>>(
    () => storedWorkspace.configuredAlloys ?? [],
  )
  const [materialTypeSettings, setMaterialTypeSettings] = useState<
    Array<MaterialTypeSetting>
  >(() => normalizeMaterialTypeSettings(storedWorkspace.materialTypeSettings))
  const [materialTypeDraft, setMaterialTypeDraft] =
    useState(materialTypeSettings)
  const [settingsDraft, setSettingsDraft] = useState<ReferenceSettingsDraft>(
    () => ({
      ciphers: serializeReferenceValues(
        unique([...configuredCiphers, ...lines.map((line) => line.cipher)]),
      ),
      units: serializeReferenceValues(
        unique([...configuredUnits, ...lines.map((line) => line.unit)]),
      ),
      documents: serializeReferenceValues(
        unique([
          ...configuredDocuments,
          ...lines.map((line) => line.normativeDocument ?? ''),
        ]),
      ),
      alloys: serializeReferenceValues(
        unique([...configuredAlloys, ...lines.map((line) => line.material)]),
      ),
    }),
  )
  const [projectChanges, setProjectChanges] = useState<
    ProjectChange[] | undefined
  >(() => storedWorkspace.projectChanges)
  const historicalProjectLines = useMemo(
    () =>
      new Set(
        (projectChanges ?? []).flatMap((change) =>
          change.items.map((item) => item.after.id),
        ),
      ),
    [projectChanges],
  )
  const [storedMaterialRequests, setMaterialRequests] = useState<
    Array<MaterialRequestEntry>
  >(() => storedWorkspace.materialRequests ?? [])
  const materialRequests = useMemo(() => {
    const lineById = new Map(
      lines.map((line) => [getProjectLineId(line), line]),
    )
    return recalculateOperationAlternatives(storedMaterialRequests, (entry) =>
      historicalProjectLines.has(entry.projectLineId)
        ? null
        : getOperationConversion(
            lineById.get(entry.projectLineId),
            entry.projectUnit,
            entry,
          ),
    )
  }, [storedMaterialRequests, lines, historicalProjectLines])
  useEffect(() => {
    // Keep the last calculated values if the material/conversion is later removed.
    if (materialRequests !== storedMaterialRequests)
      setMaterialRequests(materialRequests)
  }, [materialRequests, storedMaterialRequests])
  const [storedMaterialReceipts, setMaterialReceipts] = useState<
    Array<MaterialReceiptEntry>
  >(() => storedWorkspace.materialReceipts ?? [])
  const materialReceipts = useMemo(() => {
    const lineById = new Map(
      lines.map((line) => [getProjectLineId(line), line]),
    )
    const requestById = new Map(
      materialRequests.map((entry) => [entry.id, entry]),
    )
    return recalculateOperationAlternatives(storedMaterialReceipts, (entry) =>
      historicalProjectLines.has(entry.projectLineId)
        ? null
        : getOperationConversion(
            lineById.get(entry.projectLineId),
            entry.projectUnit,
            entry,
            requestById.get(entry.requestId),
          ),
    )
  }, [storedMaterialReceipts, lines, materialRequests, historicalProjectLines])
  useEffect(() => {
    if (materialReceipts !== storedMaterialReceipts)
      setMaterialReceipts(materialReceipts)
  }, [materialReceipts, storedMaterialReceipts])
  const [rawQualityWorkflow, setRawQualityWorkflow] = useState<
    QualityWorkflow | undefined
  >(() => storedWorkspace.qualityWorkflow)
  const [stockTransfers, setStockTransfers] = useState<
    StockTransfer[] | undefined
  >(() => storedWorkspace.stockTransfers)
  const [projectReturnTarget, setProjectReturnTarget] =
    useState<ProjectReturnTarget | null>(null)
  const [m15Reconciliations, setM15Reconciliations] = useState<
    M15Reconciliation[] | undefined
  >(() => storedWorkspace.m15Reconciliations)
  const qualityWorkflow = useMemo(
    () => qualityWithM15(rawQualityWorkflow, m15Reconciliations),
    [rawQualityWorkflow, m15Reconciliations],
  )
  function setQualityWorkflow(next: QualityWorkflow | undefined) {
    setRawQualityWorkflow(canonicalQualityWorkflow(next))
  }
  const qualityControls = useMemo(
    () => inspectionApprovals(qualityWorkflow),
    [qualityWorkflow],
  )
  function updateQualityWorkflow(next: QualityWorkflow) {
    const previous = {
      lines,
      projectChanges,
      stockTransfers,
      qualityWorkflow,
      materialReceipts,
      materialIssues,
      materialRequests,
    }
    const nextState = { ...previous, qualityWorkflow: next }
    const nextRequests = reconcileProjectRequests(
      nextState,
      localDateInputValue(),
    )
    const changed = { ...nextState, materialRequests: nextRequests }
    validateQualityWorkspace(changed, previous)
    validateProjectAccounting(changed, previous)
    setDocumentNumbering((current) =>
      consumeDocumentNumbers(
        current,
        numberHistory,
        documentNumberHistory(nextRequests, materialIssues, next),
      ),
    )
    setMaterialRequests(nextRequests)
    setQualityWorkflow(next)
  }
  const [storedMaterialIssues, setMaterialIssues] = useState<
    Array<MaterialIssueEntry>
  >(() => storedWorkspace.materialIssues ?? [])
  const materialIssues = useMemo(() => {
    const lineById = new Map(
      lines.map((line) => [getProjectLineId(line), line]),
    )
    const receiptById = new Map(
      materialReceipts.map((entry) => [entry.id, entry]),
    )
    return recalculateOperationAlternatives(storedMaterialIssues, (entry) => {
      const receipt = receiptById.get(entry.receiptId)
      if (
        historicalProjectLines.has(
          entry.projectLineId || receipt?.projectLineId || '',
        )
      )
        return null
      return getOperationConversion(
        lineById.get(entry.projectLineId),
        entry.projectUnit ?? receipt?.projectUnit,
        entry,
        receipt,
      )
    })
  }, [storedMaterialIssues, lines, materialReceipts, historicalProjectLines])
  useEffect(() => {
    if (materialIssues !== storedMaterialIssues)
      setMaterialIssues(materialIssues)
  }, [materialIssues, storedMaterialIssues])
  const numberHistory = useMemo(
    () =>
      documentNumberHistory(materialRequests, materialIssues, qualityWorkflow),
    [materialRequests, materialIssues, qualityWorkflow],
  )
  const numberingContext = useMemo(
    () => ({ settings: documentNumbering, history: numberHistory }),
    [documentNumbering, numberHistory],
  )
  const exhaustedCounters = useMemo(() => {
    const rules = documentNumbering ?? initialNumbering(numberHistory)
    return documentKinds.filter((kind) => rules[kind].lastValue >= 999999999)
  }, [documentNumbering, numberHistory])
  const [notice, setNotice] = useState(() =>
    lines.length
      ? ''
      : 'Добавьте первую позицию материала или импортируйте Excel.',
  )
  const [lastAction, setLastAction] = useState('')

  const [workspaceClientId] = useState(() =>
    workspaceClientIdentity(initialStoredData.user?.id),
  )
  const [saveStatus, setSaveStatus] = useState<WorkspaceSaveStatus>('saved')
  const [saveMessage, setSaveMessage] = useState('')
  const [editConflicts, setEditConflicts] = useState<EditConflict[]>([])
  const [cacheWarning, setCacheWarning] = useState(false)
  const [pendingJournal] = useState<EditJournal | null>(() => {
    if (!collaborative) return null
    try {
      return JSON.parse(
        localStorage.getItem(editJournalKey(workspaceClientId)) ?? 'null',
      ) as EditJournal | null
    } catch {
      return null
    }
  })
  const [collaborationReady, setCollaborationReady] = useState(!pendingJournal)
  const restoreStarted = useRef(false)
  const [workspaceSaver] = useState<
    | ReturnType<typeof createCollaborativeSaver>
    | ReturnType<typeof createWorkspaceSaver>
  >(() =>
    collaborative
      ? createCollaborativeSaver({
          accountingGeneration: initialStoredData.accountingGeneration,
          initial: {
            configuredAlloys,
            configuredCiphers,
            configuredDocuments,
            configuredUnits,
            lines,
            materialTypeSettings,
            materialIssues,
            materialReceipts,
            materialRequests,
            qualityWorkflow,
            projectChanges,
            stockTransfers,
            m15Reconciliations,
            documentNumbering,
          },
          revision: initialStoredData.revision!,
          versions: initialStoredData.versions!,
          groups: initialStoredData.groups!,
          save: (patch) => saveProjectWorkspaceChanges({ data: patch }),
          changes: (revision) =>
            loadProjectWorkspaceChanges({ data: { revision } }),
          onWorkspace: (workspace) => {
            const next = normalizeStoredProjectWorkspace(workspace)
            setLines(next.lines ?? [])
            setMaterialRequests(next.materialRequests ?? [])
            setMaterialReceipts(next.materialReceipts ?? [])
            setMaterialIssues(next.materialIssues ?? [])
            setQualityWorkflow(next.qualityWorkflow)
            setProjectChanges(next.projectChanges)
            setStockTransfers(next.stockTransfers)
            setM15Reconciliations(next.m15Reconciliations)
            setDocumentNumbering(next.documentNumbering)
            setConfiguredAlloys(next.configuredAlloys ?? [])
            setConfiguredCiphers(next.configuredCiphers ?? [])
            setConfiguredDocuments(next.configuredDocuments ?? [])
            setConfiguredUnits(next.configuredUnits ?? [])
            setMaterialTypeSettings(next.materialTypeSettings ?? [])
          },
          onStatus: (status, message, conflicts) => {
            setSaveStatus(status)
            setSaveMessage(message)
            setEditConflicts(conflicts)
          },
          writeJournal: (journal) => {
            if (journal)
              localStorage.setItem(
                editJournalKey(workspaceClientId),
                JSON.stringify(journal),
              )
            else localStorage.removeItem(editJournalKey(workspaceClientId))
          },
          onCacheError: () => setCacheWarning(true),
          canApplyRemote: () =>
            !document.querySelector(
              '[aria-modal="true"], .ag-cell-inline-editing',
            ) &&
            !document.activeElement?.matches(
              'input,textarea,select,[contenteditable="true"]',
            ),
        })
      : createWorkspaceSaver({
          initial: toWorkspaceSnapshot({
            configuredAlloys,
            configuredCiphers,
            configuredDocuments,
            configuredUnits,
            lines,
            materialTypeSettings,
            materialIssues,
            materialReceipts,
            materialRequests,
            qualityWorkflow,
            projectChanges,
            stockTransfers,
            m15Reconciliations,
            documentNumbering,
          }),
          revision: initialStoredData.revision,
          pending: loadedWorkspace.pending,
          save: (workspace, expectedRevision) =>
            saveProjectWorkspaceSnapshot({
              data: { workspace, expectedRevision },
            }),
          cache: (workspace, revision, pending) => {
            if (loadedWorkspace.cacheEnabled)
              writeWorkspaceCache(
                window.localStorage,
                workspace,
                revision,
                pending,
                workspaceClientId,
              )
          },
          onStatus: setSaveStatus,
        }),
  )
  useEffect(() => {
    if (!('poll' in workspaceSaver)) return
    if (!restoreStarted.current) {
      restoreStarted.current = true
      void workspaceSaver
        .restore(pendingJournal)
        .catch((error: unknown) => {
          setSaveMessage(
            error instanceof Error
              ? error.message
              : 'Не удалось восстановить правки вкладки.',
          )
          setSaveStatus('error')
        })
        .finally(() => setCollaborationReady(true))
    }
    const poll = () => {
      if (
        !collaborationReady ||
        document.hidden ||
        document.querySelector(
          '[aria-modal="true"], .ag-cell-inline-editing',
        ) ||
        document.activeElement?.matches(
          'input,textarea,select,[contenteditable="true"]',
        )
      )
        return
      void workspaceSaver.poll()
    }
    const interval = setInterval(poll, 2000)
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (workspaceSaver.hasPending()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('focus', poll)
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', poll)
      window.removeEventListener('beforeunload', beforeUnload)
      workspaceSaver.dispose()
    }
  }, [workspaceSaver, pendingJournal, collaborationReady])
  const submittedM15 = useRef(new Map<string, M15Reconciliation>())
  const submittedM15Removals = useRef(new Set<string>())
  async function removeM15Composition(
    baseline: M15Reconciliation,
    lineId?: string,
  ) {
    async function waitForRemovalSave() {
      try {
        await workspaceSaver.waitUntilSaved()
      } catch (cause) {
        if (submittedM15Removals.current.has(baseline.id))
          throw new Error(
            'Удаление ещё не сохранено на сервере. Повторите попытку.',
          )
        throw cause
      }
    }
    if (submittedM15Removals.current.has(baseline.id))
      await workspaceSaver.retry()
    await waitForRemovalSave()
    const previous = workspaceSaver.getLatest()
    const next = withoutM15Composition(previous, baseline, lineId)
    if (next !== previous) {
      validateQualityWorkspace(next, previous)
      submittedM15Removals.current.add(baseline.id)
      setM15Reconciliations(next.m15Reconciliations)
      workspaceSaver.update(collaborative ? next : toWorkspaceSnapshot(next))
      await waitForRemovalSave()
    }
    submittedM15Removals.current.delete(baseline.id)
  }
  async function saveM15Reconciliation(
    value: M15Reconciliation,
    baseline: M15Reconciliation | undefined,
    document?: ReceiptDocument,
  ) {
    const submitted = submittedM15.current.get(value.id)
    const local = workspaceSaver
      .getLatest()
      .m15Reconciliations?.find((row) => row.id === value.id)
    const queued =
      'hasPendingRecord' in workspaceSaver &&
      workspaceSaver.hasPendingRecord('m15Reconciliations', value.id)
    const retrying =
      (submitted && jsonEqual(local, submitted)) ||
      (queued && jsonEqual(local, baseline))
    if (retrying) {
      if ('refresh' in workspaceSaver) await workspaceSaver.refresh()
      if (editConflicts.length)
        throw new Error(
          'Сначала разрешите одновременные изменения в сравнении ниже.',
        )
    } else await workspaceSaver.waitUntilSaved()
    const previous = workspaceSaver.getLatest()
    const latest = withM15Document(previous, document, !!retrying)
    const existing = latest.m15Reconciliations?.find(
      (row) => row.id === value.id,
    )
    if (
      !retrying &&
      !jsonEqual(existing, baseline) &&
      !jsonEqual(existing, value)
    )
      throw new Error(
        'Сверка изменена другим пользователем. Загрузите актуальную сверку кнопкой ниже. Ваш черновик пока остаётся в окне.',
      )
    if (document && document.id !== value.id)
      throw new Error('М-15 и её состав должны относиться к одной накладной.')
    validateM15Reconciliation(value, latest)
    const records = [
      ...(latest.m15Reconciliations ?? []).filter((row) => row.id !== value.id),
      value,
    ]
    validateM15Workspace({ ...latest, m15Reconciliations: records }, previous)
    validateQualityWorkspace(
      { ...latest, m15Reconciliations: records },
      previous,
    )
    submittedM15.current.set(value.id, value)
    if (document)
      setQualityWorkflow(latest.qualityWorkflow ?? emptyQualityWorkflow())
    setM15Reconciliations(records)
    const outgoing = { ...latest, m15Reconciliations: records }
    workspaceSaver.update(
      collaborative ? outgoing : toWorkspaceSnapshot(outgoing),
    )
    if (retrying) await workspaceSaver.retry()
    await workspaceSaver.waitUntilSaved()
    submittedM15.current.delete(value.id)
  }
  const projectAccountingWorkspace = {
    lines,
    materialRequests,
    materialReceipts,
    materialIssues,
    qualityWorkflow: rawQualityWorkflow,
    projectChanges,
    stockTransfers,
  }
  const projectEditor = useProjectEditDraft(projectAccountingWorkspace)
  const [projectReviewOpen, setProjectReviewOpen] = useState(false)
  const [projectImportMode, setProjectImportMode] = useState<
    'full' | 'changes'
  >('changes')
  const [scopeEdit, setScopeEdit] = useState<{
    row: MaterialMatrixRow
    field: ProjectEditableField
    value: unknown
  } | null>(null)
  const [editScope, setEditScope] = useState('')
  const draftChanges = useMemo(
    () => (projectEditor.draft ? projectDraftChanges(projectEditor.draft) : []),
    [projectEditor.draft],
  )
  const draftCells = useMemo(
    () =>
      new Map(draftChanges.map((change) => [change.after.id, change.fields])),
    [draftChanges],
  )
  function updateProjectField(
    row: MaterialMatrixRow,
    field: ProjectEditableField,
    value: unknown,
  ) {
    if (row.lineIds.length > 1) {
      setEditScope('')
      setScopeEdit({ row, field, value })
      return
    }
    projectEditor.update((current) =>
      updateProjectFields(current, row.lineIds, field, value),
    )
  }
  function refreshProjectDraft() {
    projectEditor.refresh(projectAccountingWorkspace)
    if (!projectEditor.read()) {
      setProjectReviewOpen(false)
      setNotice('Эти значения уже сохранены в проектной базе.')
    }
  }
  const submittedProjectChange = useRef<{
    next: ProjectChangeWorkspace
    snapshot: ReturnType<typeof toWorkspaceSnapshot>
  } | null>(null)
  async function applyProjectAccounting(
    next: ProjectChangeWorkspace,
    baseline: ProjectChangeWorkspace,
  ) {
    const submitted = submittedProjectChange.current
    if (
      submitted?.next === next &&
      jsonEqual(workspaceSaver.getLatest(), submitted.snapshot)
    ) {
      await workspaceSaver.retry()
      await workspaceSaver.waitUntilSaved()
      submittedProjectChange.current = null
      setNotice('Изменения проекта сохранены.')
      return
    }
    await workspaceSaver.waitUntilSaved()
    const latest = workspaceSaver.getLatest()
    for (const key of [
      'lines',
      'materialRequests',
      'materialReceipts',
      'materialIssues',
      'qualityWorkflow',
      'projectChanges',
      'stockTransfers',
    ] as const)
      if (!jsonEqual(latest[key], baseline[key]))
        throw new Error(
          'Данные изменились. Нажмите «Обновить предпросмотр» и проверьте последствия заново.',
        )
    validateProjectAccounting(next, baseline)
    const snapshot = {
      ...latest,
      lines: next.lines,
      materialRequests: next.materialRequests,
      projectChanges: next.projectChanges,
      stockTransfers: next.stockTransfers,
    }
    validateQualityWorkspace(snapshot, latest)
    setLines(next.lines)
    setMaterialRequests(next.materialRequests as MaterialRequestEntry[])
    setProjectChanges(next.projectChanges)
    setStockTransfers(next.stockTransfers)
    const outgoing = collaborative ? snapshot : toWorkspaceSnapshot(snapshot)
    submittedProjectChange.current = {
      next,
      snapshot: toWorkspaceSnapshot(outgoing),
    }
    workspaceSaver.update(outgoing)
    await workspaceSaver.waitUntilSaved()
    submittedProjectChange.current = null
    setNotice('Изменения проекта сохранены.')
  }
  function downloadWorkspaceCopy(raw: string) {
    const url = URL.createObjectURL(
      new Blob([raw], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'materials-recovery.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  useEffect(() => {
    if (!collaborationReady) return
    const snapshot = {
      configuredAlloys,
      configuredCiphers,
      configuredDocuments,
      configuredUnits,
      lines,
      materialTypeSettings,
      materialIssues,
      materialReceipts,
      materialRequests,
      qualityWorkflow: canonicalQualityWorkflow(qualityWorkflow),
      projectChanges,
      stockTransfers,
      m15Reconciliations,
      documentNumbering,
    }
    workspaceSaver.update(
      collaborative ? snapshot : toWorkspaceSnapshot(snapshot),
    )
  }, [
    workspaceSaver,
    collaborative,
    collaborationReady,
    configuredAlloys,
    configuredCiphers,
    configuredDocuments,
    configuredUnits,
    lines,
    materialTypeSettings,
    materialIssues,
    materialReceipts,
    materialRequests,
    qualityWorkflow,
    projectChanges,
    stockTransfers,
    m15Reconciliations,
    documentNumbering,
  ])

  const selectedLine = lines.find((line) => line.id === selectedLineId)
  const importedKeySet = useMemo(
    () => new Set(importedCombinationKeys),
    [importedCombinationKeys],
  )
  const managedScopes = useMemo(
    () =>
      new Set(
        (projectChanges ?? []).map((change) =>
          JSON.stringify([change.project, change.cipher]),
        ),
      ),
    [projectChanges],
  )
  const filteredLines = useMemo(
    () =>
      projectEditor.lines.filter((line) => {
        if (
          line.plannedQuantity === 0 &&
          !draftCells.has(line.id!) &&
          managedScopes.has(JSON.stringify([line.project, line.cipher]))
        )
          return false
        const matchesCipher =
          cipherFilter === 'all' || line.cipher === cipherFilter
        const matchesCombination =
          selectedCombinationKey !== null
            ? getMaterialIdentityKey(line) === selectedCombinationKey
            : importedKeySet.size === 0 ||
              importedKeySet.has(getMaterialIdentityKey(line))

        return matchesCipher && matchesCombination
      }),
    [
      cipherFilter,
      importedKeySet,
      projectEditor.lines,
      draftCells,
      selectedCombinationKey,
      managedScopes,
    ],
  )
  // Zero allocations retain stable IDs for document history, but must not
  // resurrect ciphers that the user removed from the reference list.
  const ciphersForSelect = useMemo(
    () =>
      unique([
        ...configuredCiphers,
        ...projectEditor.lines
          .filter((line) => line.plannedQuantity !== 0)
          .map((line) => line.cipher),
      ]),
    [configuredCiphers, projectEditor.lines],
  )
  useEffect(() => {
    if (cipherFilter !== 'all' && !ciphersForSelect.includes(cipherFilter))
      setCipherFilter('all')
  }, [cipherFilter, ciphersForSelect, setCipherFilter])
  const unitsForSelect = unique([
    ...configuredUnits,
    ...lines.map((line) => line.unit),
  ])
  const documentsForSelect = unique([
    ...configuredDocuments,
    ...lines.map((line) => line.normativeDocument ?? ''),
  ])
  const alloysForSelect = unique([
    ...configuredAlloys,
    ...lines.map((line) => line.material),
  ])
  const materialTypesForSelect = materialTypeSettings.map((type) => type.name)
  const materialCombinations = useMemo(
    () => buildMaterialMatrix(projectEditor.lines),
    [projectEditor.lines],
  )
  const selectedCombination = selectedCombinationKey
    ? materialCombinations.find((row) => row.key === selectedCombinationKey)
    : undefined

  function openAddMaterialModal() {
    setMaterialSaveError('')
    setEditingLineId(null)
    setNewLine({
      ...emptyNewLine,
      cipher: ciphersForSelect[0] ?? '',
      unit: unitsForSelect[0] ?? '',
      cipherQuantities: buildEmptyAllocations(ciphersForSelect),
    })
    setMaterialModalOpen(true)
  }

  function openSettingsPage() {
    setSettingsError('')
    setSettingsDraft({
      ciphers: serializeReferenceValues(ciphersForSelect),
      units: serializeReferenceValues(unitsForSelect),
      documents: serializeReferenceValues(documentsForSelect),
      alloys: serializeReferenceValues(alloysForSelect),
    })
    setMaterialTypeDraft(materialTypeSettings)
    setSection('settings')
    setMaterialModalOpen(false)
    setExcelMenuOpen(false)
  }

  function saveSettings() {
    const nextCiphers = parseReferenceDraft(settingsDraft.ciphers)
    const nextUnits = parseReferenceDraft(settingsDraft.units)
    const nextDocuments = parseReferenceDraft(settingsDraft.documents)
    const nextAlloys = parseReferenceDraft(settingsDraft.alloys)

    const usedCiphers = unique(
      lines
        .filter(
          (line) =>
            line.plannedQuantity !== 0 && !nextCiphers.includes(line.cipher),
        )
        .map((line) => line.cipher),
    )
    if (usedCiphers.length) {
      setSettingsError(
        `Нельзя удалить шифры с заполненным проектным количеством: ${usedCiphers.join(', ')}. Сначала перенесите или обнулите количество в проектной базе.`,
      )
      return
    }

    setConfiguredCiphers(nextCiphers)
    setConfiguredUnits(nextUnits)
    setConfiguredDocuments(nextDocuments)
    setConfiguredAlloys(nextAlloys)
    setMaterialTypeSettings(materialTypeDraft)
    setSettingsError('')
  }

  function flashMaterialRow(rowKey: string, cellKeys: Array<string>) {
    const highlight = {
      cellKeys,
      expiresAt: Date.now() + 10_000,
      rowKey,
    }

    setMaterialHighlight(highlight)
    window.setTimeout(() => {
      setMaterialHighlight((current) =>
        current?.expiresAt === highlight.expiresAt ? null : current,
      )
    }, 10_000)
  }

  function openEditMaterialModal(lineId: string) {
    setMaterialSaveError('')
    const line = projectEditor.lines.find((item) => item.id === lineId)

    if (!line) {
      return
    }

    const groupKey = getMaterialIdentityKey(line)
    const groupLines = projectEditor.lines.filter(
      (item) => getMaterialIdentityKey(item) === groupKey,
    )
    const cipherQuantities = buildEmptyAllocations(ciphersForSelect)

    for (const groupLine of groupLines) {
      cipherQuantities[groupLine.cipher] = String(groupLine.plannedQuantity)
    }

    setEditingLineId(lineId)
    setNewLine({
      cipher: line.cipher,
      cipherQuantities,
      materialType: line.materialType ?? line.category,
      materialId: line.materialId ?? '',
      projectMaterialName: line.projectMaterialName ?? '',
      normativeDocument: line.normativeDocument ?? '',
      material: line.material,
      unitWeight:
        line.unitWeight === null || line.unitWeight === undefined
          ? ''
          : String(line.unitWeight),
      plannedQuantity: String(line.plannedQuantity),
      unit: line.unit,
      alternativeUnit: line.alternativeUnit ?? '',
      alternativeUnitFactor:
        line.alternativeUnitFactor == null
          ? ''
          : String(line.alternativeUnitFactor),
    })
    setMaterialModalOpen(true)
  }

  function saveProjectLine() {
    const conversionError = getAlternativeConversionError(
      newLine.alternativeUnit,
      newLine.alternativeUnitFactor,
    )
    if (conversionError) {
      setNotice(conversionError)
      return
    }
    if (!newLine.projectMaterialName.trim() || !newLine.unit.trim()) {
      setNotice(
        'Заполните наименование по проекту и единицу измерения. Количество по шифрам можно внести прямо в таблице.',
      )
      return
    }

    const invalidSelections = getInvalidDropdownSelections([
      {
        label: 'тип материала',
        options: materialTypesForSelect,
        required: true,
        value: newLine.materialType,
      },
      {
        label: 'нормативный документ',
        options: documentsForSelect,
        value: newLine.normativeDocument,
      },
      {
        label: 'состав',
        options: alloysForSelect,
        value: newLine.material,
      },
      {
        label: 'единицу измерения',
        options: unitsForSelect,
        required: true,
        value: newLine.unit,
      },
      {
        label: 'альтернативную единицу измерения',
        options: configuredUnits,
        value: newLine.alternativeUnit,
      },
    ])

    if (invalidSelections.length > 0) {
      setNotice(
        `Выберите из выпадающего списка: ${invalidSelections.join(', ')}.`,
      )
      return
    }

    const existingLine = editingLineId
      ? projectEditor.lines.find((line) => line.id === editingLineId)
      : undefined
    const oldGroupKey = existingLine
      ? getMaterialIdentityKey(existingLine)
      : null
    const nextGroupKey = getMaterialIdentityKey(
      buildIdentityLineFromForm(newLine),
    )
    const changedCellKeys = existingLine
      ? getChangedMaterialCellKeys(existingLine, newLine)
      : [
          'materialType',
          'materialId',
          'projectMaterialName',
          'normativeDocument',
          'unit',
          'material',
          'unitWeight',
        ]
    const duplicateLine = projectEditor.lines.find((line) => {
      if (line.id === editingLineId) {
        return false
      }

      return getMaterialIdentityKey(line) === nextGroupKey
    })

    if (duplicateLine && oldGroupKey !== nextGroupKey) {
      setSelectedLineId(duplicateLine.id ?? '')
      setNewLine(emptyNewLine)
      setEditingLineId(null)
      setMaterialModalOpen(false)
      setNotice(
        'Такая комбинация уже есть. Выбрала существующую позицию в таблице.',
      )
      setLastAction('Найдена существующая комбинация материала.')
      return
    }

    const existingGroupLines = oldGroupKey
      ? projectEditor.lines.filter(
          (line) => getMaterialIdentityKey(line) === oldGroupKey,
        )
      : []
    const existingByCipher = new Map(
      existingGroupLines.map((line) => [line.cipher, line]),
    )
    const sourceLines =
      editingLineId && existingGroupLines.length > 0
        ? existingGroupLines
        : [
            withStableId({
              id: createLocalId(),
              project:
                projectEditor.lines.find(
                  (item) =>
                    item.cipher === (ciphersForSelect[0] ?? 'без шифра'),
                )?.project ?? 'Проектная база',
              cipher: ciphersForSelect[0] ?? 'без шифра',
              category: newLine.materialType.trim() || 'Материалы',
              materialId: optionalText(newLine.materialId),
              projectMaterialName: optionalText(newLine.projectMaterialName),
              changeNumber: null,
              materialType: optionalText(newLine.materialType),
              normativeDocument: optionalText(newLine.normativeDocument),
              material: newLine.material.trim(),
              plannedQuantity: 0,
              unit: newLine.unit.trim(),
              unitWeight: optionalNumber(newLine.unitWeight),
              alternativeUnit: optionalText(newLine.alternativeUnit),
              alternativeUnitFactor: optionalNumber(
                newLine.alternativeUnitFactor,
              ),
              requested: 0,
              received: 0,
              qcPending: 0,
              accepted: 0,
              issued: 0,
              returned: 0,
              writtenOff: 0,
            }),
          ]
    const nextLines = sourceLines.map((line) => {
      const existingCipherLine = existingByCipher.get(line.cipher) ?? line

      return withStableId({
        ...existingCipherLine,
        category: newLine.materialType.trim() || 'Материалы',
        materialId: optionalText(newLine.materialId),
        projectMaterialName: optionalText(newLine.projectMaterialName),
        materialType: optionalText(newLine.materialType),
        normativeDocument: optionalText(newLine.normativeDocument),
        material: newLine.material.trim(),
        unit: newLine.unit.trim(),
        unitWeight: optionalNumber(newLine.unitWeight),
        alternativeUnit: optionalText(
          normalizeReferenceOption(configuredUnits, newLine.alternativeUnit),
        ),
        alternativeUnitFactor: optionalNumber(newLine.alternativeUnitFactor),
      })
    })

    projectEditor.update((current) =>
      editingLineId && oldGroupKey
        ? [
            ...nextLines,
            ...current.filter(
              (item) => getMaterialIdentityKey(item) !== oldGroupKey,
            ),
          ]
        : [...nextLines, ...current],
    )
    setSelectedLineId(nextLines[0]?.id ?? selectedLineId)
    setSelectedCombinationKey(null)
    setCipherFilter('all')
    setTableFilterResetVersion((version) => version + 1)
    flashMaterialRow(nextGroupKey, changedCellKeys)
    setNewLine(emptyNewLine)
    setEditingLineId(null)
    setMaterialModalOpen(false)
    const message = editingLineId
      ? `Изменение материала ${newLine.projectMaterialName.trim()} добавлено в правки.`
      : `Материал ${newLine.projectMaterialName.trim()} добавлен в правки.`
    setNotice(message)
    setLastAction(message)
  }

  function deleteProjectLines(lineIds: Array<string>) {
    const ids = new Set(lineIds),
      existing = new Set(
        (projectEditor.read()?.baseline.lines ?? lines).map((line) => line.id),
      )
    projectEditor.update((current) =>
      current.flatMap((line) =>
        !ids.has(line.id!)
          ? [line]
          : existing.has(line.id)
            ? [{ ...line, plannedQuantity: 0 }]
            : [],
      ),
    )
    setNotice('Исключение добавлено в правки. Выберите причину при сохранении.')
  }

  function updateProjectQuantity(
    row: MaterialMatrixRow,
    cipher: string,
    value: string,
  ) {
    const quantity = parseProjectQuantity(value)

    if (quantity === null) {
      return
    }

    const lineId = row.cipherLineIds[cipher]
    flashMaterialRow(row.key, [`cipher:${cipher}`])

    projectEditor.update((current) => {
      if (lineId) {
        return current.map((line) =>
          line.id === lineId ? { ...line, plannedQuantity: quantity } : line,
        )
      }

      const createdLine = withStableId({
        id: createLocalId(),
        project:
          current.find((line) => line.cipher === cipher)?.project ??
          current.find((line) => line.id === row.firstLineId)?.project ??
          'Проектная база',
        cipher,
        category: row.materialType || 'Материалы',
        materialId: optionalText(row.materialId),
        projectMaterialName: optionalText(row.projectMaterialName),
        changeNumber: null,
        materialType: optionalText(row.materialType),
        normativeDocument: optionalText(row.normativeDocument),
        material: row.material,
        plannedQuantity: quantity,
        unit: row.unit,
        unitWeight: row.unitWeight,
        alternativeUnit: optionalText(row.alternativeUnit),
        alternativeUnitFactor: row.alternativeUnitFactor,
        requested: 0,
        received: 0,
        qcPending: 0,
        accepted: 0,
        issued: 0,
        returned: 0,
        writtenOff: 0,
      })

      return [createdLine, ...current]
    })
    setNotice(
      `Количество по шифру ${cipher}: ${quantity > 0 ? formatQuantity(quantity) : 'пусто'}.`,
    )
  }

  function setProjectLineQuantity(lineId: string, quantity: number) {
    if (!Number.isFinite(quantity) || quantity < 0) {
      return
    }

    const adjustedLine = lines.find((item) => getProjectLineId(item) === lineId)
    if (adjustedLine) {
      flashMaterialRow(getMaterialIdentityKey(adjustedLine), [
        `cipher:${adjustedLine.cipher}`,
      ])
    }

    projectEditor.update((current) =>
      current.map((line) =>
        getProjectLineId(line) === lineId
          ? { ...line, plannedQuantity: quantity }
          : line,
      ),
    )
    setProjectReviewOpen(true)
    setNotice(
      'Изменение проекта добавлено в правки. Выберите причину при сохранении.',
    )
  }

  async function handleMaterialImportFile(file: File) {
    setMaterialImportDraft(null)
    setMaterialImportError('')
    setMaterialImportLoading(true)
    try {
      const { parseProjectMaterialsWorkbook } = await import('./excel')
      const workbookRows = parseProjectMaterialsWorkbook(
        await file.arrayBuffer(),
      )
      const draft = createMaterialImportDraft(workbookRows, {
        alloys: alloysForSelect,
        ciphers: ciphersForSelect,
        documents: documentsForSelect,
        existingMaterials: materialCombinations,
        units: unitsForSelect,
      })

      setMaterialImportDraft(draft)
      const message =
        draft.summary.totalRows === 0
          ? 'В файле не найдены позиции с количеством. Укажите шифры и проектные количества на первом листе Excel.'
          : `Черновик материала: ${draft.summary.validRows} можно импортировать, ${draft.summary.errorRows} требуют правки.`
      setNotice(message)
      setLastAction(message)
    } catch (error) {
      setMaterialImportError(
        `Не удалось прочитать файл. ${error instanceof Error ? error.message : 'Проверьте файл и повторите загрузку.'}`,
      )
    } finally {
      setMaterialImportLoading(false)
    }
  }

  async function downloadExcelTemplate() {
    const { createProjectMaterialsTemplateWorkbook } = await import('./excel')
    downloadWorkbook(
      await createProjectMaterialsTemplateWorkbook(
        ciphersForSelect,
        materialTypeSettings,
      ),
      'project-materials-template.xlsx',
    )
    setExcelMenuOpen(false)
  }

  async function downloadExcelExport() {
    const { createProjectMaterialsExportWorkbook } = await import('./excel')
    downloadWorkbook(
      await createProjectMaterialsExportWorkbook(
        lines,
        ciphersForSelect,
        materialTypeSettings,
      ),
      'project-materials-export.xlsx',
    )
    setExcelMenuOpen(false)
  }

  function downloadFilteredExcelExport() {
    if (!projectGrid || projectGrid.isDestroyed()) return
    projectGrid.exportDataAsExcel({
      fileName: 'Проектная база с фильтрами.xlsx',
      sheetName: 'Материалы',
      exportedRows: 'filteredAndSorted',
      columnKeys: projectGrid
        .getAllDisplayedColumns()
        .filter((column) => column.getColId() !== 'actions')
        .map((column) => column.getColId()),
    })
    setExcelMenuOpen(false)
  }

  function applyMaterialImportDraft() {
    if (
      !materialImportDraft ||
      materialImportDraft.summary.errorRows > 0 ||
      !materialImportDraft.rows.length
    )
      return
    try {
      const previews = previewMaterialImportRows(
        projectEditor.lines,
        materialImportDraft.rows.map((entry) => entry.row),
      )
      const rows = materialImportDraft.rows
        .filter((_, index) => previews[index]?.supersededBy == null)
        .map(
          (entry) =>
            Object.fromEntries(
              Object.entries(entry.row).map(([key, value]) => [
                key,
                value === null ? undefined : value,
              ]),
            ) as ImportRowInput,
        )
      projectEditor.importRows(rows, projectImportMode)
      setMaterialImportOpen(false)
      setMaterialImportDraft(null)
      setSelectedCombinationKey(null)
      setImportedCombinationKeys([])
      setCipherFilter('all')
      setTableFilterResetVersion((version) => version + 1)
      if (projectEditor.read()) setProjectReviewOpen(true)
      else setNotice('В файле нет отличий от проектной базы.')
    } catch (cause) {
      setMaterialImportError(
        cause instanceof Error
          ? cause.message
          : 'Не удалось подготовить изменения Excel.',
      )
    }
  }

  function addMissingImportReferences() {
    if (!materialImportDraft) {
      return
    }

    setConfiguredCiphers((current) =>
      unique([...current, ...materialImportDraft.summary.missingCiphers]),
    )
    setConfiguredUnits((current) =>
      unique([...current, ...materialImportDraft.summary.missingUnits]),
    )
    setConfiguredDocuments((current) =>
      unique([...current, ...materialImportDraft.summary.missingDocuments]),
    )
    setConfiguredAlloys((current) =>
      unique([...current, ...materialImportDraft.summary.missingAlloys]),
    )
    setMaterialImportDraft(clearMissingReferenceErrors(materialImportDraft))
    const message = 'Отсутствующие значения добавлены в настройки импорта.'
    setNotice(message)
    setLastAction(message)
  }

  function addMaterialRequestEntries(entries: Array<MaterialRequestEntry>) {
    if (materialRequests.some((item) => item.number === entries[0]?.number))
      throw new Error('Этот номер заявки уже занят. Выберите другой номер.')
    validateRequestChange([...entries, ...materialRequests])
    setDocumentNumbering((current) =>
      consumeDocumentNumbers(
        current,
        numberHistory,
        documentNumberHistory(
          [...entries, ...materialRequests],
          materialIssues,
          qualityWorkflow,
        ),
      ),
    )
    setMaterialRequests((current) => [...entries, ...current])
    const message = `Создана заявка ${entries[0]?.number ?? ''}: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function validateRequestChange(nextRequests: Array<MaterialRequestEntry>) {
    validateProjectAccounting(
      { ...projectAccountingWorkspace, materialRequests: nextRequests },
      projectAccountingWorkspace,
    )
    const previous = {
      qualityWorkflow,
      stockTransfers,
      materialReceipts,
      materialIssues,
      materialRequests,
    }
    validateQualityWorkspace(
      { ...previous, materialRequests: nextRequests },
      previous,
    )
  }

  function updateMaterialRequestEntries(
    originalNumber: string,
    entries: Array<MaterialRequestEntry>,
  ) {
    const nextRequests = [
      ...entries,
      ...materialRequests.filter((entry) => entry.number !== originalNumber),
    ]
    if (
      entries[0]?.number !== originalNumber &&
      materialRequests.some((entry) => entry.number === entries[0]?.number)
    )
      throw new Error('Этот номер заявки уже занят. Укажите другой номер.')
    validateRequestChange(nextRequests)
    setDocumentNumbering((current) =>
      consumeDocumentNumbers(
        current,
        numberHistory,
        documentNumberHistory(nextRequests, materialIssues, qualityWorkflow),
      ),
    )
    setMaterialRequests(nextRequests)
    const message = `Обновлена заявка ${entries[0]?.number ?? originalNumber}: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function deleteMaterialRequestEntries(number: string) {
    const nextRequests = materialRequests.filter(
      (entry) => entry.number !== number,
    )
    validateRequestChange(nextRequests)
    setMaterialRequests(nextRequests)
    const message = `Удалена заявка ${number}.`
    setNotice(message)
    setLastAction(message)
  }

  function addMaterialReceiptEntries(
    entries: Array<MaterialReceiptEntry>,
    documents: Array<ReceiptDocument>,
    records: Array<M15Reconciliation> = m15Reconciliations ?? [],
  ) {
    const nextWorkflow = {
      ...(qualityWorkflow ?? emptyQualityWorkflow()),
      receiptDocuments: documents,
      m15Reconciliations: records,
    }
    validateM15Workspace(
      {
        lines: lines,
        materialRequests,
        materialReceipts: [...entries, ...materialReceipts],
        qualityWorkflow: nextWorkflow,
        m15Reconciliations: records,
      },
      {
        lines: lines,
        materialRequests,
        materialReceipts,
        qualityWorkflow,
        m15Reconciliations,
      },
    )
    validateQualityWorkspace(
      {
        stockTransfers,
        qualityWorkflow: nextWorkflow,
        materialReceipts: [...entries, ...materialReceipts],
        materialIssues,
        materialRequests,
      },
      {
        qualityWorkflow,
        stockTransfers,
        materialReceipts,
        materialIssues,
        materialRequests,
      },
    )
    setM15Reconciliations(records)
    setQualityWorkflow(nextWorkflow)
    setMaterialReceipts((current) => [...entries, ...current])
    const message = `Оформлено получение: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function updateMaterialReceiptEntries(
    originalIds: Array<string>,
    entries: Array<MaterialReceiptEntry>,
    documents: Array<ReceiptDocument>,
    records: Array<M15Reconciliation> = m15Reconciliations ?? [],
  ) {
    const nextWorkflow = {
      ...(qualityWorkflow ?? emptyQualityWorkflow()),
      receiptDocuments: documents,
      m15Reconciliations: records,
    }
    const ids = new Set(originalIds)
    const nextReceipts = [
      ...entries,
      ...materialReceipts.filter((entry) => !ids.has(entry.id)),
    ]
    validateM15Workspace(
      {
        lines: lines,
        materialRequests,
        materialReceipts: nextReceipts,
        qualityWorkflow: nextWorkflow,
        m15Reconciliations: records,
      },
      {
        lines: lines,
        materialRequests,
        materialReceipts,
        qualityWorkflow,
        m15Reconciliations,
      },
    )
    validateQualityWorkspace(
      {
        stockTransfers,
        qualityWorkflow: nextWorkflow,
        materialReceipts: nextReceipts,
        materialIssues,
        materialRequests,
      },
      {
        qualityWorkflow,
        stockTransfers,
        materialReceipts,
        materialIssues,
        materialRequests,
      },
    )
    setM15Reconciliations(records)
    setQualityWorkflow(nextWorkflow)
    setMaterialReceipts((current) => [
      ...entries,
      ...current.filter((entry) => !ids.has(entry.id)),
    ])
    const message = `Обновлено получение: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function addMaterialIssueEntries(entries: Array<MaterialIssueEntry>) {
    if (materialIssues.some((item) => item.document === entries[0]?.document))
      throw new Error('Этот номер выдачи уже занят. Выберите другой номер.')
    const previous = {
      qualityWorkflow,
      stockTransfers,
      materialReceipts,
      materialIssues,
      materialRequests,
    }
    validateQualityWorkspace(
      { ...previous, materialIssues: [...entries, ...materialIssues] },
      previous,
    )
    setDocumentNumbering((current) =>
      consumeDocumentNumbers(
        current,
        numberHistory,
        documentNumberHistory(
          materialRequests,
          [...entries, ...materialIssues],
          qualityWorkflow,
        ),
      ),
    )
    validateProjectAccounting(
      {
        ...projectAccountingWorkspace,
        materialIssues: [...entries, ...materialIssues],
      },
      projectAccountingWorkspace,
    )
    setMaterialIssues((current) => [...entries, ...current])
    const message = `Оформлена выдача в монтаж: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function addSiteReturn(issueId: string, value: SiteReturn) {
    if (!materialIssues.some((issue) => issue.id === issueId))
      throw new Error('Выдача удалена. Обновите список.')
    const updated = materialIssues.map((issue) =>
      issue.id === issueId
        ? { ...issue, siteReturns: [...(issue.siteReturns ?? []), value] }
        : issue,
    )
    const previous = {
      qualityWorkflow,
      stockTransfers,
      materialReceipts,
      materialRequests,
      materialIssues,
    }
    validateQualityWorkspace({ ...previous, materialIssues: updated }, previous)
    validateProjectAccounting(
      { ...projectAccountingWorkspace, materialIssues: updated },
      projectAccountingWorkspace,
    )
    setMaterialIssues(updated)
    setNotice('Возврат с площадки сохранён. Складской остаток увеличен.')
  }

  function deleteOperation(target: OperationDeletion) {
    const error = getOperationDeletionError(
      target,
      materialReceipts,
      materialIssues,
      qualityWorkflow,
    )
    if (error) return error

    if (target.kind === 'receipts') {
      const ids = new Set(target.ids)
      setMaterialReceipts((current) =>
        current.filter((entry) => !ids.has(entry.id)),
      )
    } else {
      setMaterialIssues((current) =>
        current.filter((entry) => entry.id !== target.id),
      )
    }
    const message = `${target.kind === 'receipts' ? 'Удалено получение' : 'Удалена выдача'}. Остатки пересчитаны.`
    setNotice(message)
    setLastAction(message)
    return ''
  }

  const m15Workspace = useMemo(
    () => ({
      lines: lines,
      materialReceipts,
      materialRequests,
      qualityWorkflow,
      m15Reconciliations,
    }),
    [
      lines,
      materialReceipts,
      materialRequests,
      qualityWorkflow,
      m15Reconciliations,
    ],
  )
  const m15Access = {
    workspace: m15Workspace,
    save: saveM15Reconciliation,
    removeComposition: removeM15Composition,
    hasPendingSave: (id: string) =>
      'hasPendingRecord' in workspaceSaver
        ? workspaceSaver.hasPendingRecord('m15Reconciliations', id)
        : submittedM15.current.has(id) || submittedM15Removals.current.has(id),
    syncFeedback: (
      <>
        {editConflicts.length > 0 && 'resolve' in workspaceSaver && (
          <WorkspaceConflicts
            conflicts={editConflicts}
            resolve={workspaceSaver.resolve}
          />
        )}
        {saveStatus === 'error' && (
          <p
            role="alert"
            className="rounded bg-red-50 p-3 text-sm text-red-700"
          >
            {saveMessage ||
              'Ошибка сохранения. Исправьте данные и повторите сохранение сверки.'}
          </p>
        )}
      </>
    ),
  }
  const fillViewport =
    section === 'database' || section === 'documents' || section === 'm15'
  return (
    <ProjectAccountingContext value={{ projectChanges, stockTransfers }}>
      <DocumentNumberingContext value={numberingContext}>
        <main
          className={`materials-workspace bg-stone-50 text-stone-900 ${fillViewport ? 'flex h-dvh min-h-[32rem] flex-col' : 'min-h-screen'}`}
        >
          {cacheWarning && (
            <div
              role="alert"
              className="shrink-0 border-b bg-amber-50 p-3 text-sm"
            >
              Браузер не смог сохранить резервную копию правок. Дождитесь
              сохранения на сервере перед закрытием страницы.
            </div>
          )}
          {exhaustedCounters.length > 0 && (
            <div
              role="alert"
              className="shrink-0 border-b border-amber-300 bg-amber-50 p-3 text-sm"
            >
              Счётчик «
              {exhaustedCounters.map((kind) => documentLabels[kind]).join(', ')}
              » исчерпан. Измените его в настройках нумерации или укажите номер
              документа вручную.
            </div>
          )}
          {loadedWorkspace.recovery ? (
            <div
              role="status"
              className="shrink-0 border-b border-amber-300 bg-amber-50 p-3 text-sm"
            >
              Найдена отличающаяся или повреждённая копия браузера. Скачайте её
              для восстановления.
              <Button
                variant="outline"
                className="ml-3"
                onClick={() => downloadWorkspaceCopy(loadedWorkspace.recovery!)}
              >
                Скачать копию браузера
              </Button>
            </div>
          ) : null}
          {saveStatus !== 'saved' ? (
            <div
              role="status"
              className="shrink-0 border-b border-amber-300 bg-amber-50 p-3 text-sm"
            >
              {saveStatus === 'saving'
                ? 'Сохранение…'
                : saveMessage
                  ? saveMessage
                  : saveStatus === 'conflict'
                    ? 'Данные изменены в другой вкладке. Эта версия не перезаписана на сервере. Скачайте свою копию и обновите страницу.'
                    : 'Не удалось сохранить на сервере. Не закрывайте страницу; повторите сохранение или скачайте свою копию.'}
              {saveStatus !== 'saving' ? (
                <>
                  <Button
                    variant="outline"
                    className="ml-3"
                    onClick={() =>
                      downloadWorkspaceCopy(
                        JSON.stringify(workspaceSaver.getLatest(), null, 2),
                      )
                    }
                  >
                    Скачать текущую копию
                  </Button>
                  {saveStatus === 'error' ? (
                    <>
                      <Button
                        variant="outline"
                        className="ml-3"
                        onClick={() => void workspaceSaver.retry()}
                      >
                        Повторить сохранение
                      </Button>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          {editConflicts.length > 0 && 'resolve' in workspaceSaver && (
            <WorkspaceConflicts
              conflicts={editConflicts}
              resolve={workspaceSaver.resolve}
            />
          )}
          <div
            className={`workspace-with-dock flex ${fillViewport ? 'min-h-0 flex-1' : 'min-h-screen'}`}
          >
            <WorkspaceDock
              view={view}
              onNavigate={(next) => {
                setExcelMenuOpen(false)
                if (next.section === 'settings') {
                  openSettingsPage()
                  return
                }
                navigate(next)
                if (next.section === 'database') {
                  setNotice('Открыта проектная база материалов.')
                  setLastAction('Переход: Проектная база.')
                } else if (
                  next.section === 'operations' &&
                  next.tab === 'overview'
                ) {
                  setNotice('Открыт учетный маршрут выбранного материала.')
                  setLastAction('Переход: Операции.')
                }
              }}
            />

            <div
              className={`workspace-main-content min-w-0 flex-1 px-3 py-2 sm:px-4 ${fillViewport ? 'flex min-h-0 flex-col' : ''}`}
            >
              {projectEditor.draft && section !== 'database' && (
                <div className="mb-3 flex items-center gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
                  <span>В проектной базе есть несохранённые правки.</span>
                  <Button
                    variant="outline"
                    onClick={() => setSection('database')}
                  >
                    Вернуться к правкам
                  </Button>
                </div>
              )}
              <header className="workspace-page-header flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2">
                <div>
                  <h1 className="text-xl font-semibold tracking-normal">
                    {section === 'database'
                      ? 'Проектная база материалов'
                      : section === 'settings'
                        ? 'Настройки'
                        : section === 'documents'
                          ? 'Документы'
                          : section === 'm15'
                            ? 'М-15'
                            : view.tab === 'overview'
                              ? 'Операции'
                              : view.tab === 'quality'
                                ? view.inspection === 'avk'
                                  ? 'АВК'
                                  : 'ЗНИ'
                                : operationTabMeta[view.tab].label}
                  </h1>
                </div>

                {section === 'database' ? (
                  <div className="flex flex-wrap gap-2">
                    <div ref={excelMenuRef} className="relative z-50">
                      <Button
                        ref={excelMenuButtonRef}
                        variant="outline"
                        aria-expanded={excelMenuOpen}
                        onClick={() => setExcelMenuOpen((open) => !open)}
                      >
                        <FileSpreadsheet size={16} />
                        Excel
                        <ChevronDown size={15} />
                      </Button>
                      {excelMenuOpen ? (
                        <div className="absolute right-0 z-[80] mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg">
                          <button
                            className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-stone-700 hover:bg-stone-50"
                            type="button"
                            onClick={() => void downloadExcelTemplate()}
                          >
                            <Download size={15} />
                            Скачать шаблон
                          </button>
                          <button
                            className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-stone-700 hover:bg-stone-50"
                            type="button"
                            onClick={() => {
                              setExcelMenuOpen(false)
                              setMaterialImportDraft(null)
                              setMaterialImportOpen(true)
                            }}
                          >
                            <FileInput size={15} />
                            Импорт проектной базы
                          </button>
                          <button
                            className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-stone-700 hover:bg-stone-50"
                            type="button"
                            onClick={() => void downloadExcelExport()}
                          >
                            <Download size={15} />
                            Экспорт проектной базы
                          </button>
                          <button
                            className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                            type="button"
                            disabled={!projectGrid || projectGrid.isDestroyed()}
                            onClick={downloadFilteredExcelExport}
                          >
                            <Download size={15} className="shrink-0" />
                            Экспорт проектной базы с фильтрами
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </header>

              {section === 'database' ? (
                <>
                  <ProjectChangesPanel
                    workspace={projectAccountingWorkspace}
                    author={
                      initialStoredData.user?.name ||
                      initialStoredData.user?.login ||
                      'Локальный пользователь'
                    }
                    selectedCipher={cipherFilter}
                    onApply={applyProjectAccounting}
                    onReturn={(target) => {
                      setProjectReturnTarget(target)
                      navigate({ section: 'operations', tab: 'returns' })
                    }}
                  />
                  {projectEditor.draft && (
                    <div
                      role="region"
                      aria-label="Несохранённые правки проекта"
                      className="flex shrink-0 flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
                    >
                      <span className="mr-auto">
                        Несохранённые правки: {draftChanges.length} позиций.
                        Учёт материалов пока не изменён.
                      </span>
                      <Button
                        variant="outline"
                        onClick={() => {
                          projectGrid?.stopEditing(true)
                          if (
                            window.confirm(
                              'Отменить все несохранённые правки проекта?',
                            )
                          ) {
                            projectEditor.clear()
                            setProjectReviewOpen(false)
                          }
                        }}
                      >
                        Отменить правки
                      </Button>
                      <Button
                        onClick={() => {
                          projectGrid?.stopEditing()
                          if (projectEditor.read()) setProjectReviewOpen(true)
                        }}
                      >
                        Сохранить изменения
                      </Button>
                    </div>
                  )}
                  <DatabaseSection
                    cipherFilter={cipherFilter}
                    ciphers={ciphersForSelect}
                    highlight={materialHighlight}
                    lines={filteredLines}
                    selectedCombination={selectedCombination}
                    selectedImportedCount={importedCombinationKeys.length}
                    selectedLineId={selectedLine?.id ?? ''}
                    tableFilterResetVersion={tableFilterResetVersion}
                    onAddMaterial={openAddMaterialModal}
                    onChangeCipherFilter={setCipherFilter}
                    onClearSelectedCombination={() => {
                      setSelectedCombinationKey(null)
                      setImportedCombinationKeys([])
                    }}
                    onRequestDelete={(material) =>
                      setPendingDeleteMaterial(material)
                    }
                    onEditLine={openEditMaterialModal}
                    onSelectLine={(lineId) => {
                      setSelectedLineId(lineId)
                      setNotice('Выбрана позиция материала.')
                      setLastAction('Выбор позиции материала.')
                    }}
                    onUpdateQuantity={updateProjectQuantity}
                    onUpdateField={updateProjectField}
                    draftCells={draftCells}
                    onGridReady={setProjectGrid}
                  />
                </>
              ) : section === 'documents' ? (
                <DocumentsSection
                  onOpenOperation={navigate}
                  prepare={() => workspaceSaver.waitUntilSaved()}
                />
              ) : section === 'm15' ? (
                <M15Section {...m15Access} focusId={view.focus} />
              ) : section === 'operations' ? (
                <OperationDisplayProvider
                  id={
                    view.tab === 'quality'
                      ? `quality.${view.inspection ?? 'zni'}`
                      : view.tab
                  }
                >
                  <OperationsSection
                    projectReturnTarget={projectReturnTarget}
                    onClearProjectReturnTarget={() =>
                      setProjectReturnTarget(null)
                    }
                    qualityWorkflow={qualityWorkflow}
                    onChangeQualityWorkflow={updateQualityWorkflow}
                    prepareRequestPrint={() => workspaceSaver.waitUntilSaved()}
                    prepareReceiptSave={async () => {
                      await workspaceSaver.retry()
                      return workspaceSaver.waitUntilSaved()
                    }}
                    availableCiphers={ciphersForSelect}
                    configuredUnits={configuredUnits}
                    lines={lines}
                    materialIssues={materialIssues}
                    materialReceipts={materialReceipts}
                    materialRequests={materialRequests}
                    qualityControls={qualityControls}
                    onAdjustProjectQuantity={setProjectLineQuantity}
                    onCreateIssues={addMaterialIssueEntries}
                    onSiteReturn={addSiteReturn}
                    onCreateReceipts={addMaterialReceiptEntries}
                    onCreateRequests={addMaterialRequestEntries}
                    onDeleteRequests={deleteMaterialRequestEntries}
                    onDeleteOperation={deleteOperation}
                    onUpdateReceipts={updateMaterialReceiptEntries}
                    onUpdateRequests={updateMaterialRequestEntries}
                  />
                </OperationDisplayProvider>
              ) : null}

              <div className="sr-only" aria-live="polite">
                {notice} {lastAction !== notice ? lastAction : ''}
              </div>

              <MaterialModal
                error={materialSaveError}
                alternativeUnits={configuredUnits}
                alloys={alloysForSelect}
                documents={documentsForSelect}
                editing={Boolean(editingLineId)}
                existingMaterials={materialCombinations}
                form={newLine}
                materialTypes={materialTypesForSelect}
                open={materialModalOpen}
                units={unitsForSelect}
                onChange={(value) => {
                  setMaterialSaveError('')
                  setNewLine(value)
                }}
                onClose={() => {
                  setMaterialModalOpen(false)
                  setEditingLineId(null)
                }}
                onOpenSettings={openSettingsPage}
                onSubmit={saveProjectLine}
                onEditExisting={openEditMaterialModal}
                onUseExisting={(row) => {
                  setSelectedLineId(row.firstLineId)
                  setSelectedCombinationKey(row.key)
                  setImportedCombinationKeys([])
                  setCipherFilter('all')
                  setSection('database')
                  setMaterialModalOpen(false)
                  setEditingLineId(null)
                  setNotice(
                    'Выбрана существующая комбинация. Количество можно заполнить в таблице по нужному шифру.',
                  )
                  setLastAction('Использована существующая комбинация.')
                }}
              />

              {projectReviewOpen && projectEditor.draft && (
                <ProjectEditReview
                  draft={projectEditor.draft}
                  author={
                    initialStoredData.user?.name ||
                    initialStoredData.user?.login ||
                    'Локальный пользователь'
                  }
                  onApply={async (next, baseline) => {
                    await applyProjectAccounting(next, baseline)
                    projectEditor.clear()
                    setProjectReviewOpen(false)
                  }}
                  onClose={() => setProjectReviewOpen(false)}
                  onRefresh={refreshProjectDraft}
                  onSourceQuantity={(id, quantity) =>
                    projectEditor.update((current) =>
                      current.map((line) =>
                        line.id === id
                          ? { ...line, plannedQuantity: quantity }
                          : line,
                      ),
                    )
                  }
                />
              )}
              {scopeEdit && (
                <ProjectDialog
                  title="Какие шифры изменить?"
                  onClose={() => setScopeEdit(null)}
                >
                  <div className="grid gap-4">
                    <p>
                      Материал «{scopeEdit.row.projectMaterialName}»
                      используется в нескольких шифрах. Выберите область этой
                      правки.
                    </p>
                    <label className="grid gap-1">
                      Шифр для изменения
                      <SelectField
                        className="rounded border p-2"
                        aria-label="Шифр для изменения"
                        value={editScope}
                        onChange={(event) => setEditScope(event.target.value)}
                      >
                        <option value="">Выберите шифр</option>
                        <option value="all">Все шифры этой строки</option>
                        {scopeEdit.row.lineIds.map((id) => {
                          const line = projectEditor.lines.find(
                            (item) => item.id === id,
                          )
                          return (
                            <option key={id} value={id}>
                              {line?.cipher} · {line?.project}
                            </option>
                          )
                        })}
                      </SelectField>
                    </label>
                    <Button
                      disabled={!editScope}
                      onClick={() => {
                        projectEditor.update((current) =>
                          updateProjectFields(
                            current,
                            editScope === 'all'
                              ? scopeEdit.row.lineIds
                              : [editScope],
                            scopeEdit.field,
                            scopeEdit.value,
                          ),
                        )
                        setScopeEdit(null)
                      }}
                    >
                      Добавить в правки
                    </Button>
                  </div>
                </ProjectDialog>
              )}
              <MaterialImportModal
                draft={materialImportDraft}
                error={materialImportError}
                loading={materialImportLoading}
                currentLines={projectEditor.lines}
                importMode={projectImportMode}
                onChangeImportMode={setProjectImportMode}
                open={materialImportOpen}
                onAddMissingReferences={addMissingImportReferences}
                onApply={applyMaterialImportDraft}
                onClose={() => setMaterialImportOpen(false)}
                onDownloadTemplate={() => void downloadExcelTemplate()}
                onImportFile={(file) => void handleMaterialImportFile(file)}
              />

              <DeleteMaterialDialog
                material={pendingDeleteMaterial}
                onCancel={() => setPendingDeleteMaterial(null)}
                onConfirm={() => {
                  if (!pendingDeleteMaterial) {
                    return
                  }

                  deleteProjectLines(pendingDeleteMaterial.lineIds)
                  setPendingDeleteMaterial(null)
                }}
              />

              {section === 'settings' && (
                <SettingsPanel
                  numbering={documentNumbering}
                  numberHistory={numberHistory}
                  onSaveNumbering={setDocumentNumbering}
                  qualityWorkflow={qualityWorkflow}
                  onChangeQualityWorkflow={updateQualityWorkflow}
                  draft={settingsDraft}
                  error={settingsError}
                  materialTypeSettings={materialTypeDraft}
                  onChangeDraft={(key, value) => {
                    setSettingsError('')
                    setSettingsDraft((current) => ({
                      ...current,
                      [key]: value,
                    }))
                  }}
                  onChangeMaterialTypeSettings={setMaterialTypeDraft}
                  onDiscard={openSettingsPage}
                  onSave={saveSettings}
                />
              )}
            </div>
          </div>
        </main>
      </DocumentNumberingContext>
    </ProjectAccountingContext>
  )
}

function DatabaseSection({
  cipherFilter,
  ciphers,
  highlight,
  lines,
  selectedCombination,
  selectedImportedCount,
  selectedLineId,
  tableFilterResetVersion,
  onAddMaterial,
  onChangeCipherFilter,
  onClearSelectedCombination,
  onEditLine,
  onRequestDelete,
  onSelectLine,
  onUpdateQuantity,
  onUpdateField,
  draftCells,
  onGridReady,
}: {
  onUpdateField: (
    row: MaterialMatrixRow,
    field: ProjectEditableField,
    value: unknown,
  ) => void
  draftCells: Map<string, Set<string>>
  cipherFilter: string
  ciphers: Array<string>
  highlight: MaterialHighlight | null
  lines: Array<SubobjectMaterialMetric>
  selectedCombination: MaterialMatrixRow | undefined
  selectedImportedCount: number
  selectedLineId: string
  tableFilterResetVersion: number
  onGridReady: (api: GridApi<MaterialMatrixRow> | null) => void
  onAddMaterial: () => void
  onChangeCipherFilter: (value: string) => void
  onClearSelectedCombination: () => void
  onEditLine: (lineId: string) => void
  onRequestDelete: (material: PendingDeleteMaterial) => void
  onSelectLine: (lineId: string) => void
  onUpdateQuantity: (
    row: MaterialMatrixRow,
    cipher: string,
    value: string,
  ) => void
}) {
  const [search, setSearch] = useWorkspaceViewState(
    'database.search',
    '',
    isViewString,
  )
  const viewScrollRef = useWorkspaceViewScroll('database')
  const { hiddenColumns, changeHiddenColumns } = useProjectMatrixColumns()
  const matrixRows = useMemo(() => buildMaterialMatrix(lines), [lines])
  const visibleMatrixRows = useMemo(
    () =>
      matrixRows.filter((row) => materialCombinationMatchesSearch(row, search)),
    [matrixRows, search],
  )
  const matrixCiphers = ciphers
  const grid = useRef<GridApi<MaterialMatrixRow> | null>(null)
  const [tableFiltered, setTableFiltered] = useState(false)
  const [gridRowCount, setGridRowCount] = useState<number | null>(null)
  useEscapeAction({
    kind: 'filters',
    enabled:
      !!search ||
      cipherFilter !== 'all' ||
      !!selectedCombination ||
      selectedImportedCount > 0,
    onEscape: () => {
      setSearch('')
      onChangeCipherFilter('all')
      onClearSelectedCombination()
    },
  })

  return (
    <section
      ref={viewScrollRef}
      className="mt-5 flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <Card className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CardHeader className="shrink-0 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="relative min-w-48 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={17}
              />
              <Input
                className="h-10 bg-white pl-9 text-sm"
                aria-label="Поиск в проектной базе"
                placeholder="Поиск материалов"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <span className="whitespace-nowrap text-xs text-slate-500">
              Найдено{' '}
              {matrixRows.length
                ? (gridRowCount ?? visibleMatrixRows.length)
                : 0}{' '}
              из {matrixRows.length} позиций
            </span>
            <div className="w-48">
              <AppSelect
                label="Шифр проекта"
                value={cipherFilter}
                onChange={onChangeCipherFilter}
                options={[
                  { label: 'Все шифры', value: 'all' },
                  ...ciphers.map((cipher) => ({
                    label: cipher,
                    value: cipher,
                  })),
                ]}
              />
            </div>
            {(search || cipherFilter !== 'all' || tableFiltered) && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Сбросить фильтры"
                title="Сбросить фильтры"
                onClick={() => {
                  setSearch('')
                  onChangeCipherFilter('all')
                  grid.current?.setFilterModel(null)
                }}
              >
                <RotateCcw size={16} />
              </Button>
            )}
            <Button onClick={onAddMaterial}>
              <Plus size={16} />
              Материал
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {selectedCombination || selectedImportedCount > 0 ? (
            <div className="shrink-0 border-t border-slate-200 bg-blue-50/40 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase text-blue-700">
                    {selectedCombination
                      ? 'Показана выбранная комбинация'
                      : 'Показаны импортированные позиции'}
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-slate-900">
                    {selectedCombination
                      ? selectedCombination.projectMaterialName
                      : `${selectedImportedCount} позиций`}
                  </div>
                </div>
                <Button
                  className="shrink-0"
                  variant="outline"
                  onClick={onClearSelectedCombination}
                >
                  Сбросить фильтр
                </Button>
              </div>
            </div>
          ) : null}
          {matrixRows.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ProjectMaterialGrid
                ciphers={matrixCiphers}
                hiddenColumns={hiddenColumns}
                onChangeHiddenColumns={changeHiddenColumns}
                highlight={highlight}
                rows={visibleMatrixRows}
                selectedLineId={selectedLineId}
                tableFilterResetVersion={tableFilterResetVersion}
                onEditLine={onEditLine}
                onRequestDelete={onRequestDelete}
                onSelectLine={onSelectLine}
                onUpdateQuantity={onUpdateQuantity}
                onUpdateField={onUpdateField}
                draftCells={draftCells}
                onReady={(api) => {
                  grid.current = api
                  onGridReady(api)
                }}
                onFilterChanged={(active, count) => {
                  setTableFiltered(active)
                  setGridRowCount(count)
                }}
              />
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center border-t border-stone-100 bg-stone-50/40 px-6 py-10">
              <div className="max-w-sm text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-500 shadow-sm">
                  <Database size={20} />
                </div>
                <div className="mt-4 text-sm font-semibold text-stone-900">
                  {matrixRows.length === 0
                    ? 'Проектная база пока пустая'
                    : 'Ничего не найдено'}
                </div>
                <div className="mt-1 text-sm leading-6 text-stone-500">
                  {matrixRows.length === 0
                    ? 'Добавьте проектный материал вручную или импортируйте заполненный Excel-шаблон.'
                    : 'Измените запрос или очистите поиск, чтобы снова увидеть позиции.'}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function OperationsSection({
  projectReturnTarget,
  onClearProjectReturnTarget,
  qualityWorkflow,
  onChangeQualityWorkflow,
  prepareRequestPrint,
  prepareReceiptSave,
  availableCiphers,
  configuredUnits,
  lines,
  materialIssues,
  materialReceipts,
  materialRequests,
  qualityControls,
  onAdjustProjectQuantity,
  onCreateIssues,
  onSiteReturn,
  onCreateReceipts,
  onCreateRequests,
  onDeleteRequests,
  onDeleteOperation,
  onUpdateReceipts,
  onUpdateRequests,
}: {
  projectReturnTarget?: ProjectReturnTarget | null
  onClearProjectReturnTarget?: () => void
  qualityWorkflow?: QualityWorkflow
  onChangeQualityWorkflow: (next: QualityWorkflow) => void
  prepareRequestPrint: () => Promise<string>
  prepareReceiptSave: () => Promise<string>
  availableCiphers: Array<string>
  configuredUnits: Array<string>
  lines: Array<SubobjectMaterialMetric>
  materialIssues: Array<MaterialIssueEntry>
  materialReceipts: Array<MaterialReceiptEntry>
  materialRequests: Array<MaterialRequestEntry>
  qualityControls: Array<InspectionApproval>
  onAdjustProjectQuantity: (lineId: string, quantity: number) => void
  onSiteReturn: (issueId: string, value: SiteReturn) => void
  onCreateIssues: (entries: Array<MaterialIssueEntry>) => void
  onCreateReceipts: (
    entries: Array<MaterialReceiptEntry>,
    documents: Array<ReceiptDocument>,
    records?: Array<M15Reconciliation>,
  ) => void
  onCreateRequests: (entries: Array<MaterialRequestEntry>) => void
  onDeleteRequests: (number: string) => void
  onDeleteOperation: (target: OperationDeletion) => string
  onUpdateReceipts: (
    originalIds: Array<string>,
    entries: Array<MaterialReceiptEntry>,
    documents: Array<ReceiptDocument>,
    records?: Array<M15Reconciliation>,
  ) => void
  onUpdateRequests: (
    originalNumber: string,
    entries: Array<MaterialRequestEntry>,
  ) => void
}) {
  const accounting = useProjectAccounting()
  const { view, navigate } = useWorkspaceNavigation()
  const { mode: displayMode } = useOperationDisplay()
  const activeTab = view.tab
  const setActiveTab = (tab: OperationDocumentTab) => navigate({ tab })
  const viewScrollRef = useWorkspaceViewScroll(`operations:${activeTab}`)
  const [modal, setModal] = useState<OperationActionTab | null>(null)
  const [initialReceiptRequest, setInitialReceiptRequest] = useState('')
  const [choosingReturn, setChoosingReturn] = useState(false)
  const [siteReturnIssueId, setSiteReturnIssueId] = useState<string | null>(
    null,
  )
  const siteReturnIssue = materialIssues.find(
    (item) => item.id === siteReturnIssueId,
  )
  const [returnDirection, setReturnDirection] = useWorkspaceViewState<
    'customer' | 'site'
  >(
    'returns.direction',
    'customer',
    (value): value is 'customer' | 'site' =>
      value === 'customer' || value === 'site',
  )
  const [pendingDelete, setPendingDelete] = useState<OperationDeletion | null>(
    null,
  )
  const [deleteError, setDeleteError] = useState('')
  const deletionError = pendingDelete
    ? getOperationDeletionError(
        pendingDelete,
        materialReceipts,
        materialIssues,
        qualityWorkflow,
      ) || deleteError
    : ''
  function requestDelete(target: OperationDeletion) {
    setDeleteError('')
    setPendingDelete(target)
  }
  const [editingRequest, setEditingRequest] =
    useState<RequestDocumentGroup | null>(null)
  const [editingReceipt, setEditingReceipt] =
    useState<ReceiptDocumentGroup | null>(null)
  useEffect(() => {
    // History navigation must not leave an editor from another tab over the list.
    setModal(null)
    setEditingRequest(null)
    setEditingReceipt(null)
    setPendingDelete(null)
  }, [activeTab])
  const [requestSearch, setRequestSearch] = useWorkspaceViewState(
    'requests.search',
    '',
    isViewString,
  )
  const [receiptSearch, setReceiptSearch] = useWorkspaceViewState(
    'receipts.search',
    '',
    isViewString,
  )
  const [qualitySearch, setQualitySearch] = useWorkspaceViewState(
    'quality.search',
    '',
    isViewString,
  )
  const [issueSearch, setIssueSearch] = useWorkspaceViewState(
    'issues.search',
    '',
    isViewString,
  )
  const [returnSearch, setReturnSearch] = useWorkspaceViewState(
    'returns.search',
    '',
    isViewString,
  )
  const [listViews, setListViews] = useWorkspaceViewState<
    Record<string, OperationListView>
  >('operations.listViews', {}, isOperationListViews)
  useEffect(() => {
    if (!projectReturnTarget) return
    setReturnDirection('customer')
    setReturnSearch('')
    setListViews((current) => ({ ...current, returns: emptyOperationListView }))
  }, [projectReturnTarget, setReturnDirection, setReturnSearch, setListViews])
  const listView = listViews[activeTab] ?? emptyOperationListView
  const updateListView = (next: OperationListView) =>
    setListViews((current) => ({ ...current, [activeTab]: next }))
  const cipherOptions = useMemo(
    () =>
      unique(
        [
          ...lines.map((line) => line.cipher),
          ...materialRequests.map((request) => request.cipher),
        ].filter(Boolean),
      ),
    [lines, materialRequests],
  )
  const typeOptions = useMemo(
    () =>
      unique(
        [
          ...lines.map((line) => line.materialType || line.category),
          ...materialRequests.map((request) => request.materialType || ''),
        ].filter(Boolean),
      ),
    [lines, materialRequests],
  )
  const focusTarget = view.focus
    ? { tab: activeTab, targetId: view.focus }
    : null
  const overviewFocusKey =
    activeTab === 'overview' ? (view.focus ?? null) : null
  const lineById = useMemo(() => {
    const map = new Map<string, SubobjectMaterialMetric>()

    for (const line of lines) {
      map.set(getProjectLineId(line), line)
    }

    return map
  }, [lines])
  const balancesByReceipt = useMemo(
    () =>
      receiptBalances(
        materialReceipts,
        qualityWorkflow,
        qualityControls,
        materialIssues,
      ),
    [materialReceipts, qualityWorkflow, qualityControls, materialIssues],
  )
  const remainingByRequest = useMemo(
    () =>
      requestRemainingQuantities(
        materialRequests,
        receivedByRequest(materialReceipts, qualityWorkflow),
      ),
    [materialRequests, materialReceipts, qualityWorkflow],
  )
  const indicatorIndex = useMemo(() => {
    const index: OperationIndicatorIndex = indexOperationIndicators(
      materialRequests,
      materialReceipts,
      balancesByReceipt,
      remainingByRequest,
    )
    if (accounting.stockTransfers?.length) {
      const owners = stockAssignments({
        materialReceipts,
        materialIssues,
        qualityWorkflow,
        stockTransfers: accounting.stockTransfers,
      })
      const affected = new Set(
        accounting.stockTransfers.flatMap((item) => [
          item.fromProjectLineId,
          item.toProjectLineId,
        ]),
      )
      for (const id of affected) {
        const values = index.byLine.get(id) ?? emptyOverviewIndicators()
        values.availableToIssue = 0
        index.byLine.set(id, values)
      }
      index.byAssignment = new Map()
      for (const owner of owners.values()) {
        const available = Math.max(
          0,
          Math.min(owner.stock - owner.quarantined, owner.approved),
        )
        const original = index.byReceipt.get(owner.receiptId)
        if (original)
          index.byAssignment.set(
            stockAssignmentKey(owner.receiptId, owner.projectLineId),
            { ...original, availableToIssue: available },
          )
        if (affected.has(owner.projectLineId))
          index.byLine.get(owner.projectLineId)!.availableToIssue += available
      }
    }
    return index
  }, [
    materialRequests,
    materialReceipts,
    balancesByReceipt,
    remainingByRequest,
    materialIssues,
    qualityWorkflow,
    accounting.stockTransfers,
  ])
  const priority = useMemo(
    () =>
      receiptPriority(listView.sort, balancesByReceipt, {
        byRequest: remainingByRequest,
        receipts: materialReceipts,
      }),
    [listView.sort, balancesByReceipt, remainingByRequest, materialReceipts],
  )
  const operationSummary = useMemo(
    () =>
      buildOperationSummary({
        qualityWorkflow,
        ...accounting,
        lines,
        materialIssues,
        materialReceipts,
        materialRequests,
        qualityControls,
      }),
    [
      lines,
      materialIssues,
      materialReceipts,
      materialRequests,
      qualityControls,
      qualityWorkflow,
      accounting,
    ],
  )
  const tabMeta = operationTabMeta[activeTab]
  const requestDocumentGroups = useMemo(
    () => groupRequestDocuments(materialRequests),
    [materialRequests],
  )
  const requestGroupMeta = useMemo(
    () => buildRequestGroupMeta(requestDocumentGroups, lineById),
    [lineById, requestDocumentGroups],
  )
  const filteredRequestCount = useMemo(() => {
    return requestGroupMeta.filter((item) =>
      operationMetaMatches(item, requestSearch, listView),
    ).length
  }, [requestGroupMeta, requestSearch, listView])
  const receiptDocumentGroups = useMemo(
    () => groupReceiptDocuments(materialReceipts, materialRequests, lineById),
    [materialReceipts, materialRequests, lineById],
  )
  const receiptGroupMeta = useMemo(
    () =>
      buildReceiptGroupMeta(
        receiptDocumentGroups,
        materialRequests,
        lineById,
        qualityWorkflow,
      ),
    [lineById, materialRequests, receiptDocumentGroups, qualityWorkflow],
  )
  const filteredReceiptCount = useMemo(() => {
    return receiptGroupMeta.filter((item) =>
      operationMetaMatches(item, receiptSearch, listView),
    ).length
  }, [receiptGroupMeta, receiptSearch, listView])
  const issueSearchMeta = useMemo(
    () =>
      buildOperationSearchMeta(
        materialIssues,
        materialReceipts,
        materialRequests,
        lineById,
        qualityWorkflow,
      ),
    [
      materialIssues,
      materialReceipts,
      materialRequests,
      lineById,
      qualityWorkflow,
      accounting,
    ],
  )
  const visibleIssues = useMemo(
    () =>
      issueSearchMeta
        .filter((item) => operationMetaMatches(item, issueSearch, listView))
        .map((item) => item.entry),
    [issueSearchMeta, issueSearch, listView],
  )
  const searches = {
    requests: {
      value: requestSearch,
      onChange: setRequestSearch,
      label: 'Поиск заявок',
      summary: `Найдено ${filteredRequestCount} из ${requestDocumentGroups.length} заявок`,
      compactSummary: `${filteredRequestCount} из ${requestDocumentGroups.length}`,
    },
    receipts: {
      value: receiptSearch,
      onChange: setReceiptSearch,
      label: 'Поиск получений',
      summary: `Найдено ${filteredReceiptCount} из ${receiptDocumentGroups.length} материалов`,
      compactSummary: `${filteredReceiptCount} из ${receiptDocumentGroups.length}`,
    },
    quality: {
      value: qualitySearch,
      onChange: setQualitySearch,
      label: 'Поиск входного контроля',
      compactSummary: null,
      summary:
        view.inspection === 'avk'
          ? `АВК: ${qualityWorkflow?.cases.filter((entry) => latestInspectionAct(entry)).length ?? 0}`
          : `ЗНИ: ${qualityWorkflow?.cases.length ?? 0}`,
    },
    issues: {
      value: issueSearch,
      onChange: setIssueSearch,
      label: 'Поиск выдач',
      summary: `Найдено ${visibleIssues.length} из ${materialIssues.length} выдач`,
      compactSummary: `${visibleIssues.length} из ${materialIssues.length}`,
    },
    returns: {
      value: returnSearch,
      onChange: setReturnSearch,
      label: 'Поиск возвратов',
      summary: '',
      compactSummary: null,
    },
  }
  const search = activeTab === 'overview' ? null : searches[activeTab]
  useEscapeAction({
    kind: 'filters',
    enabled:
      activeTab !== 'overview' &&
      !!(search?.value || listView.cipher || listView.materialType),
    onEscape: () => {
      search?.onChange('')
      updateListView({ ...listView, cipher: '', materialType: '' })
    },
  })
  const overviewRows = useMemo(
    () =>
      buildOperationOverviewRows({
        indicatorIndex,
        summaryByLine: operationSummary.byLine,
        remainingByRequest,
        balancesByReceipt,
        workflow: qualityWorkflow,
        lines,
        materialIssues,
        materialReceipts,
        materialRequests,
        qualityControls,
      }),
    [
      lines,
      materialIssues,
      materialReceipts,
      materialRequests,
      qualityControls,
      operationSummary,
      qualityWorkflow,
      balancesByReceipt,
      remainingByRequest,
      indicatorIndex,
    ],
  )

  const indicatorSummaries = useMemo(
    () =>
      summarizeOverviewIndicators({
        rows: overviewRows,
        requests: materialRequests,
        receipts: materialReceipts,
        balances: balancesByReceipt,
        remainingByRequest,
      }),
    [
      overviewRows,
      materialRequests,
      materialReceipts,
      balancesByReceipt,
      remainingByRequest,
    ],
  )

  const returnsContent = (
    <>
      {activeTab === 'returns' && (
        <div className="flex gap-2 border-b p-4">
          <Button
            variant={returnDirection === 'customer' ? 'default' : 'outline'}
            onClick={() => setReturnDirection('customer')}
          >
            Заказчику
          </Button>
          <Button
            variant={returnDirection === 'site' ? 'default' : 'outline'}
            onClick={() => setReturnDirection('site')}
          >
            С площадки
          </Button>
        </div>
      )}
      {activeTab === 'returns' && returnDirection === 'site' && (
        <SiteReturnsWorkspace
          issues={materialIssues}
          receipts={materialReceipts}
          lines={lines}
          requests={materialRequests}
          search={returnSearch}
          view={listView}
          priority={priority}
          onReturn={(issue) => {
            setChoosingReturn(false)
            setSiteReturnIssueId(issue.id)
          }}
        />
      )}
      {activeTab === 'returns' && returnDirection === 'customer' && (
        <ReturnsWorkspace
          projectReturnTarget={projectReturnTarget}
          onClearProjectReturnTarget={onClearProjectReturnTarget}
          stockTransfers={accounting.stockTransfers}
          indicatorIndex={indicatorIndex}
          search={returnSearch}
          listView={listView}
          priority={priority}
          value={qualityWorkflow}
          receipts={materialReceipts}
          requests={materialRequests}
          controls={qualityControls}
          issues={materialIssues}
          lines={lines}
          onChange={(next) => {
            onChangeQualityWorkflow(next)
            setChoosingReturn(false)
          }}
        />
      )}
    </>
  )
  return (
    <section
      ref={viewScrollRef}
      className={`operation-section mt-2 grid min-w-0 grid-cols-1 gap-2 ${displayMode === 'table' ? 'operation-table-fill' : ''}`}
      data-display={displayMode}
    >
      <Card
        className={`min-w-0 ${displayMode === 'table' ? 'operation-table-fill' : ''}`}
      >
        {activeTab !== 'overview' && search ? (
          <CardHeader className="operation-section-toolbar grid shrink-0 gap-2 border-b border-stone-200 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {search.summary && (
                  <span
                    className="shrink-0 whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-xs tabular-nums text-slate-500"
                    title={search.summary}
                  >
                    <span className="sr-only">{search.summary}</span>
                    <span aria-hidden="true">
                      {search.compactSummary ?? search.summary}
                    </span>
                  </span>
                )}
                {activeTab !== 'quality' && activeTab !== 'returns' && (
                  <Button
                    className="h-10 shrink-0"
                    disabled={lines.length === 0}
                    onClick={() => {
                      if (activeTab === 'requests') setEditingRequest(null)
                      if (activeTab === 'receipts') setEditingReceipt(null)
                      setModal(activeTab)
                    }}
                  >
                    {tabMeta.icon}
                    {tabMeta.action}
                  </Button>
                )}
              </div>
            </div>
            <OperationSearchControls
              search={search.value}
              label={search.label}
              view={listView}
              ciphers={cipherOptions}
              materialTypes={typeOptions}
              onSearch={search.onChange}
              onView={updateListView}
            />
          </CardHeader>
        ) : null}
        <CardContent
          className={`p-0 ${displayMode === 'table' ? 'operation-table-fill' : ''}`}
        >
          {displayMode === 'list' &&
            activeTab !== 'overview' &&
            activeTab !== 'quality' && (
              <OperationIndicatorBar
                label={`Сортировка: ${tabMeta.label}`}
                summaries={indicatorSummaries}
                sort={listView.sort}
                onSort={(sort) => updateListView({ ...listView, sort })}
              />
            )}
          {activeTab === 'returns' && displayMode === 'table' && (
            <ReturnsTable
              workflow={qualityWorkflow}
              receipts={materialReceipts}
              issues={materialIssues}
              requests={materialRequests}
              lines={lines}
              search={returnSearch}
              view={listView}
              onCreate={() => setChoosingReturn(true)}
              onOpen={(tab, focus) => navigate({ tab, focus })}
            />
          )}
          {displayMode === 'list' ? (
            <>{returnsContent}</>
          ) : (
            <Modal
              open={choosingReturn}
              title="Оформить возврат"
              onClose={() => setChoosingReturn(false)}
            >
              {returnsContent}
            </Modal>
          )}
          {activeTab === 'quality' && (
            <InspectionWorkspace
              kind={view.inspection ?? 'zni'}
              onKindChange={(inspection) => navigate({ inspection })}
              indicatorIndex={indicatorIndex}
              issues={materialIssues}
              listView={listView}
              requests={materialRequests}
              value={qualityWorkflow}
              receipts={materialReceipts}
              lines={lines}
              onChange={onChangeQualityWorkflow}
              prepare={prepareRequestPrint}
              focusId={
                focusTarget?.tab === 'quality'
                  ? focusTarget.targetId
                  : undefined
              }
              search={qualitySearch}
            />
          )}

          {activeTab === 'overview' ? (
            <OperationOverview
              focusRowKey={overviewFocusKey}
              rows={overviewRows}
              indicatorSummaries={indicatorSummaries}
              onOpenDocument={(tab, targetId) => {
                setListViews((current) => ({
                  ...current,
                  [tab]: {
                    ...(current[tab] ?? emptyOperationListView),
                    cipher: '',
                    materialType: '',
                  },
                }))
                if (tab === 'requests') {
                  setRequestSearch('')
                }
                if (tab === 'receipts') {
                  setReceiptSearch('')
                }
                if (tab === 'quality') {
                  setQualitySearch('')
                }
                if (tab === 'issues') {
                  setIssueSearch('')
                }
                navigate({ tab, focus: targetId })
              }}
              onOpenStage={(tab) => {
                setActiveTab(tab)
              }}
            />
          ) : null}
          {activeTab === 'requests' ? (
            <RequestsTable
              indicatorIndex={indicatorIndex}
              listView={listView}
              priority={priority}
              receipts={materialReceipts}
              workflow={qualityWorkflow}
              onEditDelivery={(delivery) => {
                const first = delivery.entries[0]!
                setEditingReceipt({
                  ...receiptEditGroup(
                    first,
                    materialRequests.find(
                      (request) => request.id === first.requestId,
                    ),
                  ),
                  key: delivery.key,
                  entries: delivery.entries,
                })
                setModal('receipts')
              }}
              prepareRequestPrint={prepareRequestPrint}
              entries={materialRequests}
              focusDocumentNumber={
                focusTarget?.tab === 'requests'
                  ? focusTarget.targetId
                  : undefined
              }
              lineById={lineById}
              requestGroupMeta={requestGroupMeta}
              search={requestSearch}
              summaryByLine={operationSummary.byLine}
              onReceiveRequest={(group) => {
                setInitialReceiptRequest(group.number)
                setEditingReceipt(null)
                setModal('receipts')
              }}
              onEditRequest={(group) => {
                setEditingRequest(group)
                setModal('requests')
              }}
              onOpenOverviewLine={(line) => {
                navigate({
                  tab: 'overview',
                  focus: getMaterialIdentityKey(line),
                })
              }}
            />
          ) : null}
          {activeTab === 'receipts' ? (
            <ReceiptsTable
              indicatorIndex={indicatorIndex}
              listView={listView}
              priority={priority}
              workflow={qualityWorkflow}
              entries={materialReceipts}
              focusEntryId={
                focusTarget?.tab === 'receipts'
                  ? focusTarget.targetId
                  : undefined
              }
              lineById={lineById}
              receiptGroupMeta={receiptGroupMeta}
              requests={materialRequests}
              remainingByRequest={remainingByRequest}
              search={receiptSearch}
              onCreateInspection={(entry) =>
                navigate({
                  tab: 'quality',
                  inspection: 'zni',
                  focus: `create:${entry.id}`,
                })
              }
              onEditReceipt={(group) => {
                setEditingReceipt(group)
                setModal('receipts')
              }}
              onDeleteReceipt={(group) =>
                requestDelete({
                  kind: 'receipts',
                  ids: group.entries.map((entry) => entry.id),
                  title: 'Удалить получение?',
                  details: `${group.actualName || 'ТМЦ без наименования'} от ${formatDate(group.date)}. Позиций: ${group.entries.length}. Документы: ${unique(group.entries.flatMap((entry) => documentsForReceipt(entry, qualityWorkflow).map(receiptDocumentLabel))).join('; ') || 'не указаны'}.`,
                })
              }
              onOpenOverviewLine={(line) => {
                navigate({
                  tab: 'overview',
                  focus: getMaterialIdentityKey(line),
                })
              }}
            />
          ) : null}

          {activeTab === 'issues' ? (
            <IssuesTable
              indicatorIndex={indicatorIndex}
              listView={listView}
              priority={priority}
              search={issueSearch}
              entries={visibleIssues}
              focusEntryId={
                focusTarget?.tab === 'issues' ? focusTarget.targetId : undefined
              }
              lineById={lineById}
              receipts={materialReceipts}
              balances={balancesByReceipt}
              onReturn={(entry) => setSiteReturnIssueId(entry.id)}
              onDelete={(entry) =>
                requestDelete({
                  kind: 'issues',
                  id: entry.id,
                  title: 'Удалить выдачу?',
                  details: `${entry.document} от ${formatDate(entry.date)}. ${materialReceipts.find((receipt) => receipt.id === entry.receiptId)?.actualName || lineById.get(entry.projectLineId)?.projectMaterialName || 'Материал не найден'}. Количество: ${formatQuantity(entry.quantity)}.`,
                })
              }
            />
          ) : null}
          {activeTab === 'issues' &&
          materialIssues.length > 0 &&
          visibleIssues.length === 0 ? (
            <div className="p-4">
              <OperationFormEmpty text="Выдачи по такому запросу не найдены." />
            </div>
          ) : null}
          {activeTab !== 'overview' &&
          activeTab !== 'returns' &&
          activeTab !== 'quality' &&
          getOperationTabCount(activeTab, {
            receiptMaterialCount: receiptDocumentGroups.length,
            qualityDocumentCount: qualityWorkflow?.cases.length ?? 0,
            returnDocumentCount: qualityWorkflow?.customerReturns?.length ?? 0,
            overviewCount: overviewRows.length,
            materialIssues,
            materialRequests,
          }) === 0 ? (
            <OperationEmptyState
              action={tabMeta.action}
              empty={tabMeta.empty}
              icon={tabMeta.icon}
              onCreate={() => {
                if (activeTab === 'requests') {
                  setEditingRequest(null)
                }
                if (activeTab === 'receipts') {
                  setEditingReceipt(null)
                }
                setModal(activeTab)
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      <Modal
        open={Boolean(pendingDelete)}
        title={pendingDelete?.title ?? 'Удаление операции'}
        onClose={() => setPendingDelete(null)}
      >
        <div className="grid gap-4">
          <p className="text-sm text-stone-700">{pendingDelete?.details}</p>
          <p className="text-sm text-stone-600">
            {pendingDelete?.kind === 'receipts'
              ? 'Будут удалены все позиции этого получения. Количество снова станет доступно к получению по заявке.'
              : 'Выданное количество вернётся в остаток к выдаче.'}{' '}
            Отменить удаление после сохранения нельзя.
          </p>
          {deletionError ? (
            <p
              role="alert"
              className="rounded-md bg-amber-50 p-3 text-sm text-amber-900"
            >
              {deletionError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Отмена
            </Button>
            <Button
              className="bg-red-700 hover:bg-red-800"
              disabled={Boolean(deletionError)}
              onClick={() => {
                if (!pendingDelete) return
                const error = onDeleteOperation(pendingDelete)
                if (error) setDeleteError(error)
                else setPendingDelete(null)
              }}
            >
              Удалить
            </Button>
          </div>
        </div>
      </Modal>
      <RequestModal
        availableCiphers={availableCiphers}
        configuredUnits={configuredUnits}
        editingRequest={editingRequest}
        existingRequests={materialRequests}
        lines={lines}
        open={modal === 'requests'}
        receipts={materialReceipts}
        summaryByLine={operationSummary.byLine}
        onAdjustProjectQuantity={onAdjustProjectQuantity}
        onClose={() => {
          setEditingRequest(null)
          setModal(null)
        }}
        onDelete={(number) => {
          onDeleteRequests(number)
          setEditingRequest(null)
          setModal(null)
          setActiveTab('requests')
        }}
        onSubmit={(entries) => {
          if (editingRequest) {
            onUpdateRequests(editingRequest.number, entries)
          } else {
            onCreateRequests(entries)
          }
          setEditingRequest(null)
          setModal(null)
          setActiveTab('requests')
        }}
      />
      <ReceiptModal
        prepare={prepareReceiptSave}
        initialRequestNumber={initialReceiptRequest}
        workflow={qualityWorkflow}
        editingReceipt={editingReceipt}
        lineById={lineById}
        open={modal === 'receipts'}
        requests={materialRequests}
        receipts={materialReceipts}
        summaryByLine={operationSummary.byLine}
        onClose={() => {
          setEditingReceipt(null)
          setInitialReceiptRequest('')
          setModal(null)
        }}
        onSubmit={(entries, documents, records) => {
          if (editingReceipt) {
            onUpdateReceipts(
              editingReceipt.entries.map((entry) => entry.id),
              entries,
              documents,
              records,
            )
          } else {
            onCreateReceipts(entries, documents, records)
          }
        }}
        onSaved={() => {
          setEditingReceipt(null)
          setInitialReceiptRequest('')
          setModal(null)
          setActiveTab('receipts')
        }}
      />

      <Modal
        open={!!siteReturnIssue}
        title="Возврат с площадки"
        size="details"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
        onClose={() => setSiteReturnIssueId(null)}
      >
        {siteReturnIssue && (
          <SiteReturnForm
            key={siteReturnIssue.id}
            issue={siteReturnIssue}
            name={
              materialReceipts.find(
                (receipt) => receipt.id === siteReturnIssue.receiptId,
              )?.actualName || 'Материал'
            }
            unit={
              siteReturnIssue.projectUnit ||
              materialReceipts.find(
                (receipt) => receipt.id === siteReturnIssue.receiptId,
              )?.projectUnit ||
              ''
            }
            onSubmit={onSiteReturn}
            onClose={() => setSiteReturnIssueId(null)}
          />
        )}
      </Modal>
      <IssueModal
        workflow={qualityWorkflow}
        requests={materialRequests}
        lineById={lineById}
        issues={materialIssues}
        open={modal === 'issues'}
        qualityControls={qualityControls}
        receipts={materialReceipts}
        onClose={() => setModal(null)}
        onSubmit={(entries) => {
          onCreateIssues(entries)
          setModal(null)
          setIssueSearch('')
          setActiveTab('issues')
        }}
      />
    </section>
  )
}

function OperationEmptyState({
  action,
  empty,
  icon,
  onCreate,
}: {
  action: string
  empty: string
  icon: React.ReactNode
  onCreate: () => void
}) {
  return (
    <div className="grid min-h-72 place-items-center px-6 py-10">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-stone-500 shadow-sm">
          {icon}
        </div>
        <div className="mt-4 text-sm font-semibold text-stone-900">{empty}</div>

        <Button className="mt-4" onClick={onCreate}>
          <Plus size={16} />
          {action}
        </Button>
      </div>
    </div>
  )
}

function OperationIndicatorBar({
  label,
  summaries,
  sort,
  onSort,
}: {
  label: string
  summaries: ReturnType<typeof summarizeOverviewIndicators>
  sort: OverviewSort
  onSort: (sort: OverviewSort) => void
}) {
  return (
    <div
      className="grid grid-cols-2 gap-2 border-b bg-white p-4 lg:grid-cols-4 2xl:grid-cols-7"
      role="group"
      aria-label={label}
    >
      {overviewIndicatorKeys.map((key) => (
        <OperationIndicatorBadge
          key={key}
          label={overviewIndicatorLabels[key]}
          value={`${summaries[key].count.toLocaleString('ru-RU')} поз.`}
          details={`${key === 'remaining' ? 'Осталось получить по существующим заявкам' : overviewIndicatorLabels[key]}: ${summaries[key].count ? formatUnitTotals(summaries[key].quantities) : 'нет позиций'}`}
          active={sort === key}
          onClick={() => onSort(sort === key ? '' : key)}
        />
      ))}
    </div>
  )
}

function OperationOverview({
  focusRowKey,
  rows,
  indicatorSummaries,
  onOpenDocument,
  onOpenStage,
}: {
  focusRowKey?: string | null
  rows: Array<OperationOverviewRow>
  indicatorSummaries: ReturnType<typeof summarizeOverviewIndicators>
  onOpenDocument: (tab: OperationActionTab, targetId: string) => void
  onOpenStage: (tab: OperationActionTab) => void
}) {
  const { mode: displayMode } = useOperationDisplay()
  const [expandedRows, setExpandedRows] = useWorkspaceViewState<
    Record<string, boolean>
  >('overview.expanded', {}, isViewExpanded)
  const [sort, setSort] = useWorkspaceViewState<OverviewSort>(
    'overview.sort',
    '',
    isOverviewSort,
  )
  const [search, setSearch] = useWorkspaceViewState(
    'overview.search',
    '',
    isViewString,
  )
  const [cipherFilter, setCipherFilter] = useWorkspaceViewState(
    'overview.cipher',
    '',
    isViewString,
  )
  const [materialTypeFilter, setMaterialTypeFilter] = useWorkspaceViewState(
    'overview.type',
    '',
    isViewString,
  )
  useEscapeAction({
    kind: 'filters',
    enabled: !!(search || cipherFilter || materialTypeFilter),
    onEscape: () => {
      setSearch('')
      setCipherFilter('')
      setMaterialTypeFilter('')
    },
  })
  const cipherOptions = useMemo(
    () => unique(rows.flatMap((row) => row.ciphers.map((item) => item.cipher))),
    [rows],
  )
  const materialTypeOptions = useMemo(
    () => unique(rows.map((row) => row.materialType).filter(Boolean)),
    [rows],
  )
  const filteredRows = useMemo(
    () =>
      prioritizeOverviewRows(
        rows.filter(
          (row) =>
            operationOverviewRowMatchesSearch(row, search) &&
            operationOverviewRowMatchesCipher(row, cipherFilter) &&
            operationOverviewRowMatchesMaterialType(row, materialTypeFilter),
        ),
        sort,
      ),
    [cipherFilter, materialTypeFilter, rows, search, sort],
  )

  const pagination = useOperationPagination(
    'overview',
    filteredRows,
    JSON.stringify([search, cipherFilter, materialTypeFilter, sort]),
    {
      key:
        !search && !cipherFilter && !materialTypeFilter
          ? focusRowKey
          : undefined,
      index: filteredRows.findIndex((row) => row.key === focusRowKey),
    },
  )

  useEffect(() => {
    if (!focusRowKey) {
      return
    }

    setSearch('')
    setCipherFilter('')
    setMaterialTypeFilter('')
    setExpandedRows((current) => ({
      ...current,
      [focusRowKey]: true,
    }))
    window.requestAnimationFrame(() => {
      document
        .getElementById(overviewAnchorId(focusRowKey))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [focusRowKey])

  if (rows.length === 0) {
    return (
      <div className="grid min-h-72 place-items-center px-6 py-10">
        <div className="max-w-sm text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-stone-500 shadow-sm">
            <BarChart3 size={20} />
          </div>
          <div className="mt-4 text-sm font-semibold text-stone-900">
            Общих данных пока нет
          </div>
          <div className="mt-1 text-sm leading-6 text-stone-500">
            Добавьте проектный материал, затем создавайте заявки, получение, ВК
            и выдачу.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`bg-stone-50/60 ${displayMode === 'table' ? 'operation-table-fill' : ''}`}
    >
      {displayMode === 'list' && (
        <OperationIndicatorBar
          label="Сортировка материалов"
          summaries={indicatorSummaries}
          sort={sort}
          onSort={setSort}
        />
      )}
      <div className="operation-section-toolbar shrink-0 border-b border-stone-200 bg-white px-3 py-2">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_140px_180px_auto_auto] xl:items-center">
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <Input
              className="h-10 pl-10 text-sm"
              placeholder="Поиск по наименованию, шифру, нормативному документу, составу или типу"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <FilterAutocompleteInput
            options={cipherOptions}
            placeholder="Шифр"
            value={cipherFilter}
            onChange={setCipherFilter}
          />
          <FilterAutocompleteInput
            options={materialTypeOptions}
            placeholder="Тип материала"
            value={materialTypeFilter}
            onChange={setMaterialTypeFilter}
          />
          <OperationDisplayToggle />
          <span
            className="justify-self-end whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-xs tabular-nums text-slate-500 md:self-center"
            title={`Найдено ${filteredRows.length} из ${rows.length} позиций`}
          >
            <span className="sr-only">
              Найдено {filteredRows.length} из {rows.length} позиций
            </span>
            <span aria-hidden="true">
              {filteredRows.length} из {rows.length}
            </span>
          </span>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="grid min-h-64 place-items-center px-6 py-10">
          <div className="max-w-sm text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-500 shadow-sm">
              <Search size={20} />
            </div>
            <div className="mt-4 text-sm font-semibold text-stone-900">
              Ничего не найдено
            </div>
          </div>
        </div>
      ) : null}

      {displayMode === 'table' && (
        <OperationsGrid
          id="overview-flat"
          fillHeight
          label="Обеспечение материалами"
          pagination
          rows={filteredRows.flatMap((row) =>
            row.ciphers
              .filter(
                (cipher) => !cipherFilter || cipher.cipher === cipherFilter,
              )
              .map((cipher) => ({ ...row, ...cipher })),
          )}
          rowId={(row) => row.lineId}
          focusRowId={
            filteredRows.find((row) => row.key === focusRowKey)?.ciphers[0]
              ?.lineId
          }
          columns={[
            {
              id: 'material',
              title: 'Материал',
              value: (row) => row.projectMaterialName,
              width: 340,
            },
            { id: 'cipher', title: 'Шифр', value: (row) => row.cipher },
            {
              id: 'type',
              title: 'Тип материала',
              value: (row) => row.materialType,
            },
            { id: 'unit', title: 'Единица', value: (row) => row.unit },
            {
              id: 'normativeDocument',
              title: 'Нормативный документ',
              value: (row) => row.normativeDocument,
            },
            {
              id: 'composition',
              title: 'Состав',
              value: (row) => row.material,
            },
            {
              id: 'unitWeight',
              title: 'Масса',
              value: (row) => row.unitWeight,
              numeric: true,
            },
            {
              id: 'projectQuantity',
              title: 'По проекту',
              value: (row) => row.projectQuantity,
              numeric: true,
            },
            ...(['requests', 'receipts', 'quality', 'issues'] as const).map(
              (tab) => ({
                id: tab,
                title: {
                  requests: 'В заявках',
                  receipts: 'Получено',
                  quality: 'Пройден ВК',
                  issues: 'Выдано',
                }[tab],
                value: (row: OperationOverviewCipherRow) =>
                  row.metrics[tab].quantity,
                numeric: true,
              }),
            ),
            {
              id: 'm15Quantity',
              title: 'По М-15',
              value: (row: OperationOverviewCipherRow) => row.m15Quantity,
              numeric: true,
            },
            ...overviewIndicatorKeys
              .filter((key) => key !== 'received')
              .map((key) => ({
                id: key,
                title: overviewIndicatorLabels[key],
                numeric: true,
                value: (row: OperationOverviewCipherRow) => row.indicators[key],
              })),
            {
              id: 'documents',
              title: 'Документы',
              value: (row) =>
                Object.values(row.metrics)
                  .flatMap((metric) => metric.documents.map((doc) => doc.label))
                  .join('; '),
              width: 360,
            },
            {
              id: 'actions',
              title: 'Открыть документы',
              actions: true,
              value: () => '',
              width: 176,
              render: (row) => (
                <RowActions>
                  {(
                    ['requests', 'receipts', 'quality', 'issues'] as const
                  ).flatMap((tab) =>
                    row.metrics[tab].documents.map((doc) => (
                      <RowActionButton
                        key={`${tab}:${doc.id}`}
                        iconOnly
                        aria-label={doc.label}
                        title={doc.label}
                        onClick={() => onOpenDocument(tab, doc.id)}
                      >
                        <FolderOpen size={14} aria-hidden="true" />
                      </RowActionButton>
                    )),
                  )}
                </RowActions>
              ),
            },
          ]}
        />
      )}
      {displayMode === 'list' && (
        <>
          <div
            ref={pagination.containerRef}
            className="grid scroll-mt-[32rem] md:scroll-mt-48 xl:scroll-mt-32 gap-3 p-4"
          >
            {pagination.items.map((row) => {
              const isExpanded = expandedRows[row.key] ?? false
              const rowTone = getOperationOverviewRowTone(row)
              const rowFocusClass =
                row.key === focusRowKey
                  ? rowTone.focus
                  : isExpanded
                    ? rowTone.expanded
                    : ''

              return (
                <div
                  key={row.key}
                  id={overviewAnchorId(row.key)}
                  data-received-complete={
                    !row.deleted &&
                    row.totalProjectQuantity > 0 &&
                    row.remainingProjectQuantity === 0
                  }
                  className={`overflow-hidden rounded-lg border transition-colors ${rowTone.card} ${rowFocusClass}`}
                >
                  <div
                    className={`grid gap-4 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_auto] ${rowTone.header}`}
                  >
                    <button
                      className="flex min-w-0 items-start gap-3 rounded-md text-left transition-colors hover:text-slate-950"
                      type="button"
                      onClick={() =>
                        setExpandedRows((current) => ({
                          ...current,
                          [row.key]: !isExpanded,
                        }))
                      }
                    >
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-slate-400 transition-colors ${
                          isExpanded
                            ? 'border-stone-300 bg-stone-100 text-stone-600'
                            : 'border-stone-200 bg-stone-50'
                        }`}
                      >
                        <ChevronDown
                          className={`transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          size={17}
                        />
                      </span>
                      <span className="min-w-0 pt-0.5">
                        <span className="material-name-clamp block text-[15px] font-normal leading-6 text-slate-800">
                          {row.projectMaterialName ||
                            'Материал без наименования'}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
                          {row.deleted ? <DeletedProjectMaterialBadge /> : null}
                          <span>{row.materialType || 'Без типа'}</span>
                        </span>
                      </span>
                    </button>

                    <span className="grid min-w-[650px] gap-2 sm:grid-cols-6">
                      <OverviewReferenceMetric
                        label="По проекту"
                        value={row.totalProjectQuantity}
                        unit={row.unit}
                        deleted={row.deleted}
                      />
                      <OverviewHeaderMetric
                        label="В заявках"
                        tab="requests"
                        value={row.totals.requests.quantity}
                        unit={row.unit}
                        onOpenStage={onOpenStage}
                      />
                      <OverviewHeaderMetric
                        label="Получено"
                        tab="receipts"
                        value={row.totals.receipts.quantity}
                        unit={row.unit}
                        onOpenStage={onOpenStage}
                      />
                      <OverviewReferenceMetric
                        label="По М-15"
                        value={row.totalM15Quantity}
                        unit={row.unit}
                        deleted={false}
                      />
                      <OverviewHeaderMetric
                        label="Пройден ВК"
                        tab="quality"
                        value={row.totals.quality.quantity}
                        unit={row.unit}
                        onOpenStage={onOpenStage}
                      />
                      <OverviewHeaderMetric
                        label="Выдано"
                        tab="issues"
                        value={row.totals.issues.quantity}
                        unit={row.unit}
                        onOpenStage={onOpenStage}
                      />
                    </span>
                  </div>

                  {isExpanded ? (
                    <div className="border-t border-stone-200 bg-stone-50/40">
                      <div className="grid gap-3 px-4 py-3">
                        <div className="grid gap-0 overflow-hidden rounded-lg border border-stone-200 bg-white sm:grid-cols-2 lg:grid-cols-[minmax(280px,1.45fr)_170px_minmax(180px,1fr)_150px]">
                          <OverviewPassportItem
                            label="Нормативный документ"
                            value={row.normativeDocument || 'не указан'}
                          />
                          <OverviewPassportItem
                            label="Единица измерения"
                            value={row.unit}
                          />
                          <OverviewPassportItem
                            label="Состав"
                            value={row.material || 'не указан'}
                          />
                          <OverviewPassportItem
                            align="right"
                            label="Масса"
                            value={
                              row.unitWeight === null
                                ? 'не указана'
                                : formatQuantity(row.unitWeight)
                            }
                          />
                        </div>

                        <div
                          data-workspace-scroll={`overview:${row.key}`}
                          className="overflow-auto rounded-lg border border-stone-200 bg-white"
                        >
                          <OperationsGrid
                            id={`overview:${row.key}`}
                            pageScroll
                            indicators={{
                              values: (item) => item.indicators,
                              unit: (item) => item.unit,
                              existing: { received: 'receipts' },
                            }}
                            label={`Движение: ${row.projectMaterialName}`}
                            rows={row.ciphers.map((cipher) => ({
                              ...cipher,
                              unit: row.unit,
                              isTotal: false,
                            }))}
                            rowId={(item) => item.lineId}
                            totals={[
                              {
                                m15Quantity: row.totalM15Quantity,
                                lineId: 'total',
                                cipher: 'Всего по проекту',
                                projectQuantity: row.totalProjectQuantity,
                                metrics: row.totals,
                                indicators: row.indicators,
                                unit: row.unit,
                                isTotal: true,
                              },
                            ]}
                            columns={[
                              {
                                id: 'cipher',
                                title: 'Шифр',
                                value: (item) => item.cipher,
                                width: 220,
                              },
                              {
                                id: 'projectQuantity',
                                title: 'По проекту',
                                value: (item) => item.projectQuantity,
                                numeric: true,
                                render: (item) => (
                                  <>
                                    {formatQuantity(item.projectQuantity)}{' '}
                                    {item.unit}
                                  </>
                                ),
                              },
                              {
                                id: 'm15Quantity',
                                title: 'По М-15',
                                value: (item) => item.m15Quantity,
                                numeric: true,
                              },
                              ...(
                                [
                                  'requests',
                                  'receipts',
                                  'quality',
                                  'issues',
                                ] as const
                              ).map((tab) => ({
                                id: tab,
                                title: {
                                  requests: 'В заявках',
                                  receipts: 'Получено',
                                  quality: 'Пройден ВК',
                                  issues: 'Выдано',
                                }[tab],
                                value: (item: {
                                  metrics: OperationOverviewMetrics
                                }) => item.metrics[tab].quantity,
                                numeric: true,
                                width: 230,
                                render: (item: {
                                  cipher: string
                                  isTotal: boolean
                                  unit: string
                                  metrics: OperationOverviewMetrics
                                }) => (
                                  <OverviewMetricCell
                                    cipher={item.cipher}
                                    isTotal={item.isTotal}
                                    metric={item.metrics[tab]}
                                    tab={tab}
                                    unit={item.unit}
                                    onOpenDocument={onOpenDocument}
                                    onOpenStage={onOpenStage}
                                  />
                                ),
                              })),
                            ]}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {pagination.total > 0 && (
              <OperationPagination
                pagination={pagination}
                label="Общие данные"
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function OverviewReferenceMetric({
  deleted = false,
  label,
  unit,
  value,
}: {
  deleted?: boolean
  label: string
  unit: string
  value: number
}) {
  return (
    <span
      className={`grid h-20 content-center gap-1 rounded-md border px-3 py-2 text-left shadow-sm ${
        deleted
          ? 'border-slate-300 bg-slate-100 text-slate-500 shadow-slate-200/40'
          : 'border-slate-200 bg-white text-slate-700 shadow-slate-200/40'
      }`}
    >
      <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="block text-sm font-normal tabular-nums leading-5">
        {deleted ? 'удален' : `${formatQuantity(value)} ${unit}`}
      </span>
    </span>
  )
}

function OverviewHeaderMetric({
  label,
  onOpenStage,
  tab,
  unit,
  value,
}: {
  label: string
  onOpenStage: (tab: OperationActionTab) => void
  tab: OperationActionTab
  unit: string
  value: number
}) {
  return (
    <button
      className="grid h-20 content-center gap-1 rounded-md border border-stone-200 bg-stone-50/80 px-3 py-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpenStage(tab)
      }}
    >
      <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="block text-sm font-normal tabular-nums leading-5 text-slate-700">
        {formatQuantity(value)} {unit}
      </span>
    </button>
  )
}

function OverviewPassportItem({
  align = 'left',
  label,
  value,
}: {
  align?: 'left' | 'right'
  label: string
  value: string
}) {
  return (
    <span
      className={`min-w-0 border-b border-r border-slate-200 px-3 py-2.5 last:border-r-0 sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(4n)]:border-r-0 ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="mt-1 block truncate text-sm font-normal leading-5 text-slate-700">
        {value}
      </span>
    </span>
  )
}

function OverviewMetricCell({
  cipher,
  isTotal,
  metric,
  onOpenDocument,
  onOpenStage,
  tab,
  unit,
}: {
  cipher: string
  isTotal: boolean
  metric: OperationOverviewMetric
  onOpenDocument: (tab: OperationActionTab, targetId: string) => void
  onOpenStage: (tab: OperationActionTab) => void
  tab: OperationActionTab
  unit: string
}) {
  const [documentsOpen, setDocumentsOpen] = useState(false)
  const documentLabel = getOverviewDocumentLabel(tab, metric.documents.length)
  const hasReplacementDocuments =
    tab === 'receipts' &&
    metric.documents.some((document) => document.replacement)

  return (
    <div className="w-full">
      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <button
          className={`min-w-0 text-left tabular-nums hover:text-blue-700 ${
            isTotal
              ? 'font-normal text-slate-900'
              : 'font-normal text-slate-800'
          }`}
          type="button"
          onClick={() => onOpenStage(tab)}
        >
          {formatQuantity(metric.quantity)} {unit}
        </button>
        {metric.documents.length > 0 ? (
          <div className="grid justify-items-end gap-1">
            <button
              className="rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs font-normal text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-100"
              type="button"
              onClick={() => setDocumentsOpen(true)}
            >
              {documentLabel}
            </button>
            {hasReplacementDocuments ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                замена
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {documentsOpen
        ? createPortal(
            <OverviewDocumentsDialog
              cipher={cipher}
              documents={metric.documents}
              tab={tab}
              title={operationTabMeta[tab].label}
              unit={unit}
              onClose={() => setDocumentsOpen(false)}
              onOpenDocument={(targetId) => {
                setDocumentsOpen(false)
                onOpenDocument(tab, targetId)
              }}
            />,
            document.body,
          )
        : null}
    </div>
  )
}

function OverviewDocumentsDialog({
  cipher,
  documents,
  onClose,
  onOpenDocument,
  tab,
  title,
  unit,
}: {
  cipher: string
  documents: Array<OperationOverviewDocument>
  tab: OperationActionTab
  title: string
  unit: string
  onClose: () => void
  onOpenDocument: (targetId: string) => void
}) {
  const dialogTitle = tab === 'requests' ? `Заявки по шифру ${cipher}` : title

  return (
    <EscapeLayer onEscape={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialogTitle}
        className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/25 px-4 py-6"
      >
        <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-950">
                {dialogTitle}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>
                  {documents.length}{' '}
                  {getOverviewDocumentLabelSuffix(documents.length)}
                </span>
                {tab === 'requests' ? null : <span>Шифр: {cipher}</span>}
              </div>
            </div>
            <button
              className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
          <div className="max-h-[460px] overflow-auto p-2">
            {sortOperationsNewestFirst(
              documents,
              (document) => document.date,
            ).map((document) => (
              <button
                key={document.id}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-blue-50"
                type="button"
                onClick={() => onOpenDocument(document.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-normal text-blue-700">
                    {document.label}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {getOverviewDocumentDateLabel(tab)}:{' '}
                    {formatDate(document.date)}
                  </span>
                  {document.replacement ? (
                    <span className="mt-1 inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                      1 замена
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-xs tabular-nums text-slate-500">
                  {formatQuantity(document.quantity)} {unit}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </EscapeLayer>
  )
}

function getOverviewDocumentLabel(tab: OperationActionTab, count: number) {
  if (tab === 'requests') {
    return `${count} ${pluralizeRu(count, 'заявка', 'заявки', 'заявок')}`
  }

  return `${count} ${getOverviewDocumentLabelSuffix(count)}`
}

function getOverviewDocumentLabelSuffix(count: number) {
  return pluralizeRu(count, 'документ', 'документа', 'документов')
}

function getOverviewDocumentDateLabel(tab: OperationActionTab) {
  if (tab === 'requests') {
    return 'Дата заявки'
  }

  if (tab === 'receipts') {
    return 'Дата получения'
  }

  return 'Дата'
}

function pluralizeRu(count: number, one: string, few: string, many: string) {
  const mod10 = Math.abs(count) % 10
  const mod100 = Math.abs(count) % 100

  if (mod10 === 1 && mod100 !== 11) {
    return one
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few
  }

  return many
}

const requestMaterialTypeLabels: Record<string, string> = {
  'Трубопроводы / трубная продукция': 'Трубы',
  'Соединительные детали трубопроводов': 'Детали труб',
  'Фланцы и фланцевые соединения': 'Фланцы',
  'Арматура трубопроводная': 'Арматура',
  'Крепеж и метизы': 'Крепёж',
  'Опоры и подвески трубопроводов': 'Опоры труб',
  'Кабельная продукция': 'Кабель',
  'Электромонтажные изделия': 'Электромонтаж',
  'Изоляционные материалы': 'Изоляция',
  'ЛКМ и защитные покрытия': 'ЛКМ / покрытия',
  'Расходные и вспомогательные материалы': 'Расходники',
  'ЖБИ и строительные материалы': 'ЖБИ / строймат.',
  'Закладные и монтажные изделия': 'Закладные',
  'Комплекты / узлы / сборочные единицы': 'Узлы / комплекты',
  'Непроектный материал': 'Непроектный',
}

function compactRequestMaterialType(value: string) {
  const types = value.split(', ')
  const first = requestMaterialTypeLabels[types[0]!] ?? types[0]!
  return types.length > 1 ? `${first} +${types.length - 1}` : first
}

function RequestsTable({
  onReceiveRequest,
  indicatorIndex,
  listView,
  priority,
  receipts,
  workflow,
  onEditDelivery,
  prepareRequestPrint,
  entries,
  focusDocumentNumber,
  lineById,
  requestGroupMeta,
  search,
  onEditRequest,
  onOpenOverviewLine,
  summaryByLine,
}: {
  onReceiveRequest: (group: RequestDocumentGroup) => void
  indicatorIndex: OperationIndicatorIndex
  listView: OperationListView
  priority: ReceiptPriority
  receipts: Array<MaterialReceiptEntry>
  workflow?: QualityWorkflow
  onEditDelivery: (delivery: ReceiptDelivery<MaterialReceiptEntry>) => void
  prepareRequestPrint: () => Promise<string>
  entries: Array<MaterialRequestEntry>
  focusDocumentNumber?: string
  lineById: Map<string, SubobjectMaterialMetric>
  requestGroupMeta: Array<RequestGroupMeta>
  search: string
  onEditRequest: (group: RequestDocumentGroup) => void
  onOpenOverviewLine: (line: SubobjectMaterialMetric) => void
  summaryByLine: Map<string, OperationLineSummary>
}) {
  const { mode: displayMode } = useOperationDisplay()
  const [expandedGroups, setExpandedGroups] = useWorkspaceViewState<
    Record<string, boolean>
  >('requests.expanded', {}, isViewExpanded)
  const netReceived = useMemo(
    () => receivedByRequest(receipts, workflow),
    [receipts, workflow],
  )
  const normalizedSearch = normalizeSearchValue(search)
  const priorityRequestIds = useMemo(
    () =>
      priority.key === 'remaining'
        ? new Set(
            [...requestRemainingQuantities(entries, netReceived)]
              .filter(([, quantity]) => quantity > 0)
              .map(([id]) => id),
          )
        : new Set(
            receipts
              .filter((receipt) => priority.ids.has(receipt.id))
              .map((receipt) => receipt.requestId),
          ),
    [receipts, priority, entries, netReceived],
  )
  const filteredGroupMeta = prioritizeReceiptRows(
    requestGroupMeta.filter((item) =>
      operationMetaMatches(item, search, listView),
    ),
    { key: priority.key, ids: priorityRequestIds },
    (item) => item.group.entries.map((entry) => entry.id),
  )

  const pagination = useOperationPagination(
    'requests',
    filteredGroupMeta,
    JSON.stringify([normalizedSearch, listView]),
    {
      key: focusDocumentNumber,
      index: filteredGroupMeta.findIndex(
        ({ group }) => group.number === focusDocumentNumber,
      ),
    },
  )

  useEffect(() => {
    if (!focusDocumentNumber) {
      return
    }

    setExpandedGroups((current) => ({
      ...current,
      [focusDocumentNumber]: true,
    }))
    window.requestAnimationFrame(() => {
      document
        .getElementById(operationAnchorId('requests', focusDocumentNumber))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [focusDocumentNumber])

  const referenceQuantityByLineId = useMemo(
    () => buildRequestReferenceQuantities(Array.from(lineById.values())),
    [lineById],
  )

  const flatRows = filteredGroupMeta.flatMap(({ group }) =>
    group.entries.map((entry) => ({
      entry,
      group,
      line: lineById.get(entry.projectLineId),
      isDeletedProjectMaterial: !lineById.has(entry.projectLineId),
      summary: summaryByLine.get(entry.projectLineId),
      referenceQuantity: referenceQuantityByLineId.get(entry.projectLineId),
      received: netReceived.get(entry.id) ?? 0,
      remaining: Math.max(
        0,
        effectiveRequestQuantity(entry) - (netReceived.get(entry.id) ?? 0),
      ),
    })),
  )
  const columns: Array<DataColumn<(typeof flatRows)[number]>> = [
    { id: 'document', title: 'Заявка', value: ({ entry }) => entry.number },
    { id: 'date', date: true, title: 'Дата', value: ({ entry }) => entry.date },
    { id: 'cipher', title: 'Шифр', value: ({ entry }) => entry.cipher },
    {
      id: 'requester',
      title: 'Получатель заявки',
      value: ({ entry }) => entry.requester,
    },
    {
      id: 'requestNote',
      title: 'Примечание заявки',
      value: ({ entry }) => entry.requestNote,
    },
    {
      id: 'cancelled',
      title: 'Отменено по ИЗМ',
      numeric: true,
      value: ({ entry }) => cancelledRequestQuantity(entry),
    },
    {
      id: 'actions',
      title: 'Действия',
      actions: true,
      value: () => '',
      width: 176,
      minWidth: 176,
      render: ({ group, entry, line, remaining }) => (
        <RowActions>
          <RowActionButton
            iconOnly
            aria-label="Открыть"
            title="Открыть заявку"
            onClick={() => onEditRequest(group)}
          >
            <FolderOpen size={14} aria-hidden="true" />
          </RowActionButton>
          <RequestPrintButton
            entryId={entry.id}
            number={entry.number}
            prepare={prepareRequestPrint}
            iconOnly
            className={rowActionStyle({ iconOnly: true })}
          />
          {line && (
            <RowActionButton
              iconOnly
              aria-label="Материал"
              title="Открыть материал"
              onClick={() => onOpenOverviewLine(line)}
            >
              <Boxes size={14} aria-hidden="true" />
            </RowActionButton>
          )}
          {remaining > 0 && (
            <RowActionButton
              iconOnly
              aria-label="Оформить получение"
              title="Оформить получение"
              onClick={() => onReceiveRequest(group)}
            >
              <PackageCheck size={14} aria-hidden="true" />
            </RowActionButton>
          )}
        </RowActions>
      ),
    },
    {
      id: 'name',
      title: displayMode === 'table' ? 'Материал' : 'Наименование по проекту',
      value: ({ entry }) => entry.projectMaterialName,
      width: 330,
      render: ({ entry, line, isDeletedProjectMaterial }) => (
        <>
          <div className="grid gap-2">
            {line ? (
              <button
                className="cursor-pointer text-left leading-6 text-slate-700 underline-offset-4 transition-colors hover:text-blue-700 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                type="button"
                title="Открыть материал в разделе «Общие данные»"
                onClick={() => onOpenOverviewLine(line)}
              >
                {entry.projectMaterialName}
              </button>
            ) : (
              <span>{entry.projectMaterialName}</span>
            )}
            {isDeletedProjectMaterial ? <DeletedProjectMaterialBadge /> : null}
          </div>
        </>
      ),
    },
    {
      id: 'unit',
      title: 'Единица измерения',
      value: ({ entry }) => entry.projectUnit,
      width: 120,
      centered: true,
    },
    {
      id: 'quantity',
      title: 'Заявлено',
      value: ({ entry }) => entry.quantity,
      numeric: true,
      centered: true,
    },
    {
      id: 'received',
      title: 'Получено',
      value: ({ received }) => received,
      numeric: true,
      centered: true,
    },
    {
      id: 'remaining',
      title: 'Осталось получить',
      value: ({ remaining }) => remaining,
      numeric: true,
      centered: true,
    },
    {
      id: 'projectQuantity',
      title: 'По проекту',
      value: ({ referenceQuantity }) => referenceQuantity?.projectQuantity,
      numeric: true,
      centered: true,
      render: ({ referenceQuantity }) => (
        <RequestProjectQuantity
          current={referenceQuantity}
          kind="projectQuantity"
        />
      ),
    },
    {
      id: 'cipherQuantity',
      title: 'По шифру',
      value: ({ referenceQuantity }) => referenceQuantity?.cipherQuantity,
      numeric: true,
      centered: true,
      render: ({ referenceQuantity }) => (
        <RequestProjectQuantity
          current={referenceQuantity}
          kind="cipherQuantity"
        />
      ),
    },
    {
      id: 'altQuantity',
      title: 'Количество в альтернативной единице',
      value: ({ entry }) => entry.altQuantity,
      numeric: true,
      centered: true,
      render: ({ entry }) => <>{formatOptionalQuantity(entry.altQuantity)}</>,
    },
    {
      id: 'altUnit',
      title: 'Альтернативная единица измерения',
      value: ({ entry }) => entry.altUnit,
      centered: true,
      render: ({ entry }) => <>{entry.altUnit || '-'}</>,
    },
    {
      id: 'balance',
      title: 'Ещё не заявлено по шифру',
      value: ({ summary }) => Math.max(0, summary?.requestBalance ?? 0),
      numeric: true,
      centered: true,
      render: ({ entry, line, isDeletedProjectMaterial, summary }) => (
        <>
          {formatQuantity(Math.max(0, summary?.requestBalance ?? 0))}{' '}
          {line?.unit ?? entry.projectUnit}
          {!isDeletedProjectMaterial ? (
            <RequestExcessWarning
              quantity={Math.max(0, -(summary?.requestBalance ?? 0))}
              unit={line?.unit ?? entry.projectUnit}
            />
          ) : null}
        </>
      ),
    },
    {
      id: 'note',
      title: 'Нормативный документ / примечание',
      value: ({ entry, line }) => entry.note || line?.normativeDocument || '',
      width: 300,
      render: ({ entry, line }) => (
        <>
          <div className="grid gap-2">
            <span>{entry.note || line?.normativeDocument || '-'}</span>
            {cancelledRequestQuantity(entry) > 0 && (
              <p className="text-xs text-amber-800">
                Отменено по ИЗМ / переносу:{' '}
                {formatQuantity(cancelledRequestQuantity(entry))}{' '}
                {entry.projectUnit} · Действует:{' '}
                {formatQuantity(effectiveRequestQuantity(entry))}
              </p>
            )}
            {entry.sourceCipher && entry.sourceQuantity ? (
              <TransferBadge
                sourceCipher={entry.sourceCipher}
                sourceQuantity={entry.sourceQuantity}
                unit={entry.projectUnit}
              />
            ) : null}
          </div>
        </>
      ),
    },
  ]
  if (displayMode === 'table')
    return (
      <OperationsGrid
        id="requests-flat"
        fillHeight
        label="Заявки"
        rows={flatRows}
        rowId={({ entry }) => entry.id}
        columns={columns}
        pagination
      />
    )
  if (entries.length === 0) {
    return null
  }

  return (
    <div
      ref={pagination.containerRef}
      className="grid scroll-mt-[32rem] md:scroll-mt-48 xl:scroll-mt-32 gap-3 bg-stone-50/50 p-4"
    >
      {filteredGroupMeta.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Заявки по такому запросу не найдены.
        </div>
      ) : null}

      {pagination.items.map(({ group, materialType: requestMaterialType }) => {
        const isExpanded = expandedGroups[group.number] ?? false
        const requestById = new Map(
          group.entries.map((entry) => [entry.id, entry]),
        )
        const linkedReceipts = isExpanded
          ? receipts.filter((receipt) => requestById.has(receipt.requestId))
          : []
        const deliveries = groupReceiptDeliveries(linkedReceipts)
        const lineIds = Array.from(
          new Set(group.entries.map((entry) => entry.projectLineId)),
        )
        const exceededCount = lineIds.filter(
          (lineId) =>
            lineById.has(lineId) &&
            (summaryByLine.get(lineId)?.requestBalance ?? 0) < 0,
        ).length
        const receiptProgress = group.entries.map((entry) => ({
          entry,
          ...requestReceiptProgress(
            effectiveRequestQuantity(entry),
            netReceived.get(entry.id) ?? 0,
          ),
        }))
        const completedPositions = receiptProgress.filter(
          (item) => item.complete,
        ).length
        const isFullyReceived =
          group.entries.length > 0 &&
          completedPositions === group.entries.length
        const requestedTotals = formatUnitTotals(
          group.entries.map((entry) => ({
            quantity: entry.quantity,
            unit: entry.projectUnit,
          })),
        )
        const remainingTotals = formatUnitTotals(
          receiptProgress.map(({ entry, remaining }) => ({
            quantity: remaining,
            unit: entry.projectUnit,
          })),
        )

        return (
          <div
            key={group.number}
            id={operationAnchorId('requests', group.number)}
            className={`overflow-hidden rounded-lg border shadow-sm transition-colors ${
              isFullyReceived
                ? 'border-slate-200 bg-white'
                : isExpanded
                  ? 'border-blue-200 bg-white shadow-blue-100/60'
                  : 'border-slate-200 bg-white'
            } ${
              isExpanded
                ? isFullyReceived
                  ? 'ring-1 ring-emerald-200'
                  : 'ring-1 ring-blue-100'
                : ''
            }`}
          >
            <div
              className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5 2xl:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.65fr)_auto] ${
                isFullyReceived
                  ? 'bg-emerald-50/45'
                  : isExpanded
                    ? 'bg-blue-50/25'
                    : ''
              }`}
            >
              <button
                className="col-span-2 flex min-w-0 items-center gap-3 rounded-md text-left outline-none transition-colors hover:text-blue-900 focus-visible:ring-2 focus-visible:ring-stone-300 2xl:col-span-1"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  setExpandedGroups((current) => ({
                    ...current,
                    [group.number]: !isExpanded,
                  }))
                }
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border shadow-sm transition-colors ${
                    isExpanded
                      ? 'border-blue-100 bg-blue-50 text-blue-500 shadow-blue-100/50'
                      : 'border-stone-200 bg-stone-50 text-stone-500 shadow-stone-200/50'
                  }`}
                >
                  <ChevronDown
                    className={`transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    size={17}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium leading-5 text-stone-950">
                    {group.number}
                  </span>
                  <span className="mt-1 block text-[13px] leading-5 text-stone-500">
                    {formatDate(group.date)} ·{' '}
                    {group.requester || 'без заявителя'}
                    {isFullyReceived ? (
                      <span className="font-medium text-emerald-700">
                        {' · '}Получена полностью
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>

              <span className="request-group-metrics">
                <RequestGroupMetric
                  label="Шифр"
                  value={group.cipher}
                  title={group.cipher}
                  wrap
                />
                <RequestGroupMetric
                  label="Тип"
                  value={compactRequestMaterialType(requestMaterialType)}
                  title={requestMaterialType}
                />
                <RequestGroupMetric
                  label="Получено"
                  value={`${completedPositions} из ${group.entries.length}`}
                  title={`Получено позиций: ${completedPositions} из ${group.entries.length}`}
                  wrap
                />
                <RequestGroupMetric
                  label="Заявлено"
                  value={requestedTotals}
                  wrap
                />
                <RequestGroupMetric
                  label="Осталось"
                  value={remainingTotals}
                  title={`Осталось получить: ${remainingTotals}`}
                  wrap
                />
                <RequestGroupMetric
                  label="Прим."
                  value={group.entries[0]?.requestNote || '—'}
                  title={`Примечание: ${group.entries[0]?.requestNote || '—'}`}
                />
              </span>

              <div className="flex flex-col items-center justify-center gap-1.5">
                {!isFullyReceived && (
                  <RowActionButton
                    iconOnly
                    aria-label="Оформить получение"
                    title="Оформить получение"
                    onClick={() => onReceiveRequest(group)}
                  >
                    <PackageCheck size={14} aria-hidden="true" />
                  </RowActionButton>
                )}
                <RequestPrintButton
                  entryId={group.entries[0]!.id}
                  number={group.number}
                  prepare={prepareRequestPrint}
                  iconOnly
                  className={rowActionStyle({ iconOnly: true })}
                />
                <RowActionButton
                  iconOnly
                  aria-label="Редактировать"
                  title="Редактировать заявку"
                  onClick={() => onEditRequest(group)}
                >
                  <Pencil size={15} />
                </RowActionButton>
              </div>
            </div>

            {exceededCount > 0 ? (
              <p
                role="status"
                className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
              >
                Позиций с превышением проекта: {exceededCount}. Проверьте
                количество в заявках.
              </p>
            ) : null}

            {isExpanded ? (
              <div className="border-t border-blue-100 bg-blue-50/20">
                <div
                  data-workspace-scroll={`request:${group.number}`}
                  className="overflow-x-auto"
                >
                  <OperationsGrid
                    id={`request:${group.number}`}
                    pageScroll
                    indicators={{
                      values: ({ entry }) =>
                        indicatorIndex.byRequest.get(entry.id),
                      unit: ({ entry }) => entry.projectUnit,
                      existing: {
                        received: 'received',
                        remaining: 'remaining',
                      },
                    }}
                    label={`Заявка ${group.number}`}
                    rows={[
                      ...receiptProgress.map(
                        ({ entry, received, remaining }) => {
                          const line = lineById.get(entry.projectLineId)
                          const isDeletedProjectMaterial = !line
                          const summary = summaryByLine.get(entry.projectLineId)
                          const referenceQuantity =
                            referenceQuantityByLineId.get(entry.projectLineId)
                          return {
                            group,
                            entry,
                            line,
                            isDeletedProjectMaterial,
                            summary,
                            referenceQuantity,
                            received,
                            remaining,
                          }
                        },
                      ),
                    ]}
                    rowId={({ entry }) => entry.id}
                    columns={columns.filter(
                      (column) =>
                        ![
                          'document',
                          'date',
                          'cipher',
                          'requester',
                          'requestNote',
                        ].includes(column.id),
                    )}
                    isDeleted={({ isDeletedProjectMaterial }) =>
                      isDeletedProjectMaterial
                    }
                  />
                </div>
                <details className="group border-t border-slate-200 bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-500 [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      size={16}
                      className="shrink-0 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                    Связанные поступления
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-normal tabular-nums text-slate-500">
                      {deliveries.length}
                    </span>
                  </summary>
                  <div className="grid gap-2 px-4 pb-4">
                    {linkedReceipts.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Поступлений пока нет.
                      </p>
                    ) : (
                      deliveries.map((delivery) => (
                        <ReceiptDeliveryCard
                          indicatorIndex={indicatorIndex}
                          key={delivery.key}
                          delivery={delivery}
                          requestNumber={group.number}
                          workflow={workflow}
                          onEdit={() => onEditDelivery(delivery)}
                        />
                      ))
                    )}
                  </div>
                </details>
              </div>
            ) : null}
          </div>
        )
      })}
      {pagination.total > 0 && (
        <OperationPagination pagination={pagination} label="Заявки" />
      )}
    </div>
  )
}

function ReceiptDeliveryCard({
  indicatorIndex,
  delivery,
  requestNumber,
  workflow,
  onEdit,
}: {
  indicatorIndex: OperationIndicatorIndex
  delivery: ReceiptDelivery<MaterialReceiptEntry>
  requestNumber: string
  workflow?: QualityWorkflow
  onEdit: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const documents = documentsForReceipt(delivery.entries[0]!, workflow)
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3">
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 text-left"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          <span className="grid min-w-0 gap-1 text-sm">
            <span className="flex flex-wrap gap-x-4 gap-y-1 font-medium text-slate-800">
              {documents.length
                ? documents.map((document) => (
                    <span key={document.id} className="min-w-0 break-words">
                      {receiptDocumentLabel(document)}
                    </span>
                  ))
                : 'Документы не указаны'}
            </span>
            <span className="text-slate-500">
              Получение {formatDate(delivery.date)} · Позиций:{' '}
              {delivery.entries.length} ·{' '}
              {formatUnitTotals(
                delivery.entries.map((entry) => ({
                  quantity: entry.quantity,
                  unit: entry.projectUnit,
                })),
              )}
            </span>
          </span>
        </button>
        <HoverTooltip text="Редактировать реквизиты поставки">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 justify-self-end"
            aria-label="Редактировать реквизиты поставки"
            onClick={onEdit}
          >
            <Pencil size={16} />
          </Button>
        </HoverTooltip>
      </div>
      {expanded ? (
        <div className="border-t border-slate-200">
          <OperationsGrid
            id={`request-delivery:${requestNumber}:${delivery.key}`}
            pageScroll
            indicators={{
              values: (entry) => indicatorIndex.byReceipt.get(entry.id),
              unit: (entry) => entry.projectUnit,
              existing: { received: 'quantity' },
            }}
            label={`Материалы поставки от ${formatDate(delivery.date)}`}
            rows={delivery.entries}
            rowId={(entry) => entry.id}
            columns={[
              {
                id: 'material',
                title: 'Материал',
                width: 500,
                value: (entry) => entry.actualName,
              },
              {
                id: 'quantity',
                title: 'Получено',
                width: 150,
                numeric: true,
                centered: true,
                value: (entry) => entry.quantity,
              },
              {
                id: 'unit',
                title: 'Единица измерения',
                width: 140,
                centered: true,
                value: (entry) => entry.projectUnit,
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  )
}

function RequestProjectQuantity({
  current,
  kind,
}: {
  current?: RequestProjectQuantities
  kind: 'projectQuantity' | 'cipherQuantity'
}) {
  return (
    <span>
      {current ? `${formatQuantity(current[kind])} ${current.unit}` : '—'}
    </span>
  )
}

function RequestExcessWarning({
  quantity,
  unit,
}: {
  quantity: number
  unit: string
}) {
  if (quantity <= 0) return null
  return (
    <p
      role="status"
      className="mt-2 text-xs font-medium leading-5 text-amber-800"
    >
      Заявлено сверх проекта: {formatQuantity(quantity)} {unit}. С учётом всех
      заявок по шифру.
    </p>
  )
}

function RequestGroupMetric({
  label,
  value,
  title,
  wrap = false,
  onClick,
}: {
  label: string
  value: string
  title?: string
  wrap?: boolean
  onClick?: () => void
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label}: ${value}`}
        title={title}
        className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm shadow-slate-200/40 transition-colors hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <span className="block truncate text-[10px] font-medium uppercase leading-4 tracking-wide text-slate-400">
          {label}
        </span>
        <span className="mt-0.5 block text-sm leading-5 text-slate-900">
          {value}
        </span>
      </button>
    )
  }
  return (
    <HoverTooltip
      text={title}
      className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-200/40"
    >
      <span
        className={`block text-[10px] font-medium uppercase leading-4 tracking-wide text-slate-400 ${wrap ? 'whitespace-normal' : 'truncate'}`}
      >
        {label}
      </span>
      <span
        className={`mt-0.5 block text-sm leading-5 text-slate-900 ${wrap ? 'whitespace-normal break-words' : 'truncate'}`}
      >
        {value}
      </span>
    </HoverTooltip>
  )
}

function RequestSidebarMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <span className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2 shadow-sm shadow-blue-100/40">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-blue-400">
        {label}
      </span>
      <span className="mt-1 block text-base font-normal tabular-nums text-slate-900">
        {value}
      </span>
    </span>
  )
}

function TransferBadge({
  sourceCipher,
  sourceQuantity,
  unit,
}: {
  sourceCipher: string
  sourceQuantity: number
  unit: string
}) {
  return (
    <span className="inline-flex w-fit items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
      {formatQuantity(sourceQuantity)} {unit} взяты из шифра {sourceCipher}
    </span>
  )
}

function ReceiptsTable({
  onCreateInspection,
  indicatorIndex,
  listView,
  priority,
  workflow,
  focusEntryId,
  lineById,
  receiptGroupMeta,
  requests,
  entries,
  remainingByRequest,
  search,
  onEditReceipt,
  onDeleteReceipt,
  onOpenOverviewLine,
}: {
  onCreateInspection: (entry: MaterialReceiptEntry) => void
  indicatorIndex: OperationIndicatorIndex
  listView: OperationListView
  priority: ReceiptPriority
  workflow?: QualityWorkflow
  entries: Array<MaterialReceiptEntry>
  focusEntryId?: string
  lineById: Map<string, SubobjectMaterialMetric>
  receiptGroupMeta: Array<ReceiptGroupMeta>
  requests: Array<MaterialRequestEntry>
  remainingByRequest: ReadonlyMap<string, number>
  search: string
  onEditReceipt: (group: ReceiptDocumentGroup) => void
  onDeleteReceipt: (group: ReceiptDocumentGroup) => void
  onOpenOverviewLine: (line: SubobjectMaterialMetric) => void
}) {
  const { mode: displayMode } = useOperationDisplay()
  const [expandedGroups, setExpandedGroups] = useWorkspaceViewState<
    Record<string, boolean>
  >('receipts.expanded', {}, isViewExpanded)
  const [references, setReferences] = useState<{
    groupKey: string
    kind: 'receipts' | 'documents' | 'returns'
  } | null>(null)
  const [selectedReceiptId, setSelectedReceiptId] = useState<string>()
  const returnedByReceipt = useMemo(
    () => customerReturnTotals(workflow),
    [workflow],
  )
  const remainingByMaterial = useMemo(() => {
    const totals = new Map<string, number>()
    for (const request of requests) {
      const key = getReceiptRequestMaterialKey(
        request,
        lineById.get(request.projectLineId),
      )
      totals.set(
        key,
        (totals.get(key) ?? 0) + (remainingByRequest.get(request.id) ?? 0),
      )
    }
    return totals
  }, [requests, remainingByRequest, lineById])
  const documentById = useMemo(
    () => indexReceiptDocuments(workflow),
    [workflow],
  )
  const referenceGroup = references
    ? receiptGroupMeta.find(({ group }) => group.key === references.groupKey)
        ?.group
    : undefined
  const focusedGroup = useMemo(() => {
    if (!focusEntryId) {
      return null
    }

    return (
      receiptGroupMeta.find(({ group }) =>
        group.entries.some(
          (entry) =>
            entry.id === focusEntryId ||
            getReceiptGroupKey(entry, lineById.get(entry.projectLineId)) ===
              focusEntryId,
        ),
      )?.group ?? null
    )
  }, [focusEntryId, receiptGroupMeta, lineById])
  const focusedGroupKey = focusedGroup?.key
  const focusedReceiptId =
    focusedGroup?.entries.find(
      (entry) =>
        entry.id === focusEntryId ||
        getReceiptGroupKey(entry, lineById.get(entry.projectLineId)) ===
          focusEntryId,
    )?.id ?? focusEntryId

  useEffect(() => {
    if (!focusEntryId || !focusedGroupKey || !focusedReceiptId) {
      return
    }

    // Reveal the navigation target once; subsequent toggles belong to the user.
    setExpandedGroups((current) =>
      current[focusedGroupKey]
        ? current
        : { ...current, [focusedGroupKey]: true },
    )

    const frame = window.requestAnimationFrame(() => {
      const target =
        document.getElementById(
          operationAnchorId('receipts', focusedReceiptId),
        ) ??
        document.getElementById(operationAnchorId('receipts', focusedGroupKey))

      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusEntryId, focusedGroupKey, focusedReceiptId, setExpandedGroups])

  const requestById = useMemo(
    () => new Map(requests.map((request) => [request.id, request])),
    [requests],
  )
  const referenceReturns = useMemo(() => {
    if (references?.kind !== 'returns' || !referenceGroup) return []
    const returnAllocations = workflow
      ? rejectedReturnAllocations(workflow)
      : new Map()
    const receiptById = new Map(
      referenceGroup.entries.map((entry) => [entry.id, entry]),
    )
    const caseById = new Map(workflow?.cases.map((entry) => [entry.id, entry]))
    return [...(workflow?.customerReturns ?? [])]
      .reverse()
      .filter((item) => receiptById.has(item.receiptId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((item) => {
        const receipt = receiptById.get(item.receiptId)!
        return {
          id: item.id,
          receiptId: item.receiptId,
          date: formatDate(item.date),
          quantity: `${formatQuantity(item.quantity)} ${receipt.projectUnit}`,
          reason: customerReturnReason(
            item,
            item.caseId ? caseById.get(item.caseId) : undefined,
            returnAllocations.get(item.id),
          ),
          request:
            requestById.get(receipt.requestId)?.number ?? 'Заявка удалена',
          receiptDate: formatDate(receipt.date),
          zni: item.caseId
            ? caseById
                .get(item.caseId)
                ?.revisions.find(
                  (revision) => revision.revision === item.revision,
                )?.zni.number
            : undefined,
          documentNumber: item.documentNumber,
          note: item.note,
        }
      })
  }, [referenceGroup, references?.kind, requestById, workflow])
  const normalizedSearch = normalizeSearchValue(search)
  const visibleGroups = prioritizeReceiptRows(
    receiptGroupMeta.filter((item) =>
      operationMetaMatches(item, search, listView),
    ),
    priority,
    (item) => item.group.entries.map((entry) => entry.id),
  )

  const pagination = useOperationPagination(
    'receipts',
    visibleGroups,
    JSON.stringify([normalizedSearch, listView]),
    {
      key: focusEntryId,
      index: visibleGroups.findIndex(
        ({ group }) => group.key === focusedGroup?.key,
      ),
    },
  )
  const visibleReceiptIds = new Set(
    visibleGroups.flatMap(({ group }) =>
      group.entries.map((entry) => entry.id),
    ),
  )
  // New receipts are prepended to entries. Keep that order for same-day
  // receipts instead of interleaving older entries from material groups.
  const flatRows = prioritizeReceiptRows(
    sortOperationsNewestFirst(
      entries.filter((entry) => visibleReceiptIds.has(entry.id)),
      (entry) => entry.date,
    ),
    priority,
    (entry) => [entry.id],
  ).map((entry) => ({
    entry,
    request: requestById.get(entry.requestId),
    line: lineById.get(entry.projectLineId),
    entryIsReplacement: isReceiptReplacement(
      entry,
      requestById.get(entry.requestId),
    ),
    entryIsDeletedProjectMaterial: !lineById.has(entry.projectLineId),
  }))
  const columns: Array<DataColumn<(typeof flatRows)[number]>> = [
    {
      id: 'date',
      date: true,
      title: 'Дата получения',
      value: ({ entry }) => entry.date,
      render: ({ entry }) => <>{formatDate(entry.date)}</>,
    },

    {
      id: 'actions',
      title: 'Действия',
      value: () => null,
      width: 176,
      actions: true,
      render: ({ entry, request, line }) => (
        <>
          <RowActions>
            {line && (
              <RowActionButton
                iconOnly
                aria-label="Открыть материал"
                title="Открыть материал"
                onClick={() => onOpenOverviewLine(line)}
              >
                <Boxes size={14} aria-hidden="true" />
              </RowActionButton>
            )}
            <RowActionButton
              iconOnly
              aria-label="Редактировать получение"
              title={
                request ? 'Редактировать получение' : 'Исходная заявка удалена'
              }
              disabled={!request}
              onClick={() => onEditReceipt(receiptEditGroup(entry, request))}
            >
              <Pencil size={16} />
            </RowActionButton>
            <DeleteOperationButton
              label="Удалить получение"
              onClick={() => onDeleteReceipt(receiptEditGroup(entry, request))}
            />
            {(indicatorIndex.byReceipt.get(entry.id)?.awaitingInspection ?? 0) >
              0 && (
              <DocumentActionButton
                kind="ЗНИ"
                onClick={() => onCreateInspection(entry)}
              />
            )}
          </RowActions>
        </>
      ),
    },
    {
      id: 'request',
      title: 'Заявка',
      value: ({ request }) => request?.number ?? 'Заявка удалена',
      width: 280,
    },
    {
      id: 'name',
      title: 'По заявке',
      value: ({ request, line }) =>
        request?.projectMaterialName ?? line?.projectMaterialName ?? '',
      width: 310,
      render: ({ request, line, entryIsDeletedProjectMaterial }) => (
        <>
          <div className="grid gap-1">
            {line ? (
              <button
                className="cursor-pointer text-left leading-6 text-slate-700 underline-offset-4 transition-colors hover:text-blue-700 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                type="button"
                title="Открыть материал в разделе «Общие данные»"
                onClick={() => onOpenOverviewLine(line)}
              >
                {request?.projectMaterialName ??
                  line.projectMaterialName ??
                  '-'}
              </button>
            ) : (
              <span>{request?.projectMaterialName ?? '-'}</span>
            )}
            {entryIsDeletedProjectMaterial ? (
              <DeletedProjectMaterialBadge />
            ) : null}
          </div>
        </>
      ),
    },
    {
      id: 'requested',
      title: 'Заявлено',
      value: ({ request }) => request?.quantity,
      numeric: true,
      render: ({ request }) =>
        request
          ? `${formatQuantity(request.quantity)} ${request.projectUnit}`
          : '—',
    },
    {
      id: 'cipher',
      title: 'Шифр',
      value: ({ request, line }) => request?.cipher ?? line?.cipher,
    },
    {
      id: 'actualName',
      title: 'Материал',
      value: ({ entry }) => entry.actualName,
      width: 300,
      renderInTable: true,
      render: ({ entry, entryIsReplacement }) => (
        <>
          <div className="grid gap-1">
            <span>{entry.actualName}</span>
            {entryIsReplacement ? <ReplacementBadge /> : null}
          </div>
        </>
      ),
    },
    {
      id: 'quantity',
      title: 'Поступило',
      value: ({ entry }) => entry.quantity,
      numeric: true,
      render: ({ entry }) => <>{formatQuantity(entry.quantity)}</>,
    },
    {
      id: 'unit',
      title: 'Единица измерения проекта',
      value: ({ entry }) => entry.projectUnit,
      render: ({ entry }) => <>{entry.projectUnit}</>,
    },
    {
      id: 'altQuantity',
      title: 'Поступило в альтернативной единице',
      value: ({ entry }) => entry.altQuantity,
      numeric: true,
      render: ({ entry }) => <>{formatOptionalQuantity(entry.altQuantity)}</>,
    },
    {
      id: 'altUnit',
      title: 'Альтернативная единица измерения',
      value: ({ entry }) => entry.altUnit,
      render: ({ entry }) => <>{entry.altUnit || '-'}</>,
    },
    {
      id: 'app',
      title: 'АПП',
      value: ({ entry }) =>
        documentsForReceipt(entry, workflow, documentById)
          .filter((doc) => doc.kind === 'app')
          .map(receiptDocumentLabel)
          .join('; '),
    },
    {
      id: 'returned',
      title: 'Возвращено заказчику',
      value: ({ entry }) => returnedByReceipt.get(entry.id) ?? 0,
    },
    {
      id: 'factoryNumber',
      title: 'Заводской номер',
      value: ({ entry }) => entry.factoryNumber,
      render: ({ entry }) => <>{entry.factoryNumber || '-'}</>,
    },
    {
      id: 'manufacturer',
      title: 'Завод-изготовитель',
      value: ({ entry }) => entry.manufacturer,
      render: ({ entry }) => <>{entry.manufacturer || '-'}</>,
    },
    {
      id: 'heatBatch',
      title: 'Партия плавки',
      value: ({ entry }) => entry.heatBatch,
      render: ({ entry }) => <>{entry.heatBatch || '-'}</>,
    },
    {
      id: 'customerArvk',
      title: 'АРВК заказчика',
      value: ({ entry }) => entry.customerArvk,
      render: ({ entry }) => <>{entry.customerArvk || '-'}</>,
    },
    {
      id: 'qualityDocument',
      title: 'Документ качества',
      value: ({ entry }) => entry.qualityDocument,
      render: ({ entry }) => <>{entry.qualityDocument || '-'}</>,
    },
    {
      id: 'certificate',
      title: 'Паспорт / сертификат',
      value: ({ entry }) => entry.certificate,
      render: ({ entry }) => <>{entry.certificate || '-'}</>,
    },
    {
      id: 'technicalDecision',
      title: 'Техническое решение',
      value: ({ entry }) => entry.technicalDecision,
      render: ({ entry }) => <>{entry.technicalDecision || '-'}</>,
    },
    {
      id: 'note',
      title: 'Примечание',
      value: ({ entry }) => entry.note,
      render: ({ entry }) => <>{entry.note || '-'}</>,
    },
  ]
  if (displayMode === 'table')
    return (
      <OperationsGrid
        id="receipts-flat"
        fillHeight
        label="Получения"
        rows={flatRows}
        rowId={({ entry }) => entry.id}
        columns={columns}
        pagination
      />
    )
  if (receiptGroupMeta.length === 0) return null

  return (
    <div
      ref={pagination.containerRef}
      className="grid scroll-mt-[32rem] md:scroll-mt-48 xl:scroll-mt-32 gap-3 bg-stone-50/60 p-4"
    >
      {visibleGroups.length === 0 ? (
        <OperationFormEmpty text="Получения по такому запросу не найдены." />
      ) : null}
      {pagination.items.map(({ group }) => {
        const isExpanded = expandedGroups[group.key] ?? false
        const firstEntry = group.entries[0]!
        const remaining = remainingByMaterial.get(
          getReceiptRequestMaterialKey(
            firstEntry,
            lineById.get(firstEntry.projectLineId),
          ),
        )
        const isDeletedProjectMaterial = group.entries.some(
          (entry) => !lineById.has(entry.projectLineId),
        )
        return (
          <div
            key={group.key}
            id={operationAnchorId('receipts', group.key)}
            className={`min-w-0 overflow-hidden rounded-lg border shadow-sm ${
              isExpanded
                ? 'border-blue-200 bg-white ring-1 ring-blue-100'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="grid gap-4 px-4 py-3.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)] xl:items-start">
              <button
                className="flex min-w-0 items-start gap-3 text-left"
                type="button"
                aria-expanded={isExpanded}
                onClick={() =>
                  setExpandedGroups((current) => ({
                    ...current,
                    [group.key]: !isExpanded,
                  }))
                }
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${isExpanded ? 'border-blue-100 bg-blue-50 text-blue-500' : 'border-slate-200 bg-white text-slate-400'}`}
                >
                  <ChevronDown
                    className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    size={17}
                  />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-[15px] font-medium leading-6 text-slate-900">
                      {group.actualName || 'ТМЦ без наименования'}
                    </span>
                    {group.replacement ? <ReplacementBadge /> : null}
                    {isDeletedProjectMaterial ? (
                      <DeletedProjectMaterialBadge />
                    ) : null}
                  </span>
                  <span className="mt-1 block text-[13px] text-slate-500">
                    {formatDate(group.firstDate)}
                    {group.firstDate !== group.date
                      ? ` — ${formatDate(group.date)}`
                      : ''}{' '}
                    ·{' '}
                    {group.requestNumbers.length
                      ? `Заявки: ${group.requestNumbers.join(', ')}`
                      : 'Исходная заявка удалена'}
                  </span>
                </span>
              </button>
              <div className="grid min-w-0 gap-2 sm:grid-cols-4">
                <RequestGroupMetric
                  label="Получено"
                  value={formatUnitTotals(
                    group.entries.map((entry) => ({
                      quantity: entry.quantity,
                      unit: entry.projectUnit,
                    })),
                  )}
                  title="Показать получения материала"
                  onClick={() => {
                    setSelectedReceiptId(undefined)
                    setReferences({ groupKey: group.key, kind: 'receipts' })
                  }}
                />
                <RequestGroupMetric
                  label="Осталось получить"
                  wrap
                  value={
                    remaining === undefined
                      ? '—'
                      : formatUnitTotals([
                          { quantity: remaining, unit: firstEntry.projectUnit },
                        ])
                  }
                  title="По существующим заявкам на материал"
                />
                <RequestGroupMetric
                  label="Возвращено"
                  value={formatUnitTotals(
                    group.entries.map((entry) => ({
                      quantity: returnedByReceipt.get(entry.id) ?? 0,
                      unit: entry.projectUnit,
                    })),
                  )}
                  title="Показать возвраты материала"
                  onClick={() => {
                    setSelectedReceiptId(undefined)
                    setReferences({ groupKey: group.key, kind: 'returns' })
                  }}
                />
                <RequestGroupMetric
                  label="Документы"
                  value={String(
                    new Set(
                      group.entries.flatMap((entry) => [
                        ...documentsForReceipt(
                          entry,
                          workflow,
                          documentById,
                        ).map((doc) => doc.id),
                      ]),
                    ).size,
                  )}
                  title="Показать АПП и М-15"
                  onClick={() => {
                    setSelectedReceiptId(undefined)
                    setReferences({ groupKey: group.key, kind: 'documents' })
                  }}
                />
              </div>
            </div>
            {isExpanded ? (
              <div className="border-t border-blue-100 bg-blue-50/20 p-3">
                <div
                  data-workspace-scroll={`receipt:${group.key}`}
                  className="overflow-x-auto rounded-lg border border-blue-100 bg-white"
                >
                  <OperationsGrid
                    id={`receipt:${group.key}`}
                    pageScroll
                    indicators={{
                      values: ({ entry }) =>
                        indicatorIndex.byReceipt.get(entry.id),
                      unit: ({ entry }) => entry.projectUnit,
                      existing: { received: 'quantity', returned: 'returned' },
                    }}
                    label={`Получения материала ${group.actualName}`}
                    firstColumnId="date"
                    rows={[
                      ...group.entries.map((entry) => {
                        const request = requestById.get(entry.requestId)
                        const line = lineById.get(entry.projectLineId)
                        const entryIsReplacement = isReceiptReplacement(
                          entry,
                          request,
                        )
                        const entryIsDeletedProjectMaterial = !line
                        return {
                          entry,
                          request,
                          line,
                          entryIsReplacement,
                          entryIsDeletedProjectMaterial,
                        }
                      }),
                    ]}
                    rowId={({ entry }) => entry.id}
                    columns={columns}
                    isDeleted={({ entryIsDeletedProjectMaterial }) =>
                      entryIsDeletedProjectMaterial
                    }
                    focusRowId={
                      group.entries.some(
                        (entry) => entry.id === selectedReceiptId,
                      )
                        ? selectedReceiptId
                        : group.entries.find(
                            (entry) =>
                              entry.id === focusEntryId ||
                              getReceiptGroupKey(
                                entry,
                                lineById.get(entry.projectLineId),
                              ) === focusEntryId,
                          )?.id
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
      {pagination.total > 0 && (
        <OperationPagination pagination={pagination} label="Получение" />
      )}
      {references && referenceGroup && (
        <ReceiptReferencesDialog
          kind={references.kind}
          material={referenceGroup.actualName}
          returns={referenceReturns}
          receipts={referenceGroup.entries.map((entry) => ({
            id: entry.id,
            date: formatDate(entry.date),
            quantity: `${formatQuantity(entry.quantity)} ${entry.projectUnit}`,
            request:
              requestById.get(entry.requestId)?.number ?? 'Заявка удалена',
            documents: documentsForReceipt(entry, workflow, documentById),
          }))}
          onClose={() => setReferences(null)}
          onOpenReceipt={(id) => {
            setSelectedReceiptId(id)
            setExpandedGroups((current) => ({
              ...current,
              [referenceGroup.key]: true,
            }))
            setReferences(null)
            window.requestAnimationFrame(() =>
              document
                .getElementById(
                  operationAnchorId('receipts', referenceGroup.key),
                )
                ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
            )
          }}
        />
      )}
    </div>
  )
}

function ReplacementBadge() {
  return (
    <span className="inline-flex w-fit items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-normal text-amber-700">
      Замена
    </span>
  )
}

function IssuesTable({
  indicatorIndex,
  listView,
  priority,
  search,
  entries,
  focusEntryId,
  lineById,
  receipts,
  onDelete,
  onReturn,
  balances,
}: {
  indicatorIndex: OperationIndicatorIndex
  listView: OperationListView
  priority: ReceiptPriority
  search: string
  entries: Array<MaterialIssueEntry>
  focusEntryId?: string
  lineById: Map<string, SubobjectMaterialMetric>
  receipts: Array<MaterialReceiptEntry>
  onReturn: (entry: MaterialIssueEntry) => void
  balances: ReturnType<typeof receiptBalances>
  onDelete: (entry: MaterialIssueEntry) => void
}) {
  const { mode } = useOperationDisplay()
  const orderedEntries = useMemo(
    () => sortOperationsNewestFirst(entries, (entry) => entry.date),
    [entries],
  )
  useEffect(() => {
    if (!focusEntryId) {
      return
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById(operationAnchorId('issues', focusEntryId))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [focusEntryId])

  if (entries.length === 0 && mode === 'list') {
    return null
  }
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))

  return (
    <OperationsGrid
      id={'issues'}
      fillHeight={mode === 'table'}
      indicators={{
        values: ({ entry }) =>
          assignedOperationIndicators(
            indicatorIndex,
            entry.receiptId,
            entry.projectLineId,
          ),
        unit: ({ receipt }) => receipt?.projectUnit ?? '',
      }}
      pagination
      paginationFilterKey={JSON.stringify([search, listView])}
      priorityRow={
        priority.key
          ? ({ entry }) => priority.ids.has(entry.receiptId)
          : undefined
      }
      label={'Выдача'}
      rows={[
        ...orderedEntries.map((entry) => {
          const receipt = receiptById.get(entry.receiptId)
          const line = lineById.get(entry.projectLineId)
          const isDeletedProjectMaterial = !line
          return { entry, receipt, line, isDeletedProjectMaterial }
        }),
      ]}
      rowId={({ entry }) => entry.id}
      columns={[
        { id: 'cipher', title: 'Шифр', value: ({ line }) => line?.cipher },
        {
          id: 'document',
          title: 'Документ передачи',
          value: ({ entry }) => entry.document,
          render: ({ entry }) => <>{entry.document}</>,
        },
        {
          id: 'name',
          title: 'Материал',
          value: ({ receipt, line }) =>
            receipt?.actualName ?? line?.projectMaterialName ?? '',
          width: 320,
          render: ({ receipt, line, isDeletedProjectMaterial }) => (
            <>
              <div className="grid gap-2">
                <span>
                  {receipt?.actualName ?? line?.projectMaterialName ?? '-'}
                </span>
                {isDeletedProjectMaterial ? (
                  <DeletedProjectMaterialBadge />
                ) : null}
              </div>
            </>
          ),
        },
        {
          id: 'quantity',
          title: 'Выдано',
          value: ({ entry }) => entry.quantity,
          numeric: true,
          render: ({ entry }) => <>{formatQuantity(entry.quantity)}</>,
        },
        {
          id: 'siteReturned',
          title: 'Возвращено с площадки',
          value: ({ entry }) => siteReturned(entry),
          numeric: true,
        },
        {
          id: 'atSite',
          title: 'У площадки',
          value: ({ entry }) => netIssued(entry),
          numeric: true,
        },
        {
          id: 'control',
          title: 'Входной контроль',
          value: ({ entry }) =>
            entry.beforeInspection
              ? netIssued(entry) === 0
                ? 'Выдано до ВК · возвращено с площадки'
                : (balances.get(entry.receiptId)?.issuedBeforeInspection ?? 0) >
                    0
                  ? 'Выдано до ВК · контроль не закрыт по партии'
                  : 'Выдано до ВК · контроль закрыт'
              : 'По подписанному АВК',
          width: 240,
        },
        {
          id: 'reason',
          title: 'Причина выдачи до ВК',
          value: ({ entry }) => entry.beforeInspection?.reason ?? '',
        },
        {
          id: 'altQuantity',
          title: 'Выдано в альтернативной единице',
          value: ({ entry }) => entry.altQuantity,
          numeric: true,
          render: ({ entry }) => (
            <>{formatOptionalQuantity(entry.altQuantity)}</>
          ),
        },
        {
          id: 'unit',
          title: 'Единица измерения',
          value: ({ entry, receipt, line }) =>
            entry.projectUnit ?? receipt?.projectUnit ?? line?.unit,
        },
        {
          id: 'altUnit',
          title: 'А.ЕИ',
          value: ({ entry, receipt }) => entry.altUnit ?? receipt?.altUnit,
        },
        {
          id: 'date',
          date: true,
          title: 'Дата выдачи',
          value: ({ entry }) => entry.date,
          render: ({ entry }) => <>{formatDate(entry.date)}</>,
        },
        {
          id: 'receiver',
          title: 'Получатель',
          value: ({ entry }) => entry.receiver,
          render: ({ entry }) => <>{entry.receiver || '-'}</>,
        },
        {
          id: 'note',
          title: 'Примечание',
          value: ({ entry }) => entry.note,
          render: ({ entry }) => <>{entry.note || '-'}</>,
        },
        {
          id: 'actions',
          title: 'Действия',
          value: (_row) => null,
          width: 104,
          actions: true,
          render: ({ entry }) => (
            <RowActions>
              {netIssued(entry) > 0 && (
                <RowActionButton
                  iconOnly
                  title="Принять возврат с площадки"
                  aria-label="Принять возврат с площадки"
                  onClick={() => onReturn(entry)}
                >
                  <Undo2 size={16} />
                </RowActionButton>
              )}
              <DeleteOperationButton
                label="Удалить выдачу"
                onClick={() => onDelete(entry)}
              />
            </RowActions>
          ),
        },
      ]}
      isDeleted={({ isDeletedProjectMaterial }) => isDeletedProjectMaterial}
      focusRowId={focusEntryId}
    />
  )
}

function DeleteOperationButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <RowActionButton
      type="button"
      iconOnly
      danger
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Trash2 size={16} />
    </RowActionButton>
  )
}

function DeletedProjectMaterialBadge() {
  return (
    <span className="inline-flex w-fit items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-normal text-slate-600">
      Удален из проектной базы
    </span>
  )
}

const requestReviewColumnIds = [
  'material',
  'quantity',
  'unit',
  'composition',
  'normativeDocument',
  'note',
  'cipher',
  'materialType',
]

function RequestModal({
  availableCiphers,
  configuredUnits,
  editingRequest,
  existingRequests,
  lines,
  open,
  receipts,
  summaryByLine,
  onAdjustProjectQuantity,
  onClose,
  onDelete,
  onSubmit,
}: {
  availableCiphers: Array<string>
  configuredUnits: Array<string>
  editingRequest: RequestDocumentGroup | null
  existingRequests: Array<MaterialRequestEntry>
  lines: Array<SubobjectMaterialMetric>
  open: boolean
  receipts: Array<MaterialReceiptEntry>
  summaryByLine: Map<string, OperationLineSummary>
  onAdjustProjectQuantity: (lineId: string, quantity: number) => void
  onClose: () => void
  onDelete: (number: string) => void
  onSubmit: (entries: Array<MaterialRequestEntry>) => void
}) {
  const lineById = useMemo(
    () => new Map(lines.map((line) => [getProjectLineId(line), line])),
    [lines],
  )
  const referenceQuantityByLineId = useMemo(
    () => buildRequestReferenceQuantities(lines),
    [lines],
  )
  const receiptCount = useMemo(() => {
    const requestIds = new Set(editingRequest?.entries.map((entry) => entry.id))
    return receipts.filter((entry) => requestIds.has(entry.requestId)).length
  }, [editingRequest, receipts])
  const ciphers = useMemo(
    () =>
      unique([
        ...availableCiphers,
        ...(editingRequest?.entries.map((entry) => entry.cipher) ?? []),
      ]),
    [availableCiphers, editingRequest],
  )
  const suggestNumber = useDocumentNumber()
  const [step, setStep] = useState(0)
  const [number, setNumber] = useState('')
  const alternativeUnits = unique(configuredUnits.map((unit) => unit.trim()))
  const [date, setDate] = useState('')
  const [requester, setRequester] = useState('')
  const [cipher, setCipher] = useState('')
  const [materialTypes, setMaterialTypes] = useState<Array<string>>([])
  const materialType = materialTypes.join(', ')
  const numberMaterialType =
    materialTypes.length === 1 ? materialTypes[0]! : 'Материалы'
  const [requestNote, setRequestNote] = useState('')
  const [scopeError, setScopeError] = useState('')
  const [requestSearch, setRequestSearch] = useState('')
  const [requestSearchOpen, setRequestSearchOpen] = useState(false)
  const [reviewFilterModel, setReviewFilterModel] =
    useState<FilterModel | null>(null)
  const requestSearchId = useId()
  const requestSearchInputRef = useRef<HTMLInputElement>(null)
  const requestSearchButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open && step === 1 && requestSearchOpen) {
      requestSearchInputRef.current?.focus()
    }
  }, [open, step, requestSearchOpen])

  function closeRequestSearch() {
    setRequestSearchOpen(false)
    setRequestSearch('')
    requestSearchButtonRef.current?.focus()
  }
  const [requestListMode, setRequestListMode] = useState<
    'all' | 'filled' | 'request' | 'add'
  >('all')
  const [drafts, setDrafts] = useState<Record<string, RequestDraft>>({})
  const [requestImportOpen, setRequestImportOpen] = useState(false)
  const [requestImportDraft, setRequestImportDraft] =
    useState<MaterialRequestImportDraft | null>(null)
  const [overRequest, setOverRequest] = useState<OverRequestState | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [requestSaveError, setRequestSaveError] = useState('')
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const initializationKeyRef = useRef<string | null>(null)
  const initializationKey = editingRequest
    ? `edit:${editingRequest.number}`
    : 'create'
  const deletedRequestLines = useMemo(
    () =>
      buildDeletedRequestLines({
        editingRequest,
        fallbackMaterialType: materialType,
        lineById,
      }),
    [editingRequest, lineById, materialType],
  )
  const editingEntryByLineId = useMemo(
    () =>
      new Map(
        editingRequest?.entries.map((entry) => [entry.projectLineId, entry]) ??
          [],
      ),
    [editingRequest],
  )
  const requestSourceLines = useMemo(() => {
    const allowedCiphers = new Set(ciphers)
    return [
      ...lines
        .filter((line) => allowedCiphers.has(line.cipher))
        .map((line) => {
          const previous = editingEntryByLineId.get(getProjectLineId(line))
          return previous
            ? {
                ...line,
                materialType: previous.materialType || line.materialType,
                // Editing a note must not reinterpret saved quantities in a
                // different unit after a project catalogue change.
                unit: previous.projectUnit,
              }
            : line
        }),
      ...deletedRequestLines,
    ]
  }, [ciphers, deletedRequestLines, lines, editingEntryByLineId])

  const materialTypesForCipher = useMemo(
    () =>
      unique(
        requestSourceLines
          .filter((line) => !cipher || line.cipher === cipher)
          .map((line) => getRequestLineMaterialType(line)),
      ),
    [cipher, requestSourceLines],
  )
  const requestCandidateLines = useMemo(
    () =>
      requestSourceLines.filter(
        (line) =>
          (!cipher || line.cipher === cipher) &&
          (!materialType ||
            materialTypes.includes(getRequestLineMaterialType(line))),
      ),
    [cipher, materialType, requestSourceLines],
  )
  const requestScopeLines = useMemo(
    () =>
      requestCandidateLines.filter(
        (line) =>
          line.cipher === cipher &&
          materialTypes.includes(getRequestLineMaterialType(line)),
      ),
    [cipher, materialType, requestCandidateLines],
  )
  const filteredRequestLines = useMemo(() => {
    if (!cipher && !materialType && requestSearch.trim().length === 0) {
      return []
    }

    return requestCandidateLines
      .filter((line) => requestLineMatchesSearch(line, requestSearch))
      .sort((left, right) => {
        const leftBalance = getRequestAvailableBalance(
          left,
          getProjectLineId(left),
        )
        const rightBalance = getRequestAvailableBalance(
          right,
          getProjectLineId(right),
        )
        const leftHasBalance = leftBalance > 0
        const rightHasBalance = rightBalance > 0

        if (leftHasBalance !== rightHasBalance) {
          return leftHasBalance ? -1 : 1
        }

        if (rightBalance !== leftBalance) {
          return rightBalance - leftBalance
        }

        return (left.projectMaterialName ?? '').localeCompare(
          right.projectMaterialName ?? '',
          'ru',
        )
      })
  }, [
    cipher,
    editingEntryByLineId,
    lineById,
    materialType,
    requestCandidateLines,
    requestSearch,
    summaryByLine,
  ])
  const filteredFilledRowsCount = filteredRequestLines.filter(
    (line) =>
      parsePositiveNumber(drafts[getProjectLineId(line)]?.quantity ?? '') > 0,
  ).length
  const requestListModeLines = useMemo(() => {
    if (requestListMode === 'request') {
      // Keep a line visible while its quantity is cleared or retyped.
      return filteredRequestLines.filter((line) =>
        Object.hasOwn(drafts, getProjectLineId(line)),
      )
    }
    if (requestListMode === 'add') {
      return filteredRequestLines.filter(
        (line) => !editingEntryByLineId.has(getProjectLineId(line)),
      )
    }
    if (requestListMode !== 'filled') {
      return filteredRequestLines
    }

    return filteredRequestLines.filter(
      (line) =>
        parsePositiveNumber(drafts[getProjectLineId(line)]?.quantity ?? '') > 0,
    )
  }, [drafts, editingEntryByLineId, filteredRequestLines, requestListMode])
  const requestScopeSelected = Boolean(cipher && materialType)
  const hasRows = requestScopeLines.some(
    (line) =>
      parsePositiveNumber(drafts[getProjectLineId(line)]?.quantity ?? '') > 0,
  )
  const filledRowsCount = requestScopeLines.filter(
    (line) =>
      parsePositiveNumber(drafts[getProjectLineId(line)]?.quantity ?? '') > 0,
  ).length
  function getRequestConversion(line: SubobjectMaterialMetric) {
    const lineId = getProjectLineId(line)
    const entry = editingEntryByLineId.get(lineId)
    return getOperationConversion(
      lineById.get(lineId),
      entry?.projectUnit ?? line.unit,
      entry,
    )
  }

  function getRequestAlternative(
    line: SubobjectMaterialMetric,
    quantity = parseNullableNumber(
      drafts[getProjectLineId(line)]?.quantity ?? '',
    ),
  ) {
    return getOperationAlternative(
      quantity,
      getRequestConversion(line),
      editingEntryByLineId.get(getProjectLineId(line)),
    )
  }

  function getAlternativeUnit(line: SubobjectMaterialMetric) {
    return getRequestAlternative(line).altUnit
  }

  function getAlternativeQuantity(line: SubobjectMaterialMetric) {
    return getRequestAlternative(line).altQuantity
  }
  const hasInvalidConvertedQuantities = requestScopeLines.some(
    (line) =>
      parsePositiveNumber(drafts[getProjectLineId(line)]?.quantity ?? '') > 0 &&
      Boolean(getRequestAlternative(line).error),
  )

  const requestGridRows = useMemo<Array<RequestMaterialRow>>(
    () =>
      requestListModeLines.map((line) => {
        const id = getProjectLineId(line)
        const draft = drafts[id]
        const previous = editingEntryByLineId.get(id)
        const initial = previous?.projectQuantitiesAtCreation
        const current = referenceQuantityByLineId.get(id)
        const deleted = !lineById.has(id)
        const requestedQuantity = parsePositiveNumber(draft?.quantity ?? '')
        const available = getRequestAvailableBalance(line, id)
        const lineType = getRequestLineMaterialType(line)
        const inScope =
          line.cipher === cipher && materialTypes.includes(lineType)
        const alternative = getRequestAlternative(line)
        const conversion = getRequestConversion(line)
        const warnings: string[] = []
        if (!deleted && requestedQuantity > available)
          warnings.push(
            `Заявлено сверх проекта: ${formatQuantity(requestedQuantity - available)} ${line.unit}.`,
          )
        if (inScope && alternative.error) warnings.push(alternative.error)
        if (
          inScope &&
          alternative.altUnit &&
          !alternativeUnits.includes(alternative.altUnit)
        )
          warnings.push(`Единицы «${alternative.altUnit}» нет в настройках.`)
        if (
          inScope &&
          (conversion || alternative.altQuantity !== null) &&
          alternativeUnits.length === 0
        )
          warnings.push(
            'Добавьте единицы в настройках базы, в разделе «Единицы измерения».',
          )
        return {
          id,
          name: line.projectMaterialName || line.material || 'Материал',
          cipher: line.cipher,
          materialType: lineType,
          normativeDocument: line.normativeDocument || '',
          composition: line.material,
          unit: line.unit,
          quantity: draft?.quantity ?? '',
          note: draft?.note ?? '',
          projectQuantity: deleted ? null : (current?.projectQuantity ?? 0),
          cipherQuantity: deleted ? null : line.plannedQuantity,
          remainingQuantity: Math.max(0, available - requestedQuantity),
          inScope,
          deleted,
          alternativeQuantity: inScope ? alternative.altQuantity : null,
          alternativeUnit: inScope ? alternative.altUnit : '',
          conversionDetails: !inScope
            ? ''
            : conversion
              ? `1 ${previous?.projectUnit ?? line.unit} = ${formatAlternativeQuantity(conversion.factor)} ${alternative.altUnit}.`
              : alternative.altQuantity !== null
                ? 'Прежнее альтернативное количество сохранено. Для пересчёта задайте коэффициент в проектной базе.'
                : '',
          history: previous
            ? initial
              ? `При создании заявки: по проекту ${formatQuantity(initial.projectQuantity)} ${initial.unit}, по шифру ${formatQuantity(initial.cipherQuantity)} ${initial.unit}.`
              : 'Проектное количество при создании этой заявки не сохранялось.'
            : '',
          source:
            draft?.sourceCipher && draft.sourceQuantity
              ? `Из шифра ${draft.sourceCipher}: ${formatQuantity(draft.sourceQuantity)} ${line.unit}`
              : '',
          warnings,
        }
      }),
    [
      requestListModeLines,
      drafts,
      editingEntryByLineId,
      referenceQuantityByLineId,
      lineById,
      cipher,
      materialType,
      configuredUnits,
      summaryByLine,
    ],
  )

  useEffect(() => {
    if (!open) {
      initializationKeyRef.current = null
      setReviewFilterModel(null)
      return
    }

    if (initializationKeyRef.current === initializationKey) {
      return
    }

    initializationKeyRef.current = initializationKey
    setStep(0)
    setRequestListMode(editingRequest ? 'request' : 'all')

    if (editingRequest) {
      const firstEntry = editingRequest.entries[0]
      const firstLine = firstEntry
        ? lineById.get(firstEntry.projectLineId)
        : null

      setNumber(editingRequest.number)
      setDate(firstEntry?.date ?? todayInputValue())
      setRequester(editingRequest.requester)
      setCipher(firstEntry?.cipher ?? ciphers[0] ?? '')
      setMaterialTypes(
        unique(
          editingRequest.entries.map(
            (entry) =>
              entry.materialType ||
              getRequestLineMaterialType(lineById.get(entry.projectLineId)) ||
              getRequestLineMaterialType(firstLine ?? lines[0]),
          ),
        ),
      )
      setRequestSaveError('')
      setRequestNote(firstEntry?.requestNote ?? '')
      setDrafts(
        Object.fromEntries(
          editingRequest.entries.map((entry) => [
            entry.projectLineId,
            {
              note: entry.note,
              quantity: String(entry.quantity),
              sourceCipher: entry.sourceCipher ?? '',
              sourceQuantity: entry.sourceQuantity ?? null,
            },
          ]),
        ),
      )
    } else {
      const initialDate = todayInputValue()

      setNumber(suggestNumber('request', { date: initialDate }))
      setDate(initialDate)
      setRequester('')
      setCipher('')
      setMaterialTypes([])
      setRequestSaveError('')
      setRequestNote('')
      setDrafts({})
    }
    setRequestSearch('')
    setRequestSearchOpen(false)
    setRequestImportDraft(null)
    setRequestImportOpen(false)
    setOverRequest(null)
    setDeleteConfirmOpen(false)
    setScopeError('')
  }, [
    ciphers,
    editingRequest,
    existingRequests,
    initializationKey,
    lineById,
    lines,
    open,
    requestSourceLines,
    suggestNumber,
  ])

  useEffect(() => {
    if (!open || editingRequest) {
      return
    }

    setNumber(
      suggestNumber('request', {
        date,
        cipher,
        materialType: numberMaterialType,
      }),
    )
  }, [
    date,
    cipher,
    editingRequest,
    materialType,
    numberMaterialType,
    open,
    suggestNumber,
  ])

  function getRequestAvailableBalance(
    line: SubobjectMaterialMetric,
    lineId: string,
  ) {
    const existingQuantity = editingEntryByLineId.get(lineId)?.quantity ?? 0

    if (!lineById.has(lineId)) {
      return existingQuantity
    }

    const currentBalance =
      summaryByLine.get(lineId)?.requestBalance ?? line.plannedQuantity

    return currentBalance + existingQuantity
  }

  function getDraftOverRequestState(
    line: SubobjectMaterialMetric,
    quantity: string,
  ) {
    const lineId = getProjectLineId(line)
    const existing = editingEntryByLineId.get(lineId)
    // A reduced project plan must not force rewriting an existing request or
    // prevent saving its notes and reducing the already requested quantity.
    if (existing && parsePositiveNumber(quantity) <= existing.quantity)
      return null
    return getOverRequestState({
      availableOverride: getRequestAvailableBalance(line, lineId),
      line,
      quantity,
      summaryByLine,
    })
  }

  function updateDraft(
    lineId: string,
    key: 'note' | 'quantity',
    value: string,
  ) {
    if (key === 'quantity') {
      const line = lineById.get(lineId)

      if (line) {
        const nextOverRequest = getDraftOverRequestState(line, value)

        if (nextOverRequest) {
          setOverRequest(nextOverRequest)
        }
      }
    }

    setDrafts((current) => ({
      ...current,
      [lineId]: {
        note: current[lineId]?.note ?? '',
        quantity: current[lineId]?.quantity ?? '',
        sourceCipher: current[lineId]?.sourceCipher ?? '',
        sourceQuantity: current[lineId]?.sourceQuantity ?? null,
        [key]: value,
      },
    }))
  }

  function selectRequestScopeFromLine(line: SubobjectMaterialMetric) {
    const nextMaterialType = getRequestLineMaterialType(line)

    setCipher(line.cipher)
    setMaterialTypes((current) => unique([...current, nextMaterialType]))
    setRequestSearch('')
  }

  async function downloadRequestTemplate() {
    const { createMaterialRequestTemplateWorkbook } = await import('./excel')

    downloadWorkbook(
      await createMaterialRequestTemplateWorkbook({
        cipher,
        materialType,
        lines: requestScopeLines.map((line) => {
          const lineId = getProjectLineId(line)

          return {
            alternativeUnit: getAlternativeUnit(line),
            alternativeUnitFactor: getRequestConversion(line)?.factor,
            lineId,
            material: line.material,
            materialId: line.materialId,
            materialType: getRequestLineMaterialType(line),
            normativeDocument: line.normativeDocument,
            plannedQuantity: line.plannedQuantity,
            projectMaterialName: line.projectMaterialName,
            requestBalance: Math.max(
              0,
              getRequestAvailableBalance(line, lineId),
            ),
            unit: line.unit,
          }
        }),
      }),
      `request-template-${sanitizeFileName(cipher)}-${sanitizeFileName(materialType)}.xlsx`,
    )
  }

  async function parseRequestImportFile(file: File) {
    const { parseMaterialRequestWorkbook } = await import('./excel')
    const rows = parseMaterialRequestWorkbook(await file.arrayBuffer())
    setRequestImportDraft(buildRequestImportDraft(rows))
  }

  function buildRequestImportDraft(
    rows: Array<MaterialRequestImportRowInput>,
  ): MaterialRequestImportDraft {
    const scopeById = new Map(
      requestScopeLines.map((line) => [getProjectLineId(line), line]),
    )
    const rowsDraft = rows.map((row): MaterialRequestImportDraftRow => {
      const errors: Array<string> = []
      const line = findRequestImportLine(row, scopeById)
      const quantity = row.quantity ?? 0
      const alternative = line ? getRequestAlternative(line, quantity) : null
      const hasEditableData =
        row.quantity !== null || row.note.trim().length > 0

      if (!hasEditableData && !row.projectLineId) {
        return {
          draft: emptyRequestDraft(),
          errors: [],
          line: null,
          row,
          status: 'ignored',
        }
      }

      if (!line) {
        errors.push(
          'Позиция не найдена в выбранном шифре и типе материала. Скачайте свежий шаблон и не меняйте серые колонки.',
        )
      }

      if (hasEditableData && quantity <= 0) {
        errors.push('Заполните количество по заявке больше нуля.')
      }

      if (row.quantity !== null && row.quantity < 0) {
        errors.push('Количество по заявке не может быть отрицательным.')
      }

      if (hasEditableData && alternative?.error) errors.push(alternative.error)
      if (line && hasEditableData) {
        const exceeded = getDraftOverRequestState(line, String(quantity))
        if (exceeded) {
          errors.push(
            `Количество превышает остаток к заявке: доступно ${formatQuantity(exceeded.available)} ${line.unit}.`,
          )
        }
      }

      if (!hasEditableData && errors.length === 0) {
        return {
          draft: emptyRequestDraft(),
          errors,
          line,
          row,
          status: 'ignored',
        }
      }

      return {
        draft: {
          note: row.note,
          quantity:
            row.quantity === null
              ? ''
              : formatRawSpreadsheetNumber(row.quantity),
          sourceCipher: '',
          sourceQuantity: null,
        },
        errors,
        line,
        row,
        status: errors.length > 0 ? 'error' : 'ready',
      }
    })

    return {
      rows: rowsDraft,
      summary: {
        errors: rowsDraft.filter((row) => row.status === 'error').length,
        ignored: rowsDraft.filter((row) => row.status === 'ignored').length,
        ready: rowsDraft.filter((row) => row.status === 'ready').length,
        total: rowsDraft.length,
      },
    }
  }

  function findRequestImportLine(
    row: MaterialRequestImportRowInput,
    scopeById: Map<string, SubobjectMaterialMetric>,
  ) {
    const byId = scopeById.get(row.projectLineId)

    if (byId) {
      return byId
    }

    const materialId = normalizeOptionValue(row.materialId)
    const materialName = normalizeSearchValue(row.projectMaterialName)
    const matches = requestScopeLines.filter((line) => {
      const lineMaterialId = normalizeOptionValue(line.materialId ?? '')
      const lineName = normalizeSearchValue(line.projectMaterialName ?? '')

      return (
        materialId.length > 0 &&
        lineMaterialId === materialId &&
        (materialName.length === 0 || lineName === materialName)
      )
    })

    return matches.length === 1 ? (matches[0] ?? null) : null
  }

  function applyRequestImportDraft() {
    if (!requestImportDraft || requestImportDraft.summary.errors > 0) {
      return
    }

    setDrafts((current) => {
      const next = { ...current }

      for (const row of requestImportDraft.rows) {
        if (row.status !== 'ready' || !row.line) {
          continue
        }

        next[getProjectLineId(row.line)] = row.draft
      }

      return next
    })
    setRequestImportOpen(false)
    setRequestImportDraft(null)
  }

  function submit() {
    if (hasInvalidConvertedQuantities) return
    if (!number.trim()) {
      setRequestSaveError(
        'Укажите номер заявки или измените счётчик в настройках нумерации.',
      )
      return
    }

    const exceededLine = requestScopeLines
      .map((line) => {
        const lineId = getProjectLineId(line)
        return getDraftOverRequestState(line, drafts[lineId]?.quantity ?? '')
      })
      .find((item) => item !== null)

    if (exceededLine) {
      setOverRequest(exceededLine)
      return
    }

    const entries: Array<MaterialRequestEntry> = []

    for (const line of requestScopeLines) {
      const lineId = getProjectLineId(line)
      const draft = drafts[lineId]
      const quantity = parsePositiveNumber(draft?.quantity ?? '')
      const existingEntry = editingEntryByLineId.get(lineId)

      if (quantity <= 0) {
        continue
      }

      entries.push({
        altQuantity: getAlternativeQuantity(line),
        altUnit: getAlternativeUnit(line),
        altUnitFactor: getRequestAlternative(line).altUnitFactor,
        cipher: line.cipher,
        date,
        id: existingEntry?.id ?? createClientId('request'),
        materialId: line.materialId ?? '',
        note: draft?.note.trim() ?? '',
        requestNote: requestNote.trim(),
        materialType: getRequestLineMaterialType(line),
        number:
          number.trim() ||
          suggestNumber('request', {
            date,
            cipher,
            materialType: numberMaterialType,
          }),
        projectLineId: lineId,
        projectMaterialName:
          line.projectMaterialName || line.material || 'Материал',
        projectUnit: line.unit,
        projectCancellations: existingEntry?.projectCancellations,
        projectQuantitiesAtCreation: existingEntry
          ? existingEntry.projectQuantitiesAtCreation
          : referenceQuantityByLineId.get(lineId),
        quantity,
        requester: requester.trim(),
        sourceCipher: draft?.sourceCipher || undefined,
        sourceQuantity: draft?.sourceQuantity ?? undefined,
      })
    }

    if (entries.length > 0) {
      try {
        onSubmit(entries)
      } catch (error) {
        setRequestSaveError(
          error instanceof Error
            ? error.message
            : 'Не удалось сохранить заявку.',
        )
      }
    }
  }

  function advance(next: number) {
    setRequestSaveError('')
    if (next < step) {
      setStep(next)
      return
    }
    if (
      !cipher ||
      !materialTypes.length ||
      !date ||
      !number.trim() ||
      (!requester.trim() && !editingRequest)
    ) {
      setRequestSaveError(
        'Заполните шифр, тип материала, номер, дату и получателя заявки.',
      )
      return
    }
    if (next === 2 && (!hasRows || hasInvalidConvertedQuantities)) {
      setRequestSaveError('Выберите материалы и проверьте количества.')
      return
    }
    setStep(next)
  }
  return (
    <Modal
      open={open}
      size={step === 0 ? 'details' : 'xl'}
      title={editingRequest ? 'Редактирование заявки' : 'Заявка на получение'}
      onClose={onClose}
      steps={<WorkflowSteps step={step} onStep={advance} />}
      bodyClassName={
        step === 0
          ? 'min-h-0 overflow-auto px-5 py-4'
          : 'min-h-0 flex-1 overflow-auto px-5 py-4 lg:flex lg:flex-col lg:overflow-hidden'
      }
      footer={
        <OperationModalFooter
          footerStart={
            editingRequest ? (
              <div className="flex items-center gap-2">
                {deleteConfirmOpen ? (
                  <EscapeLayer onEscape={() => setDeleteConfirmOpen(false)}>
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                      <div className="basis-full">
                        <p>Удалить заявку {editingRequest.number}?</p>
                        <p className="mt-1 text-xs leading-5">
                          {receiptCount > 0
                            ? `По заявке уже оформлены получения: ${receiptCount}. Они сохранятся во вкладке «Получение» как история удалённой заявки.`
                            : 'Получений по заявке нет.'}
                        </p>
                      </div>
                      <Button
                        className="h-8 border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-100"
                        variant="outline"
                        onClick={() => {
                          try {
                            onDelete(editingRequest.number)
                          } catch (error) {
                            setRequestSaveError(
                              error instanceof Error
                                ? error.message
                                : 'Не удалось удалить заявку.',
                            )
                          }
                        }}
                      >
                        Удалить
                      </Button>
                      <Button
                        className="h-8 px-3 text-xs"
                        variant="ghost"
                        onClick={() => setDeleteConfirmOpen(false)}
                      >
                        Отмена
                      </Button>
                    </div>
                  </EscapeLayer>
                ) : (
                  <Button
                    className="border-red-200 bg-white text-red-700 hover:bg-red-50"
                    variant="outline"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 size={16} />
                    Удалить заявку
                  </Button>
                )}
              </div>
            ) : null
          }
          primaryDisabled={step === 1 && hasInvalidConvertedQuantities}
          primaryLabel={step < 2 ? 'Далее' : 'Сохранить заявку'}
          cancelLabel={step ? 'Назад' : 'Отмена'}
          onCancel={() => (step ? setStep(step - 1) : onClose())}
          onSubmit={() => (step < 2 ? advance(step + 1) : submit())}
        />
      }
    >
      <EscapeFilters
        active={
          step === 1 &&
          (!!requestSearch || requestSearchOpen || requestListMode === 'filled')
        }
        onReset={() => {
          closeRequestSearch()
          if (requestListMode === 'filled') setRequestListMode('all')
        }}
      />
      <div
        className={`request-wizard-step-${step} grid gap-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col`}
      >
        {requestSaveError && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {requestSaveError}
          </p>
        )}
        {step > 0 && hasInvalidConvertedQuantities ? (
          <p role="alert" className="mb-3 text-sm text-amber-800">
            Не удалось пересчитать альтернативное количество. Проверьте
            количество и настройки пересчёта материала в проектной базе.
          </p>
        ) : null}
        {step === 2 && (
          <OperationsGrid
            id="request-review"
            label="Проверка заявки"
            pagination
            rows={requestScopeLines.filter(
              (line) =>
                parsePositiveNumber(
                  drafts[getProjectLineId(line)]?.quantity ?? '',
                ) > 0,
            )}
            rowId={getProjectLineId}
            initialFilterModel={reviewFilterModel}
            onFilterModelChange={setReviewFilterModel}
            initialColumnOrder={Array.from(
              new Set([
                ...(
                  readDataGridState('request-material-picker').columnOrder
                    ?.orderedColIds ?? []
                )
                  .map((id) => (id === 'name' ? 'material' : id))
                  .filter((id) => requestReviewColumnIds.includes(id)),
                ...requestReviewColumnIds,
              ]),
            )}
            columns={[
              {
                id: 'material',
                title: 'Материал',
                value: (line) => line.projectMaterialName || line.material,
                width: 300,
                minWidth: 250,
                flex: 2,
              },
              {
                id: 'quantity',
                title: 'Заявлено',
                value: (line) =>
                  parsePositiveNumber(
                    drafts[getProjectLineId(line)]?.quantity ?? '',
                  ),
                numeric: true,
                width: 110,
              },
              {
                id: 'unit',
                title: 'Ед.',
                value: (line) => line.unit,
                width: 75,
                minWidth: 65,
              },
              {
                id: 'composition',
                title: 'Состав',
                value: (line) => line.material,
                width: 130,
                minWidth: 110,
                flex: 1,
              },
              {
                id: 'normativeDocument',
                title: 'Нормативный документ',
                value: (line) => line.normativeDocument,
                width: 180,
                minWidth: 150,
                flex: 1.3,
              },
              {
                id: 'note',
                title: 'Примечание',
                value: (line) => drafts[getProjectLineId(line)]?.note,
                width: 150,
                minWidth: 140,
                flex: 1,
              },
              {
                id: 'cipher',
                title: 'Шифр',
                value: (line) => line.cipher,
                width: 190,
                minWidth: 160,
              },
              {
                id: 'materialType',
                title: 'Тип материала',
                value: getRequestLineMaterialType,
                width: 180,
                minWidth: 150,
                flex: 1.3,
              },
            ]}
          />
        )}
        <div
          className={
            editingRequest
              ? 'request-wizard-fields grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-rows-[auto_minmax(0,1fr)]'
              : 'request-wizard-fields grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-1'
          }
        >
          <aside
            className={`grid min-w-0 grid-cols-1 content-start gap-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain ${editingRequest ? 'lg:max-h-[30dvh]' : ''} ${step === 0 && (!editingRequest || requestListMode === 'add') ? 'md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-stretch' : ''}`}
          >
            {!editingRequest || requestListMode === 'add' ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50/55 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-xs font-medium text-white">
                    1
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-950">
                      Область заявки
                    </div>
                  </div>
                </div>
                <div className="grid gap-3">
                  <Field label="Шифр проекта">
                    <AppSelect
                      label="Шифр проекта"
                      value={cipher}
                      onChange={(value) => {
                        if (
                          value !== cipher &&
                          Object.values(drafts).some(
                            (draft) => parsePositiveNumber(draft.quantity) > 0,
                          )
                        ) {
                          setScopeError(
                            'Сначала очистите заполненные позиции перед сменой шифра.',
                          )
                          return
                        }
                        setScopeError('')
                        setCipher(value)
                        setRequestSearch('')
                        if (!value) {
                          setMaterialTypes([])
                          setRequestNote('')
                        }
                      }}
                      options={buildSelectOptions(
                        'Выберите шифр',
                        ciphers,
                        cipher,
                      )}
                    />
                  </Field>
                  <Field label="Типы материала">
                    <RequestMaterialTypeSelect
                      key={cipher}
                      options={materialTypesForCipher}
                      value={materialTypes}
                      error={scopeError}
                      onToggle={(type, checked) => {
                        if (
                          !checked &&
                          requestScopeLines.some(
                            (line) =>
                              getRequestLineMaterialType(line) === type &&
                              parsePositiveNumber(
                                drafts[getProjectLineId(line)]?.quantity ?? '',
                              ) > 0,
                          )
                        ) {
                          setScopeError(
                            'Сначала очистите количества позиций этого типа.',
                          )
                          return
                        }
                        setScopeError('')
                        setMaterialTypes((current) =>
                          checked
                            ? [...current, type]
                            : current.filter((value) => value !== type),
                        )
                        setRequestSearch('')
                      }}
                    />
                  </Field>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <RequestSidebarMetric
                    label="Позиции"
                    value={formatQuantity(requestScopeLines.length)}
                  />
                  <RequestSidebarMetric
                    label="Заполнено"
                    value={formatQuantity(filledRowsCount)}
                  />
                </div>
              </div>
            ) : null}
            <div
              className={`min-w-0 rounded-xl border p-4 shadow-sm shadow-slate-200/50 ${requestScopeSelected ? 'border-blue-100 bg-blue-50/55' : 'border-slate-200 bg-white'}`}
            >
              <div className="mb-3 flex items-center gap-2">
                {!editingRequest && (
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-medium ${requestScopeSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    2
                  </span>
                )}
                <div>
                  <div className="text-sm font-medium text-slate-950">
                    Реквизиты заявки
                  </div>
                </div>
              </div>
              <div
                className={
                  editingRequest
                    ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3'
                    : 'grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]'
                }
              >
                <Field label="Номер заявки">
                  <Input
                    aria-label="Номер заявки"
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                  />
                </Field>
                <Field label="Дата заявки">
                  <DateInput
                    aria-label="Дата заявки"
                    value={date}
                    onValueChange={(value) => setDate(value)}
                  />
                </Field>
                <div className={editingRequest ? undefined : 'sm:col-span-2'}>
                  <Field label="Заявитель">
                    <Input
                      aria-label="Заявитель"
                      value={requester}
                      onChange={(event) => setRequester(event.target.value)}
                    />
                  </Field>
                </div>
                <div
                  className={
                    editingRequest
                      ? 'sm:col-span-2 xl:col-span-3'
                      : 'sm:col-span-2'
                  }
                >
                  <Field label="Примечание к заявке">
                    <textarea
                      aria-label="Примечание к заявке"
                      className="min-h-24 w-full rounded-md border bg-white p-2 text-sm"
                      value={requestNote}
                      onChange={(event) => setRequestNote(event.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </aside>

          <section className="flex h-[65dvh] min-h-[320px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50 lg:h-auto lg:min-h-0">
            <div className="grid shrink-0 gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-center">
              <div className="grid gap-1">
                <div className="text-sm font-medium text-slate-900">
                  {editingRequest
                    ? requestListMode === 'add'
                      ? 'Добавление материалов'
                      : 'Материалы заявки'
                    : requestScopeSelected
                      ? 'Материалы выбранной области'
                      : 'Поиск материала по всей базе'}
                </div>
                <div className="text-xs leading-5 text-slate-500">
                  {editingRequest ? (
                    <>
                      Найдено: {requestListModeLines.length}. В заявке:{' '}
                      {filledRowsCount}.
                    </>
                  ) : (
                    <>
                      Найдено {filteredRequestLines.length} из{' '}
                      {requestCandidateLines.length} позиций. Заполнено:{' '}
                      {filledRowsCount}.
                    </>
                  )}
                </div>
              </div>
              {editingRequest ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setRequestListMode(
                      requestListMode === 'add' ? 'request' : 'add',
                    )
                    setRequestSearch('')
                  }}
                >
                  {requestListMode === 'add' ? (
                    'К материалам заявки'
                  ) : (
                    <>
                      <Plus size={16} />
                      Добавить материалы
                    </>
                  )}
                </Button>
              ) : (
                <div className="rounded-full bg-white px-3 py-1 text-xs font-normal text-slate-500 ring-1 ring-slate-200">
                  {cipher && materialType
                    ? `${cipher} · ${materialType}`
                    : 'Поиск по всей базе'}
                </div>
              )}
            </div>

            <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {!editingRequest && (
                  <div className="flex flex-wrap items-center gap-2">
                    <ReceiptListModeButton
                      active={requestListMode === 'all'}
                      count={filteredRequestLines.length}
                      label="Все"
                      onClick={() => setRequestListMode('all')}
                    />
                    <ReceiptListModeButton
                      active={requestListMode === 'filled'}
                      count={filteredFilledRowsCount}
                      label="Заполненные"
                      onClick={() => setRequestListMode('filled')}
                    />
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    ref={requestSearchButtonRef}
                    variant="outline"
                    size="icon"
                    aria-label={
                      requestSearchOpen ? 'Скрыть поиск' : 'Поиск материалов'
                    }
                    title={
                      requestSearchOpen
                        ? 'Скрыть поиск и сбросить запрос'
                        : 'Поиск материалов'
                    }
                    aria-expanded={requestSearchOpen}
                    aria-controls={
                      requestSearchOpen ? requestSearchId : undefined
                    }
                    onClick={() => {
                      if (requestSearchOpen) closeRequestSearch()
                      else setRequestSearchOpen(true)
                    }}
                  >
                    {requestSearchOpen ? <X size={17} /> : <Search size={17} />}
                  </Button>
                  {step === 1 && (
                    <Button
                      className="h-9 shrink-0 bg-white"
                      disabled={
                        !cipher ||
                        !materialType ||
                        requestScopeLines.length === 0
                      }
                      variant="outline"
                      onClick={() => setRequestImportOpen(true)}
                    >
                      <FileInput size={16} />
                      Импорт Excel
                    </Button>
                  )}
                </div>
              </div>
              {requestSearchOpen && (
                <div className="relative mt-3">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={17}
                  />
                  <Input
                    id={requestSearchId}
                    ref={requestSearchInputRef}
                    aria-label="Поиск материалов заявки"
                    className="h-10 bg-white pl-9 text-sm"
                    placeholder="Поиск по наименованию, нормативному документу, составу или массе"
                    value={requestSearch}
                    onChange={(event) => setRequestSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return
                      event.preventDefault()
                      event.stopPropagation()
                      closeRequestSearch()
                    }}
                  />
                </div>
              )}
            </div>

            <RequestMaterialsGrid
              rows={requestGridRows}
              onUpdate={updateDraft}
              onChooseScope={(lineId) => {
                const line = requestSourceLines.find(
                  (item) => getProjectLineId(item) === lineId,
                )
                if (line) selectRequestScopeFromLine(line)
              }}
              emptyMessage={
                !cipher && !materialType && requestSearch.trim().length === 0
                  ? 'Выберите шифр и тип материала или начните поиск.'
                  : requestListMode === 'filled'
                    ? 'Заполненных позиций пока нет.'
                    : 'Материалы не найдены.'
              }
            />
          </section>
        </div>
        <RequestImportDialog
          draft={requestImportDraft}
          fileInputRef={importFileInputRef}
          materialType={materialType}
          open={requestImportOpen}
          scopeCount={requestScopeLines.length}
          cipher={cipher}
          onApply={applyRequestImportDraft}
          onChooseFile={() => importFileInputRef.current?.click()}
          onClose={() => setRequestImportOpen(false)}
          onDownloadTemplate={() => void downloadRequestTemplate()}
          onFileChange={(file) => void parseRequestImportFile(file)}
        />
        {overRequest ? (
          <OverRequestDialog
            overRequest={overRequest}
            onAdjustProjectQuantity={() => {
              onAdjustProjectQuantity(
                overRequest.lineId,
                overRequest.line.plannedQuantity + overRequest.shortage,
              )
              setOverRequest(null)
            }}
            onClose={() => setOverRequest(null)}
          />
        ) : null}
      </div>
    </Modal>
  )
}

function RequestImportDialog({
  cipher,
  draft,
  fileInputRef,
  materialType,
  open,
  scopeCount,
  onApply,
  onChooseFile,
  onClose,
  onDownloadTemplate,
  onFileChange,
}: {
  cipher: string
  draft: MaterialRequestImportDraft | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  materialType: string
  open: boolean
  scopeCount: number
  onApply: () => void
  onChooseFile: () => void
  onClose: () => void
  onDownloadTemplate: () => void
  onFileChange: (file: File) => void
}) {
  const [templateDownloaded, setTemplateDownloaded] = useState(false)

  useEffect(() => {
    if (open) {
      setTemplateDownloaded(false)
    }
  }, [cipher, materialType, open])

  if (!open) {
    return null
  }

  const canApply = Boolean(
    draft && draft.summary.ready > 0 && draft.summary.errors === 0,
  )
  const handleDownloadTemplate = () => {
    onDownloadTemplate()
    setTemplateDownloaded(true)
  }

  return (
    <EscapeLayer onEscape={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Импорт заявки из Excel"
        className="fixed inset-0 z-[80] grid place-items-center bg-stone-950/35 px-4 py-6"
      >
        <div className="flex h-[min(820px,calc(100vh-2rem))] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">
                Импорт заявки из Excel
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Шаблон строится по выбранному шифру и типу материала. Серые
                колонки служебные, заполняйте только количество и примечания.
              </p>
            </div>
            <button
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>

          <div className="grid gap-4 overflow-auto px-5 py-5">
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="grid gap-2 text-sm text-slate-600">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md bg-white px-2.5 py-1 text-slate-700 ring-1 ring-slate-200">
                    Шифр: {cipher || '-'}
                  </span>
                  <span className="rounded-md bg-white px-2.5 py-1 text-slate-700 ring-1 ring-slate-200">
                    Тип: {materialType || '-'}
                  </span>
                  <span className="rounded-md bg-white px-2.5 py-1 text-slate-700 ring-1 ring-slate-200">
                    Позиций в шаблоне: {scopeCount}
                  </span>
                </div>
              </div>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => {
                  const file = event.target.files?.[0]

                  if (file) {
                    onFileChange(file)
                  }

                  event.currentTarget.value = ''
                }}
              />
            </div>

            {draft ? (
              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <RequestImportMetric
                    label="Позиций в файле"
                    value={draft.summary.total}
                  />
                  <RequestImportMetric
                    label="Готово к импорту"
                    value={draft.summary.ready}
                  />
                  <RequestImportMetric
                    label="Пропущено"
                    value={draft.summary.ignored}
                  />
                  <RequestImportMetric
                    label="Ошибки"
                    tone={draft.summary.errors > 0 ? 'danger' : 'default'}
                    value={draft.summary.errors}
                  />
                </div>

                <div className="min-w-0 rounded-xl border border-slate-200">
                  <OperationsGrid
                    id={'request-import'}
                    label={'Проверка импорта заявки'}
                    rows={[
                      ...draft.rows.map((row) => {
                        return { row }
                      }),
                    ]}
                    rowId={({ row }) =>
                      `${row.row.rowNumber}-${row.row.projectLineId}`
                    }
                    columns={[
                      {
                        id: 'row',
                        title: '№ в файле',
                        value: ({ row }) => row.row.rowNumber,
                        numeric: true,
                        width: 120,
                        render: ({ row }) => <>{row.row.rowNumber}</>,
                      },
                      {
                        id: 'name',
                        title: 'Наименование по проекту',
                        value: ({ row }) =>
                          row.line?.projectMaterialName ||
                          row.row.projectMaterialName ||
                          '',
                        width: 400,
                        render: ({ row }) => (
                          <>
                            {row.line?.projectMaterialName ||
                              row.row.projectMaterialName ||
                              '-'}
                            {row.errors.length > 0 ? (
                              <div className="mt-1 text-xs leading-5 text-red-600">
                                {row.errors.join(' ')}
                              </div>
                            ) : null}
                          </>
                        ),
                      },
                      {
                        id: 'quantity',
                        title: 'Количество по заявке',
                        value: ({ row }) => row.row.quantity,
                        numeric: true,
                        render: ({ row }) => (
                          <>
                            {row.row.quantity === null
                              ? '-'
                              : formatQuantity(row.row.quantity)}
                          </>
                        ),
                      },
                      {
                        id: 'unit',
                        title: 'Единица измерения проекта',
                        value: ({ row }) => row.line?.unit || row.row.unit,
                        render: ({ row }) => (
                          <>{row.line?.unit || row.row.unit || '-'}</>
                        ),
                      },
                      {
                        id: 'status',
                        title: 'Статус',
                        value: ({ row }) =>
                          row.status === 'ready'
                            ? 'Готово'
                            : row.status === 'error'
                              ? 'Ошибка'
                              : 'Пустая позиция',
                        render: ({ row }) => (
                          <>
                            <span
                              className={`inline-flex rounded-md px-2 py-1 text-xs ${
                                row.status === 'ready'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : row.status === 'error'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {row.status === 'ready'
                                ? 'Готово'
                                : row.status === 'error'
                                  ? 'Ошибка'
                                  : 'Пустая позиция'}
                            </span>
                          </>
                        ),
                      },
                    ]}
                  />
                </div>
              </div>
            ) : (
              <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                <div className="max-w-xl">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm">
                    <FileSpreadsheet size={24} />
                  </div>
                  <div className="mt-4 text-base font-medium text-slate-950">
                    Черновик импорта еще не создан
                  </div>

                  <Button
                    className="mt-4"
                    variant={templateDownloaded ? 'default' : 'outline'}
                    onClick={
                      templateDownloaded ? onChooseFile : handleDownloadTemplate
                    }
                  >
                    {templateDownloaded ? (
                      <FileInput size={16} />
                    ) : (
                      <Download size={16} />
                    )}
                    {templateDownloaded ? 'Загрузить файл' : 'Скачать шаблон'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button disabled={!canApply} onClick={onApply}>
              Применить импорт
            </Button>
          </div>
        </div>
      </div>
    </EscapeLayer>
  )
}

function RequestImportMetric({
  label,
  tone = 'default',
  value,
}: {
  label: string
  tone?: 'danger' | 'default'
  value: number
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        tone === 'danger'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-slate-200 bg-white text-slate-900'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-medium tabular-nums">{value}</div>
    </div>
  )
}

function OverRequestDialog({
  overRequest,
  onAdjustProjectQuantity,
  onClose,
}: {
  overRequest: OverRequestState
  onAdjustProjectQuantity: () => void
  onClose: () => void
}) {
  return (
    <EscapeLayer onEscape={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Остаток по проекту превышен"
        className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/35 px-4 py-6"
      >
        <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-stone-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">
                Остаток по проекту превышен
              </h3>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                Нельзя создать заявку с отрицательным остатком. Выберите, как
                закрыть нехватку по этой позиции.
              </p>
            </div>
            <button
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>

          <div className="grid gap-4 px-5 py-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-sm font-medium text-amber-950">
                {overRequest.line.projectMaterialName ||
                  overRequest.line.material ||
                  'Материал'}
              </div>
              <div className="mt-2 grid gap-2 text-sm text-amber-900 sm:grid-cols-3">
                <div>
                  Остаток:{' '}
                  <span className="font-semibold">
                    {formatQuantity(overRequest.available)}{' '}
                    {overRequest.line.unit}
                  </span>
                </div>
                <div>
                  Заявлено:{' '}
                  <span className="font-semibold">
                    {formatQuantity(overRequest.quantity)}{' '}
                    {overRequest.line.unit}
                  </span>
                </div>
                <div>
                  Не хватает:{' '}
                  <span className="font-semibold">
                    {formatQuantity(overRequest.shortage)}{' '}
                    {overRequest.line.unit}
                  </span>
                </div>
              </div>
            </div>

            <button
              className="rounded-lg border border-stone-200 bg-white px-4 py-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
              type="button"
              onClick={onAdjustProjectQuantity}
            >
              <div className="text-sm font-semibold text-stone-950">
                Изменить проектное количество
              </div>
              <div className="mt-1 text-sm leading-6 text-stone-500">
                Увеличить количество по шифру {overRequest.line.cipher} на{' '}
                {formatQuantity(overRequest.shortage)} {overRequest.line.unit}.
              </div>
            </button>

            <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
              Перенос материала между шифрами будет оформляться на этапе
              получения, когда будет понятно фактическое поступление и возможная
              замена.
            </div>
          </div>
        </div>
      </div>
    </EscapeLayer>
  )
}

function RequestMetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-1.5 text-slate-500">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="truncate text-slate-600">{value}</span>
    </span>
  )
}

function AutomaticAlternative({
  label,
  baseUnit,
  conversion,
  value,
}: {
  label: string
  baseUnit: string
  conversion: ReturnType<typeof getOperationConversion>
  value: ReturnType<typeof getOperationAlternative>
}) {
  if (!conversion && value.altQuantity === null && !value.altUnit) return null
  return (
    <div className="mt-2 text-sm text-slate-600">
      {value.altQuantity !== null ? (
        <p>
          {label}:{' '}
          <output aria-label={label} className="font-medium text-slate-900">
            {formatAlternativeQuantity(value.altQuantity)} {value.altUnit}
          </output>
        </p>
      ) : null}
      <p className="mt-1 text-xs text-slate-500">
        {conversion
          ? `1 ${baseUnit} = ${formatAlternativeQuantity(conversion.factor)} ${conversion.unit}. Количество рассчитывается автоматически.`
          : 'Прежнее альтернативное количество сохранено. Для пересчёта задайте коэффициент в проектной базе.'}
      </p>
      {value.error ? (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {value.error}
        </p>
      ) : null}
    </div>
  )
}

function RequestMetric({
  children,
  label,
  tone = 'default',
}: {
  children: React.ReactNode
  label: string
  tone?: 'default' | 'warning'
}) {
  return (
    <div
      className={`min-w-0 border-r px-3 py-2.5 last:border-r-0 ${
        tone === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-slate-200 text-slate-900'
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-normal tabular-nums">{children}</div>
    </div>
  )
}

function RequestLineInputField({
  children,
  className = '',
  label,
}: {
  children: React.ReactNode
  className?: string
  label: string
}) {
  return (
    <label className={`grid content-start text-xs ${className}`}>
      <span className="sr-only">{label}</span>
      {children}
    </label>
  )
}

function ReceiptListModeButton({
  active,
  count,
  label,
  onClick,
  tone = 'default',
}: {
  active: boolean
  count: number
  label: string
  onClick: () => void
  tone?: 'default' | 'warning'
}) {
  const activeClass =
    tone === 'warning'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-blue-300 bg-blue-50 text-blue-800'

  return (
    <button
      className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs transition-colors ${
        active
          ? activeClass
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
      }`}
      type="button"
      onClick={onClick}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11px] ${
          active ? 'bg-white/70' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function ReceiptModal({
  initialRequestNumber = '',
  workflow,
  editingReceipt,
  lineById,
  open,
  receipts,
  requests,
  summaryByLine,
  onClose,
  onSubmit,
  onSaved,
  prepare,
}: {
  initialRequestNumber?: string
  workflow?: QualityWorkflow
  editingReceipt: ReceiptDocumentGroup | null
  lineById: Map<string, SubobjectMaterialMetric>
  open: boolean
  receipts: Array<MaterialReceiptEntry>
  requests: Array<MaterialRequestEntry>
  summaryByLine: Map<string, OperationLineSummary>
  onClose: () => void
  onSaved: () => void
  prepare: () => Promise<string>
  onSubmit: (
    entries: Array<MaterialReceiptEntry>,
    documents: Array<ReceiptDocument>,
    records: Array<M15Reconciliation>,
  ) => void
}) {
  const requestGroups = useMemo(
    () => groupRequestDocuments(requests),
    [requests],
  )
  const [submitError, setSubmitError] = useState('')
  const [step, setStep] = useState(0)
  const [m15Records, setM15Records] = useState<M15Reconciliation[]>([])
  const [localDocuments, setLocalDocuments] = useState<ReceiptDocument[]>([])
  const scans = useReceiptScans(open, localDocuments)
  const [savingScans, setSavingScans] = useState(false)
  const submitted = useRef(false)
  const submitting = useRef(false)
  const [receiptSubmitted, setReceiptSubmitted] = useState(false)
  const [confirmDiscardScans, setConfirmDiscardScans] = useState(false)
  function closeReceipt() {
    if (submitting.current) return
    if (scans.hasPending) setConfirmDiscardScans(true)
    else onClose()
  }
  function receiptId(key: string, receipt: MaterialReceiptEntry | null) {
    if (receipt) return receipt.id
    let id = stableReceiptIds.current.get(key)
    if (!id) {
      id = createClientId('receipt')
      stableReceiptIds.current.set(key, id)
    }
    return id
  }
  const [reviewEntries, setReviewEntries] = useState<MaterialReceiptEntry[]>([])
  const stableReceiptIds = useRef(new Map<string, string>())

  const [requestNumber, setRequestNumber] = useState('')
  const [receiptMaterialTypeFilter, setReceiptMaterialTypeFilter] = useState('')
  const [rowDrafts, setDrafts] = useState<Record<string, ReceiptDraft>>({})
  const [overageApprovals, setOverageApprovals] = useState<
    Record<string, ReceiptOverageApproval | undefined>
  >({})
  const [commonDetails, setCommonDetails] = useState<ReceiptDeliveryDetails>(
    () => ({ ...emptyReceiptDocumentFields, date: localDateInputValue() }),
  )
  const [ownDetailsKeys, setOwnDetailsKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const drafts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(rowDrafts).map(([key, draft]) => [
          key,
          ownDetailsKeys.has(key) ? draft : { ...draft, ...commonDetails },
        ]),
      ),
    [commonDetails, ownDetailsKeys, rowDrafts],
  )
  const getDeliveryDetails = (key: string): ReceiptDeliveryDetails =>
    ownDetailsKeys.has(key) && rowDrafts[key] ? rowDrafts[key] : commonDetails
  const [receiptListMode, setReceiptListMode] = useState<
    'all' | 'filled' | 'missing-document'
  >('all')
  const [receiptSearch, setReceiptSearch] = useState('')
  const [receiptImportOpen, setReceiptImportOpen] = useState(false)
  const [receiptImportDraft, setStoredReceiptImportDraft] =
    useState<MaterialReceiptImportDraft | null>(null)
  const receiptImportDraftRef = useRef<MaterialReceiptImportDraft | null>(null)
  const receiptImportReadRef = useRef(0)
  const [receiptImportFileName, setReceiptImportFileName] = useState('')
  const [receiptImportError, setReceiptImportError] = useState('')
  const [receiptImportNotice, setReceiptImportNotice] = useState('')
  const [receiptImportLoading, setReceiptImportLoading] = useState(false)
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const initializationKeyRef = useRef<string | null>(null)
  const initializationKey = editingReceipt
    ? `edit:${editingReceipt.key}`
    : `create:${initialRequestNumber}`

  function setReceiptImportDraft(value: MaterialReceiptImportDraft | null) {
    // Cell commit and Apply may happen in the same event, before React renders.
    receiptImportDraftRef.current = value
    setStoredReceiptImportDraft(value)
    if (!value) {
      receiptImportReadRef.current += 1
      setReceiptImportFileName('')
      setReceiptImportError('')
      setReceiptImportLoading(false)
    }
  }

  function closeReceiptImport() {
    receiptImportReadRef.current += 1
    setReceiptImportLoading(false)
    setReceiptImportOpen(false)
  }

  useEffect(() => {
    if (!open) {
      initializationKeyRef.current = null
      return
    }

    if (initializationKeyRef.current === initializationKey) {
      return
    }

    initializationKeyRef.current = initializationKey
    submitted.current = false
    submitting.current = false
    setReceiptSubmitted(false)
    setSavingScans(false)
    setConfirmDiscardScans(false)
    setStep(0)
    setSubmitError('')
    setReviewEntries([])
    setM15Records(structuredClone(workflow?.m15Reconciliations ?? []))
    setLocalDocuments([...receiptDocuments(workflow)])
    stableReceiptIds.current.clear()

    const firstReceipt = editingReceipt?.entries[0]
    const initialDetails = firstReceipt
      ? {
          ...receiptDocumentFields(firstReceipt, workflow),
          date: firstReceipt.date,
        }
      : { ...emptyReceiptDocumentFields, date: localDateInputValue() }
    setCommonDetails(initialDetails)
    setOverageApprovals(
      Object.fromEntries(
        (editingReceipt?.entries ?? []).map((entry) => [
          getReceiptDraftKey(entry),
          entry.overageApproval,
        ]),
      ),
    )
    setOwnDetailsKeys(
      new Set(
        (editingReceipt?.entries ?? [])
          .filter(
            (entry) =>
              !sameReceiptDeliveryDetails(
                { ...receiptDocumentFields(entry, workflow), date: entry.date },
                initialDetails,
              ),
          )
          .map(getReceiptDraftKey),
      ),
    )

    if (editingReceipt) {
      const firstRequest = requests.find(
        (request) => request.id === editingReceipt.entries[0]?.requestId,
      )
      setRequestNumber(firstRequest?.number ?? '')
      setReceiptMaterialTypeFilter(
        firstRequest
          ? getRequestLineMaterialType(lineById.get(firstRequest.projectLineId))
          : '',
      )
      setDrafts(
        Object.fromEntries(
          editingReceipt.entries.map((entry) => [
            getReceiptDraftKey(entry),
            {
              ...receiptDocumentFields(entry, workflow),
              actualName: entry.actualName,
              certificate: entry.certificate,
              customerArvk: entry.customerArvk,
              date: entry.date,
              factoryNumber: entry.factoryNumber,
              heatBatch: entry.heatBatch || '',
              manufacturer: entry.manufacturer || '',
              note: entry.note || '',
              qualityDocument: entry.qualityDocument,
              quantity: String(entry.quantity),
              technicalDecision: entry.technicalDecision,
            },
          ]),
        ),
      )
    } else {
      setRequestNumber(initialRequestNumber)
      setReceiptMaterialTypeFilter('')
      setDrafts({})
    }

    setReceiptSearch('')
    setReceiptListMode('all')
    setReceiptImportDraft(null)
    setReceiptImportOpen(false)
  }, [
    editingReceipt,
    initialRequestNumber,
    initializationKey,
    lineById,
    open,
    requests,
  ])

  const selectedRequests = requests.filter(
    (request) =>
      (!requestNumber || request.number === requestNumber) &&
      (!receiptMaterialTypeFilter ||
        getRequestLineMaterialType(lineById.get(request.projectLineId)) ===
          receiptMaterialTypeFilter),
  )
  const receiptMaterialTypeOptions = useMemo(
    () =>
      unique(
        requests
          .map((request) =>
            getRequestLineMaterialType(lineById.get(request.projectLineId)),
          )
          .filter(Boolean),
      ),
    [lineById, requests],
  )
  const receiptByRequest = useMemo(
    () => receivedByRequest(receipts, workflow),
    [receipts, workflow],
  )
  const receiptRequestOptions = useMemo(
    () =>
      buildRequestGroupMeta(
        requestGroups.filter((group) =>
          group.entries.some(
            (entry) =>
              !requestReceiptProgress(
                effectiveRequestQuantity(entry),
                receiptByRequest.get(entry.id) ?? 0,
              ).complete ||
              editingReceipt?.entries.some(
                (receipt) => receipt.requestId === entry.id,
              ),
          ),
        ),
        lineById,
      ),
    [editingReceipt, lineById, receiptByRequest, requestGroups],
  )
  const selectedReceiptRequestOption = receiptRequestOptions.find(
    (option) => option.group.number === requestNumber,
  )
  const globalReceiptSearchMode = !editingReceipt && !requestNumber
  const receiptWorkItems = useMemo<Array<ReceiptWorkItem>>(() => {
    if (editingReceipt) {
      const items: Array<ReceiptWorkItem> = []

      for (const entry of editingReceipt.entries) {
        const request = requests.find((item) => item.id === entry.requestId)

        if (request) {
          items.push({
            key: getReceiptDraftKey(entry),
            request,
            receipt: entry,
          })
        }
      }

      return items
    }

    const sourceRequests =
      requestNumber || receiptMaterialTypeFilter ? selectedRequests : requests

    return sourceRequests
      .filter((request) => getReceiptRequestRest(request, receiptByRequest) > 0)
      .map((request) => ({
        key: request.id,
        request,
        receipt: null,
      }))
  }, [
    editingReceipt,
    receiptByRequest,
    receiptMaterialTypeFilter,
    requestNumber,
    requests,
    selectedRequests,
  ])
  const searchedReceiptWorkItems = useMemo(() => {
    if (
      globalReceiptSearchMode &&
      !receiptMaterialTypeFilter &&
      receiptSearch.trim().length === 0
    ) {
      return []
    }

    if (receiptSearch.trim().length === 0) {
      return receiptWorkItems
    }

    return receiptWorkItems.filter((item) =>
      receiptWorkItemMatchesSearch(item, receiptSearch, lineById),
    )
  }, [
    globalReceiptSearchMode,
    lineById,
    receiptMaterialTypeFilter,
    receiptSearch,
    receiptWorkItems,
  ])
  const filledReceiptRowsCount = receiptWorkItems.filter(
    ({ key }) => parsePositiveNumber(drafts[key]?.quantity ?? '') > 0,
  ).length
  const missingInvoiceRowsCount = receiptWorkItems.filter(({ key }) => {
    const draft = drafts[key]

    return (
      parsePositiveNumber(draft?.quantity ?? '') > 0 &&
      !!receiptDocumentError(draft ?? emptyReceiptDocumentFields)
    )
  }).length
  const receiptOverRestRowsCount = receiptWorkItems.filter(
    ({ key, request, receipt }) => {
      const quantity = parsePositiveNumber(drafts[key]?.quantity ?? '')

      return (
        quantity > 0 &&
        quantity > getReceiptRequestRest(request, receiptByRequest, receipt) &&
        !isReceiptOverageApproved(
          overageApprovals[key],
          request.id,
          quantity,
          getReceiptRequestRest(request, receiptByRequest, receipt),
        )
      )
    },
  ).length
  const filteredReceiptWorkItems = useMemo(() => {
    const sortReceiptItems = (items: Array<ReceiptWorkItem>) =>
      [...items].sort((left, right) => {
        const leftRest = getReceiptRequestRest(
          left.request,
          receiptByRequest,
          left.receipt,
        )
        const rightRest = getReceiptRequestRest(
          right.request,
          receiptByRequest,
          right.receipt,
        )
        const leftCanReceive = leftRest > 0
        const rightCanReceive = rightRest > 0

        if (leftCanReceive !== rightCanReceive) {
          return leftCanReceive ? -1 : 1
        }

        if (rightRest !== leftRest) {
          return rightRest - leftRest
        }

        return left.request.projectMaterialName.localeCompare(
          right.request.projectMaterialName,
          'ru',
        )
      })

    if (receiptListMode === 'filled') {
      return sortReceiptItems(
        searchedReceiptWorkItems.filter(
          ({ key }) => parsePositiveNumber(drafts[key]?.quantity ?? '') > 0,
        ),
      )
    }

    if (receiptListMode === 'missing-document') {
      return sortReceiptItems(
        searchedReceiptWorkItems.filter(({ key }) => {
          const draft = drafts[key]

          return (
            parsePositiveNumber(draft?.quantity ?? '') > 0 &&
            !!receiptDocumentError(draft ?? emptyReceiptDocumentFields)
          )
        }),
      )
    }

    return sortReceiptItems(searchedReceiptWorkItems)
  }, [drafts, receiptByRequest, receiptListMode, searchedReceiptWorkItems])
  const visibleReceiptWorkItems = filteredReceiptWorkItems.slice(0, 180)
  const hiddenReceiptWorkItemCount =
    filteredReceiptWorkItems.length - visibleReceiptWorkItems.length
  const receiptTemplateWorkItems = filteredReceiptWorkItems
  const hasRows = Object.values(drafts).some(
    (draft) => parsePositiveNumber(draft.quantity) > 0,
  )
  function getReceiptConversion(
    request: MaterialRequestEntry,
    receipt?: MaterialReceiptEntry | null,
  ) {
    return getOperationConversion(
      lineById.get(request.projectLineId),
      receipt?.projectUnit ?? request.projectUnit,
      receipt,
      request,
    )
  }
  function getReceiptAlternative(
    request: MaterialRequestEntry,
    receipt: MaterialReceiptEntry | null | undefined,
    quantity: number | null,
  ) {
    return getOperationAlternative(
      quantity,
      getReceiptConversion(request, receipt),
      receipt,
    )
  }
  const alternativeErrors = receiptWorkItems.flatMap(
    ({ key, request, receipt }) => {
      const quantity = parsePositiveNumber(drafts[key]?.quantity ?? '')
      const error =
        quantity > 0
          ? getReceiptAlternative(request, receipt, quantity).error
          : ''
      return error ? [error] : []
    },
  )
  const chronologyError = receiptWorkItems
    .flatMap(({ key, request }) =>
      parsePositiveNumber(drafts[key]?.quantity ?? '') > 0
        ? [receiptChronologyError(request, getDeliveryDetails(key).date)]
        : [],
    )
    .find(Boolean)
  const receiptSaveBlockedReason = !hasRows
    ? 'Укажите поступившее количество хотя бы по одной позиции.'
    : receiptWorkItems.some(
          ({ key }) =>
            parsePositiveNumber(drafts[key]?.quantity ?? '') > 0 &&
            !normalizeCalendarDate(getDeliveryDetails(key).date),
        )
      ? 'Укажите корректную дату получения.'
      : missingInvoiceRowsCount > 0
        ? receiptWorkItems
            .filter(
              ({ key }) => parsePositiveNumber(drafts[key]?.quantity ?? '') > 0,
            )
            .map(({ key }) =>
              receiptDocumentError(drafts[key] ?? emptyReceiptDocumentFields),
            )
            .find(Boolean) || 'Заполните АПП.'
        : receiptOverRestRowsCount > 0
          ? `Поступление превышает остаток к получению: ${receiptOverRestRowsCount} поз.`
          : chronologyError || alternativeErrors[0] || ''
  const receiptSaveDisabled = Boolean(receiptSaveBlockedReason)

  function updateDraft(
    draftKey: string,
    request: MaterialRequestEntry,
    key: keyof ReceiptDraft,
    value: string,
  ) {
    if (key === 'quantity') {
      setOverageApprovals((current) => ({ ...current, [draftKey]: undefined }))
    }
    setDrafts((current) => ({
      ...current,
      [draftKey]: {
        actualName:
          current[draftKey]?.actualName ?? request.projectMaterialName,
        certificate: current[draftKey]?.certificate ?? '',
        customerArvk: current[draftKey]?.customerArvk ?? '',
        date: current[draftKey]?.date ?? localDateInputValue(),
        factoryNumber: current[draftKey]?.factoryNumber ?? '',
        heatBatch: current[draftKey]?.heatBatch ?? '',
        appNumber: current[draftKey]?.appNumber ?? '',
        appDate: current[draftKey]?.appDate ?? '',
        m15Number: current[draftKey]?.m15Number ?? '',
        m15Date: current[draftKey]?.m15Date ?? '',
        manufacturer: current[draftKey]?.manufacturer ?? '',
        note: current[draftKey]?.note ?? '',
        qualityDocument: current[draftKey]?.qualityDocument ?? '',
        quantity: current[draftKey]?.quantity ?? '',
        technicalDecision: current[draftKey]?.technicalDecision ?? '',
        [key]: value,
      },
    }))
  }

  function toggleOwnDetails(key: string, request: MaterialRequestEntry) {
    if (!ownDetailsKeys.has(key)) {
      setDrafts((current) => ({
        ...current,
        [key]: {
          ...emptyReceiptDraft(),
          actualName: request.projectMaterialName,
          ...current[key],
          ...commonDetails,
        },
      }))
    }
    setOwnDetailsKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function downloadReceiptTemplate() {
    const { createMaterialReceiptTemplateWorkbook } = await import('./excel')

    downloadWorkbook(
      await createMaterialReceiptTemplateWorkbook({
        lines: receiptTemplateWorkItems.map(({ key, request, receipt }) => ({
          altUnit: getReceiptConversion(request, receipt)?.unit,
          altUnitFactor: getReceiptConversion(request, receipt)?.factor,
          ...getDeliveryDetails(key),
          materialId: request.materialId,
          projectLineId: request.projectLineId,
          projectMaterialName: request.projectMaterialName,
          receivedQuantity:
            (receiptByRequest.get(request.id) ?? 0) - (receipt?.quantity ?? 0),
          requestId: request.id,
          requestQuantity: effectiveRequestQuantity(request),
          requestRest: getReceiptRequestRest(
            request,
            receiptByRequest,
            receipt,
          ),
          unit: request.projectUnit,
        })),
        requestNumber,
      }),
      `receipt-template-${sanitizeFileName(requestNumber || 'found-items')}.xlsx`,
    )
  }

  async function parseReceiptImportFile(file: File) {
    const readId = ++receiptImportReadRef.current
    setReceiptImportLoading(true)
    setReceiptImportError('')
    try {
      const { parseMaterialReceiptWorkbook } = await import('./excel')
      const rows = parseMaterialReceiptWorkbook(await file.arrayBuffer())
      if (readId !== receiptImportReadRef.current) return
      if (rows.length === 0) {
        throw new Error(
          'В файле не найдены позиции. Используйте шаблон получения.',
        )
      }
      setReceiptImportNotice(
        rows.some((row) => row.m15Number || row.m15Date)
          ? 'Колонки М-15 из старого шаблона не используются. Получение оформляется только по АПП.'
          : '',
      )
      setReceiptImportDraft(
        buildReceiptImportDraft(
          rows.map((row) => ({ ...row, m15Number: '', m15Date: '' })),
        ),
      )
      setReceiptImportFileName(file.name)
    } catch (error) {
      if (readId !== receiptImportReadRef.current) return
      setReceiptImportError(
        `Не удалось загрузить файл «${file.name}». ${
          error instanceof Error ? error.message : 'Проверьте файл Excel.'
        } Загрузите исправленный файл повторно.`,
      )
    } finally {
      if (readId === receiptImportReadRef.current)
        setReceiptImportLoading(false)
    }
  }

  function editReceiptImportRow(
    rowNumber: number,
    field: keyof ReceiptDraft,
    value: string,
  ) {
    const current = receiptImportDraftRef.current
    if (!current) return
    if (
      field === 'quantity' &&
      value.trim() &&
      parseNullableNumber(value) === null
    )
      return
    const rows = current.rows.map(({ row }) =>
      row.rowNumber === rowNumber
        ? {
            ...row,
            [field]:
              field === 'quantity'
                ? parseNullableNumber(value)
                : field === 'date'
                  ? normalizeCalendarDate(value) || value.trim()
                  : value.trim(),
          }
        : row,
    )
    setReceiptImportDraft(buildReceiptImportDraft(rows))
  }

  function buildReceiptImportDraft(
    rows: Array<MaterialReceiptImportRowInput>,
  ): MaterialReceiptImportDraft {
    const requestById = new Map(
      receiptWorkItems.map((item) => [item.request.id, item]),
    )
    const rowsDraft = rows.map((row): MaterialReceiptImportDraftRow => {
      const errors: Array<string> = []
      const item = requestById.get(row.requestId)
      const quantity = row.quantity ?? 0
      const defaults = item ? getDeliveryDetails(item.key) : commonDetails
      const date = row.date || defaults.date
      const documentFields = [
        row.appNumber,
        row.appDate,
        row.m15Number,
        row.m15Date,
      ].some((value) => value.trim())
        ? row
        : defaults
      const hasEditableData =
        quantity > 0 ||
        (row.actualName.trim().length > 0 &&
          normalizeSearchValue(row.actualName) !==
            normalizeSearchValue(item?.request.projectMaterialName ?? '')) ||
        row.manufacturer.trim().length > 0 ||
        row.heatBatch.trim().length > 0 ||
        row.certificate.trim().length > 0 ||
        row.factoryNumber.trim().length > 0 ||
        row.qualityDocument.trim().length > 0 ||
        row.customerArvk.trim().length > 0 ||
        row.note.trim().length > 0 ||
        row.technicalDecision.trim().length > 0

      if (!hasEditableData && !row.requestId) {
        return {
          draft: emptyReceiptDraft(),
          errors: [],
          request: null,
          row,
          status: 'ignored',
        }
      }

      if (!item) {
        errors.push(
          'Позиция не найдена в выбранной заявке. Скачайте свежий шаблон и не меняйте серые колонки.',
        )
      }

      if (hasEditableData && quantity <= 0) {
        errors.push('Заполните поступившее количество больше нуля.')
      }

      const documentError = receiptDocumentError(documentFields)
      if (hasEditableData && documentError) errors.push(documentError)

      if (hasEditableData && !normalizeCalendarDate(date)) {
        errors.push(
          'Некорректная дата поступления. Укажите дату в формате ДД-ММ-ГГ.',
        )
      }
      if (item && hasEditableData) {
        const chronology = receiptChronologyError(item.request, date)
        if (chronology) errors.push(chronology)
      }

      if (row.quantity !== null && row.quantity < 0) {
        errors.push('Поступившее количество не может быть отрицательным.')
      }

      if (item && hasEditableData) {
        const error = getReceiptAlternative(
          item.request,
          item.receipt,
          quantity,
        ).error
        if (error) errors.push(error)
      }

      if (
        item &&
        quantity >
          getReceiptRequestRest(item.request, receiptByRequest, item.receipt)
      ) {
        errors.push(
          `Поступление превышает остаток к получению: доступно ${formatQuantity(
            getReceiptRequestRest(item.request, receiptByRequest, item.receipt),
          )} ${item.request.projectUnit}.`,
        )
      }

      if (!hasEditableData && errors.length === 0) {
        return {
          draft: emptyReceiptDraft(),
          errors,
          request: item?.request ?? null,
          row,
          status: 'ignored',
        }
      }

      return {
        draft: {
          actualName: row.actualName || item?.request.projectMaterialName || '',
          certificate: row.certificate,
          customerArvk: row.customerArvk,
          date,
          factoryNumber: row.factoryNumber,
          heatBatch: row.heatBatch,
          appNumber: documentFields.appNumber,
          appDate: documentFields.appDate,
          m15Number: documentFields.m15Number,
          m15Date: documentFields.m15Date,
          manufacturer: row.manufacturer,
          note: row.note,
          qualityDocument: row.qualityDocument,
          quantity:
            row.quantity === null
              ? ''
              : formatRawSpreadsheetNumber(row.quantity),
          technicalDecision: row.technicalDecision,
        },
        errors,
        request: item?.request ?? null,
        row: {
          ...row,
          date,
          appNumber: documentFields.appNumber,
          appDate: documentFields.appDate,
          m15Number: documentFields.m15Number,
          m15Date: documentFields.m15Date,
        },
        status: errors.length > 0 ? 'error' : 'ready',
      }
    })

    const activeRequestCounts = new Map<string, number>()
    for (const row of rowsDraft) {
      if (row.status !== 'ignored') {
        activeRequestCounts.set(
          row.row.requestId,
          (activeRequestCounts.get(row.row.requestId) ?? 0) + 1,
        )
      }
    }
    for (const row of rowsDraft) {
      if (
        row.status !== 'ignored' &&
        (activeRequestCounts.get(row.row.requestId) ?? 0) > 1
      ) {
        row.errors.push(
          'Позиция заявки повторяется в файле. Оставьте одно поступление на позицию.',
        )
        row.status = 'error'
      }
    }

    return {
      rows: rowsDraft,
      summary: {
        errors: rowsDraft.filter((row) => row.status === 'error').length,
        ignored: rowsDraft.filter((row) => row.status === 'ignored').length,
        ready: rowsDraft.filter((row) => row.status === 'ready').length,
        total: rowsDraft.length,
      },
    }
  }

  function applyReceiptImportDraft() {
    const importDraft = receiptImportDraftRef.current
    if (!importDraft || receiptImportLoading || receiptImportError) return
    const validated = buildReceiptImportDraft(
      importDraft.rows.map(({ row }) => row),
    )
    setReceiptImportDraft(validated)
    if (validated.summary.errors > 0 || !validated.summary.ready) {
      return
    }

    setDrafts((current) => {
      const next = { ...current }

      for (const row of validated.rows) {
        if (row.status !== 'ready' || !row.request) {
          continue
        }

        const workItem = receiptWorkItems.find(
          (item) => item.request.id === row.request?.id,
        )

        if (!workItem) {
          continue
        }

        next[workItem.key] = row.draft
      }

      return next
    })
    setOwnDetailsKeys((current) => {
      const next = new Set(current)
      for (const row of validated.rows) {
        if (row.status !== 'ready' || !row.request) continue
        const item = receiptWorkItems.find(
          (candidate) => candidate.request.id === row.request?.id,
        )
        if (!item) continue
        if (sameReceiptDeliveryDetails(row.draft, commonDetails))
          next.delete(item.key)
        else next.add(item.key)
      }
      return next
    })
    setReceiptImportOpen(false)
    setReceiptImportDraft(null)
  }

  function buildEntries() {
    if (receiptSaveDisabled) throw new Error(receiptSaveBlockedReason)

    const entries: Array<MaterialReceiptEntry> = []
    const catalog = [...localDocuments]

    for (const { key, request, receipt } of receiptWorkItems) {
      const draft = drafts[key]
      const quantity = parsePositiveNumber(draft?.quantity ?? '')

      if (quantity <= 0) {
        continue
      }

      const requestRest = getReceiptRequestRest(
        request,
        receiptByRequest,
        receipt,
      )

      const overageApproved = isReceiptOverageApproved(
        overageApprovals[key],
        request.id,
        quantity,
        requestRest,
      )
      if (quantity > requestRest && !overageApproved)
        throw new Error('Поступление превышает остаток заявки.')

      const alternative = getReceiptAlternative(request, receipt, quantity)
      entries.push({
        ...(overageApproved ? { overageApproval: overageApprovals[key] } : {}),
        ...bindReceiptDocuments(draft ?? emptyReceiptDocumentFields, catalog),
        actualName:
          draft?.actualName.trim() ||
          request.projectMaterialName ||
          'ТМЦ без наименования',
        altQuantity: alternative.altQuantity,
        altUnit: alternative.altUnit,
        altUnitFactor: alternative.altUnitFactor,
        certificate: draft?.certificate.trim() ?? '',
        customerArvk: draft?.customerArvk.trim() ?? '',
        date: draft?.date || localDateInputValue(),
        factoryNumber: draft?.factoryNumber.trim() ?? '',
        heatBatch: draft?.heatBatch.trim() ?? '',
        id: receiptId(key, receipt),
        manufacturer: draft?.manufacturer.trim() ?? '',
        note: draft?.note.trim() ?? '',
        projectLineId: request.projectLineId,
        projectUnit: receipt?.projectUnit ?? request.projectUnit,
        qualityDocument: draft?.qualityDocument.trim() ?? '',
        quantity,
        requestId: request.id,
        technicalDecision: draft?.technicalDecision.trim() ?? '',
      })
    }

    const originalIds = new Set(receiptDocuments(workflow).map((doc) => doc.id))
    const referencedIds = new Set(
      entries
        .flatMap((entry) => [entry.appDocumentId, entry.m15DocumentId])
        .filter(Boolean),
    )
    return {
      entries,
      catalog: catalog.filter(
        (doc) =>
          originalIds.has(doc.id) ||
          doc.kind === 'm15' ||
          referencedIds.has(doc.id),
      ),
    }
  }
  function advance(next: number) {
    if (submitting.current || submitted.current) return
    setSubmitError('')
    if (next < step) {
      setStep(next)
      return
    }
    try {
      if (!normalizeCalendarDate(commonDetails.date))
        throw new Error('Укажите дату получения.')
      if (next === 2) {
        const { entries, catalog } = buildEntries()
        setReviewEntries(entries)
        setLocalDocuments(catalog)
      }
      setStep(next)
    } catch (cause) {
      setSubmitError(
        cause instanceof Error ? cause.message : 'Проверьте форму.',
      )
    }
  }
  async function submit() {
    if (submitting.current) return
    submitting.current = true
    setSavingScans(true)
    setSubmitError('')
    let persisted = false
    try {
      scans.validate(reviewEntries, localDocuments, m15Records)
      await scans.uploadRequired(reviewEntries, localDocuments, m15Records)
      if (!submitted.current) {
        // Flush the accounting state/effect before waiting for its save queue.
        flushSync(() => onSubmit(reviewEntries, localDocuments, m15Records))
        submitted.current = true
        setReceiptSubmitted(true)
      }
      await prepare()
      persisted = true
      await scans.upload(reviewEntries, localDocuments, m15Records)
      onSaved()
    } catch (cause) {
      setSubmitError(
        `${persisted ? 'Получение сохранено. Не все сканы загружены; проверьте файлы и повторите загрузку. ' : ''}${cause instanceof Error ? cause.message : 'Не удалось сохранить получение.'}`,
      )
    } finally {
      submitting.current = false
      setSavingScans(false)
    }
  }

  return (
    <Modal
      open={open}
      size={step === 0 ? 'details' : 'xl'}
      title={editingReceipt ? 'Редактирование получения' : 'Оформить получение'}
      onClose={closeReceipt}
      steps={
        !receiptImportOpen && <WorkflowSteps step={step} onStep={advance} />
      }
      footer={
        !receiptImportOpen && (
          <OperationModalFooter
            primaryDisabled={savingScans || (step === 1 && receiptSaveDisabled)}
            primaryLabel={
              savingScans
                ? 'Сохранение…'
                : receiptSubmitted
                  ? 'Повторить загрузку сканов'
                  : step < 2
                    ? 'Далее'
                    : 'Сохранить получение'
            }
            onCancel={() => {
              if (!savingScans) {
                if (receiptSubmitted || !step) closeReceipt()
                else setStep(step - 1)
              }
            }}
            cancelLabel={
              receiptSubmitted ? 'Закрыть' : step ? 'Назад' : 'Отмена'
            }
            onSubmit={() => {
              if (step < 2) advance(step + 1)
              else void submit()
            }}
          />
        )
      }
    >
      <EscapeFilters
        active={step === 1 && !!(receiptSearch || receiptMaterialTypeFilter)}
        onReset={() => {
          setReceiptSearch('')
          setReceiptMaterialTypeFilter('')
        }}
      />
      <>
        {scans.dialog}
        {confirmDiscardScans && (
          <EscapeLayer onEscape={() => setConfirmDiscardScans(false)}>
            <div
              role="alert"
              className="mb-3 grid gap-2 rounded-lg bg-amber-50 p-3 text-sm"
            >
              <p>
                Выбранные, но ещё не загруженные сканы будут убраны из формы.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmDiscardScans(false)}
                >
                  Продолжить работу
                </Button>
                <Button onClick={onClose}>Закрыть без загрузки сканов</Button>
              </div>
            </div>
          </EscapeLayer>
        )}
        <fieldset disabled={savingScans}>{scans.summary}</fieldset>
        {submitError && (
          <p role="alert" className="mb-3 text-red-700">
            {submitError}
          </p>
        )}
        {step === 1 && hasRows && receiptSaveBlockedReason && !submitError && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {receiptSaveBlockedReason}
          </p>
        )}
        {step === 2 && (
          <fieldset disabled={receiptSubmitted || savingScans}>
            <ReceiptReview
              receipts={reviewEntries}
              documents={localDocuments}
            />
          </fieldset>
        )}
        <fieldset
          disabled={receiptSubmitted || savingScans}
          className={`receipt-wizard-step-${step} min-w-0`}
          hidden={step === 2}
        >
          <OperationModalLayout
            hideFooter
            primaryDisabled={receiptSaveDisabled}
            primaryLabel={
              editingReceipt ? 'Сохранить изменения' : 'Сохранить получение'
            }
            onCancel={onClose}
            onSubmit={submit}
          >
            <div className="grid min-h-0 gap-5">
              <aside className="grid gap-3 border-b border-slate-200 pb-5">
                <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <Field label="Заявка">
                    <ReceiptRequestSearchPicker
                      options={receiptRequestOptions}
                      selectedNumber={requestNumber}
                      selectedOption={selectedReceiptRequestOption}
                      onClear={() => {
                        setRequestNumber('')
                        setDrafts({})
                        setOwnDetailsKeys(new Set())
                        setReceiptSearch('')
                        setReceiptImportDraft(null)
                      }}
                      onSelect={(value) => {
                        if (value === requestNumber) return
                        setRequestNumber(value)
                        setDrafts({})
                        setOwnDetailsKeys(new Set())
                        setReceiptSearch('')
                        setReceiptImportDraft(null)
                      }}
                    />
                  </Field>
                  <Field label="Тип материала">
                    <AppSelect
                      label="Тип материала"
                      value={receiptMaterialTypeFilter}
                      onChange={(value) => {
                        setReceiptMaterialTypeFilter(value)
                        setReceiptImportDraft(null)
                      }}
                      options={buildSelectOptions(
                        'Все типы',
                        receiptMaterialTypeOptions,
                        receiptMaterialTypeFilter,
                      )}
                    />
                  </Field>
                </div>

                {step === 0 && (
                  <Button
                    className="justify-self-start"
                    size="sm"
                    disabled={receiptTemplateWorkItems.length === 0}
                    variant="outline"
                    onClick={() => setReceiptImportOpen(true)}
                  >
                    <FileInput size={16} />
                    Импорт Excel
                  </Button>
                )}
              </aside>

              <section
                className={
                  step === 0
                    ? 'min-w-0'
                    : 'min-w-0 rounded-xl border border-slate-200 bg-slate-50/60'
                }
              >
                <fieldset className="grid min-w-0 gap-3">
                  <legend className="sr-only">Общие реквизиты получения</legend>
                  <div className="grid items-start gap-3 sm:grid-cols-[170px_minmax(0,1fr)]">
                    <label className="grid min-w-0 gap-1 text-sm">
                      Дата получения
                      <DateInput
                        aria-label="Дата получения"
                        value={commonDetails.date}
                        onValueChange={(value) =>
                          setCommonDetails((current) => ({
                            ...current,
                            date: value,
                          }))
                        }
                      />
                    </label>
                    <ReceiptDocumentInputs
                      flat
                      fields={commonDetails}
                      renderScan={scans.documentClip}
                      documents={localDocuments}
                      onChange={(fields) =>
                        setCommonDetails((current) => ({
                          ...current,
                          ...fields,
                        }))
                      }
                    />
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    Общие реквизиты для всех материалов. Для отдельных позиций
                    их можно изменить на следующем шаге.
                  </p>
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-medium text-slate-950">
                      Позиции к получению
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Найдено {filteredReceiptWorkItems.length} из{' '}
                      {receiptWorkItems.length} позиций. Заполнено:{' '}
                      {filledReceiptRowsCount}.
                      {missingInvoiceRowsCount > 0 ? (
                        <span className="ml-2 text-amber-700">
                          Документ получения обязателен:{' '}
                          {missingInvoiceRowsCount}.
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {requestNumber ? (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                      {requestNumber}
                    </span>
                  ) : globalReceiptSearchMode ? (
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs text-blue-700">
                      Поиск по всем заявкам
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-3 p-4">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                    />
                    <Input
                      className="h-11 bg-white pl-10 text-[15px]"
                      placeholder={
                        requestNumber
                          ? 'Поиск по материалу, АПП, составу или документу'
                          : 'Начните вводить наименование, шифр, заявку, состав или документ'
                      }
                      value={receiptSearch}
                      onChange={(event) => setReceiptSearch(event.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <ReceiptListModeButton
                      active={receiptListMode === 'all'}
                      count={searchedReceiptWorkItems.length}
                      label="Все"
                      onClick={() => setReceiptListMode('all')}
                    />
                    <ReceiptListModeButton
                      active={receiptListMode === 'filled'}
                      count={filledReceiptRowsCount}
                      label="Заполненные"
                      onClick={() => setReceiptListMode('filled')}
                    />
                    <ReceiptListModeButton
                      active={receiptListMode === 'missing-document'}
                      count={missingInvoiceRowsCount}
                      label="Без документа"
                      tone="warning"
                      onClick={() => setReceiptListMode('missing-document')}
                    />
                    {step === 1 && (
                      <Button
                        className="ml-auto h-8"
                        variant="outline"
                        disabled={receiptTemplateWorkItems.length === 0}
                        onClick={() => setReceiptImportOpen(true)}
                      >
                        <FileInput size={16} />
                        Импорт Excel
                      </Button>
                    )}
                  </div>

                  {globalReceiptSearchMode &&
                  !receiptMaterialTypeFilter &&
                  receiptSearch.trim().length === 0 ? (
                    <OperationFormEmpty text="Выберите заявку на шаге «Реквизиты» или найдите материал по всем заявкам." />
                  ) : !globalReceiptSearchMode &&
                    selectedRequests.length === 0 ? (
                    <OperationFormEmpty text="Выберите заявку слева или очистите выбор и найдите материал через поиск." />
                  ) : visibleReceiptWorkItems.length > 0 ? (
                    <div className="grid gap-4">
                      {visibleReceiptWorkItems.map(
                        ({ key, request, receipt }) => {
                          const line = lineById.get(request.projectLineId)
                          const received =
                            (receiptByRequest.get(request.id) ?? 0) -
                            (receipt?.quantity ?? 0)
                          const rest = getReceiptRequestRest(
                            request,
                            receiptByRequest,
                            receipt,
                          )
                          const draft = drafts[key]
                          const draftQuantity = parsePositiveNumber(
                            draft?.quantity ?? '',
                          )
                          const exceedsReceiptRest =
                            draftQuantity > 0 && draftQuantity > rest
                          const overageApproved = isReceiptOverageApproved(
                            overageApprovals[key],
                            request.id,
                            draftQuantity,
                            rest,
                          )
                          const overageBlocked =
                            exceedsReceiptRest && !overageApproved
                          const currentActualName =
                            draft?.actualName ??
                            receipt?.actualName ??
                            request.projectMaterialName
                          const isReplacement =
                            normalizeSearchValue(currentActualName) !==
                            normalizeSearchValue(request.projectMaterialName)
                          const additionalCount =
                            [
                              draft?.factoryNumber,
                              draft?.manufacturer,
                              draft?.heatBatch,
                              draft?.customerArvk,
                              draft?.qualityDocument,
                              draft?.certificate,
                              draft?.technicalDecision,
                              draft?.note,
                            ].filter((value) => value?.trim()).length +
                            Number(isReplacement)
                          const progressTone = getMaterialProgressTone({
                            deleted: !line,
                            summary: summaryByLine.get(request.projectLineId),
                          })

                          return (
                            <div
                              key={key}
                              role="group"
                              aria-label={`Материал: ${request.projectMaterialName}`}
                              className={`overflow-hidden rounded-lg border transition-colors ${
                                overageBlocked
                                  ? 'border-rose-300 bg-rose-50/40'
                                  : progressTone.card
                              }`}
                            >
                              <div
                                className={`grid gap-4 border-b border-l-[6px] px-4 py-3.5 xl:grid-cols-[minmax(0,1fr)_360px] ${progressTone.header} ${progressTone.divider} ${
                                  isReplacement
                                    ? 'border-l-amber-300'
                                    : progressTone.leftBorder
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-[15px] font-normal leading-6 text-slate-900">
                                    {request.projectMaterialName}
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-blue-700">
                                      Заявка {request.number}
                                    </span>
                                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                                      Шифр {request.cipher}
                                    </span>
                                    <RequestMetaPill
                                      label="Нормативный документ"
                                      value={
                                        line?.normativeDocument ?? request.note
                                      }
                                    />
                                    {line?.material ? (
                                      <RequestMetaPill
                                        label="Состав"
                                        value={line.material}
                                      />
                                    ) : null}
                                    <RequestMetaPill
                                      label="Единица измерения"
                                      value={request.projectUnit}
                                    />
                                  </div>
                                </div>

                                <div
                                  className={`grid overflow-hidden rounded-lg border text-right sm:grid-cols-3 ${progressTone.metric}`}
                                >
                                  <RequestMetric label="По заявке">
                                    {formatQuantity(request.quantity)}{' '}
                                    {request.projectUnit}
                                  </RequestMetric>
                                  <RequestMetric label="Получено">
                                    {formatQuantity(Math.max(0, received))}{' '}
                                    {request.projectUnit}
                                  </RequestMetric>
                                  <RequestMetric
                                    tone={
                                      exceedsReceiptRest || rest <= 0
                                        ? 'warning'
                                        : 'default'
                                    }
                                    label="К получению"
                                  >
                                    {formatQuantity(rest)} {request.projectUnit}
                                  </RequestMetric>
                                </div>
                              </div>

                              <div className="bg-white px-4 py-4">
                                <div className="grid max-w-sm gap-3">
                                  <RequestLineInputField
                                    label={`Поступило, ${request.projectUnit}`}
                                  >
                                    <Input
                                      className="h-10 bg-white text-sm"
                                      aria-label={`Поступило: ${request.projectMaterialName}, ${receipt?.projectUnit ?? request.projectUnit}`}
                                      aria-invalid={overageBlocked}
                                      inputMode="decimal"
                                      placeholder={`Поступило, ${request.projectUnit}`}
                                      value={draft?.quantity ?? ''}
                                      onChange={(event) =>
                                        updateDraft(
                                          key,
                                          request,
                                          'quantity',
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </RequestLineInputField>
                                </div>
                                <AutomaticAlternative
                                  label="Поступило в альтернативной единице"
                                  baseUnit={
                                    receipt?.projectUnit ?? request.projectUnit
                                  }
                                  conversion={getReceiptConversion(
                                    request,
                                    receipt,
                                  )}
                                  value={getReceiptAlternative(
                                    request,
                                    receipt,
                                    parseNullableNumber(draft?.quantity ?? ''),
                                  )}
                                />

                                {isReplacement ? (
                                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                                    <span className="font-medium">
                                      Замена материала.
                                    </span>{' '}
                                    В заявке закрывается позиция “
                                    {request.projectMaterialName}”, фактически
                                    поступает “{currentActualName}”.
                                  </div>
                                ) : null}
                                {exceedsReceiptRest ? (
                                  <div
                                    className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm leading-6 ${
                                      overageApproved
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                        : 'border-rose-200 bg-rose-50 text-rose-900'
                                    }`}
                                  >
                                    <span
                                      role="status"
                                      className="min-w-0 flex-1 basis-64"
                                    >
                                      {overageApproved
                                        ? `Согласовано получение ${formatQuantity(draftQuantity)} ${request.projectUnit}, сверх остатка по заявке — ${formatQuantity(draftQuantity - rest)} ${request.projectUnit}.`
                                        : `По заявке доступно ${formatQuantity(rest)} ${request.projectUnit}. Превышение — ${formatQuantity(draftQuantity - rest)} ${request.projectUnit}. Для сохранения согласуйте получение сверх заявки.`}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="shrink-0"
                                      onClick={() =>
                                        setOverageApprovals((current) => ({
                                          ...current,
                                          [key]: overageApproved
                                            ? undefined
                                            : {
                                                requestId: request.id,
                                                quantity: draftQuantity,
                                                excessQuantity: Number(
                                                  (
                                                    draftQuantity - rest
                                                  ).toPrecision(15),
                                                ),
                                                approvedAt:
                                                  new Date().toISOString(),
                                              },
                                        }))
                                      }
                                    >
                                      {overageApproved
                                        ? 'Отменить согласование'
                                        : 'Согласовать превышение'}
                                    </Button>
                                  </div>
                                ) : null}

                                <div className="mt-3 border-t border-slate-200 pt-3">
                                  <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-600">
                                    <input
                                      type="checkbox"
                                      checked={ownDetailsKeys.has(key)}
                                      onChange={() =>
                                        toggleOwnDetails(key, request)
                                      }
                                    />
                                    Свои дата и документы
                                  </label>
                                  {ownDetailsKeys.has(key) ? (
                                    <fieldset className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3">
                                      <legend className="sr-only">
                                        Реквизиты материала
                                      </legend>
                                      <label className="grid max-w-xs gap-1 text-sm text-slate-600">
                                        Дата получения
                                        <DateInput
                                          aria-label="Дата получения"
                                          value={draft?.date ?? ''}
                                          onValueChange={(value) =>
                                            updateDraft(
                                              key,
                                              request,
                                              'date',
                                              value,
                                            )
                                          }
                                        />
                                      </label>
                                      <ReceiptDocumentInputs
                                        renderScan={scans.documentClip}
                                        fields={
                                          draft ?? emptyReceiptDocumentFields
                                        }
                                        documents={localDocuments}
                                        onChange={(fields) =>
                                          setDrafts((current) => ({
                                            ...current,
                                            [key]: {
                                              ...(current[key] ??
                                                emptyReceiptDraft()),
                                              ...fields,
                                            },
                                          }))
                                        }
                                      />
                                      {draftQuantity > 0 &&
                                      receiptDocumentError(
                                        draft ?? emptyReceiptDocumentFields,
                                      ) ? (
                                        <p
                                          role="alert"
                                          className="text-sm text-red-700"
                                        >
                                          {receiptDocumentError(
                                            draft ?? emptyReceiptDocumentFields,
                                          )}
                                        </p>
                                      ) : null}
                                    </fieldset>
                                  ) : null}
                                </div>
                                <details className="mt-3 border-t border-slate-200 pt-3">
                                  <summary
                                    className="cursor-pointer text-sm text-slate-600"
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter')
                                        event.stopPropagation()
                                    }}
                                  >
                                    Дополнительные сведения
                                    {additionalCount > 0
                                      ? ` · Заполнено: ${additionalCount}`
                                      : ''}
                                  </summary>
                                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="col-span-full">
                                      <RequestLineInputField label="Наименование ТМЦ по факту поступления">
                                        <Input
                                          className="h-10 bg-white text-sm"
                                          placeholder="Наименование ТМЦ по факту поступления"
                                          value={currentActualName}
                                          onChange={(event) =>
                                            updateDraft(
                                              key,
                                              request,
                                              'actualName',
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </RequestLineInputField>
                                    </div>
                                    <RequestLineInputField label="Заводской номер">
                                      <Input
                                        className="h-10 bg-white text-sm"
                                        placeholder="Заводской номер"
                                        value={draft?.factoryNumber ?? ''}
                                        onChange={(event) =>
                                          updateDraft(
                                            key,
                                            request,
                                            'factoryNumber',
                                            event.target.value,
                                          )
                                        }
                                      />
                                    </RequestLineInputField>
                                    <RequestLineInputField label="Завод-изготовитель">
                                      <Input
                                        className="h-10 bg-white text-sm"
                                        placeholder="Завод-изготовитель"
                                        value={draft?.manufacturer ?? ''}
                                        onChange={(event) =>
                                          updateDraft(
                                            key,
                                            request,
                                            'manufacturer',
                                            event.target.value,
                                          )
                                        }
                                      />
                                    </RequestLineInputField>
                                    <RequestLineInputField label="Партия плавки">
                                      <Input
                                        className="h-10 bg-white text-sm"
                                        placeholder="Партия плавки"
                                        value={draft?.heatBatch ?? ''}
                                        onChange={(event) =>
                                          updateDraft(
                                            key,
                                            request,
                                            'heatBatch',
                                            event.target.value,
                                          )
                                        }
                                      />
                                    </RequestLineInputField>
                                    <div className="flex min-w-0 items-start gap-1">
                                      <RequestLineInputField
                                        className="min-w-0 flex-1"
                                        label="АРВК заказчика"
                                      >
                                        <Input
                                          className="h-10 bg-white text-sm"
                                          placeholder="АРВК заказчика"
                                          value={draft?.customerArvk ?? ''}
                                          onChange={(event) =>
                                            updateDraft(
                                              key,
                                              request,
                                              'customerArvk',
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </RequestLineInputField>
                                      {scans.fieldClip(
                                        receiptId(key, receipt),
                                        'customerArvk',
                                        draft?.customerArvk ?? '',
                                        'АРВК заказчика',
                                      )}
                                    </div>
                                    <div className="flex min-w-0 items-start gap-1">
                                      <RequestLineInputField
                                        className="min-w-0 flex-1"
                                        label="Дата и номер документа о качестве"
                                      >
                                        <Input
                                          className="h-10 bg-white text-sm"
                                          placeholder="Дата и номер документа о качестве"
                                          value={draft?.qualityDocument ?? ''}
                                          onChange={(event) =>
                                            updateDraft(
                                              key,
                                              request,
                                              'qualityDocument',
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </RequestLineInputField>
                                      {scans.fieldClip(
                                        receiptId(key, receipt),
                                        'qualityDocument',
                                        draft?.qualityDocument ?? '',
                                        'Дата и номер документа о качестве',
                                      )}
                                    </div>
                                    <div className="flex min-w-0 items-start gap-1">
                                      <RequestLineInputField
                                        className="min-w-0 flex-1"
                                        label="Паспорт / сертификат"
                                      >
                                        <Input
                                          className="h-10 bg-white text-sm"
                                          placeholder="Паспорт / сертификат"
                                          value={draft?.certificate ?? ''}
                                          onChange={(event) =>
                                            updateDraft(
                                              key,
                                              request,
                                              'certificate',
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </RequestLineInputField>
                                      {scans.fieldClip(
                                        receiptId(key, receipt),
                                        'certificate',
                                        draft?.certificate ?? '',
                                        'Паспорт / сертификат',
                                      )}
                                    </div>
                                    <div className="flex min-w-0 items-start gap-1">
                                      <RequestLineInputField
                                        className="min-w-0 flex-1"
                                        label="Техническое решение / согласование"
                                      >
                                        <Input
                                          className="h-10 bg-white text-sm"
                                          placeholder="Техническое решение / согласование"
                                          value={draft?.technicalDecision ?? ''}
                                          onChange={(event) =>
                                            updateDraft(
                                              key,
                                              request,
                                              'technicalDecision',
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </RequestLineInputField>
                                      {scans.fieldClip(
                                        receiptId(key, receipt),
                                        'technicalDecision',
                                        draft?.technicalDecision ?? '',
                                        'Техническое решение / согласование',
                                      )}
                                    </div>
                                    <RequestLineInputField
                                      className="xl:col-span-4"
                                      label="Примечание"
                                    >
                                      <Input
                                        className="h-10 bg-white text-sm"
                                        placeholder="Примечание"
                                        value={draft?.note ?? ''}
                                        onChange={(event) =>
                                          updateDraft(
                                            key,
                                            request,
                                            'note',
                                            event.target.value,
                                          )
                                        }
                                      />
                                    </RequestLineInputField>
                                  </div>
                                </details>
                              </div>
                            </div>
                          )
                        },
                      )}
                      {hiddenReceiptWorkItemCount > 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-500">
                          Показано 180 позиций. Уточните поиск, чтобы сузить
                          список еще на {hiddenReceiptWorkItemCount}.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <OperationFormEmpty
                      text={
                        globalReceiptSearchMode
                          ? 'Поиск не нашел материалов в заявках.'
                          : 'По выбранной заявке позиций не найдено.'
                      }
                    />
                  )}
                </div>
              </section>
            </div>
            <ReceiptImportDialog
              draft={receiptImportDraft}
              fileName={receiptImportFileName}
              fileError={receiptImportError}
              fileNotice={receiptImportNotice}
              loading={receiptImportLoading}
              fileInputRef={importFileInputRef}
              open={receiptImportOpen}
              requestNumber={requestNumber}
              scopeCount={receiptTemplateWorkItems.length}
              onApply={applyReceiptImportDraft}
              onChooseFile={() => importFileInputRef.current?.click()}
              onClose={closeReceiptImport}
              onEdit={editReceiptImportRow}
              onDownloadTemplate={() => void downloadReceiptTemplate()}
              onFileChange={(file) => void parseReceiptImportFile(file)}
            />
          </OperationModalLayout>
        </fieldset>
      </>
    </Modal>
  )
}

type ReceiptWorkItem = {
  key: string
  receipt: MaterialReceiptEntry | null
  request: MaterialRequestEntry
}

function ReceiptRequestSearchPicker({
  options,
  selectedNumber,
  selectedOption,
  onClear,
  onSelect,
}: {
  options: Array<RequestGroupMeta>
  selectedNumber: string
  selectedOption: RequestGroupMeta | undefined
  onClear: () => void
  onSelect: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <AppSelect
        label="Заявка для получения"
        value={selectedNumber}
        onChange={(value) => (value ? onSelect(value) : onClear())}
        options={[
          { value: '', label: 'По всем заявкам' },
          ...options.map(({ group, materialType }) => ({
            value: group.number,
            label: `${group.number} · ${group.cipher} · ${materialType} · ${formatDate(group.date)}`,
          })),
        ]}
      />
      {selectedOption && (
        <p className="text-xs text-slate-500">
          {selectedOption.group.entries.length} позиций ·{' '}
          {selectedOption.group.cipher}
        </p>
      )}
    </div>
  )
}

function ReceiptImportDialog({
  draft,
  fileName,
  fileError,
  fileNotice,
  loading,
  fileInputRef,
  open,
  requestNumber,
  scopeCount,
  onApply,
  onChooseFile,
  onClose,
  onDownloadTemplate,
  onFileChange,
  onEdit,
}: {
  draft: MaterialReceiptImportDraft | null
  fileName: string
  fileError: string
  fileNotice: string
  loading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  open: boolean
  requestNumber: string
  scopeCount: number
  onApply: () => void
  onChooseFile: () => void
  onClose: () => void
  onDownloadTemplate: () => void
  onFileChange: (file: File) => void
  onEdit: (rowNumber: number, field: keyof ReceiptDraft, value: string) => void
}) {
  const gridRef = useRef<GridApi<{
    row: MaterialReceiptImportDraftRow
  }> | null>(null)

  if (!open) {
    return null
  }

  const canApply = Boolean(
    draft &&
    draft.summary.ready > 0 &&
    draft.summary.errors === 0 &&
    !loading &&
    !fileError,
  )

  return (
    <EscapeLayer onEscape={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Импорт получения из Excel"
        className="fixed inset-0 z-[80] grid place-items-center bg-stone-950/35 px-4 py-6"
      >
        <div className="flex h-[min(820px,calc(100vh-2rem))] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">
                Импорт получения из Excel
              </h3>
            </div>
            <button
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>

          <div className="grid gap-4 overflow-auto px-5 py-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                <span className="rounded-md bg-white px-2.5 py-1 text-slate-700 ring-1 ring-slate-200">
                  Область:{' '}
                  {requestNumber
                    ? `заявка ${requestNumber}`
                    : 'найденные позиции'}
                </span>
                <span className="rounded-md bg-white px-2.5 py-1 text-slate-700 ring-1 ring-slate-200">
                  Позиций в шаблоне: {scopeCount}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={onDownloadTemplate}>
                  <Download size={16} /> Скачать шаблон
                </Button>
                <Button onClick={onChooseFile}>
                  <FileInput size={16} />
                  {draft ? 'Загрузить исправленный файл' : 'Загрузить файл'}
                </Button>
                <span
                  className="break-all text-sm text-slate-600"
                  role="status"
                >
                  {loading ? 'Чтение файла…' : fileName}
                </span>
              </div>
              {draft ? (
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Новый файл заменит черновик и правки в таблице.
                </p>
              ) : null}
              {fileNotice ? (
                <p role="status" className="mt-2 text-sm text-amber-700">
                  {fileNotice}
                </p>
              ) : null}
              {fileError ? (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {fileError}
                </p>
              ) : null}
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => {
                  const file = event.target.files?.[0]

                  if (file) {
                    const grid = gridRef.current
                    if (grid && !grid.isDestroyed()) grid.stopEditing(true)
                    onFileChange(file)
                  }

                  event.currentTarget.value = ''
                }}
              />
            </div>

            {draft ? (
              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <RequestImportMetric
                    label="Позиций в файле"
                    value={draft.summary.total}
                  />
                  <RequestImportMetric
                    label="Готово к импорту"
                    value={draft.summary.ready}
                  />
                  <RequestImportMetric
                    label="Пропущено"
                    value={draft.summary.ignored}
                  />
                  <RequestImportMetric
                    label="Ошибки"
                    tone={draft.summary.errors > 0 ? 'danger' : 'default'}
                    value={draft.summary.errors}
                  />
                </div>

                <div className="min-w-0 rounded-xl border border-slate-200">
                  <OperationsGrid
                    id={'receipt-import'}
                    label={'Проверка импорта получения'}
                    rows={[
                      ...draft.rows.map((row) => {
                        return { row }
                      }),
                    ]}
                    rowId={({ row }) =>
                      `${row.row.rowNumber}-${row.row.requestId}`
                    }
                    onReady={(api) => {
                      gridRef.current = api
                    }}
                    columns={[
                      {
                        id: 'row',
                        title: '№ в файле',
                        value: ({ row }) => row.row.rowNumber,
                        numeric: true,
                        width: 120,
                        render: ({ row }) => <>{row.row.rowNumber}</>,
                      },
                      {
                        id: 'name',
                        title: 'Наименование по проекту',
                        value: ({ row }) =>
                          row.request?.projectMaterialName ||
                          row.row.projectMaterialName ||
                          '',
                        width: 400,
                        render: ({ row }) => (
                          <>
                            {row.request?.projectMaterialName ||
                              row.row.projectMaterialName ||
                              '-'}
                            {row.errors.length > 0 ? (
                              <div className="mt-1 text-xs leading-5 text-red-600">
                                {row.errors.join(' ')}
                              </div>
                            ) : null}
                          </>
                        ),
                      },
                      {
                        id: 'actualName',
                        title: 'Материал',
                        value: ({ row }) => row.row.actualName,
                        onEdit: ({ row }, value) =>
                          onEdit(row.row.rowNumber, 'actualName', value),
                        width: 300,
                        render: ({ row }) => <>{row.row.actualName || '-'}</>,
                      },
                      {
                        id: 'quantity',
                        title: 'Поступило',
                        value: ({ row }) => row.row.quantity,
                        onEdit: ({ row }, value) =>
                          onEdit(row.row.rowNumber, 'quantity', value),
                        validateEdit: (value) =>
                          value.trim() && parseNullableNumber(value) === null
                            ? 'Введите число, например 2,5.'
                            : null,
                        numeric: true,
                        render: ({ row }) => (
                          <>
                            {row.row.quantity === null
                              ? '-'
                              : formatQuantity(row.row.quantity)}
                          </>
                        ),
                      },
                      {
                        id: 'unit',
                        title: 'Единица измерения проекта',
                        value: ({ row }) =>
                          row.request?.projectUnit || row.row.unit,
                        render: ({ row }) => (
                          <>{row.request?.projectUnit || row.row.unit || '-'}</>
                        ),
                      },
                      {
                        id: 'date',
                        date: true,
                        title: 'Дата поступления',
                        value: ({ row }) =>
                          row.status === 'ignored'
                            ? row.row.date
                            : row.draft.date,
                        onEdit: ({ row }, value) =>
                          onEdit(row.row.rowNumber, 'date', value),
                        render: ({ row }) => (
                          <>
                            {row.status === 'ignored'
                              ? '-'
                              : formatDate(row.draft.date)}
                          </>
                        ),
                      },
                      ...(['appNumber', 'appDate'] as const).map((field) => ({
                        id: field,
                        date: field.endsWith('Date'),
                        title: {
                          appNumber: 'Номер АПП',
                          appDate: 'Дата АПП',
                          m15Number: 'Номер М-15',
                          m15Date: 'Дата М-15',
                        }[field],
                        value: ({
                          row,
                        }: {
                          row: MaterialReceiptImportDraftRow
                        }) => row.row[field],
                        onEdit: (
                          { row }: { row: MaterialReceiptImportDraftRow },
                          value: string,
                        ) =>
                          onEdit(
                            row.row.rowNumber,
                            field,
                            field.endsWith('Date')
                              ? (normalizeCalendarDate(value) ?? value)
                              : value,
                          ),
                        render: ({
                          row,
                        }: {
                          row: MaterialReceiptImportDraftRow
                        }) => (
                          <>
                            {field.endsWith('Date')
                              ? formatDate(row.row[field])
                              : row.row[field] || '-'}
                          </>
                        ),
                      })),
                      {
                        id: 'manufacturer',
                        title: 'Завод-изготовитель',
                        value: ({ row }) => row.row.manufacturer,
                        onEdit: ({ row }, value) =>
                          onEdit(row.row.rowNumber, 'manufacturer', value),
                        render: ({ row }) => <>{row.row.manufacturer || '-'}</>,
                      },
                      {
                        id: 'heatBatch',
                        title: 'Партия плавки',
                        value: ({ row }) => row.row.heatBatch,
                        onEdit: ({ row }, value) =>
                          onEdit(row.row.rowNumber, 'heatBatch', value),
                        render: ({ row }) => <>{row.row.heatBatch || '-'}</>,
                      },
                      {
                        id: 'note',
                        title: 'Примечание',
                        value: ({ row }) => row.row.note,
                        onEdit: ({ row }, value) =>
                          onEdit(row.row.rowNumber, 'note', value),
                        render: ({ row }) => <>{row.row.note || '-'}</>,
                      },
                      ...(
                        [
                          ['factoryNumber', 'Заводской номер'],
                          ['certificate', 'Паспорт / сертификат'],
                          ['qualityDocument', 'Документ о качестве'],
                          ['customerArvk', 'АРВК Заказчика'],
                          [
                            'technicalDecision',
                            'Техническое решение (согласование замены)',
                          ],
                        ] as const
                      ).map(([field, title]) => ({
                        id: field,
                        title,
                        value: ({
                          row,
                        }: {
                          row: MaterialReceiptImportDraftRow
                        }) => row.row[field],
                        onEdit: (
                          { row }: { row: MaterialReceiptImportDraftRow },
                          value: string,
                        ) => onEdit(row.row.rowNumber, field, value),
                      })),
                      {
                        id: 'status',
                        title: 'Статус',
                        value: ({ row }) =>
                          row.status === 'ready'
                            ? 'Готово'
                            : row.status === 'error'
                              ? 'Ошибка'
                              : 'Пустая позиция',
                        render: ({ row }) => (
                          <>
                            <span
                              className={`inline-flex rounded-md px-2 py-1 text-xs ${
                                row.status === 'ready'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : row.status === 'error'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {row.status === 'ready'
                                ? 'Готово'
                                : row.status === 'error'
                                  ? 'Ошибка'
                                  : 'Пустая позиция'}
                            </span>
                          </>
                        ),
                      },
                    ]}
                  />
                </div>
              </div>
            ) : (
              <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                <div className="max-w-xl">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm">
                    <FileSpreadsheet size={24} />
                  </div>
                  <div className="mt-4 text-base font-medium text-slate-950">
                    Черновик импорта еще не создан
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button
              disabled={!canApply}
              onClick={() => {
                const grid = gridRef.current
                if (grid && !grid.isDestroyed()) {
                  grid.stopEditing()
                  if (grid.getEditingCells().length > 0) return
                }
                onApply()
              }}
            >
              Применить импорт
            </Button>
          </div>
        </div>
      </div>
    </EscapeLayer>
  )
}

function IssueModal({
  workflow,
  lineById,
  issues,
  open,
  qualityControls,
  receipts,
  requests,
  onClose,
  onSubmit,
}: {
  workflow?: QualityWorkflow
  lineById: Map<string, SubobjectMaterialMetric>
  issues: Array<MaterialIssueEntry>
  open: boolean
  qualityControls: Array<InspectionApproval>
  receipts: Array<MaterialReceiptEntry>
  requests: Array<MaterialRequestEntry>
  onClose: () => void
  onSubmit: (entries: Array<MaterialIssueEntry>) => void
}) {
  const [step, setStep] = useState(0)
  const accounting = useProjectAccounting()
  const suggestNumber = useDocumentNumber()
  const [drafts, setDrafts] = useState<Record<string, IssueDraft>>({})
  const draftsRef = useRef(drafts)
  const gridRef = useRef<GridApi<IssueTableRow> | null>(null)
  const submitting = useRef(false)
  const initialized = useRef(false)
  const [manualNumber, setManualNumber] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [receiver, setReceiver] = useState('')
  const [reason, setReason] = useState('')
  const [search, setSearch] = useState('')
  const [cipher, setCipher] = useState('')
  const [materialType, setMaterialType] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!open) {
      initialized.current = false
      return
    }
    if (initialized.current) return
    initialized.current = true
    draftsRef.current = {}
    setStep(0)
    setDrafts({})
    setManualNumber(null)
    setDate(localDateInputValue())
    setReceiver('')
    setReason('')
    setSearch('')
    setCipher('')
    setMaterialType('')
    setOnlySelected(false)
    setSubmitError('')
    submitting.current = false
  }, [open, suggestNumber])

  const candidates = useMemo(() => {
    if (!open) return []
    const availability = issueAvailability(
      {
        materialReceipts: receipts,
        materialRequests: requests,
        qualityWorkflow: workflow,
        materialIssues: issues,
      },
      date,
    )
    const requestById = new Map(
      requests.map((request) => [request.id, request]),
    )
    const documentById = indexReceiptDocuments(workflow)
    const approvals = new Map<string, Array<InspectionApproval>>()
    for (const approval of qualityControls) {
      const rows = approvals.get(approval.receiptId) ?? []
      rows.push(approval)
      approvals.set(approval.receiptId, rows)
    }
    const assigned = availableAssignedStock(
      {
        materialReceipts: receipts,
        materialIssues: issues,
        qualityWorkflow: workflow,
        stockTransfers: accounting.stockTransfers,
      },
      date,
    )
    const ownersByReceipt = new Map<
      string,
      Array<typeof assigned extends Map<string, infer V> ? V : never>
    >()
    for (const owner of assigned.values()) {
      const owners = ownersByReceipt.get(owner.receiptId) ?? []
      owners.push(owner)
      ownersByReceipt.set(owner.receiptId, owners)
    }
    const transferredReceipts = new Set(
      accounting.stockTransfers?.map((item) => item.receiptId),
    )
    const ownedReceipts = receipts.flatMap((receipt) => {
      const owners = transferredReceipts.has(receipt.id)
        ? (ownersByReceipt.get(receipt.id) ?? [])
        : []
      return owners.length
        ? owners.map((owner) => ({
            ...receipt,
            projectLineId: owner.projectLineId,
          }))
        : [receipt]
    })
    return ownedReceipts.map((receipt) => {
      const owner = assigned.get(
        stockAssignmentKey(receipt.id, receipt.projectLineId),
      )
      const ownership = transferredReceipts.has(receipt.id)
      const root = availability.get(receipt.id)

      const line = lineById.get(receipt.projectLineId)
      const request = requestById.get(receipt.requestId)
      const controls = approvals.get(receipt.id) ?? []
      const documents = receiptDocumentCoverage(receipt, workflow, documentById)
        .map(receiptDocumentCoverageLabel)
        .join(' ')
      const name = receipt.actualName || line?.projectMaterialName || '—'
      const cipherValue = line?.cipher || request?.cipher || ''
      const type = request?.materialType || line?.materialType || ''
      const avk = unique(controls.map((item) => item.arvkNumber)).join('; ')
      const zni = unique(controls.map((item) => item.zniNumber)).join('; ')
      return {
        key: ownership
          ? stockAssignmentKey(receipt.id, receipt.projectLineId)
          : receipt.id,
        receipt,
        name,
        cipher: cipherValue,
        materialType: type,
        documents,
        avk,
        zni,
        requestNumber: request?.number || '',
        available: ownership
          ? Math.min(root?.available ?? 0, owner?.available ?? 0)
          : (root?.available ?? 0),
        approvedAvailable: ownership
          ? Math.min(root?.approved ?? 0, owner?.availableApproved ?? 0)
          : (root?.approved ?? 0),
        conversion: getOperationConversion(line, receipt.projectUnit, receipt),
        searchText: normalizeSearchValue(
          [
            name,
            cipherValue,
            type,
            documents,
            avk,
            zni,
            request?.number,
            receipt.factoryNumber,
            receipt.heatBatch,
            receipt.certificate,
            receipt.manufacturer,
            receipt.qualityDocument,
            line?.normativeDocument,
          ].join(' '),
        ),
      }
    })
  }, [
    open,
    date,
    receipts,
    workflow,
    qualityControls,
    issues,
    requests,
    lineById,
    accounting.stockTransfers,
  ])

  function buildRows(values: Record<string, IssueDraft>): Array<IssueTableRow> {
    return candidates
      .map((candidate) => {
        const draft = values[candidate.key]
        const quantity = draft?.quantity ?? ''
        const parsed = parseNullableNumber(quantity)
        const selected = Boolean(quantity.trim())
        const alternative = getOperationAlternative(
          selected && parsed !== null && parsed > 0 ? parsed : null,
          candidate.conversion,
        )
        const error = !selected
          ? ''
          : parsed === null || parsed <= 0
            ? 'Введите положительное количество.'
            : parsed > candidate.available
              ? `К выдаче доступно только ${formatQuantity(candidate.available)} ${candidate.receipt.projectUnit}.`
              : alternative.error || ''
        return {
          ...candidate,
          quantity,
          note: draft?.note ?? '',
          selected,
          error,
          alternative:
            alternative.altQuantity === null
              ? '—'
              : `${formatQuantity(alternative.altQuantity)} ${alternative.altUnit}`,
        }
      })
      .filter((row) => row.available > 0 || row.selected)
  }
  const rows = buildRows(drafts)
  const selectedRows = rows.filter((row) => row.selected)
  const documentNumber =
    manualNumber ??
    suggestNumber('issue', { date, ...materialNumberContext(selectedRows) })
  const tokens = normalizeSearchValue(search).split(/\s+/).filter(Boolean)
  const visibleRows = onlySelected
    ? selectedRows
    : rows.filter(
        (row) =>
          tokens.every((token) => row.searchText.includes(token)) &&
          normalizeSearchValue(row.cipher).includes(
            normalizeSearchValue(cipher),
          ) &&
          normalizeSearchValue(row.materialType).includes(
            normalizeSearchValue(materialType),
          ),
      )
  const selectedTotals = formatUnitTotals(
    selectedRows.map((row) => ({
      quantity: parsePositiveNumber(row.quantity),
      unit: row.receipt.projectUnit,
    })),
  )
  const errorCount = selectedRows.filter((row) => row.error).length
  const earlyRows = selectedRows.flatMap((row) => {
    if (row.error) return []
    const amount = allocateIssue(
      parsePositiveNumber(row.quantity),
      row.approvedAvailable,
    ).beforeInspection
    return amount > 0
      ? [{ quantity: amount, unit: row.receipt.projectUnit }]
      : []
  })

  function updateDraft(
    receiptId: string,
    key: keyof IssueDraft,
    value: string,
  ) {
    const current = draftsRef.current
    const next = {
      ...current,
      [receiptId]: {
        quantity: '',
        note: '',
        ...current[receiptId],
        [key]: value,
      },
    }
    draftsRef.current = next
    setDrafts(next)
    setSubmitError('')
  }

  function stopEditing() {
    const grid = gridRef.current
    if (grid && !grid.isDestroyed()) {
      grid.stopEditing()
      return grid.getEditingCells().length === 0
    }
    return true
  }

  function submit() {
    if (submitting.current || !stopEditing()) return
    const selected = buildRows(draftsRef.current).filter((row) => row.selected)
    if (!selected.length) {
      setSubmitError('Укажите количество хотя бы у одного материала.')
      return
    }
    if (
      selected.some((row) => row.error) ||
      Object.entries(draftsRef.current).some(
        ([id, draft]) =>
          draft.quantity.trim() && !candidates.some((row) => row.key === id),
      )
    ) {
      setSubmitError(
        'Проверьте выбранные позиции: количество должно быть положительным и не превышать доступный остаток.',
      )
      return
    }
    if (
      !documentNumber.trim() ||
      !date ||
      normalizeCalendarDate(date) !== date
    ) {
      setSubmitError(
        'Укажите номер документа передачи и корректную дату выдачи.',
      )
      return
    }
    const needsReason = selected.some(
      (row) =>
        allocateIssue(parsePositiveNumber(row.quantity), row.approvedAvailable)
          .beforeInspection > 0,
    )
    if (needsReason && (!reason.trim() || !receiver.trim())) {
      setSubmitError('Укажите получателя и причину выдачи до ВК.')
      return
    }
    const entries = selected.flatMap(
      ({ receipt, quantity, approvedAvailable, conversion, note }) => {
        const allocation = allocateIssue(
          parsePositiveNumber(quantity),
          approvedAvailable,
        )
        return [
          { amount: allocation.approved, early: false },
          { amount: allocation.beforeInspection, early: true },
        ]
          .filter(({ amount }) => amount > 0)
          .map(({ amount, early }) => {
            const alternative = getOperationAlternative(amount, conversion)
            return {
              altQuantity: alternative.altQuantity,
              altUnit: alternative.altUnit,
              altUnitFactor: alternative.altUnitFactor,
              projectUnit: receipt.projectUnit,
              date,
              document: documentNumber.trim(),
              id: createClientId('issue'),
              note: note.trim(),
              projectLineId: receipt.projectLineId,
              quantity: amount,
              receiptId: receipt.id,
              receiver: receiver.trim(),
              ...(early ? { beforeInspection: { reason: reason.trim() } } : {}),
            } satisfies MaterialIssueEntry
          })
      },
    )
    try {
      const previous = {
        stockTransfers: accounting.stockTransfers,
        qualityWorkflow: workflow,
        materialReceipts: receipts,
        materialRequests: requests,
        materialIssues: issues,
      }
      validateQualityWorkspace(
        { ...previous, materialIssues: [...entries, ...issues] },
        previous,
      )
      submitting.current = true
      onSubmit(entries)
    } catch (error) {
      submitting.current = false
      setSubmitError(
        error instanceof Error ? error.message : 'Не удалось оформить выдачу.',
      )
    }
  }

  function advance(next: number) {
    if (!stopEditing()) return
    setSubmitError('')
    if (next > step && (!date || !receiver.trim() || !documentNumber.trim())) {
      setSubmitError('Укажите дату, документ и получателя.')
      return
    }
    if (next === 2 && (!selectedRows.length || errorCount)) {
      setSubmitError('Выберите материалы и исправьте количества.')
      return
    }
    if (next === 2) {
      const grid = gridRef.current
      if (grid && !grid.isDestroyed()) grid.setFilterModel(null)
      setOnlySelected(true)
    }
    if (next === 1) setOnlySelected(false)
    setStep(next)
  }
  return (
    <Modal
      open={open}
      size="xl"
      title="Выдача в монтаж"
      onClose={onClose}
      steps={<WorkflowSteps step={step} onStep={advance} />}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50/60 px-5 py-4">
          <div
            className="text-sm text-slate-700"
            role="status"
            aria-label="Итог выдачи"
          >
            К выдаче: {selectedRows.length} позиций
            {selectedRows.length > 0 ? ` · ${selectedTotals}` : ''}
            {errorCount > 0 ? ` · С ошибками: ${errorCount}` : ''}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => (step ? advance(step - 1) : onClose())}
            >
              {step ? 'Назад' : 'Отмена'}
            </Button>
            <Button onClick={() => (step < 2 ? advance(step + 1) : submit())}>
              {step < 2 ? 'Далее' : 'Сохранить выдачу'}
            </Button>
          </div>
        </div>
      }
    >
      <EscapeFilters
        active={!!(search || cipher || materialType || onlySelected)}
        onReset={() => {
          setSearch('')
          setCipher('')
          setMaterialType('')
          setOnlySelected(false)
        }}
      />
      <div
        className={`issue-wizard-step-${step} grid gap-4`}
        onKeyDownCapture={(event) => {
          const grid = gridRef.current
          if (
            event.key === 'Escape' &&
            grid &&
            !grid.isDestroyed() &&
            grid.getEditingCells().length > 0
          ) {
            grid.stopEditing(true)
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        {earlyRows.length > 0 && (
          <div className="grid gap-3 rounded-md bg-amber-50 p-3">
            <p
              role="status"
              aria-label="Выдача до ВК"
              className="text-sm text-amber-900"
            >
              До ВК будет выдано: {formatUnitTotals(earlyRows)}. Входной
              контроль остаётся незавершённым.
            </p>
            <Field label="Причина выдачи до ВК">
              <Input
                aria-label="Причина выдачи до ВК"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </div>
        )}
        <div className="issue-wizard-details grid gap-3 md:grid-cols-3">
          <Field label="Документ передачи">
            <Input
              aria-label="Документ передачи"
              value={documentNumber}
              onChange={(event) => setManualNumber(event.target.value)}
            />
          </Field>
          <Field label="Дата выдачи">
            <DateInput
              aria-label="Дата выдачи"
              value={date}
              onValueChange={(value) => setDate(value)}
            />
          </Field>
          <Field label="Получатель">
            <Input
              aria-label="Получатель"
              value={receiver}
              onChange={(event) => setReceiver(event.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button
              variant={onlySelected ? 'outline' : 'secondary'}
              aria-pressed={!onlySelected}
              onClick={() => {
                if (!stopEditing()) return
                setOnlySelected(false)
              }}
            >
              Доступные материалы
            </Button>
            <Button
              variant={onlySelected ? 'secondary' : 'outline'}
              aria-pressed={onlySelected}
              onClick={() => {
                if (!stopEditing()) return
                const grid = gridRef.current
                if (grid && !grid.isDestroyed()) grid.setFilterModel(null)
                setOnlySelected(true)
              }}
            >
              Только выбранные ({selectedRows.length})
            </Button>
          </div>
          <span className="text-xs text-slate-500">
            {onlySelected
              ? `Выбрано ${selectedRows.length} позиций`
              : `Найдено ${visibleRows.length} из ${rows.length} поступлений`}
          </span>
        </div>
        {!onlySelected ? (
          <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr]">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <Input
                className="h-11 pl-9"
                aria-label="Поиск материалов для выдачи"
                placeholder="Материал, шифр, АПП, АВК, ЗНИ или партия"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <FilterAutocompleteInput
              placeholder="Шифр для выдачи"
              options={rows.map((row) => row.cipher)}
              value={cipher}
              onChange={setCipher}
            />
            <FilterAutocompleteInput
              placeholder="Тип материала для выдачи"
              options={rows.map((row) => row.materialType)}
              value={materialType}
              onChange={setMaterialType}
            />
          </div>
        ) : null}
        {submitError ? (
          <p role="alert" className="text-sm text-rose-700">
            {submitError}
          </p>
        ) : null}
        {errorCount > 0 ? (
          <p role="alert" className="text-sm text-rose-700">
            Исправьте количество в выбранных позициях с ошибками: {errorCount}.
            Они сохраняются в списке «Только выбранные», даже если скрыты
            поиском.
          </p>
        ) : null}
        {rows.length === 0 ? (
          <OperationFormEmpty text="Нет доступного остатка на выбранную дату." />
        ) : (
          <OperationsGrid<IssueTableRow>
            id="issue-selection"
            label="Материалы для выдачи"
            rows={visibleRows}
            rowId={(row) => row.key}
            pagination
            paginationFilterKey={JSON.stringify([
              onlySelected,
              search,
              cipher,
              materialType,
            ])}
            onReady={(api) => {
              gridRef.current = api
              api.setFilterModel(null)
              api.paginationGoToFirstPage()
            }}
            columns={[
              {
                id: 'name',
                title: 'Материал',
                width: 360,
                value: (row) => row.name,
                render: (row) => (
                  <div>
                    {row.name}
                    <p className="mt-1 text-xs text-slate-500">
                      {[
                        row.documents,
                        row.avk ? `АВК ${row.avk}` : '',
                        row.receipt.heatBatch
                          ? `Партия ${row.receipt.heatBatch}`
                          : '',
                        row.receipt.factoryNumber
                          ? `Зав. № ${row.receipt.factoryNumber}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {row.error ? (
                      <p className="mt-1 text-xs text-rose-700">{row.error}</p>
                    ) : null}
                  </div>
                ),
              },
              {
                id: 'cipher',
                title: 'Шифр',
                width: 170,
                value: (row) => row.cipher,
              },
              {
                id: 'available',
                title: 'Доступно',
                width: 120,
                numeric: true,
                centered: true,
                value: (row) => row.available,
              },
              {
                id: 'control',
                title: 'Входной контроль',
                width: 220,
                value: (row) =>
                  row.approvedAvailable >= row.available
                    ? 'АВК подписан'
                    : row.approvedAvailable > 0
                      ? `АВК на ${formatQuantity(row.approvedAvailable)} ${row.receipt.projectUnit}`
                      : 'До ВК',
                render: (row) => {
                  const allocation = allocateIssue(
                    parsePositiveNumber(row.quantity),
                    row.approvedAvailable,
                  )
                  return (
                    <div>
                      <span
                        className={
                          row.approvedAvailable >= row.available
                            ? 'text-emerald-700'
                            : 'text-amber-800'
                        }
                      >
                        {row.approvedAvailable >= row.available
                          ? 'АВК подписан'
                          : row.approvedAvailable > 0
                            ? `АВК на ${formatQuantity(row.approvedAvailable)} ${row.receipt.projectUnit}`
                            : 'До ВК'}
                      </span>
                      {row.selected &&
                        !row.error &&
                        allocation.beforeInspection > 0 && (
                          <p className="mt-1 text-xs text-amber-800">
                            {allocation.approved > 0
                              ? `По АВК: ${formatQuantity(allocation.approved)} · `
                              : ''}
                            До ВК: {formatQuantity(allocation.beforeInspection)}{' '}
                            {row.receipt.projectUnit}
                          </p>
                        )}
                    </div>
                  )
                },
              },
              {
                id: 'quantity',
                title: 'Выдать',
                width: 120,
                numeric: true,
                centered: true,
                value: (row) =>
                  parseNullableNumber(row.quantity) ?? row.quantity,
                onEdit: (row, value) => updateDraft(row.key, 'quantity', value),
              },
              {
                id: 'unit',
                title: 'Ед.',
                width: 100,
                centered: true,
                value: (row) => row.receipt.projectUnit,
              },
              {
                id: 'alternative',
                title: 'Альтернативно',
                width: 150,
                centered: true,
                value: (row) => row.alternative,
              },
              {
                id: 'documents',
                title: 'Документы поступления',
                width: 280,
                value: (row) => row.documents,
              },
              { id: 'avk', title: 'АВК', width: 150, value: (row) => row.avk },
              { id: 'zni', title: 'ЗНИ', width: 120, value: (row) => row.zni },
              {
                id: 'receiptDate',
                date: true,
                title: 'Дата поступления',
                value: (row) => row.receipt.date,
              },
              {
                id: 'batch',
                title: 'Партия / заводской номер',
                value: (row) =>
                  [row.receipt.heatBatch, row.receipt.factoryNumber]
                    .filter(Boolean)
                    .join(' / '),
              },
              {
                id: 'certificate',
                title: 'Паспорт / сертификат',
                value: (row) => row.receipt.certificate,
              },
              {
                id: 'request',
                title: 'Заявка',
                value: (row) => row.requestNumber,
              },
              {
                id: 'type',
                title: 'Тип материала',
                value: (row) => row.materialType,
              },
              {
                id: 'note',
                title: 'Примечание',
                value: (row) => row.note,
                onEdit: (row, value) => updateDraft(row.key, 'note', value),
              },
              {
                id: 'actions',
                title: 'Выбор',
                actions: true,
                width: 190,
                value: () => '',
                render: (row) => (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={row.available <= 0}
                      aria-label={`Весь остаток: ${row.name}`}
                      onClick={() => {
                        if (stopEditing())
                          updateDraft(
                            row.key,
                            'quantity',
                            String(row.available),
                          )
                      }}
                    >
                      Весь остаток
                    </Button>
                    {row.selected ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Убрать из выдачи: ${row.name}`}
                        onClick={() => {
                          if (stopEditing())
                            updateDraft(row.key, 'quantity', '')
                        }}
                      >
                        <X size={15} />
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        )}
        {rows.length > 0 && visibleRows.length === 0 ? (
          <p className="text-sm text-slate-500">
            {onlySelected
              ? 'Выберите материалы, указав количество к выдаче.'
              : 'Материалы по этому запросу не найдены. Измените поиск или фильтры.'}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

type IssueTableRow = {
  key: string
  receipt: MaterialReceiptEntry
  name: string
  cipher: string
  materialType: string
  documents: string
  avk: string
  zni: string
  requestNumber: string
  available: number
  approvedAvailable: number
  conversion: ReturnType<typeof getOperationConversion>
  searchText: string
  quantity: string
  note: string
  selected: boolean
  error: string
  alternative: string
}

function OperationModalLayout({
  children,
  footerStart,
  hideFooter = false,
  primaryDisabled,
  primaryLabel,
  onCancel,
  onSubmit,
}: {
  children: React.ReactNode
  footerStart?: React.ReactNode
  hideFooter?: boolean
  primaryDisabled: boolean
  primaryLabel: string
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="grid gap-5">
      {children}
      {hideFooter ? null : (
        <div className="-mx-5 -mb-5 mt-1">
          <OperationModalFooter
            footerStart={footerStart}
            primaryDisabled={primaryDisabled}
            primaryLabel={primaryLabel}
            onCancel={onCancel}
            onSubmit={onSubmit}
          />
        </div>
      )}
    </div>
  )
}

function OperationModalFooter({
  footerStart,
  cancelLabel = 'Отмена',
  primaryDisabled,
  primaryLabel,
  onCancel,
  onSubmit,
}: {
  footerStart?: React.ReactNode
  cancelLabel?: string
  primaryDisabled: boolean
  primaryLabel: string
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-4">
      <div>{footerStart}</div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button disabled={primaryDisabled} onClick={onSubmit}>
          {primaryLabel}
        </Button>
      </div>
    </div>
  )
}

function OperationFormEmpty({ text }: { text: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-6 py-8 text-center text-sm text-stone-500">
      {text}
    </div>
  )
}

type OperationLineSummary = MaterialProgress & { requestBalance: number }
type OperationSummary = { byLine: Map<string, OperationLineSummary> }
type OperationOverviewDocument = {
  date: string
  id: string
  label: string
  quantity: number
  replacement?: boolean
  replacementActualName?: string
  replacementOriginalName?: string
}
type OperationOverviewMetric = {
  documents: Array<OperationOverviewDocument>
  quantity: number
}
type OperationOverviewMetrics = {
  issues: OperationOverviewMetric
  quality: OperationOverviewMetric
  receipts: OperationOverviewMetric
  requests: OperationOverviewMetric
}
type OperationOverviewCipherRow = {
  m15Quantity: number
  indicators: OverviewIndicators
  cipher: string
  lineId: string
  metrics: OperationOverviewMetrics
  projectQuantity: number
}
type OperationOverviewRow = {
  totalM15Quantity: number
  indicators: OverviewIndicators
  ciphers: Array<OperationOverviewCipherRow>
  deleted: boolean
  key: string
  latestActivityTime: number
  material: string
  materialId: string
  materialType: string
  normativeDocument: string
  projectMaterialName: string
  totalProjectQuantity: number
  remainingProjectQuantity: number
  totals: OperationOverviewMetrics
  unit: string
  unitWeight: number | null
}
type DeletedOperationLineDescriptor = {
  cipher: string
  lineId: string
  materialId: string
  projectMaterialName: string
  unit: string
}
type ReceiptDeliveryDetails = ReceiptDocumentFields & { date: string }

function sameReceiptDeliveryDetails(
  left: ReceiptDeliveryDetails,
  right: ReceiptDeliveryDetails,
) {
  return (
    left.date === right.date &&
    left.appNumber.trim() === right.appNumber.trim() &&
    (!left.appNumber.trim() || left.appDate === right.appDate) &&
    left.m15Number.trim() === right.m15Number.trim() &&
    (!left.m15Number.trim() || left.m15Date === right.m15Date)
  )
}

type ReceiptDraft = ReceiptDeliveryDetails & {
  actualName: string
  certificate: string
  customerArvk: string
  factoryNumber: string
  heatBatch: string
  manufacturer: string
  note: string
  qualityDocument: string
  quantity: string
  technicalDecision: string
}
type IssueDraft = {
  note: string
  quantity: string
}
type RequestDraft = {
  note: string
  quantity: string
  sourceCipher: string
  sourceQuantity: number | null
}
type OverRequestState = {
  available: number
  line: SubobjectMaterialMetric
  lineId: string
  quantity: number
  shortage: number
}

function buildOperationSummary({
  qualityWorkflow,
  projectChanges,
  stockTransfers,
  materialIssues,
  lines,
  materialReceipts,
  materialRequests,
  qualityControls,
}: {
  qualityWorkflow?: QualityWorkflow
  projectChanges?: ProjectChange[]
  stockTransfers?: StockTransfer[]
  lines: Array<SubobjectMaterialMetric>
  materialIssues: Array<MaterialIssueEntry>
  materialReceipts: Array<MaterialReceiptEntry>
  materialRequests: Array<MaterialRequestEntry>
  qualityControls: Array<InspectionApproval>
}): OperationSummary {
  const byLine = new Map<string, OperationLineSummary>()
  for (const line of lines)
    ensureOperationLineSummary(byLine, getProjectLineId(line)).projectQuantity =
      line.plannedQuantity
  for (const request of materialRequests)
    ensureOperationLineSummary(
      byLine,
      request.projectLineId,
    ).requestedQuantity += effectiveRequestQuantity(request)
  const rejected = customerReturnTotals(qualityWorkflow, 'rejected')
  const approvedReturns = approvedCustomerReturnTotals(qualityWorkflow)
  for (const receipt of materialReceipts) {
    const summary = ensureOperationLineSummary(byLine, receipt.projectLineId)
    summary.receivedQuantity +=
      receipt.quantity - (rejected.get(receipt.id) ?? 0)
    summary.qcSignedQuantity -= approvedReturns.get(receipt.id) ?? 0
  }
  for (const approval of qualityControls)
    ensureOperationLineSummary(
      byLine,
      approval.projectLineId,
    ).qcSignedQuantity += approval.quantity
  for (const summary of byLine.values())
    summary.requestBalance = summary.projectQuantity - summary.requestedQuantity
  if (projectChanges?.length || stockTransfers?.length) {
    const state = {
      lines,
      materialRequests,
      materialReceipts,
      materialIssues,
      qualityWorkflow,
      projectChanges,
      stockTransfers,
    }
    for (const row of projectConsequences(state)) {
      if (
        !row.change &&
        !stockTransfers?.some(
          (item) =>
            item.toProjectLineId === row.line.id ||
            item.fromProjectLineId === row.line.id,
        )
      )
        continue
      const summary = ensureOperationLineSummary(byLine, row.line.id!)
      summary.receivedQuantity = row.retained
      summary.requestBalance = row.toRequest
    }
  }
  return { byLine }
}

function buildOperationOverviewRows({
  indicatorIndex,
  remainingByRequest,
  workflow,
  summaryByLine,
  balancesByReceipt,
  lines,
  materialIssues,
  materialReceipts,
  materialRequests,
  qualityControls,
}: {
  indicatorIndex: OperationIndicatorIndex
  lines: Array<SubobjectMaterialMetric>
  materialIssues: Array<MaterialIssueEntry>
  materialReceipts: Array<MaterialReceiptEntry>
  materialRequests: Array<MaterialRequestEntry>
  qualityControls: Array<InspectionApproval>
  workflow?: QualityWorkflow
  summaryByLine: Map<string, OperationLineSummary>
  remainingByRequest: ReadonlyMap<string, number>
  balancesByReceipt: ReturnType<typeof receiptBalances>
}): Array<OperationOverviewRow> {
  const m15ByLine = new Map(
    buildM15Accounting({
      lines,
      materialRequests,
      materialReceipts,
      qualityWorkflow: workflow,
      m15Reconciliations: workflow?.m15Reconciliations,
    }).map((row) => [row.projectLineId, row.documented]),
  )
  const balancesByLine = receiptIndicatorsByLine(
    materialReceipts,
    balancesByReceipt,
  )
  for (const [id, values] of indicatorIndex.byLine) {
    const total = balancesByLine.get(id) ?? emptyOverviewIndicators()
    total.availableToIssue = values.availableToIssue
    balancesByLine.set(id, total)
  }
  const remainingByLine = new Map<string, number>()
  for (const request of materialRequests) {
    remainingByLine.set(
      request.projectLineId,
      (remainingByLine.get(request.projectLineId) ?? 0) +
        (remainingByRequest.get(request.id) ?? 0),
    )
  }
  const documentById = indexReceiptDocuments(workflow)
  const requestById = new Map(
    materialRequests.map((request) => [request.id, request]),
  )
  const requestMetrics = groupOverviewDocuments(
    materialRequests,
    (entry) => entry.projectLineId,
    (entry) => entry.number,
    (entry) => entry.number,
    (entry) => entry.date,
    (entry) => entry.quantity,
  )
  const receiptMetrics = groupOverviewDocuments(
    materialReceipts,
    (entry) => entry.projectLineId,
    (entry) => entry.id,
    (entry) =>
      documentsForReceipt(entry, workflow, documentById)
        .map(receiptDocumentLabel)
        .join('; ') || formatDate(entry.date),
    (entry) => entry.date,
    (entry) => entry.quantity,
    (entry) => {
      const request = requestById.get(entry.requestId)

      if (!isReceiptReplacement(entry, request)) {
        return {}
      }

      return {
        replacement: true,
        replacementActualName: entry.actualName,
        replacementOriginalName: request?.projectMaterialName ?? '',
      }
    },
  )
  const qualityMetrics = groupOverviewDocuments(
    qualityControls,
    (entry) => entry.projectLineId,
    (entry) => entry.id,
    (entry) => entry.zniNumber || entry.arvkNumber || formatDate(entry.date),
    (entry) => entry.date,
    (entry) => entry.quantity,
  )
  const receiptLineIds = new Map(
    materialReceipts.map((receipt) => [receipt.id, receipt.projectLineId]),
  )
  const latestActivityByLineId = buildOperationActivityIndex({
    materialReceipts,
    materialRequests,
    qualityControls,
    additionalOperations: [
      ...materialIssues,
      ...(workflow?.customerReturns ?? []).map((item) => ({
        projectLineId:
          item.projectLineId ?? receiptLineIds.get(item.receiptId) ?? '',
        date: item.date,
      })),
      ...(workflow?.cases ?? []).flatMap((entry) => {
        const { zni, avk } = currentInspection(entry)
        const date = [
          zni.date,
          zni.signedOn ?? '',
          avk?.date ?? '',
          avk?.signedOn ?? '',
        ]
          .sort()
          .at(-1)!
        return zni.rows.map((row) => ({
          projectLineId: row.projectLineId,
          date,
        }))
      }),
    ],
  })
  const issueMetrics = groupOverviewDocuments(
    materialIssues,
    (entry) => entry.projectLineId,
    (entry) => entry.id,
    (entry) => entry.document || formatDate(entry.date),
    (entry) => entry.date,
    (entry) => entry.quantity,
  )
  const rowMap = new Map<string, OperationOverviewRow>()
  const activeLineIds = new Set<string>()

  for (const line of lines) {
    const key = getMaterialIdentityKey(line)
    const lineId = getProjectLineId(line)
    activeLineIds.add(lineId)
    const current =
      rowMap.get(key) ??
      ({
        indicators: emptyOverviewIndicators(),
        ciphers: [],
        deleted: false,
        key,
        latestActivityTime: 0,
        material: line.material,
        materialId: line.materialId ?? '',
        materialType: line.materialType ?? line.category,
        normativeDocument: line.normativeDocument ?? '',
        projectMaterialName: line.projectMaterialName ?? '',
        totalProjectQuantity: 0,
        remainingProjectQuantity: 0,
        totalM15Quantity: 0,
        totals: createEmptyOverviewMetrics(),
        unit: line.unit,
        unitWeight: line.unitWeight ?? null,
      } satisfies OperationOverviewRow)
    const metrics = {
      issues: issueMetrics.get(lineId) ?? createEmptyOverviewMetric(),
      quality: qualityMetrics.get(lineId) ?? createEmptyOverviewMetric(),
      receipts: receiptMetrics.get(lineId) ?? createEmptyOverviewMetric(),
      requests: requestMetrics.get(lineId) ?? createEmptyOverviewMetric(),
    } satisfies OperationOverviewMetrics

    current.latestActivityTime = Math.max(
      current.latestActivityTime,
      latestActivityByLineId.get(lineId) ?? 0,
    )

    const m15Quantity = m15ByLine.get(lineId) ?? 0
    current.totalM15Quantity += m15Quantity
    current.ciphers.push({
      m15Quantity,
      cipher: line.cipher,
      indicators:
        indicatorIndex.byLine.get(lineId) ?? emptyOverviewIndicators(),
      lineId,
      metrics,
      projectQuantity: line.plannedQuantity,
    })
    current.totalProjectQuantity += line.plannedQuantity
    // A surplus under one cipher must not cover an unreceived quantity under another.
    current.remainingProjectQuantity += remainingMaterialQuantity({
      projectQuantity: line.plannedQuantity,
      receivedQuantity: summaryByLine.get(lineId)?.receivedQuantity ?? 0,
    })
    current.indicators.remaining += remainingByLine.get(lineId) ?? 0
    for (const field of receiptIndicatorKeys)
      current.indicators[field] += balancesByLine.get(lineId)?.[field] ?? 0
    current.totals = addOverviewMetrics(current.totals, metrics)
    rowMap.set(key, current)
  }

  const deletedDescriptors = buildDeletedOperationLineDescriptors({
    activeLineIds,
    materialIssues,
    materialReceipts,
    materialRequests,
    qualityControls,
  })

  for (const descriptor of deletedDescriptors.values()) {
    const key = getDeletedOverviewRowKey(descriptor)
    const lineId = descriptor.lineId
    const metrics = {
      issues: issueMetrics.get(lineId) ?? createEmptyOverviewMetric(),
      quality: qualityMetrics.get(lineId) ?? createEmptyOverviewMetric(),
      receipts: receiptMetrics.get(lineId) ?? createEmptyOverviewMetric(),
      requests: requestMetrics.get(lineId) ?? createEmptyOverviewMetric(),
    } satisfies OperationOverviewMetrics

    if (!hasAnyOverviewMetrics(metrics)) {
      continue
    }

    const current =
      rowMap.get(key) ??
      ({
        indicators: emptyOverviewIndicators(),
        ciphers: [],
        deleted: true,
        key,
        latestActivityTime: 0,
        material: '',
        materialId: descriptor.materialId,
        materialType: 'Удален из проектной базы',
        normativeDocument: '',
        projectMaterialName:
          descriptor.projectMaterialName || 'Удаленный материал',
        totalProjectQuantity: 0,
        remainingProjectQuantity: 0,
        totalM15Quantity: 0,
        totals: createEmptyOverviewMetrics(),
        unit: descriptor.unit,
        unitWeight: null,
      } satisfies OperationOverviewRow)

    current.latestActivityTime = Math.max(
      current.latestActivityTime,
      latestActivityByLineId.get(lineId) ?? 0,
    )

    const m15Quantity = m15ByLine.get(lineId) ?? 0
    current.totalM15Quantity += m15Quantity
    current.ciphers.push({
      m15Quantity,
      cipher: descriptor.cipher || 'удален',
      indicators:
        indicatorIndex.byLine.get(lineId) ?? emptyOverviewIndicators(),
      lineId,
      metrics,
      projectQuantity: 0,
    })
    current.indicators.remaining += remainingByLine.get(lineId) ?? 0
    for (const field of receiptIndicatorKeys)
      current.indicators[field] += balancesByLine.get(lineId)?.[field] ?? 0
    current.totals = addOverviewMetrics(current.totals, metrics)
    rowMap.set(key, current)
  }

  return Array.from(rowMap.values()).sort((left, right) => {
    if (right.latestActivityTime !== left.latestActivityTime) {
      return right.latestActivityTime - left.latestActivityTime
    }

    return left.projectMaterialName.localeCompare(
      right.projectMaterialName,
      'ru',
    )
  })
}

function buildDeletedOperationLineDescriptors({
  activeLineIds,
  materialIssues,
  materialReceipts,
  materialRequests,
  qualityControls,
}: {
  activeLineIds: Set<string>
  materialIssues: Array<MaterialIssueEntry>
  materialReceipts: Array<MaterialReceiptEntry>
  materialRequests: Array<MaterialRequestEntry>
  qualityControls: Array<InspectionApproval>
}) {
  const descriptors = new Map<string, DeletedOperationLineDescriptor>()
  const requestById = new Map(
    materialRequests.map((request) => [request.id, request]),
  )
  const receiptById = new Map(
    materialReceipts.map((receipt) => [receipt.id, receipt]),
  )

  function addDescriptor(
    lineId: string,
    data: Partial<DeletedOperationLineDescriptor>,
  ) {
    if (activeLineIds.has(lineId)) {
      return
    }

    const current = descriptors.get(lineId)
    descriptors.set(lineId, {
      cipher: data.cipher || current?.cipher || '',
      lineId,
      materialId: data.materialId || current?.materialId || '',
      projectMaterialName:
        data.projectMaterialName || current?.projectMaterialName || '',
      unit: data.unit || current?.unit || '',
    })
  }

  for (const request of materialRequests) {
    addDescriptor(request.projectLineId, {
      cipher: request.cipher,
      materialId: request.materialId,
      projectMaterialName: request.projectMaterialName,
      unit: request.projectUnit,
    })
  }

  for (const receipt of materialReceipts) {
    const request = requestById.get(receipt.requestId)
    addDescriptor(receipt.projectLineId, {
      cipher: request?.cipher ?? '',
      materialId: request?.materialId ?? '',
      projectMaterialName:
        request?.projectMaterialName || receipt.actualName || '',
      unit: request?.projectUnit || receipt.projectUnit || '',
    })
  }

  for (const control of qualityControls) {
    const receipt = receiptById.get(control.receiptId)
    const request = receipt ? requestById.get(receipt.requestId) : undefined
    addDescriptor(control.projectLineId, {
      cipher: request?.cipher ?? '',
      materialId: request?.materialId ?? '',
      projectMaterialName:
        request?.projectMaterialName || receipt?.actualName || '',
      unit: request?.projectUnit || receipt?.projectUnit || '',
    })
  }

  for (const issue of materialIssues) {
    const receipt = receiptById.get(issue.receiptId)
    const request = receipt ? requestById.get(receipt.requestId) : undefined
    addDescriptor(issue.projectLineId, {
      cipher: request?.cipher ?? '',
      materialId: request?.materialId ?? '',
      projectMaterialName:
        request?.projectMaterialName || receipt?.actualName || '',
      unit: request?.projectUnit || receipt?.projectUnit || '',
    })
  }

  return descriptors
}

function getDeletedOverviewRowKey(descriptor: DeletedOperationLineDescriptor) {
  const identity = [
    descriptor.materialId,
    descriptor.projectMaterialName,
    descriptor.unit,
  ]
    .map((part) => normalizeSearchValue(part))
    .filter(Boolean)
    .join('|')

  return `deleted:${identity || descriptor.lineId}`
}

function groupOverviewDocuments<T>(
  entries: Array<T>,
  getLineId: (entry: T) => string,
  getDocumentId: (entry: T) => string,
  getDocumentLabel: (entry: T) => string,
  getDocumentDate: (entry: T) => string,
  getQuantity: (entry: T) => number,
  getDocumentMeta?: (entry: T) => Partial<OperationOverviewDocument>,
) {
  const byLine = new Map<string, OperationOverviewMetric>()

  for (const entry of entries) {
    const lineId = getLineId(entry)
    const metric = byLine.get(lineId) ?? createEmptyOverviewMetric()
    const documentId = getDocumentId(entry)
    const documentDate = getDocumentDate(entry)
    const quantity = getQuantity(entry)
    const documentMeta = getDocumentMeta?.(entry) ?? {}
    const existingDocument = metric.documents.find(
      (document) => document.id === documentId,
    )

    metric.quantity += quantity

    if (existingDocument) {
      existingDocument.quantity += quantity
      existingDocument.date = getLatestOverviewDocumentDate(
        existingDocument.date,
        documentDate,
      )
      existingDocument.replacement =
        existingDocument.replacement || documentMeta.replacement
      existingDocument.replacementActualName =
        existingDocument.replacementActualName ||
        documentMeta.replacementActualName
      existingDocument.replacementOriginalName =
        existingDocument.replacementOriginalName ||
        documentMeta.replacementOriginalName
    } else {
      metric.documents.push({
        date: documentDate,
        id: documentId,
        label: getDocumentLabel(entry) || 'Документ',
        quantity,
        ...documentMeta,
      })
    }

    byLine.set(lineId, metric)
  }

  return byLine
}

function getLatestOverviewDocumentDate(left: string, right: string) {
  if (!left) {
    return right
  }

  if (!right) {
    return left
  }

  return parseDocumentDate(right).getTime() > parseDocumentDate(left).getTime()
    ? right
    : left
}

function createEmptyOverviewMetric(): OperationOverviewMetric {
  return {
    documents: [],
    quantity: 0,
  }
}

function createEmptyOverviewMetrics(): OperationOverviewMetrics {
  return {
    issues: createEmptyOverviewMetric(),
    quality: createEmptyOverviewMetric(),
    receipts: createEmptyOverviewMetric(),
    requests: createEmptyOverviewMetric(),
  }
}

function addOverviewMetrics(
  left: OperationOverviewMetrics,
  right: OperationOverviewMetrics,
): OperationOverviewMetrics {
  return {
    issues: addOverviewMetric(left.issues, right.issues),
    quality: addOverviewMetric(left.quality, right.quality),
    receipts: addOverviewMetric(left.receipts, right.receipts),
    requests: addOverviewMetric(left.requests, right.requests),
  }
}

function hasAnyOverviewMetrics(metrics: OperationOverviewMetrics) {
  return (
    metrics.issues.quantity > 0 ||
    metrics.quality.quantity > 0 ||
    metrics.receipts.quantity > 0 ||
    metrics.requests.quantity > 0
  )
}

function addOverviewMetric(
  left: OperationOverviewMetric,
  right: OperationOverviewMetric,
): OperationOverviewMetric {
  return {
    documents: mergeOverviewDocuments(left.documents, right.documents),
    quantity: left.quantity + right.quantity,
  }
}

function mergeOverviewDocuments(
  left: Array<OperationOverviewDocument>,
  right: Array<OperationOverviewDocument>,
) {
  const documents = new Map<string, OperationOverviewDocument>()

  for (const document of [...left, ...right]) {
    const current = documents.get(document.id)

    if (current) {
      current.quantity += document.quantity
      current.replacement = current.replacement || document.replacement
      current.replacementActualName =
        current.replacementActualName || document.replacementActualName
      current.replacementOriginalName =
        current.replacementOriginalName || document.replacementOriginalName
    } else {
      documents.set(document.id, { ...document })
    }
  }

  return Array.from(documents.values())
}

function getProjectLineId(line: SubobjectMaterialMetric) {
  return line.id ?? getMaterialIdentityKey(line)
}

function buildRequestReferenceQuantities(
  lines: Array<SubobjectMaterialMetric>,
) {
  const projectQuantityByIdentity = new Map<string, number>()
  for (const line of lines) {
    const key = getMaterialIdentityKey(line)
    projectQuantityByIdentity.set(
      key,
      (projectQuantityByIdentity.get(key) ?? 0) + line.plannedQuantity,
    )
  }
  return new Map<string, RequestProjectQuantities>(
    lines.map((line) => [
      getProjectLineId(line),
      {
        projectQuantity:
          projectQuantityByIdentity.get(getMaterialIdentityKey(line)) ??
          line.plannedQuantity,
        cipherQuantity: line.plannedQuantity,
        unit: line.unit,
      },
    ]),
  )
}

function ensureOperationLineSummary(
  byLine: Map<string, OperationLineSummary>,
  lineId: string,
) {
  const existing = byLine.get(lineId)

  if (existing) {
    return existing
  }

  const fallback = {
    projectQuantity: 0,
    qcSignedQuantity: 0,
    receivedQuantity: 0,
    requestBalance: 0,
    requestedQuantity: 0,
  }

  byLine.set(lineId, fallback)
  return fallback
}

function groupRequestEntries(entries: Array<MaterialRequestEntry>) {
  const groups = new Map<
    string,
    { cipher: string; count: number; date: string; number: string }
  >()

  for (const entry of entries) {
    const current = groups.get(entry.number)
    groups.set(entry.number, {
      cipher: current?.cipher ?? entry.cipher,
      count: (current?.count ?? 0) + 1,
      date: current?.date ?? entry.date,
      number: entry.number,
    })
  }

  return Array.from(groups.values())
}

function groupRequestDocuments(
  entries: Array<MaterialRequestEntry>,
): Array<RequestDocumentGroup> {
  const groups = new Map<string, RequestDocumentGroup>()

  for (const entry of entries) {
    const current = groups.get(entry.number)

    if (!current) {
      groups.set(entry.number, {
        cipher: entry.cipher,
        date: entry.date,
        entries: [entry],
        number: entry.number,
        quantity: entry.quantity,
        requester: entry.requester,
      })
      continue
    }

    current.entries.push(entry)
    current.quantity += entry.quantity
    current.cipher = unique([...current.cipher.split(', '), entry.cipher]).join(
      ', ',
    )
    current.requester = current.requester || entry.requester
  }

  return sortOperationsNewestFirst(
    Array.from(groups.values()),
    (group) => group.date,
  )
}

function buildRequestGroupMeta(
  groups: Array<RequestDocumentGroup>,
  lineById: Map<string, SubobjectMaterialMetric>,
): Array<RequestGroupMeta> {
  return groups.map((group) => {
    const materialTypes = unique(
      group.entries
        .map(
          (entry) =>
            entry.materialType ||
            getRequestLineMaterialType(lineById.get(entry.projectLineId)),
        )
        .filter(Boolean),
    )
    const materialType = materialTypes.join(', ') || 'не указан'

    return {
      group,
      materialType,
      materials: group.entries.map((entry) =>
        operationMaterial(lineById.get(entry.projectLineId), entry),
      ),
      searchText: normalizeSearchValue(
        [
          group.number,
          group.date,
          group.requester,
          group.entries[0]?.requestNote,
          group.cipher,
          materialType,
          ...group.entries.flatMap((entry) => [
            entry.materialId,
            entry.projectMaterialName,
            entry.note,
            lineById.get(entry.projectLineId)?.normativeDocument,
            lineById.get(entry.projectLineId)?.material,
          ]),
        ].join(' '),
      ),
    }
  })
}

function groupReceiptDocuments(
  entries: Array<MaterialReceiptEntry>,
  requests: Array<MaterialRequestEntry>,
  lineById: Map<string, SubobjectMaterialMetric>,
): Array<ReceiptDocumentGroup> {
  const requestById = new Map(requests.map((request) => [request.id, request]))
  const groups = new Map<string, ReceiptDocumentGroup>()

  entries.forEach((entry) => {
    const key = getReceiptGroupKey(entry, lineById.get(entry.projectLineId))
    const request = requestById.get(entry.requestId)
    const current = groups.get(key)
    const requestNumbers = request?.number ? [request.number] : []

    if (!current) {
      groups.set(key, {
        actualName: entry.actualName,
        date: entry.date,
        firstDate: entry.date,
        entries: [entry],
        key,
        quantity: entry.quantity,
        replacement: isReceiptReplacement(entry, request),
        requestNumbers,
      })
      return
    }

    current.entries.push(entry)
    if (entry.date < current.firstDate) current.firstDate = entry.date
    if (entry.date > current.date) current.date = entry.date
    current.quantity += entry.quantity
    current.replacement =
      current.replacement || isReceiptReplacement(entry, request)
    current.requestNumbers = unique([
      ...current.requestNumbers,
      ...requestNumbers,
    ])
  })

  const result = Array.from(groups.values())
  for (const group of result)
    group.entries = sortOperationsNewestFirst(
      group.entries,
      (entry) => entry.date,
    )
  return sortOperationsNewestFirst(result, (group) => group.date)
}

function receiptEditGroup(
  entry: MaterialReceiptEntry,
  request?: MaterialRequestEntry,
): ReceiptDocumentGroup {
  return {
    key: entry.id,
    actualName: entry.actualName,
    date: entry.date,
    firstDate: entry.date,
    entries: [entry],
    quantity: entry.quantity,
    requestNumbers: request ? [request.number] : [],
    replacement: isReceiptReplacement(entry, request),
  }
}

function formatUnitTotals(entries: Array<{ quantity: number; unit: string }>) {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    totals.set(entry.unit, (totals.get(entry.unit) ?? 0) + entry.quantity)
  }
  return (
    [...totals]
      .map(
        ([unit, quantity]) =>
          `${formatQuantity(quantity)} ${unit || '(единица не указана)'}`,
      )
      .join(' · ') || '—'
  )
}

function buildOperationSearchMeta<T extends MaterialIssueEntry>(
  entries: Array<T>,
  receipts: Array<MaterialReceiptEntry>,
  requests: Array<MaterialRequestEntry>,
  lineById: Map<string, SubobjectMaterialMetric>,
  workflow?: QualityWorkflow,
) {
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  const documentById = indexReceiptDocuments(workflow)
  const requestById = new Map(requests.map((request) => [request.id, request]))

  return entries.map((entry) => {
    const receipt = receiptById.get(entry.receiptId)
    const request = receipt ? requestById.get(receipt.requestId) : undefined
    const line = lineById.get(entry.projectLineId)
    const details = [entry.document, entry.receiver, entry.note]

    return {
      entry,
      materials: [
        operationMaterial(
          line,
          line && receipt?.projectLineId !== entry.projectLineId
            ? { ...request, cipher: line.cipher }
            : request,
        ),
      ],
      searchText: normalizeSearchValue(
        [
          ...details,
          entry.date,
          formatDate(entry.date),
          receipt?.actualName,
          ...(receipt
            ? documentsForReceipt(receipt, workflow, documentById).map(
                receiptDocumentLabel,
              )
            : []),
          request?.number,
          request?.projectMaterialName,
          request?.cipher,
          line?.projectMaterialName,
          line?.cipher,
          line?.materialType,
          line?.category,
          line?.material,
          line?.normativeDocument,
        ]
          .filter(Boolean)
          .join(' '),
      ),
    }
  })
}

function operationMetaMatches(
  meta: { searchText: string; materials: Array<OperationMaterial> },
  search: string,
  view: OperationListView,
) {
  const query = normalizeSearchValue(search)
  return (
    (!query || meta.searchText.includes(query)) &&
    meta.materials.some((material) => matchesOperationMaterial(material, view))
  )
}

function buildReceiptGroupMeta(
  groups: Array<ReceiptDocumentGroup>,
  requests: Array<MaterialRequestEntry>,
  lineById: Map<string, SubobjectMaterialMetric>,
  workflow?: QualityWorkflow,
): Array<ReceiptGroupMeta> {
  const documentById = indexReceiptDocuments(workflow)
  const requestById = new Map(requests.map((request) => [request.id, request]))
  return groups.map((group) => {
    return {
      group,
      materials: group.entries.map((entry) =>
        operationMaterial(
          lineById.get(entry.projectLineId),
          requestById.get(entry.requestId),
        ),
      ),
      searchText: normalizeSearchValue(
        [
          ...group.requestNumbers,
          ...group.entries.flatMap((entry) => {
            const request = requestById.get(entry.requestId)
            const line = lineById.get(entry.projectLineId)
            return [
              entry.date,
              formatDate(entry.date),
              entry.actualName,
              ...documentsForReceipt(entry, workflow, documentById).map(
                receiptDocumentLabel,
              ),
              isReceiptReplacement(entry, request) ? 'замена' : '',
              request?.number,
              request ? '' : 'Заявка удалена',
              request?.requester,
              request?.projectMaterialName,
              request?.cipher,
              line?.projectMaterialName,
              line?.cipher,
              line?.materialType,
              line?.material,
              line?.normativeDocument,
              entry.factoryNumber,
              entry.manufacturer,
              entry.heatBatch,
              entry.customerArvk,
              entry.qualityDocument,
              entry.certificate,
              entry.technicalDecision,
              entry.note,
            ]
          }),
        ]
          .filter(Boolean)
          .join(' '),
      ),
    }
  })
}

function getReceiptRequestMaterialKey(
  entry: { projectLineId: string; projectUnit: string },
  line?: SubobjectMaterialMetric,
) {
  return JSON.stringify([
    line ? getMaterialIdentityKey(line) : `deleted:${entry.projectLineId}`,
    normalizeSearchValue(entry.projectUnit),
  ])
}

function getReceiptGroupKey(
  entry: MaterialReceiptEntry,
  line?: SubobjectMaterialMetric,
) {
  // Share the project database identity across ciphers, but keep replacements
  // and historical materials without a full identity separate.
  return JSON.stringify([
    line ? getMaterialIdentityKey(line) : `deleted:${entry.projectLineId}`,
    normalizeSearchValue(entry.actualName),
    normalizeSearchValue(entry.projectUnit),
  ])
}

function getReceiptDraftKey(entry: MaterialReceiptEntry) {
  return `receipt:${entry.id}`
}

function isReceiptReplacement(
  entry: MaterialReceiptEntry,
  request?: MaterialRequestEntry,
) {
  if (!request) {
    return false
  }

  return (
    normalizeSearchValue(entry.actualName) !==
    normalizeSearchValue(request.projectMaterialName)
  )
}

function getReceiptRequestRest(
  request: MaterialRequestEntry,
  receiptByRequest: Map<string, number>,
  editingReceipt?: MaterialReceiptEntry | null,
) {
  const received =
    (receiptByRequest.get(request.id) ?? 0) - (editingReceipt?.quantity ?? 0)
  return requestReceiptProgress(effectiveRequestQuantity(request), received)
    .remaining
}

function receiptWorkItemMatchesSearch(
  item: ReceiptWorkItem,
  search: string,
  lineById: Map<string, SubobjectMaterialMetric>,
) {
  const tokens = tokenizeSearchValue(search)

  if (tokens.length === 0) {
    return true
  }

  const line = lineById.get(item.request.projectLineId)
  const haystack = normalizeSearchValue(
    [
      item.request.number,
      item.request.materialId,
      item.request.projectMaterialName,
      item.request.cipher,
      item.request.note,
      item.receipt?.actualName,
      item.receipt?.factoryNumber,
      item.receipt?.manufacturer,
      item.receipt?.heatBatch,
      item.receipt?.customerArvk,
      item.receipt?.qualityDocument,
      item.receipt?.certificate,
      item.receipt?.technicalDecision,
      item.receipt?.note,
      line?.materialId,
      line?.material,
      line?.normativeDocument,
      line?.unitWeight === null || line?.unitWeight === undefined
        ? ''
        : formatQuantity(line.unitWeight),
    ].join(' '),
  )

  return tokens.every((token) => haystack.includes(token))
}

function buildDeletedRequestLines({
  editingRequest,
  fallbackMaterialType,
  lineById,
}: {
  editingRequest: RequestDocumentGroup | null
  fallbackMaterialType: string
  lineById: Map<string, SubobjectMaterialMetric>
}): Array<SubobjectMaterialMetric> {
  if (!editingRequest) {
    return []
  }

  const deletedByLineId = new Map<string, SubobjectMaterialMetric>()

  for (const entry of editingRequest.entries) {
    if (lineById.has(entry.projectLineId)) {
      continue
    }

    deletedByLineId.set(entry.projectLineId, {
      accepted: 0,
      alternativeUnit: entry.altUnit || null,
      category:
        entry.materialType ||
        fallbackMaterialType ||
        'Удален из проектной базы',
      changeNumber: null,
      cipher: entry.cipher,
      id: entry.projectLineId,
      issued: 0,
      material: '',
      materialId: entry.materialId,
      materialType:
        entry.materialType ||
        fallbackMaterialType ||
        'Удален из проектной базы',
      normativeDocument: entry.note || null,
      plannedQuantity: 0,
      project: 'Удален из проектной базы',
      projectMaterialName: entry.projectMaterialName,
      qcPending: 0,
      received: 0,
      requested: entry.quantity,
      returned: 0,
      unit: entry.projectUnit,
      unitWeight: null,
      writtenOff: 0,
    })
  }

  return Array.from(deletedByLineId.values())
}

function getOverRequestState({
  availableOverride,
  line,
  quantity,
  summaryByLine,
}: {
  availableOverride?: number
  line: SubobjectMaterialMetric
  quantity: string
  summaryByLine: Map<string, OperationLineSummary>
}): OverRequestState | null {
  const parsedQuantity = parsePositiveNumber(quantity)

  if (parsedQuantity <= 0) {
    return null
  }

  const lineId = getProjectLineId(line)
  const available =
    availableOverride ??
    summaryByLine.get(lineId)?.requestBalance ??
    line.plannedQuantity
  const shortage = parsedQuantity - available

  if (shortage <= 0) {
    return null
  }

  return {
    available: Math.max(0, available),
    line,
    lineId,
    quantity: parsedQuantity,
    shortage,
  }
}

function getRequestLineMaterialType(line?: SubobjectMaterialMetric) {
  return line?.materialType ?? line?.category ?? 'Материалы'
}

function operationOverviewRowMatchesSearch(
  row: OperationOverviewRow,
  search: string,
) {
  const tokens = tokenizeSearchValue(search)

  if (tokens.length === 0) {
    return true
  }

  const haystack = normalizeSearchValue(
    [
      row.materialId,
      row.projectMaterialName,
      row.materialType,
      row.normativeDocument,
      row.material,
      row.unit,
      row.deleted ? 'удален удален из проектной базы архив' : '',
      row.unitWeight === null ? '' : formatQuantity(row.unitWeight),
      ...row.ciphers.map((cipherRow) => cipherRow.cipher),
    ].join(' '),
  )

  return tokens.every((token) => haystack.includes(token))
}

function operationOverviewRowMatchesCipher(
  row: OperationOverviewRow,
  filter: string,
) {
  const token = normalizeSearchValue(filter)

  if (!token) {
    return true
  }

  return row.ciphers.some((cipherRow) =>
    normalizeSearchValue(cipherRow.cipher).includes(token),
  )
}

function operationOverviewRowMatchesMaterialType(
  row: OperationOverviewRow,
  filter: string,
) {
  const token = normalizeSearchValue(filter)

  if (!token) {
    return true
  }

  return normalizeSearchValue(row.materialType).includes(token)
}

function getOperationOverviewRowTone(row: OperationOverviewRow) {
  if (
    !row.deleted &&
    row.totalProjectQuantity > 0 &&
    row.remainingProjectQuantity === 0
  ) {
    return {
      card: 'border-slate-200 bg-white',
      expanded: 'ring-1 ring-emerald-200',
      focus: 'ring-2 ring-emerald-200',
      header: 'bg-white',
    }
  }

  return {
    card: 'border-slate-200 bg-white',
    expanded: 'ring-1 ring-stone-200',
    focus: 'ring-2 ring-stone-200',
    header: 'bg-white',
  }
}

function getMaterialProgressTone({
  deleted = false,
  summary,
}: {
  deleted?: boolean
  summary?: OperationLineSummary
}) {
  if (!deleted && summary && isMaterialFullyReceived(summary)) {
    return {
      accent: 'bg-emerald-300',
      card: 'border-slate-200 bg-white',
      divider: 'border-emerald-200',
      header: 'bg-white',
      leftBorder: 'border-l-emerald-300',
      metric: 'border-emerald-200 bg-emerald-50/65',
      ring: 'ring-emerald-200',
    }
  }

  return {
    accent: 'bg-stone-300',
    card: 'border-slate-200 bg-white',
    divider: 'border-stone-200',
    header: 'bg-white',
    leftBorder: 'border-l-stone-300',
    metric: 'border-slate-200 bg-slate-50/70',
    ring: 'ring-stone-200',
  }
}

function requestLineMatchesSearch(
  line: SubobjectMaterialMetric,
  search: string,
) {
  const tokens = tokenizeSearchValue(search)

  if (tokens.length === 0) {
    return true
  }

  const haystack = normalizeSearchValue(
    [
      line.materialId ?? '',
      line.projectMaterialName ?? '',
      line.normativeDocument ?? '',
      line.material,
      line.unit,
      line.unitWeight === null || line.unitWeight === undefined
        ? ''
        : formatQuantity(line.unitWeight),
    ].join(' '),
  )

  return tokens.every((token) => haystack.includes(token))
}

function emptyRequestDraft(): RequestDraft {
  return {
    note: '',
    quantity: '',
    sourceCipher: '',
    sourceQuantity: null,
  }
}

function emptyReceiptDraft(): ReceiptDraft {
  return {
    ...emptyReceiptDocumentFields,
    actualName: '',
    certificate: '',
    customerArvk: '',
    date: localDateInputValue(),
    factoryNumber: '',
    heatBatch: '',
    manufacturer: '',
    note: '',
    qualityDocument: '',
    quantity: '',
    technicalDecision: '',
  }
}

function formatRawSpreadsheetNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(value).replace('.', ',')
}

function sanitizeFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'request'
  )
}

function getOperationTabCount(
  tab: OperationDocumentTab,
  context: {
    receiptMaterialCount: number
    qualityDocumentCount: number
    returnDocumentCount: number
    overviewCount: number
    materialIssues: Array<MaterialIssueEntry>
    materialRequests: Array<MaterialRequestEntry>
  },
) {
  if (tab === 'overview') {
    return context.overviewCount
  }

  if (tab === 'returns')
    return (
      context.returnDocumentCount +
      context.materialIssues.reduce(
        (sum, issue) => sum + (issue.siteReturns?.length ?? 0),
        0,
      )
    )

  if (tab === 'requests') {
    return groupRequestEntries(context.materialRequests).length
  }

  if (tab === 'receipts') {
    return context.receiptMaterialCount
  }

  if (tab === 'quality') {
    return context.qualityDocumentCount
  }

  return context.materialIssues.length
}

function operationAnchorId(tab: OperationActionTab, targetId: string) {
  return `operation-${tab}-${targetId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function overviewAnchorId(targetId: string) {
  return `operation-overview-${encodeURIComponent(targetId)}`
}

function getOperationDeletionError(
  target: OperationDeletion,
  receipts: Array<MaterialReceiptEntry>,
  issues: Array<MaterialIssueEntry>,
  workflow?: QualityWorkflow,
) {
  const missing =
    'Запись уже удалена или изменена. Закройте окно и выберите её заново.'
  if (target.kind === 'receipts') {
    const ids = new Set(target.ids)
    if (
      !ids.size ||
      receipts.filter((entry) => ids.has(entry.id)).length !== ids.size
    )
      return missing
    if (
      workflow?.cases.some((entry) =>
        entry.revisions.some((revision) =>
          revision.zni.rows.some((row) => ids.has(row.receiptId)),
        ),
      )
    )
      return 'Получение связано с ЗНИ. Сначала удалите её черновик; подписанные документы и связанные поступления сохраняются в истории.'
    if (workflow?.customerReturns?.some((item) => ids.has(item.receiptId)))
      return 'Получение связано с фактическим возвратом заказчику и защищено от удаления.'
    const issueCount = issues.filter((entry) => ids.has(entry.receiptId)).length
    if (issueCount)
      return `Нельзя удалить получение: есть связанные выдачи (${issueCount}). Сначала удалите их.`
    return ''
  }
  const issue = issues.find((entry) => entry.id === target.id)
  return !issue
    ? missing
    : issue.siteReturns?.length
      ? 'Нельзя удалить выдачу: по ней есть возврат с площадки.'
      : ''
}

function createClientId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseDocumentDate(dateValue: string) {
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date()

  return Number.isNaN(date.getTime()) ? new Date() : date
}

function todayInputValue() {
  return localDateInputValue()
}

function formatDate(value: string) {
  return formatCalendarDate(value, '-')
}

function parsePositiveNumber(value: string) {
  const parsed = parseNullableNumber(value)
  return parsed && parsed > 0 ? parsed : 0
}

function parseNullableNumber(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.')

  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatOptionalQuantity(value: number | null) {
  return value === null ? '-' : formatAlternativeQuantity(value)
}

function MaterialModal({
  error,
  alternativeUnits,
  alloys,
  documents,
  editing,
  existingMaterials,
  form,
  materialTypes,
  open,
  units,
  onChange,
  onClose,
  onEditExisting,
  onOpenSettings,
  onSubmit,
  onUseExisting,
}: {
  error: string
  alternativeUnits: Array<string>
  alloys: Array<string>
  documents: Array<string>
  editing: boolean
  existingMaterials: Array<MaterialMatrixRow>
  form: typeof emptyNewLine
  materialTypes: Array<string>
  open: boolean
  units: Array<string>
  onChange: (value: typeof emptyNewLine) => void
  onClose: () => void
  onEditExisting: (lineId: string) => void
  onOpenSettings: () => void
  onSubmit: () => void
  onUseExisting: (row: MaterialMatrixRow) => void
}) {
  const [combinationSearch, setCombinationSearch] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const search = combinationSearch.trim()
  const isPassportVisible = editing || creatingNew
  const isCreatePassportOnly = creatingNew && !editing
  const isLookupVisible = !editing && !isCreatePassportOnly
  const foundCombinations = useMemo(
    () =>
      search.length > 0
        ? existingMaterials
            .filter((row) => materialCombinationMatchesSearch(row, search))
            .slice(0, isPassportVisible ? 8 : 14)
        : existingMaterials.slice(0, isPassportVisible ? 5 : 12),
    [existingMaterials, isPassportVisible, search],
  )
  const saveHint = getMaterialFormSaveHint({
    alternativeUnits,
    documents,
    editing,
    existingMaterials,
    form,
    materialTypes,
    units,
    alloys,
  })

  useEffect(() => {
    if (open) {
      setCombinationSearch('')
      setCreatingNew(editing)
    }
  }, [editing, open])

  return (
    <Modal
      open={open}
      size="lg"
      title={editing ? 'Редактирование материала' : 'Материал проектной базы'}
      onClose={onClose}
    >
      <EscapeFilters
        active={isLookupVisible && !!combinationSearch}
        onReset={() => setCombinationSearch('')}
      />
      <div className="grid gap-4">
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}
        <div
          className={`grid gap-4 ${
            editing || isCreatePassportOnly
              ? 'lg:grid-cols-1'
              : isPassportVisible
                ? 'lg:grid-cols-[minmax(380px,1fr)_minmax(430px,500px)]'
                : 'lg:grid-cols-1'
          }`}
        >
          {isLookupVisible ? (
            <section className="grid min-h-[620px] grid-rows-[auto_1fr] overflow-hidden rounded-md border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 max-w-3xl">
                    <div className="text-sm font-medium text-slate-900">
                      Существующие комбинации
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Button
                      className="justify-center"
                      variant={creatingNew ? 'secondary' : 'outline'}
                      onClick={() => setCreatingNew(true)}
                    >
                      <Plus size={16} />
                      Создать вручную
                    </Button>
                  </div>
                </div>
                <div className="relative mt-3">
                  <Search
                    className="pointer-events-none absolute left-3 top-2.5 text-slate-400"
                    size={16}
                  />
                  <Input
                    className="pl-9"
                    placeholder="Поиск существующей комбинации"
                    value={combinationSearch}
                    onChange={(event) =>
                      setCombinationSearch(event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="min-h-0 overflow-auto bg-white">
                {foundCombinations.length > 0 ? (
                  foundCombinations.map((row, index) => (
                    <div
                      key={row.key}
                      className={`grid w-full cursor-pointer gap-2.5 border-b border-slate-200/80 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(148,163,184,0.12)] transition-colors last:border-0 hover:bg-blue-50/50 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-slate-50/45'
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onUseExisting(row)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') {
                          return
                        }

                        event.preventDefault()
                        onUseExisting(row)
                      }}
                    >
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                        <div className="min-w-0">
                          <div className="material-name-clamp text-[15px] font-medium leading-6 text-slate-900">
                            {row.projectMaterialName}
                          </div>
                          <div className="mt-0.5 text-[13px] leading-5 text-slate-500">
                            {row.materialType || 'Тип не указан'}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center">
                          <button
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 shadow-sm shadow-slate-200/50 hover:bg-slate-50 hover:text-slate-900"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              onEditExisting(row.firstLineId)
                            }}
                          >
                            <Pencil size={13} />
                            Паспорт
                          </button>
                        </div>
                      </div>
                      <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[minmax(220px,1.35fr)_140px_minmax(140px,0.85fr)_110px]">
                        <MaterialCombinationMeta
                          label="Нормативный документ"
                          value={row.normativeDocument || 'не указан'}
                        />
                        <MaterialCombinationMeta
                          label="Единица измерения"
                          value={row.unit}
                        />
                        <MaterialCombinationMeta
                          label="Состав"
                          value={row.material || 'не указан'}
                        />
                        <MaterialCombinationMeta
                          align="right"
                          label="Масса"
                          value={
                            row.unitWeight === null
                              ? 'не указана'
                              : formatQuantity(row.unitWeight)
                          }
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-8 text-center text-sm text-slate-500">
                    Похожих комбинаций не найдено.
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {isPassportVisible ? (
            <section className="min-h-[620px] overflow-hidden rounded-md border border-slate-200 bg-white">
              <div
                className="grid h-full grid-rows-[auto_1fr_auto]"
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || saveHint) {
                    return
                  }

                  event.preventDefault()
                  onSubmit()
                }}
              >
                <div className="border-b border-slate-200 bg-white px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {editing ? 'Паспорт материала' : 'Новая комбинация'}
                      </div>
                    </div>
                    {isCreatePassportOnly ? (
                      <Button
                        className="shrink-0"
                        variant="outline"
                        onClick={() => setCreatingNew(false)}
                      >
                        К поиску
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="min-h-0 overflow-auto px-4 py-4">
                  <div
                    className={`grid gap-4 ${
                      isCreatePassportOnly ? 'xl:grid-cols-2' : ''
                    }`}
                  >
                    <div
                      className={
                        isCreatePassportOnly ? 'xl:col-span-2' : undefined
                      }
                    >
                      <Button variant="outline" onClick={onOpenSettings}>
                        <Settings size={16} />
                        Настройки
                      </Button>
                    </div>

                    <FormSection title="Основные данные">
                      <Field label="Тип материала">
                        <AppSelect
                          label="Тип материала"
                          options={buildSelectOptions(
                            'Выберите тип',
                            materialTypes,
                            form.materialType,
                          )}
                          value={form.materialType}
                          onChange={(value) =>
                            onChange({ ...form, materialType: value })
                          }
                        />
                      </Field>
                      <Field label="Наименование по проекту">
                        <Input
                          aria-label="Наименование по проекту"
                          placeholder="Введите наименование по проекту"
                          value={form.projectMaterialName}
                          onChange={(event) =>
                            onChange({
                              ...form,
                              projectMaterialName: event.target.value,
                            })
                          }
                        />
                      </Field>
                    </FormSection>

                    <FormSection title="Нормативный документ и свойства">
                      <Field label="Нормативный документ">
                        <AutocompleteInput
                          options={documents}
                          placeholder="Начните вводить нормативный документ"
                          value={form.normativeDocument}
                          onChange={(value) =>
                            onChange({ ...form, normativeDocument: value })
                          }
                        />
                      </Field>
                      <Field label="Состав">
                        <AutocompleteInput
                          options={alloys}
                          placeholder="Начните вводить состав"
                          value={form.material}
                          onChange={(value) =>
                            onChange({ ...form, material: value })
                          }
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Единица измерения">
                          <AutocompleteInput
                            ariaLabel="Единица измерения"
                            options={units}
                            placeholder="Например: м"
                            value={form.unit}
                            onChange={(value) =>
                              onChange({ ...form, unit: value })
                            }
                          />
                        </Field>
                        <Field label="Масса единицы">
                          <Input
                            inputMode="decimal"
                            value={form.unitWeight}
                            onChange={(event) =>
                              onChange({
                                ...form,
                                unitWeight: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </div>
                    </FormSection>

                    <FormSection title="Пересчёт в альтернативную единицу">
                      <Field label="Альтернативная единица измерения">
                        <AutocompleteInput
                          ariaLabel="Альтернативная единица измерения"
                          options={alternativeUnits}
                          placeholder="Например: кг"
                          value={form.alternativeUnit}
                          onChange={(value) =>
                            onChange({ ...form, alternativeUnit: value })
                          }
                        />
                      </Field>
                      <Field
                        label={`Количество альтернативных единиц на 1 ${form.unit || 'основную единицу'}`}
                      >
                        <Input
                          aria-label="Количество альтернативных единиц на одну основную"
                          inputMode="decimal"
                          placeholder="Например: 2,5"
                          value={form.alternativeUnitFactor}
                          onChange={(event) =>
                            onChange({
                              ...form,
                              alternativeUnitFactor: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <p className="text-sm text-slate-500">
                        {form.alternativeUnit.trim() &&
                        !getAlternativeConversionError(
                          form.alternativeUnit,
                          form.alternativeUnitFactor,
                        )
                          ? `1 ${form.unit} = ${form.alternativeUnitFactor} ${form.alternativeUnit}. Количество в заявках, получении и выдаче рассчитается автоматически.`
                          : 'Необязательно. Укажите, сколько альтернативных единиц содержится в одной основной. Масса единицы не подставляется автоматически.'}
                      </p>
                    </FormSection>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  {saveHint && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                      {saveHint}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>
                      Отмена
                    </Button>
                    <Button disabled={Boolean(saveHint)} onClick={onSubmit}>
                      <Plus size={16} />
                      {editing ? 'Сохранить' : 'Создать комбинацию'}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

function MaterialImportModal({
  draft,
  error,
  loading,
  currentLines,
  importMode,
  onChangeImportMode,
  open,
  onAddMissingReferences,
  onApply,
  onClose,
  onDownloadTemplate,
  onImportFile,
}: {
  draft: MaterialImportDraft | null
  error: string
  loading: boolean
  currentLines: Array<SubobjectMaterialMetric>
  importMode: 'full' | 'changes'
  onChangeImportMode: (mode: 'full' | 'changes') => void
  open: boolean
  onAddMissingReferences: () => void
  onApply: () => void
  onClose: () => void
  onDownloadTemplate: () => void
  onImportFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileVersion, setFileVersion] = useState(0)
  const [onlyErrors, setOnlyErrors] = useState(true)
  const hasErrors = (draft?.summary.errorRows ?? 0) > 0
  const showOnlyErrors = hasErrors && onlyErrors
  const pagination = useOperationPagination(
    'material-import',
    (showOnlyErrors
      ? draft?.rows.filter((entry) => entry.errors.length > 0)
      : draft?.rows) ?? [],
    `${fileVersion}:${showOnlyErrors}`,
  )
  const previews = useMemo(
    () =>
      previewMaterialImportRows(
        currentLines,
        draft?.rows.map((entry) => entry.row) ?? [],
      ),
    [currentLines, draft],
  )
  const effectivePreviews = previews.filter(
    (preview, index) =>
      preview.supersededBy === null && draft?.rows[index]?.errors.length === 0,
  )
  const changedCount = effectivePreviews.filter(
    (preview) => preview.existing && preview.changes.length > 0,
  ).length
  const unchangedCount = effectivePreviews.filter(
    (preview) => preview.existing && preview.changes.length === 0,
  ).length
  const isEmptyDraft = draft !== null && draft.summary.totalRows === 0
  const canApply =
    !loading && draft !== null && !isEmptyDraft && draft.summary.errorRows === 0

  return (
    <Modal
      open={open}
      size="lg"
      title="Импорт проектной базы"
      onClose={onClose}
    >
      <div className="grid h-full min-h-[640px] gap-4 lg:grid-cols-[340px_1fr]">
        <aside className="grid content-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div>
            <div className="text-sm font-medium text-slate-900">
              Массовая загрузка комбинаций
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              Заполните «Шифр» и «Количество» для каждой позиции. Если шифры уже
              настроены, шаблон содержит отдельный столбец количества для
              каждого шифра.
            </div>
          </div>

          <label className="grid gap-1 text-sm">
            Состав Excel
            <SelectField
              aria-label="Состав Excel"
              className="rounded border p-2"
              value={importMode}
              onChange={(event) =>
                onChangeImportMode(event.target.value as 'full' | 'changes')
              }
            >
              <option value="changes">Только изменения</option>
              <option value="full">Полная спецификация шифра</option>
            </SelectField>
          </label>
          <p className="text-xs text-slate-600">
            {importMode === 'full'
              ? 'Отсутствующие позиции шифров из файла будут предложены к исключению. Другие шифры сохранятся.'
              : 'Позиции, которых нет в файле, сохранятся.'}{' '}
          </p>
          <Button
            className="justify-center"
            variant="outline"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            <FileInput size={16} />
            Выбрать Excel-файл
          </Button>
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            disabled={loading}
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                setFileVersion((current) => current + 1)
                setOnlyErrors(true)
                onImportFile(file)
                event.currentTarget.value = ''
              }
            }}
          />

          {loading && <div role="status">Чтение файла…</div>}
          {error && (
            <div role="alert" className="text-sm text-red-700">
              {error}
            </div>
          )}

          {draft ? (
            <div className="grid grid-cols-2 gap-2">
              <ImportStat label="Позиций" value={draft.summary.totalRows} />
              <ImportStat label="Готово" value={draft.summary.validRows} />
              <ImportStat
                label="Новые"
                value={
                  effectivePreviews.filter((preview) => !preview.existing)
                    .length
                }
              />
              <ImportStat label="Изменятся" value={changedCount} />
              <ImportStat label="Без изменений" value={unchangedCount} />
              <ImportStat
                label="Ошибки"
                value={draft.summary.errorRows}
                tone="bad"
              />
            </div>
          ) : null}

          {changedCount > 0 && (
            <div
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950"
            >
              <div className="font-medium">
                Будут изменены существующие позиции: {changedCount}.
              </div>
              Проверьте «Было → Станет» в списке. Затем выберите причину
              изменения. Количества не складываются; файл подготовит новые
              значения.
            </div>
          )}

          {draft && draft.summary.unknownReferenceRows > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
              <div className="text-sm font-medium text-amber-900">
                Есть новые значения справочников
              </div>
              <div className="mt-1 text-sm leading-6 text-amber-800">
                Их можно добавить в настройки и затем применить импорт.
              </div>
              <Button
                className="mt-3 w-full justify-center"
                variant="outline"
                onClick={onAddMissingReferences}
              >
                <Plus size={16} />
                Добавить в настройки
              </Button>
            </div>
          ) : null}

          <div className="mt-2 flex gap-2">
            <Button className="flex-1" variant="outline" onClick={onClose}>
              Закрыть
            </Button>
            <Button className="flex-1" disabled={!canApply} onClick={onApply}>
              Перейти к изменениям
            </Button>
          </div>

          {isEmptyDraft ? (
            <div
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800"
            >
              Нет позиций с количеством. На первом листе Excel заполните колонки
              «Шифр» и «Количество» либо количества под заголовками шифров.
              Затем загрузите файл снова.
            </div>
          ) : !canApply && draft ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
              Применение станет доступно, когда в черновике не останется ошибок.
            </div>
          ) : null}
        </aside>

        <section className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-medium text-slate-900">
              Проверка перед импортом
            </div>
            {hasErrors && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={onlyErrors}
                  onChange={(event) => setOnlyErrors(event.target.checked)}
                />
                Только позиции с ошибками
              </label>
            )}
          </div>

          {draft ? (
            <div className="flex min-h-0 flex-col">
              <div
                ref={pagination.containerRef}
                className="min-h-0 flex-1 overflow-auto"
              >
                {pagination.items.map((entry) => (
                  <ImportDraftRowCard
                    key={`${entry.row.rowNumber}-${entry.identityKey}-${entry.row.cipher}`}
                    entry={entry}
                    preview={previews[entry.row.rowNumber - 1]!}
                  />
                ))}
              </div>
              <OperationPagination
                pagination={pagination}
                label="Импорт проектной базы"
              />
            </div>
          ) : (
            <div className="grid place-items-center bg-slate-50/50 px-6 text-center">
              <div className="max-w-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm">
                  <FileSpreadsheet size={20} />
                </div>
                <div className="mt-4 text-sm font-medium text-slate-900">
                  Черновик еще не создан
                </div>

                <Button
                  className="mx-auto mt-5 justify-center"
                  variant="outline"
                  onClick={onDownloadTemplate}
                >
                  <Download size={16} />
                  Скачать шаблон
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}

function ImportStat({
  label,
  tone = 'default',
  value,
}: {
  label: string
  tone?: 'bad' | 'default'
  value: number
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        tone === 'bad'
          ? 'border-red-100 bg-red-50 text-red-900'
          : 'border-slate-200 bg-white text-slate-900'
      }`}
    >
      <div className="text-[10px] font-medium uppercase text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

function ImportDraftRowCard({
  entry,
  preview,
}: {
  entry: MaterialImportDraftRow
  preview: MaterialImportPreview
}) {
  const hasErrors = entry.errors.length > 0
  const toneClass = hasErrors
    ? 'border-red-100 bg-red-50/70'
    : preview.existing
      ? 'border-blue-100 bg-blue-50/50'
      : 'border-emerald-100 bg-emerald-50/50'

  return (
    <div
      className={`border-b px-4 py-3 last:border-0 ${toneClass}`}
      role="group"
      aria-label={`Позиция ${entry.row.rowNumber}: ${entry.row.projectMaterialName}, шифр ${entry.row.cipher}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="material-name-clamp text-sm font-medium text-slate-900">
            {entry.row.projectMaterialName || `Позиция ${entry.row.rowNumber}`}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
            <span>Позиция №{entry.row.rowNumber}</span>
            <span>Шифр: {entry.row.cipher || 'не указан'}</span>
            <span>Количество: {formatQuantity(entry.row.quantity)}</span>
            <span>Единица измерения: {entry.row.unit || 'не указана'}</span>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
            hasErrors
              ? 'border-red-200 bg-white text-red-700'
              : preview.existing
                ? 'border-blue-200 bg-white text-blue-700'
                : 'border-emerald-200 bg-white text-emerald-700'
          }`}
        >
          {hasErrors
            ? 'Нужно исправить'
            : preview.supersededBy !== null
              ? 'Повтор в файле'
              : preview.existing
                ? preview.changes.length > 0
                  ? 'Будет изменена'
                  : 'Без изменений'
                : preview.existingMaterial
                  ? 'Новый шифр'
                  : 'Новая комбинация'}
        </span>
      </div>

      <div className="mt-3 grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4">
        <MaterialCombinationMeta
          label="Тип"
          value={entry.row.materialType || 'не указан'}
        />
        <MaterialCombinationMeta
          label="Нормативный документ"
          value={entry.row.normativeDocument || 'не указан'}
        />
        <MaterialCombinationMeta
          label="Состав"
          value={entry.row.material || 'не указан'}
        />
        <MaterialCombinationMeta
          align="right"
          label="Масса"
          value={
            entry.row.unitWeight === null
              ? 'не указана'
              : formatQuantity(entry.row.unitWeight)
          }
        />
      </div>

      {!hasErrors && (
        <MaterialImportChanges preview={preview} row={entry.row} />
      )}

      {entry.errors.length > 0 ? (
        <div className="mt-3 rounded-md border border-red-100 bg-white px-3 py-2 text-sm leading-6 text-red-700">
          {entry.errors.join(' ')}
        </div>
      ) : entry.warnings.length > 0 ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-600">
          {entry.warnings.join(' ')}
        </div>
      ) : null}
    </div>
  )
}

function DeleteMaterialDialog({
  material,
  onCancel,
  onConfirm,
}: {
  material: PendingDeleteMaterial | null
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!material) {
    return null
  }

  return (
    <Modal open title="Удалить материал" onClose={onCancel}>
      <div className="grid gap-5">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-sm font-medium text-red-950">
            {material.name}
          </div>
          <div className="mt-1 text-sm leading-6 text-red-700">
            Количество по шифрам будет обнулено в черновике. История и связанные
            документы сохранятся. Причину выберете при сохранении правок.
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button
            className="bg-red-700 text-white hover:bg-red-800"
            onClick={onConfirm}
          >
            Удалить
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function MaterialCombinationMeta({
  align = 'left',
  label,
  value,
}: {
  align?: 'left' | 'right'
  label: string
  value: string
}) {
  return (
    <span
      className={`min-w-0 border-b border-r border-slate-200 px-3 py-2 last:border-r-0 sm:border-b-0 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <span className="block text-[10px] font-medium uppercase leading-4 tracking-wide text-slate-400">
        {label}
      </span>
      <span className="mt-0.5 block truncate text-[13px] leading-5 text-slate-700">
        {value}
      </span>
    </span>
  )
}

function FormSection({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className="border-b border-slate-100 pb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  )
}

function SettingsPanel({
  numbering,
  numberHistory,
  onSaveNumbering,
  qualityWorkflow,
  onChangeQualityWorkflow,
  draft,
  error,
  materialTypeSettings,
  onChangeDraft,
  onChangeMaterialTypeSettings,
  onDiscard,
  onSave,
}: {
  numbering?: DocumentNumbering
  numberHistory: NumberHistory
  onSaveNumbering: (next: DocumentNumbering) => void
  qualityWorkflow?: QualityWorkflow
  onChangeQualityWorkflow: (next: QualityWorkflow) => void
  draft: ReferenceSettingsDraft
  error: string
  materialTypeSettings: Array<MaterialTypeSetting>
  onChangeDraft: (key: keyof ReferenceSettingsDraft, value: string) => void
  onChangeMaterialTypeSettings: (
    materialTypeSettings: Array<MaterialTypeSetting>,
  ) => void
  onDiscard: () => void
  onSave: () => void
}) {
  const { view, navigate } = useWorkspaceNavigation()
  const activeTab = view.settings
  const setActiveTab = (settings: typeof activeTab) => navigate({ settings })
  const printKind = view.template
  const setPrintKind = (template: typeof printKind) => navigate({ template })
  const [saved, setSaved] = useState(false)
  const sections: Array<{
    key: ReferenceSettingsKey
    label: string
    shortLabel: string

    emptyText: string
    placeholder: string
    readOnly?: boolean
  }> = [
    {
      key: 'materialTypes',
      label: 'Тип материала',
      shortLabel: 'Тип материала',

      emptyText: 'Список типов материала задан в приложении.',
      placeholder: '',
    },
    {
      key: 'ciphers',
      label: 'Шифры',
      shortLabel: 'Шифры',

      emptyText: 'Добавьте первый шифр, чтобы он появился в таблице количеств.',
      placeholder: 'Например: 300-ТХ-1',
    },
    {
      key: 'units',
      label: 'Единицы измерения',
      shortLabel: 'Единица измерения',

      emptyText: 'Добавьте единицу измерения для формы материала.',
      placeholder: 'Например: м',
    },
    {
      key: 'documents',
      label: 'Нормативные документы',
      shortLabel: 'Норм. документы',

      emptyText:
        'Добавьте нормативный документ, если хотите выбирать его из списка.',
      placeholder: 'Например: ГОСТ 9940-81',
    },
    {
      key: 'alloys',
      label: 'Состав',
      shortLabel: 'Состав',

      emptyText: 'Добавьте состав, если хотите выбирать его из списка.',
      placeholder: 'Например: 09Г2С',
    },
  ]
  const activeSection =
    sections.find((section) => section.key === activeTab) ?? sections[0]
  if (!activeSection) return null

  return (
    <section className="mt-5" aria-label="Настройки приложения">
      <div className="grid grid-cols-1 gap-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="grid content-start gap-2 self-start rounded-md border border-stone-200 bg-stone-50/70 p-2 md:block">
            <button
              type="button"
              className={`mb-2 w-full rounded-md px-3 py-3 text-left text-sm ${activeTab === 'numbering' ? 'bg-white font-medium shadow-sm' : 'text-stone-600 hover:bg-white'}`}
              onClick={() => setActiveTab('numbering')}
            >
              Нумерация документов
            </button>
            <button
              type="button"
              className={`mb-2 w-full rounded-md px-3 py-3 text-left text-sm ${activeTab === 'print' ? 'bg-white font-medium text-stone-900 shadow-sm ring-1 ring-stone-200' : 'text-stone-600 hover:bg-white'}`}
              onClick={() => setActiveTab('print')}
            >
              Шаблоны печати
            </button>
            <button
              type="button"
              className="mb-2 w-full rounded-md px-3 py-3 text-left text-sm hover:bg-white"
              onClick={() => setActiveTab('quality')}
            >
              Реквизиты документов
            </button>
            {sections.map((section) => {
              const active = activeTab === section.key

              return (
                <button
                  key={section.key}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200'
                      : 'text-stone-600 hover:bg-white/70 hover:text-stone-900'
                  }`}
                  type="button"
                  onClick={() => setActiveTab(section.key)}
                >
                  <span className="grid gap-0.5">
                    <span className="font-medium">{section.shortLabel}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {activeTab === 'numbering' ? (
            <DocumentNumberingSettings
              value={numbering}
              history={numberHistory}
              onSave={onSaveNumbering}
            />
          ) : activeTab === 'quality' ? (
            <QualitySettings
              value={qualityWorkflow}
              onChange={onChangeQualityWorkflow}
            />
          ) : activeTab === 'print' ? (
            <div className="grid content-start gap-4 min-w-0">
              <div
                className="flex flex-wrap gap-2"
                role="tablist"
                aria-label="Шаблоны печати"
              >
                {(['request', 'zni', 'avk'] as const).map((kind) => (
                  <Button
                    role="tab"
                    aria-selected={printKind === kind}
                    key={kind}
                    variant={printKind === kind ? 'default' : 'outline'}
                    onClick={() => setPrintKind(kind)}
                  >
                    {kind === 'request'
                      ? 'Заявка на получение'
                      : kind === 'zni'
                        ? 'ЗНИ'
                        : 'АВК'}
                  </Button>
                ))}
              </div>
              {printKind === 'request' ? (
                <RequestPrintSettings />
              ) : (
                <QualityPrintSettings key={printKind} kind={printKind} />
              )}
            </div>
          ) : activeSection.key === 'materialTypes' ? (
            <MaterialTypeSettingsSection
              materialTypes={materialTypeSettings}
              onChange={onChangeMaterialTypeSettings}
            />
          ) : (
            <ReferenceSettingsSection
              key={activeSection.key}
              id={activeSection.key}
              emptyText={activeSection.emptyText}
              label={activeSection.label}
              placeholder={activeSection.placeholder}
              value={draft[activeSection.key]}
              onChange={(value) =>
                onChangeDraft(
                  activeSection.key as keyof ReferenceSettingsDraft,
                  value,
                )
              }
            />
          )}
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}
        {!['print', 'quality', 'numbering'].includes(activeTab) && (
          <div className="flex items-center gap-2 border-t border-stone-200 pt-4">
            <Button
              onClick={() => {
                onSave()
                setSaved(true)
              }}
            >
              Сохранить
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                onDiscard()
                setSaved(false)
              }}
            >
              Отменить изменения
            </Button>
            {saved && !error && (
              <span role="status" className="text-sm text-emerald-700">
                Настройки применены.
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function MaterialTypeSettingsSection({
  materialTypes,
  onChange,
}: {
  materialTypes: Array<MaterialTypeSetting>
  onChange: (materialTypes: Array<MaterialTypeSetting>) => void
}) {
  function updateMaterialType(
    id: string,
    key: 'description' | 'name',
    value: string,
  ) {
    onChange(
      normalizeMaterialTypeSettings(
        materialTypes.map((item) =>
          item.id === id ? { ...item, [key]: value } : item,
        ),
      ),
    )
  }

  return (
    <div className="grid min-w-0 content-start gap-4 rounded-md border border-stone-200 bg-white p-4">
      <div>
        <div className="text-base font-medium text-stone-900">
          Тип материала
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Типов: {materialTypes.length}
        </p>
      </div>
      <OperationsGrid<MaterialTypeSetting>
        id="settings:materialTypes"
        label="Справочник: Тип материала"
        rows={materialTypes}
        rowId={(item) => item.id}
        pagination
        columns={[
          {
            id: 'name',
            title: 'Название типа',
            value: (item) => item.name,
            flex: 1,
            width: 260,
            onEdit: (item, value) => updateMaterialType(item.id, 'name', value),
            validateEdit: (value) =>
              value.trim() ? null : 'Введите название типа',
          },
          {
            id: 'description',
            title: 'Описание',
            value: (item) => item.description,
            flex: 2,
            width: 420,
            multiline: true,
            onEdit: (item, value) =>
              updateMaterialType(item.id, 'description', value),
          },
          {
            id: 'actions',
            title: 'Действия',
            value: () => '',
            actions: true,
            width: 188,
            render: (item) => {
              const standard = defaultMaterialTypeSettings.find(
                (value) => value.id === item.id,
              )
              const changed =
                standard &&
                (standard.name !== item.name ||
                  standard.description !== item.description)
              return (
                <RowActionButton
                  disabled={!changed}
                  aria-label={`Вернуть стандарт: ${item.name}`}
                  onClick={() => {
                    if (standard)
                      onChange(
                        materialTypes.map((value) =>
                          value.id === item.id ? standard : value,
                        ),
                      )
                  }}
                >
                  <RotateCcw size={14} aria-hidden="true" /> Вернуть стандарт
                </RowActionButton>
              )
            },
          },
        ]}
      />
    </div>
  )
}

function ReferenceSettingsSection({
  id,
  emptyText,
  label,
  placeholder,
  readOnly = false,
  value,
  onChange,
}: {
  id: string
  emptyText: string
  label: string
  placeholder: string
  readOnly?: boolean
  value: string
  onChange: (value: string) => void
}) {
  const [newValue, setNewValue] = useState('')
  const [pendingDeleteValue, setPendingDeleteValue] = useState<string | null>(
    null,
  )
  const values = parseReferenceDraft(value)

  function addValue() {
    const trimmed = newValue.trim()

    if (trimmed.length === 0) {
      return
    }

    onChange(serializeReferenceValues(unique([...values, trimmed])))
    setNewValue('')
  }

  function removeValue(item: string) {
    onChange(
      serializeReferenceValues(
        values.filter((valueItem) => valueItem !== item),
      ),
    )
    setPendingDeleteValue(null)
  }

  return (
    <div className="grid min-w-0 content-start gap-4 rounded-md border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div>
          <div className="text-base font-medium text-stone-900">{label}</div>
        </div>
      </div>

      {readOnly ? (
        <div className="rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2 text-sm leading-6 text-blue-900">
          Список доступен только для просмотра.
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder={placeholder}
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addValue()
                }
              }}
            />
          </div>
          <Button type="button" onClick={addValue}>
            <Plus size={16} />
            Добавить
          </Button>
        </div>
      )}

      {pendingDeleteValue ? (
        <div className="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm leading-6 text-red-800">
            Удалить из настроек:{' '}
            <span className="font-medium">{pendingDeleteValue}</span>?
          </div>
          <div className="flex shrink-0 justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPendingDeleteValue(null)}
            >
              Отмена
            </Button>
            <Button
              className="bg-red-700 text-white hover:bg-red-800"
              size="sm"
              onClick={() => removeValue(pendingDeleteValue)}
            >
              Удалить
            </Button>
          </div>
        </div>
      ) : null}

      <OperationsGrid<string>
        id={`settings:${id}`}
        label={`Справочник: ${label}`}
        rows={values}
        rowId={(item) => item}
        pagination
        columns={[
          {
            id: 'value',
            title: 'Наименование',
            value: (item) => item,
            width: 600,
            flex: 1,
          },
          ...(readOnly
            ? []
            : [
                {
                  id: 'actions',
                  title: 'Действия',
                  value: () => '',
                  actions: true,
                  width: 150,
                  render: (item: string) => (
                    <RowActionButton
                      danger
                      aria-label={`Удалить ${item}`}
                      onClick={() => setPendingDeleteValue(item)}
                    >
                      <Trash2 size={15} />
                      Удалить
                    </RowActionButton>
                  ),
                },
              ]),
        ]}
      />
      {!values.length && <p className="text-sm text-stone-500">{emptyText}</p>}
    </div>
  )
}

function Modal({
  children,
  bodyClassName,
  footer,
  steps,
  open,
  size = 'md',
  title,
  hideHeader = false,
  onClose,
}: {
  children: React.ReactNode
  bodyClassName?: string
  footer?: React.ReactNode
  steps?: React.ReactNode
  open: boolean
  size?: 'md' | 'lg' | 'xl' | 'details'
  title: string
  hideHeader?: boolean
  onClose: () => void
}) {
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => previous?.focus()
  }, [open])
  if (!open) {
    return null
  }

  return (
    <EscapeLayer onEscape={onClose}>
      <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/30 px-4 py-6">
        <div
          className={`flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl ${
            size === 'xl'
              ? 'h-[min(900px,calc(100vh-2rem))] max-w-[1500px]'
              : size === 'lg'
                ? 'h-[min(820px,calc(100vh-3rem))] max-w-6xl'
                : size === 'details'
                  ? 'max-w-4xl'
                  : 'max-w-xl'
          }`}
          ref={dialog}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return
            const fields = [
              ...(dialog.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
              ) ?? []),
            ].filter((item) => item.getClientRects().length)
            const first = fields[0],
              last = fields.at(-1)
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === dialog.current)
            ) {
              event.preventDefault()
              last?.focus()
            }
            if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {!hideHeader && (
            <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                type="button"
                aria-label="Закрыть"
                onClick={onClose}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {steps}
          <div
            className={
              bodyClassName ?? 'min-h-0 flex-1 overflow-auto px-5 py-5'
            }
          >
            {children}
          </div>
          {footer}
        </div>
      </div>
    </EscapeLayer>
  )
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="grid gap-1.5 text-xs">
      <span className="font-normal leading-4 text-slate-500">{label}</span>
      {children}
    </div>
  )
}

function AutocompleteInput({
  ariaLabel,
  className,
  invalid,
  options,
  placeholder,
  value,
  onChange,
}: {
  ariaLabel?: string
  className?: string
  invalid?: boolean
  options: Array<string>
  placeholder?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className={className} aria-invalid={invalid || undefined}>
      <AppSelect
        label={ariaLabel ?? placeholder ?? 'Выбор значения'}
        value={value}
        allowCustom
        options={[
          { value: '', label: placeholder ?? 'Выберите значение' },
          ...unique(options).map((option) => ({
            value: option,
            label: option,
          })),
        ]}
        onChange={onChange}
      />
    </div>
  )
}

function buildSelectOptions(
  placeholder: string,
  values: Array<string>,
  currentValue: string,
) {
  const options = [
    { label: placeholder, value: '' },
    ...unique(values).map((value) => ({ label: value, value })),
  ]

  if (
    currentValue.trim().length > 0 &&
    !values.some(
      (value) =>
        normalizeOptionValue(value) === normalizeOptionValue(currentValue),
    )
  ) {
    options.splice(1, 0, {
      label: `${currentValue} (не из справочника)`,
      value: currentValue,
    })
  }

  return options
}

function normalizeStoredProjectWorkspace(
  value: unknown,
): StoredProjectWorkspace {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const parsed = value as StoredProjectWorkspace

  return {
    configuredAlloys: Array.isArray(parsed.configuredAlloys)
      ? parsed.configuredAlloys
      : undefined,
    configuredCiphers: Array.isArray(parsed.configuredCiphers)
      ? parsed.configuredCiphers
      : undefined,
    configuredDocuments: Array.isArray(parsed.configuredDocuments)
      ? parsed.configuredDocuments
      : undefined,
    configuredUnits: Array.isArray(parsed.configuredUnits)
      ? parsed.configuredUnits
      : undefined,
    lines: Array.isArray(parsed.lines) ? parsed.lines : undefined,
    materialTypeSettings: Array.isArray(parsed.materialTypeSettings)
      ? normalizeMaterialTypeSettings(parsed.materialTypeSettings)
      : undefined,
    materialIssues: Array.isArray(parsed.materialIssues)
      ? parsed.materialIssues
      : undefined,
    materialReceipts: Array.isArray(parsed.materialReceipts)
      ? parsed.materialReceipts
      : undefined,
    materialRequests: Array.isArray(parsed.materialRequests)
      ? parsed.materialRequests
      : undefined,
    qualityWorkflow: parsed.qualityWorkflow,
    projectChanges: parsed.projectChanges,
    stockTransfers: parsed.stockTransfers,
    m15Reconciliations: parsed.m15Reconciliations,
    documentNumbering: parsed.documentNumbering,
  }
}

function normalizeMaterialTypeSettings(
  settings?: Array<Partial<MaterialTypeSetting>>,
): Array<MaterialTypeSetting> {
  const settingsById = new Map(
    (settings ?? [])
      .filter((item) => typeof item.id === 'string')
      .map((item) => [item.id as string, item]),
  )

  return defaultMaterialTypeSettings.map((defaultItem) => {
    const saved = settingsById.get(defaultItem.id)
    const name =
      typeof saved?.name === 'string' && saved.name.trim().length > 0
        ? saved.name.trim()
        : defaultItem.name
    const description =
      typeof saved?.description === 'string'
        ? saved.description
        : defaultItem.description

    return {
      description,
      id: defaultItem.id,
      name,
    }
  })
}

function createMaterialImportDraft(
  importRows: Array<ImportRowInput>,
  context: {
    alloys: Array<string>
    ciphers: Array<string>
    documents: Array<string>
    existingMaterials: Array<MaterialMatrixRow>
    units: Array<string>
  },
): MaterialImportDraft {
  const validation = validateImportDraft(importRows)
  const existingKeys = new Set(
    context.existingMaterials.map((material) => material.key),
  )
  const missingCiphers = unique(
    validation.rows
      .map((row) => row.cipher)
      .filter((value) => value && !hasExactOption(context.ciphers, value)),
  )
  const missingUnits = unique(
    validation.rows
      .flatMap((row) => [row.unit, row.alternativeUnit ?? ''])
      .filter((value) => value && !hasExactOption(context.units, value)),
  )
  const missingDocuments = unique(
    validation.rows
      .map((row) => row.normativeDocument ?? '')
      .filter((value) => value && !hasExactOption(context.documents, value)),
  )
  const missingAlloys = unique(
    validation.rows
      .map((row) => row.material)
      .filter((value) => value && !hasExactOption(context.alloys, value)),
  )

  const draftRows = validation.rows.map((row) => {
    const identityKey = getMaterialIdentityKey(buildIdentityLineFromImport(row))
    const referenceErrors = getMaterialImportReferenceErrors(row, context)
    const errors = [...row.errors, ...referenceErrors]
    const isExistingCombination = existingKeys.has(identityKey)
    const warnings = [...row.warnings]

    return {
      errors,
      identityKey,
      isExistingCombination,
      row,
      warnings,
    } satisfies MaterialImportDraftRow
  })

  return {
    rows: draftRows,
    summary: buildMaterialImportSummary(draftRows, {
      missingAlloys,
      missingCiphers,
      missingDocuments,
      missingUnits,
    }),
  }
}

function clearMissingReferenceErrors(
  draft: MaterialImportDraft,
): MaterialImportDraft {
  const rows = draft.rows.map((entry) => ({
    ...entry,
    errors: entry.row.errors,
  }))

  return {
    rows,
    summary: buildMaterialImportSummary(rows, {
      missingAlloys: [],
      missingCiphers: [],
      missingDocuments: [],
      missingUnits: [],
    }),
  }
}

function buildMaterialImportSummary(
  rows: Array<MaterialImportDraftRow>,
  missing: Pick<
    MaterialImportDraft['summary'],
    'missingAlloys' | 'missingCiphers' | 'missingDocuments' | 'missingUnits'
  >,
): MaterialImportDraft['summary'] {
  return {
    errorRows: rows.filter((entry) => entry.errors.length > 0).length,
    existingRows: rows.filter(
      (entry) => entry.errors.length === 0 && entry.isExistingCombination,
    ).length,
    ...missing,
    newRows: rows.filter(
      (entry) => entry.errors.length === 0 && !entry.isExistingCombination,
    ).length,
    totalRows: rows.length,
    unknownReferenceRows: rows.filter(
      (entry) => entry.errors.length > entry.row.errors.length,
    ).length,
    validRows: rows.filter((entry) => entry.errors.length === 0).length,
  }
}

function getMaterialImportReferenceErrors(
  row: NormalizedImportRow,
  context: {
    alloys: Array<string>
    ciphers: Array<string>
    documents: Array<string>
    units: Array<string>
  },
) {
  const errors: Array<string> = []

  if (row.cipher && !hasExactOption(context.ciphers, row.cipher)) {
    errors.push(`Шифр «${row.cipher}» отсутствует в настройках.`)
  }

  if (row.unit && !hasExactOption(context.units, row.unit)) {
    errors.push(`Единица измерения «${row.unit}» отсутствует в настройках.`)
  }
  if (
    row.alternativeUnit &&
    !hasExactOption(context.units, row.alternativeUnit)
  ) {
    errors.push(
      `Альтернативная единица «${row.alternativeUnit}» отсутствует в настройках.`,
    )
  }

  if (
    row.normativeDocument &&
    !hasExactOption(context.documents, row.normativeDocument)
  ) {
    errors.push(
      `Нормативный документ «${row.normativeDocument}» отсутствует в настройках.`,
    )
  }

  if (row.material && !hasExactOption(context.alloys, row.material)) {
    errors.push(`Состав «${row.material}» отсутствует в настройках.`)
  }

  return errors
}

function unique(values: Array<string>) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ru'),
  )
}

function parseReferenceDraft(value: string) {
  return unique(
    value
      .split(/\r?\n|,/)
      .map((cipher) => cipher.trim())
      .filter(Boolean),
  )
}

function serializeReferenceValues(values: Array<string>) {
  return unique(values).join('\n')
}

function getInvalidDropdownSelections(
  fields: Array<{
    label: string
    options: Array<string>
    required?: boolean
    value: string
  }>,
) {
  return fields
    .filter(({ options, required, value }) => {
      const trimmed = value.trim()

      if (trimmed.length === 0) {
        return Boolean(required)
      }

      return !hasExactOption(options, trimmed)
    })
    .map((field) => field.label)
}

function getMaterialFormSaveHint({
  alternativeUnits,
  alloys,
  documents,
  editing,
  existingMaterials,
  form,
  materialTypes,
  units,
}: {
  alternativeUnits: Array<string>
  alloys: Array<string>
  documents: Array<string>
  editing: boolean
  existingMaterials: Array<MaterialMatrixRow>
  form: typeof emptyNewLine
  materialTypes: Array<string>
  units: Array<string>
}) {
  if (!form.projectMaterialName.trim()) {
    return 'Нельзя сохранить: введите наименование по проекту.'
  }
  const conversionError = getAlternativeConversionError(
    form.alternativeUnit,
    form.alternativeUnitFactor,
  )
  if (conversionError) return `Нельзя сохранить: ${conversionError}`

  if (!form.unit.trim()) {
    return 'Нельзя сохранить: выберите единицу измерения из списка.'
  }

  if (!form.materialType.trim()) {
    return 'Нельзя сохранить: выберите тип материала из списка.'
  }

  const invalidSelections = getInvalidDropdownSelections([
    {
      label: 'тип материала',
      options: materialTypes,
      required: true,
      value: form.materialType,
    },
    {
      label: 'нормативный документ',
      options: documents,
      value: form.normativeDocument,
    },
    {
      label: 'состав',
      options: alloys,
      value: form.material,
    },
    {
      label: 'единица измерения',
      options: units,
      required: true,
      value: form.unit,
    },
    {
      label: 'альтернативную единицу измерения',
      options: alternativeUnits,
      value: form.alternativeUnit,
    },
  ])

  if (invalidSelections.length > 0) {
    return `Нельзя сохранить: выберите из выпадающего списка ${invalidSelections.join(', ')}.`
  }

  if (!editing) {
    const nextGroupKey = getMaterialIdentityKey(buildIdentityLineFromForm(form))
    const duplicate = existingMaterials.find((row) => row.key === nextGroupKey)

    if (duplicate) {
      return `Нельзя создать дубль: такая комбинация уже есть (${duplicate.projectMaterialName}). Выберите ее в списке слева.`
    }
  }

  return ''
}

function hasExactOption(options: Array<string>, value: string) {
  const normalizedValue = normalizeOptionValue(value)

  return options.some(
    (option) => normalizeOptionValue(option) === normalizedValue,
  )
}

function normalizeReferenceOption(options: Array<string>, value: string) {
  return (
    options.find(
      (option) => normalizeOptionValue(option) === normalizeOptionValue(value),
    ) ?? value.trim()
  )
}

function normalizeOptionValue(value: string) {
  return value.trim().toLocaleLowerCase('ru').replace(/\s+/g, ' ')
}

function materialCombinationMatchesSearch(
  row: MaterialMatrixRow,
  search: string,
) {
  const tokens = tokenizeSearchValue(search)

  if (tokens.length === 0) {
    return true
  }

  const haystack = normalizeSearchValue(
    [
      row.materialType,
      row.materialId,
      row.projectMaterialName,
      row.normativeDocument,
      row.unit,
      row.material,
      row.alternativeUnit,
      formatQuantity(row.totalQuantity),
      row.unitWeight === null ? '' : formatQuantity(row.unitWeight),
      ...Object.entries(row.cipherQuantities).flatMap(([cipher, quantity]) => [
        cipher,
        formatQuantity(quantity),
        `${cipher} ${formatQuantity(quantity)}`,
      ]),
    ].join(' '),
  )

  return tokens.every((token) => haystack.includes(token))
}

function tokenizeSearchValue(value: string) {
  return normalizeSearchValue(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
}

function buildMaterialMatrix(
  lines: Array<SubobjectMaterialMetric>,
): Array<MaterialMatrixRow> {
  const rowMap = new Map<string, MaterialMatrixRow>()

  for (const line of lines) {
    const key = getMaterialIdentityKey(line)
    const current =
      rowMap.get(key) ??
      ({
        key,
        firstLineId: line.id ?? '',
        lineIds: [],
        material: line.material,
        materialId: line.materialId ?? '',
        projectMaterialName: line.projectMaterialName ?? '',
        changeNumber: '',
        materialType: line.materialType ?? line.category,
        normativeDocument: line.normativeDocument ?? '',
        unit: line.unit,
        unitWeight: line.unitWeight ?? null,
        alternativeUnit: line.alternativeUnit ?? '',
        alternativeUnitFactor: line.alternativeUnitFactor ?? null,
        totalQuantity: 0,
        cipherQuantities: {},
        cipherLineIds: {},
      } satisfies MaterialMatrixRow)

    current.totalQuantity += line.plannedQuantity
    if (line.id) {
      current.lineIds.push(line.id)
    }
    current.cipherQuantities[line.cipher] =
      (current.cipherQuantities[line.cipher] ?? 0) + line.plannedQuantity
    current.cipherLineIds[line.cipher] ??= line.id ?? ''
    rowMap.set(key, current)
  }

  return Array.from(rowMap.values())
}

function createLocalId() {
  return createClientId('line')
}

function buildEmptyAllocations(ciphers: Array<string>) {
  return Object.fromEntries(ciphers.map((cipher) => [cipher, '']))
}

function buildIdentityLineFromForm(
  form: typeof emptyNewLine,
): SubobjectMaterialMetric {
  return {
    id: 'identity-preview',
    project: 'Проектная база',
    cipher: 'identity-preview',
    category: form.materialType.trim() || 'Материалы',
    materialId: optionalText(form.materialId),
    projectMaterialName: optionalText(form.projectMaterialName),
    changeNumber: null,
    materialType: optionalText(form.materialType),
    normativeDocument: optionalText(form.normativeDocument),
    material: form.material.trim(),
    plannedQuantity: 0,
    unit: form.unit.trim(),
    unitWeight: optionalNumber(form.unitWeight),
    alternativeUnit: optionalText(form.alternativeUnit),
    alternativeUnitFactor: optionalNumber(form.alternativeUnitFactor),
    requested: 0,
    received: 0,
    qcPending: 0,
    accepted: 0,
    issued: 0,
    returned: 0,
    writtenOff: 0,
  }
}

function getChangedMaterialCellKeys(
  line: SubobjectMaterialMetric,
  form: typeof emptyNewLine,
) {
  const changed: Array<string> = []
  const nextUnitWeight = optionalNumber(form.unitWeight)

  if (
    (line.materialType ?? line.category) !==
    (form.materialType.trim() || 'Материалы')
  ) {
    changed.push('materialType')
  }

  if ((line.materialId ?? '') !== form.materialId.trim()) {
    changed.push('materialId')
  }

  if ((line.projectMaterialName ?? '') !== form.projectMaterialName.trim()) {
    changed.push('projectMaterialName')
  }

  if ((line.normativeDocument ?? '') !== form.normativeDocument.trim()) {
    changed.push('normativeDocument')
  }

  if (line.unit !== form.unit.trim()) {
    changed.push('unit')
  }

  if (line.material !== form.material.trim()) {
    changed.push('material')
  }

  if ((line.unitWeight ?? null) !== nextUnitWeight) {
    changed.push('unitWeight')
  }
  if (
    (line.alternativeUnit ?? '') !== form.alternativeUnit.trim() ||
    (line.alternativeUnitFactor ?? null) !==
      optionalNumber(form.alternativeUnitFactor)
  ) {
    changed.push('alternativeUnit', 'alternativeUnitFactor')
  }

  return changed
}

function optionalText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function optionalNumber(value: string) {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  const parsed = Number(trimmed.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function downloadWorkbook(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 3,
  }).format(value)
}

function formatAlternativeQuantity(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 12 }).format(
    value,
  )
}
