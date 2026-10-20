import { createPortal } from 'react-dom'
import { OperationsGrid } from './operations-grid'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { GridApi } from 'ag-grid-community'
import {
  BarChart3,
  ClipboardCheck,
  Database,
  ChevronDown,
  Download,
  Pencil,
  FileInput,
  FileSpreadsheet,
  FolderKanban,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Send,
  Settings,
  Trash2,
  Undo2,
  Workflow,
  X,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import {
  getAlternativeConversionError,
  getMaterialRequestConversion,
  getOperationAlternative,
  getOperationConversion,
  recalculateOperationAlternatives,
  recalculateRequestAlternatives,
  validateImportDraft,
} from './domain'
import { buildOperationActivityIndex } from './operation-activity'
import { localDateInputValue, normalizeCalendarDate } from './calendar-date'
import {
  isViewBoolean,
  isViewExpanded,
  isViewString,
  useWorkspaceViewScroll,
  useWorkspaceViewState,
} from './workspace-view'
import { ProjectMaterialGrid } from './project-material-grid'
import { parseProjectQuantity } from './project-grid-state'
import type {
  MaterialMatrixRow,
  MaterialHighlight,
  PendingDeleteMaterial,
} from './project-grid-state'
import {
  ProjectMatrixColumnSettings,
  useProjectMatrixColumns,
} from './project-matrix-columns'
import {
  readWorkspaceCache,
  writeWorkspaceCache,
  toWorkspaceSnapshot,
} from './workspace-snapshot'
import type { LoadedWorkspace } from './workspace-snapshot'
import { createWorkspaceSaver } from './workspace-saver'
import { RequestPrintButton, RequestPrintSettings } from './request-print-ui'
import {
  inspectionApprovals,
  validateQualityWorkspace,
} from './quality-workflow'
import type { QualityWorkflow } from './quality-workflow'
import {
  InspectionWorkspace,
  TransferActs,
  QualitySettings,
} from './quality-workflow-ui'
import type { WorkspaceSaveStatus } from './workspace-saver'
import {
  getSubobjectMaterialPlan,
  saveProjectWorkspaceSnapshot,
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

type PlanData = Awaited<ReturnType<typeof getSubobjectMaterialPlan>>
type Section = 'database' | 'operations'
type OperationDocumentTab =
  | 'overview'
  | 'requests'
  | 'receipts'
  | 'quality'
  | 'issues'
type OperationActionTab = Exclude<OperationDocumentTab, 'overview'>
type OperationDeletion = {
  title: string
  details: string
} & (
  | { kind: 'receipts'; ids: Array<string> }
  | { kind: 'quality' | 'issues'; id: string }
)
type QualityControlStatus = 'in_progress' | 'signed'
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
  altQuantity: number | null
  altUnit: string
  altUnitFactor?: number | null
  cipher: string
  date: string
  id: string
  materialId: string
  note: string
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
  actualName: string
  altQuantity: number | null
  altUnit: string
  altUnitFactor?: number | null
  certificate: string
  customerArvk: string
  customerReceiptDocument: string
  date: string
  factoryNumber: string
  heatBatch: string
  id: string
  invoiceNumber: string
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
  entries: Array<MaterialReceiptEntry>
  invoiceNumbers: Array<string>
  key: string
  latestChangeOrder: number
  quantity: number
  requestNumbers: Array<string>
  replacement: boolean
}
type ReceiptGroupMeta = {
  group: ReceiptRequestGroup
  materialType: string
  searchText: string
}
type ReceiptRequestGroup = {
  key: string
  request: RequestDocumentGroup | null
  entries: Array<MaterialReceiptEntry>
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
type QualityControlEntry = {
  arvkDate: string
  arvkNumber: string
  author: string
  comment: string
  date: string
  id: string
  projectLineId: string
  quantity: number
  receiptId: string
  status: QualityControlStatus
  zniNumber: string
}
type MaterialIssueEntry = {
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
  qualityControls?: Array<QualityControlEntry>
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
    description: string
    empty: string
    icon: React.ReactNode
    label: string
  }
> = {
  overview: {
    action: '',
    description:
      'Сводка по каждой позиции материала: по шифрам и всего по проекту.',
    empty: 'Материалов пока нет.',
    icon: <BarChart3 size={18} />,
    label: 'Общие данные',
  },
  requests: {
    action: 'Создать заявку',
    description: 'Один шифр и один тип материала.',
    empty: 'Заявок пока нет.',
    icon: <FileInput size={18} />,
    label: 'Заявки',
  },
  receipts: {
    action: 'Оформить получение',
    description:
      'Раскройте заявку, чтобы увидеть её материалы, поступления и накладные.',
    empty: 'Заявок и получений пока нет.',
    icon: <PackageCheck size={18} />,
    label: 'Получение',
  },
  quality: {
    action: 'Создать ЗНИ',
    description:
      'ЗНИ на выбранные материалы или весь АПП и АВК с результатами приёмки.',
    empty: 'Документов входного контроля пока нет.',
    icon: <ClipboardCheck size={18} />,
    label: 'Входной контроль',
  },
  issues: {
    action: 'Выдать в монтаж',
    description: 'Выдача идет из материала, который прошел входной контроль.',
    empty: 'Выдач в монтаж пока нет.',
    icon: <Send size={18} />,
    label: 'Выдача',
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
  initialData,
  initialStoredData,
}: {
  initialData: PlanData
  initialStoredData: LoadedWorkspace
}) {
  const { data } = useQuery({
    queryKey: ['project-material-plan', 'default'],
    queryFn: () =>
      getSubobjectMaterialPlan({ data: { subobjectId: 'project-1' } }),
    initialData,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const initialLines = useMemo(
    () =>
      data.categories.flatMap((category) => category.rows).map(withStableId),
    [data.categories],
  )
  const lastHorizontalScrollRef = useRef(0)
  const [loadedWorkspace] = useState(() => {
    if (typeof window === 'undefined')
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
  const [section, setSection] = useWorkspaceViewState<Section>(
    'section',
    'operations',
    (value): value is Section => value === 'operations' || value === 'database',
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useWorkspaceViewState(
    'sidebarCollapsed',
    false,
    isViewBoolean,
  )
  const [lines, setLines] = useState<Array<SubobjectMaterialMetric>>(
    () => storedWorkspace.lines?.map(withStableId) ?? initialLines,
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
  const [materialImportOpen, setMaterialImportOpen] = useState(false)
  const [materialImportDraft, setMaterialImportDraft] =
    useState<MaterialImportDraft | null>(null)
  const [pendingDeleteMaterial, setPendingDeleteMaterial] =
    useState<PendingDeleteMaterial | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [excelMenuOpen, setExcelMenuOpen] = useState(false)
  const [configuredCiphers, setConfiguredCiphers] = useState<Array<string>>(
    () =>
      storedWorkspace.configuredCiphers ??
      unique(
        data.categories
          .flatMap((category) => category.rows)
          .map((line) => line.cipher),
      ),
  )
  const [configuredUnits, setConfiguredUnits] = useState<Array<string>>(
    () =>
      storedWorkspace.configuredUnits ??
      unique([
        'шт',
        'м',
        ...data.categories
          .flatMap((category) => category.rows)
          .map((line) => line.unit),
      ]),
  )
  const [configuredDocuments, setConfiguredDocuments] = useState<Array<string>>(
    () =>
      storedWorkspace.configuredDocuments ??
      unique(
        data.categories
          .flatMap((category) => category.rows)
          .map((line) => line.normativeDocument ?? ''),
      ),
  )
  const [configuredAlloys, setConfiguredAlloys] = useState<Array<string>>(
    () =>
      storedWorkspace.configuredAlloys ??
      unique(
        data.categories
          .flatMap((category) => category.rows)
          .map((line) => line.material),
      ),
  )
  const [materialTypeSettings, setMaterialTypeSettings] = useState<
    Array<MaterialTypeSetting>
  >(() => normalizeMaterialTypeSettings(storedWorkspace.materialTypeSettings))
  const [settingsDraft, setSettingsDraft] = useState<ReferenceSettingsDraft>({
    ciphers: '',
    units: '',
    documents: '',
    alloys: '',
  })
  const [storedMaterialRequests, setMaterialRequests] = useState<
    Array<MaterialRequestEntry>
  >(() => storedWorkspace.materialRequests ?? [])
  const materialRequests = useMemo(
    () => recalculateRequestAlternatives(storedMaterialRequests, lines),
    [storedMaterialRequests, lines],
  )
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
      getOperationConversion(
        lineById.get(entry.projectLineId),
        entry.projectUnit,
        entry,
        requestById.get(entry.requestId),
      ),
    )
  }, [storedMaterialReceipts, lines, materialRequests])
  useEffect(() => {
    if (materialReceipts !== storedMaterialReceipts)
      setMaterialReceipts(materialReceipts)
  }, [materialReceipts, storedMaterialReceipts])
  const [legacyQualityControls, setQualityControls] = useState<
    Array<QualityControlEntry>
  >(() => storedWorkspace.qualityControls ?? [])
  const [qualityWorkflow, setQualityWorkflow] = useState<
    QualityWorkflow | undefined
  >(() => storedWorkspace.qualityWorkflow)
  const qualityControls = useMemo(
    () => [...legacyQualityControls, ...inspectionApprovals(qualityWorkflow)],
    [legacyQualityControls, qualityWorkflow],
  )
  function updateQualityWorkflow(next: QualityWorkflow) {
    validateQualityWorkspace(
      {
        qualityWorkflow: next,
        materialReceipts,
        materialIssues,
        qualityControls: legacyQualityControls,
      },
      {
        qualityWorkflow,
        materialReceipts,
        materialIssues,
        qualityControls: legacyQualityControls,
      },
    )
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
      return getOperationConversion(
        lineById.get(entry.projectLineId),
        entry.projectUnit ?? receipt?.projectUnit,
        entry,
        receipt,
      )
    })
  }, [storedMaterialIssues, lines, materialReceipts])
  useEffect(() => {
    if (materialIssues !== storedMaterialIssues)
      setMaterialIssues(materialIssues)
  }, [materialIssues, storedMaterialIssues])
  const [notice, setNotice] = useState(
    'Добавьте первую позицию материала или импортируйте Excel.',
  )
  const [lastAction, setLastAction] = useState('')

  const [workspaceClientId] = useState(() => crypto.randomUUID())
  const [saveStatus, setSaveStatus] = useState<WorkspaceSaveStatus>('saved')
  const [workspaceSaver] = useState(() =>
    createWorkspaceSaver({
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
        qualityControls: legacyQualityControls,
        qualityWorkflow,
      }),
      revision: initialStoredData.revision,
      pending: loadedWorkspace.pending,
      save: (workspace, expectedRevision) =>
        saveProjectWorkspaceSnapshot({ data: { workspace, expectedRevision } }),
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
    workspaceSaver.update(
      toWorkspaceSnapshot({
        configuredAlloys,
        configuredCiphers,
        configuredDocuments,
        configuredUnits,
        lines,
        materialTypeSettings,
        materialIssues,
        materialReceipts,
        materialRequests,
        qualityControls: legacyQualityControls,
        qualityWorkflow,
      }),
    )
  }, [
    workspaceSaver,
    configuredAlloys,
    configuredCiphers,
    configuredDocuments,
    configuredUnits,
    lines,
    materialTypeSettings,
    materialIssues,
    materialReceipts,
    materialRequests,
    legacyQualityControls,
    qualityWorkflow,
  ])

  useEffect(() => {
    function handleHorizontalScroll(event: Event) {
      if (sidebarCollapsed) {
        return
      }

      const targetScrollLeft = getHorizontalScrollLeft(event.target)
      const scrollLeft = Math.max(window.scrollX, targetScrollLeft)

      if (
        scrollLeft > 24 &&
        scrollLeft >= lastHorizontalScrollRef.current + 4
      ) {
        setSidebarCollapsed(true)
      }

      lastHorizontalScrollRef.current = scrollLeft
    }

    window.addEventListener('scroll', handleHorizontalScroll, {
      capture: true,
      passive: true,
    })

    return () => {
      window.removeEventListener('scroll', handleHorizontalScroll, {
        capture: true,
      })
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }

      if (pendingDeleteMaterial) {
        event.preventDefault()
        setPendingDeleteMaterial(null)
        return
      }

      if (materialImportOpen) {
        event.preventDefault()
        setMaterialImportOpen(false)
        return
      }

      if (settingsOpen) {
        event.preventDefault()
        setSettingsOpen(false)
        return
      }

      if (materialModalOpen) {
        event.preventDefault()
        setMaterialModalOpen(false)
        setEditingLineId(null)
        return
      }

      event.preventDefault()
      setSelectedCombinationKey(null)
      setImportedCombinationKeys([])
      setCipherFilter('all')
      setTableFilterResetVersion((version) => version + 1)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    materialImportOpen,
    materialModalOpen,
    pendingDeleteMaterial,
    settingsOpen,
  ])

  const selectedLine = lines.find((line) => line.id === selectedLineId)
  const filteredLines = useMemo(
    () =>
      lines.filter((line) => {
        const matchesCipher =
          cipherFilter === 'all' || line.cipher === cipherFilter
        const matchesCombination =
          selectedCombinationKey !== null
            ? getMaterialIdentityKey(line) === selectedCombinationKey
            : importedCombinationKeys.length === 0 ||
              importedCombinationKeys.includes(getMaterialIdentityKey(line))

        return matchesCipher && matchesCombination
      }),
    [cipherFilter, importedCombinationKeys, lines, selectedCombinationKey],
  )
  // Zero allocations retain stable IDs for document history, but must not
  // resurrect ciphers that the user removed from the reference list.
  const ciphersForSelect = useMemo(
    () =>
      unique([
        ...configuredCiphers,
        ...lines
          .filter((line) => line.plannedQuantity !== 0)
          .map((line) => line.cipher),
      ]),
    [configuredCiphers, lines],
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
    () => buildMaterialMatrix(lines),
    [lines],
  )
  const selectedCombination = selectedCombinationKey
    ? materialCombinations.find((row) => row.key === selectedCombinationKey)
    : undefined

  function openAddMaterialModal() {
    setEditingLineId(null)
    setNewLine({
      ...emptyNewLine,
      cipher: ciphersForSelect[0] ?? '',
      unit: unitsForSelect[0] ?? '',
      cipherQuantities: buildEmptyAllocations(ciphersForSelect),
    })
    setMaterialModalOpen(true)
  }

  function openSettingsModal() {
    setSettingsError('')
    setSettingsDraft({
      ciphers: serializeReferenceValues(ciphersForSelect),
      units: serializeReferenceValues(unitsForSelect),
      documents: serializeReferenceValues(documentsForSelect),
      alloys: serializeReferenceValues(alloysForSelect),
    })
    setSettingsOpen(true)
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
    setSettingsOpen(false)
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
    const line = lines.find((item) => item.id === lineId)

    if (!line) {
      return
    }

    const groupKey = getMaterialIdentityKey(line)
    const groupLines = lines.filter(
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
      ? lines.find((line) => line.id === editingLineId)
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
    const duplicateLine = lines.find((line) => {
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
      ? lines.filter((line) => getMaterialIdentityKey(line) === oldGroupKey)
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
              project: 'Проектная база',
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

    setLines((current) =>
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
      ? `Обновлен материал ${newLine.projectMaterialName.trim()}.`
      : `Добавлен материал ${newLine.projectMaterialName.trim()}.`
    setNotice(message)
    setLastAction(message)
  }

  function deleteProjectLines(lineIds: Array<string>) {
    const ids = new Set(lineIds)
    const deletedSelected = selectedLineId ? ids.has(selectedLineId) : false

    setLines((current) => {
      const next = current.filter((line) => !ids.has(line.id ?? ''))

      if (deletedSelected) {
        setSelectedLineId(next[0]?.id ?? '')
      }

      return next
    })
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

    setLines((current) => {
      if (lineId) {
        return current.map((line) =>
          line.id === lineId ? { ...line, plannedQuantity: quantity } : line,
        )
      }

      const createdLine = withStableId({
        id: createLocalId(),
        project: 'Проектная база',
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

    setLines((current) =>
      current.map((line) =>
        getProjectLineId(line) === lineId
          ? { ...line, plannedQuantity: quantity }
          : line,
      ),
    )
  }

  async function handleMaterialImportFile(file: File) {
    const { parseProjectMaterialsWorkbook } = await import('./excel')
    const workbookRows = parseProjectMaterialsWorkbook(await file.arrayBuffer())
    const draft = createMaterialImportDraft(workbookRows, {
      alloys: alloysForSelect,
      ciphers: ciphersForSelect,
      documents: documentsForSelect,
      existingMaterials: materialCombinations,
      units: unitsForSelect,
    })

    setMaterialImportDraft(draft)
    const message = `Черновик материала: ${draft.summary.validRows} можно импортировать, ${draft.summary.errorRows} требуют правки.`
    setNotice(message)
    setLastAction(message)
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

  function applyMaterialImportDraft() {
    if (!materialImportDraft || materialImportDraft.summary.errorRows > 0) {
      setNotice(
        'Импорт нельзя применить: сначала исправьте позиции с ошибками или справочники.',
      )
      return
    }

    const validRows = materialImportDraft.rows.map((entry) => entry.row)
    const importedKeys = unique(
      materialImportDraft.rows
        .map((entry) => entry.identityKey)
        .filter((key): key is string => Boolean(key)),
    )
    const firstIdentityKey = importedKeys[0] ?? null

    setLines((current) => applyMaterialImportRows(current, validRows))
    setSelectedCombinationKey(null)
    setImportedCombinationKeys(importedKeys)
    setCipherFilter('all')
    setTableFilterResetVersion((version) => version + 1)
    if (firstIdentityKey) {
      flashMaterialRow(firstIdentityKey, [
        'materialType',
        'materialId',
        'projectMaterialName',
        'normativeDocument',
        'unit',
        'material',
        'unitWeight',
      ])
    }
    setMaterialImportOpen(false)
    setMaterialImportDraft(null)
    setMaterialModalOpen(false)
    setEditingLineId(null)
    const message = `Импортировано комбинаций/количеств: ${validRows.length}.`
    setNotice(message)
    setLastAction(message)
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
    setMaterialRequests((current) => [...entries, ...current])
    const message = `Создана заявка ${entries[0]?.number ?? ''}: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function updateMaterialRequestEntries(
    originalNumber: string,
    entries: Array<MaterialRequestEntry>,
  ) {
    setMaterialRequests((current) => [
      ...entries,
      ...current.filter((entry) => entry.number !== originalNumber),
    ])
    const message = `Обновлена заявка ${entries[0]?.number ?? originalNumber}: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function deleteMaterialRequestEntries(number: string) {
    setMaterialRequests((current) =>
      current.filter((entry) => entry.number !== number),
    )
    const message = `Удалена заявка ${number}.`
    setNotice(message)
    setLastAction(message)
  }

  function addMaterialReceiptEntries(entries: Array<MaterialReceiptEntry>) {
    setMaterialReceipts((current) => [...entries, ...current])
    const message = `Оформлено получение: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function updateMaterialReceiptEntries(
    originalIds: Array<string>,
    entries: Array<MaterialReceiptEntry>,
  ) {
    const ids = new Set(originalIds)
    const nextReceipts = [
      ...entries,
      ...materialReceipts.filter((entry) => !ids.has(entry.id)),
    ]
    validateQualityWorkspace(
      {
        qualityWorkflow,
        materialReceipts: nextReceipts,
        materialIssues,
        qualityControls: legacyQualityControls,
      },
      {
        qualityWorkflow,
        materialReceipts,
        materialIssues,
        qualityControls: legacyQualityControls,
      },
    )
    setMaterialReceipts((current) => [
      ...entries,
      ...current.filter((entry) => !ids.has(entry.id)),
    ])
    const message = `Обновлено получение: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function addQualityControlEntries(entries: Array<QualityControlEntry>) {
    setQualityControls((current) => [...entries, ...current])
    const message = `Создан входной контроль: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function updateQualityControlStatus(
    id: string,
    status: QualityControlStatus,
  ) {
    const entry = qualityControls.find((control) => control.id === id)
    if (!entry || entry.status === status) return

    const error =
      status === 'in_progress'
        ? getQualityReductionError(
            entry,
            getSignedQuantityByReceipt(qualityControls).get(entry.receiptId) ??
              0,
            sumByKey(materialIssues, 'receiptId', 'quantity').get(
              entry.receiptId,
            ) ?? 0,
          )
        : ''
    if (error) {
      setNotice(error)
      return
    }

    setQualityControls((current) =>
      current.map((control) =>
        control.id === id ? { ...control, status } : control,
      ),
    )
    const document = entry.arvkNumber
      ? `АРВК №${entry.arvkNumber}`
      : `ЗНИ ${entry.zniNumber}`
    const message = `${document}: статус «${status === 'signed' ? 'Подписан' : 'В работе'}».`
    setNotice(message)
    setLastAction(message)
  }

  function addMaterialIssueEntries(entries: Array<MaterialIssueEntry>) {
    setMaterialIssues((current) => [...entries, ...current])
    const message = `Оформлена выдача в монтаж: ${entries.length} позиций.`
    setNotice(message)
    setLastAction(message)
  }

  function deleteOperation(target: OperationDeletion) {
    const error = getOperationDeletionError(
      target,
      materialReceipts,
      qualityControls,
      materialIssues,
      qualityWorkflow,
    )
    if (error) return error

    if (target.kind === 'receipts') {
      const ids = new Set(target.ids)
      setMaterialReceipts((current) =>
        current.filter((entry) => !ids.has(entry.id)),
      )
    } else if (target.kind === 'quality') {
      setQualityControls((current) =>
        current.filter((entry) => entry.id !== target.id),
      )
    } else {
      setMaterialIssues((current) =>
        current.filter((entry) => entry.id !== target.id),
      )
    }
    const message = `${target.kind === 'receipts' ? 'Удалено получение' : target.kind === 'quality' ? 'Удалён входной контроль' : 'Удалена выдача'}. Остатки пересчитаны.`
    setNotice(message)
    setLastAction(message)
    return ''
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      {loadedWorkspace.recovery ? (
        <div
          role="status"
          className="border-b border-amber-300 bg-amber-50 p-3 text-sm"
        >
          Найдена отличающаяся или повреждённая копия браузера. Скачайте её для
          восстановления.
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
          className="border-b border-amber-300 bg-amber-50 p-3 text-sm"
        >
          {saveStatus === 'saving'
            ? 'Сохранение…'
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
                <Button
                  variant="outline"
                  className="ml-3"
                  onClick={() => void workspaceSaver.retry()}
                >
                  Повторить сохранение
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      <div className="flex min-h-screen">
        <aside
          className={`sticky left-0 top-0 z-40 h-screen shrink-0 overflow-hidden border-r border-stone-200 bg-stone-100/90 py-6 transition-[width,padding] duration-300 ease-out ${
            sidebarCollapsed ? 'w-[68px] px-2.5' : 'w-[280px] px-5'
          }`}
        >
          <div
            className={`flex items-center ${
              sidebarCollapsed ? 'justify-center' : 'justify-between gap-3'
            }`}
          >
            <div
              className={`items-center gap-3 ${
                sidebarCollapsed ? 'hidden' : 'flex'
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-stone-700 text-white">
                <FolderKanban size={20} />
              </div>
              <div>
                <div className="font-semibold">Материалы</div>
              </div>
            </div>
            <button
              className={`inline-flex shrink-0 items-center justify-center rounded-md border text-stone-500 outline-none transition-[background-color,border-color,color,box-shadow,width,height] duration-200 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-300 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-100 ${
                sidebarCollapsed
                  ? 'h-10 w-full border-transparent bg-transparent shadow-none hover:border-stone-200 hover:bg-white hover:shadow-sm'
                  : 'h-9 w-9 border-stone-200 bg-white shadow-sm hover:bg-stone-50'
              }`}
              type="button"
              aria-label={sidebarCollapsed ? 'Показать меню' : 'Скрыть меню'}
              title={sidebarCollapsed ? 'Показать меню' : 'Скрыть меню'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                lastHorizontalScrollRef.current = 0
                setSidebarCollapsed((collapsed) => !collapsed)
              }}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={17} />
              ) : (
                <PanelLeftClose size={17} />
              )}
            </button>
          </div>

          <nav
            className={sidebarCollapsed ? 'mt-4 grid gap-3' : 'mt-7 grid gap-2'}
          >
            <NavButton
              active={section === 'operations'}
              collapsed={sidebarCollapsed}
              icon={<Workflow size={17} />}
              label="Операции"
              onClick={() => {
                setSection('operations')
                setExcelMenuOpen(false)
                setNotice('Открыт учетный маршрут выбранного материала.')
                setLastAction('Переход: Операции.')
              }}
            />
            <NavButton
              active={section === 'database'}
              collapsed={sidebarCollapsed}
              icon={<Database size={17} />}
              label="Проектная база"
              onClick={() => {
                setSection('database')
                setNotice('Открыта проектная база материалов.')
                setLastAction('Переход: Проектная база.')
              }}
            />
          </nav>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 border-b border-stone-200 pb-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">
                {section === 'database'
                  ? 'Проектная база материалов'
                  : 'Учетный маршрут материала'}
              </h1>
              <p className="mt-1 text-sm text-stone-500">
                {section === 'database'
                  ? 'Общий список материала из спецификаций: шифр, реквизиты материала и количество.'
                  : 'Заявка, получение, входной контроль и выдача на линию по выбранной проектной позиции.'}
              </p>
            </div>

            {section === 'database' ? (
              <div className="flex flex-wrap gap-2">
                <div className="relative z-50">
                  <Button
                    variant="outline"
                    onClick={() => setExcelMenuOpen((open) => !open)}
                  >
                    <FileSpreadsheet size={16} />
                    Excel
                    <ChevronDown size={15} />
                  </Button>
                  {excelMenuOpen ? (
                    <div className="absolute right-0 z-[80] mt-2 w-72 overflow-hidden rounded-md border border-stone-200 bg-white shadow-xl">
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
                    </div>
                  ) : null}
                </div>
                <Button variant="outline" onClick={openSettingsModal}>
                  <Settings size={16} />
                  Настройка
                </Button>
              </div>
            ) : null}
          </header>

          {section === 'database' ? (
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
              onRequestDelete={(material) => setPendingDeleteMaterial(material)}
              onEditLine={openEditMaterialModal}
              onSelectLine={(lineId) => {
                setSelectedLineId(lineId)
                setNotice('Выбрана позиция материала.')
                setLastAction('Выбор позиции материала.')
              }}
              onUpdateQuantity={updateProjectQuantity}
            />
          ) : (
            <OperationsSection
              qualityWorkflow={qualityWorkflow}
              onChangeQualityWorkflow={updateQualityWorkflow}
              prepareRequestPrint={() => workspaceSaver.waitUntilSaved()}
              availableCiphers={ciphersForSelect}
              configuredUnits={configuredUnits}
              lines={lines}
              materialIssues={materialIssues}
              materialReceipts={materialReceipts}
              materialRequests={materialRequests}
              qualityControls={qualityControls}
              onAdjustProjectQuantity={setProjectLineQuantity}
              onCreateIssues={addMaterialIssueEntries}
              onCreateQualityControls={addQualityControlEntries}
              onCreateReceipts={addMaterialReceiptEntries}
              onCreateRequests={addMaterialRequestEntries}
              onDeleteRequests={deleteMaterialRequestEntries}
              onDeleteOperation={deleteOperation}
              onUpdateQualityStatus={updateQualityControlStatus}
              onUpdateReceipts={updateMaterialReceiptEntries}
              onUpdateRequests={updateMaterialRequestEntries}
            />
          )}

          <div className="sr-only" aria-live="polite">
            {notice} {lastAction}
          </div>

          <MaterialModal
            alternativeUnits={configuredUnits}
            alloys={alloysForSelect}
            documents={documentsForSelect}
            editing={Boolean(editingLineId)}
            existingMaterials={materialCombinations}
            form={newLine}
            materialTypes={materialTypesForSelect}
            open={materialModalOpen}
            units={unitsForSelect}
            onChange={setNewLine}
            onClose={() => {
              setMaterialModalOpen(false)
              setEditingLineId(null)
            }}
            onOpenSettings={openSettingsModal}
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

          <MaterialImportModal
            draft={materialImportDraft}
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

          <SettingsModal
            qualityWorkflow={qualityWorkflow}
            onChangeQualityWorkflow={updateQualityWorkflow}
            draft={settingsDraft}
            error={settingsError}
            materialTypeSettings={materialTypeSettings}
            open={settingsOpen}
            onChangeDraft={(key, value) => {
              setSettingsError('')
              setSettingsDraft((current) => ({ ...current, [key]: value }))
            }}
            onChangeMaterialTypeSettings={setMaterialTypeSettings}
            onClose={() => setSettingsOpen(false)}
            onSave={saveSettings}
          />
        </div>
      </div>
    </main>
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
}: {
  cipherFilter: string
  ciphers: Array<string>
  highlight: MaterialHighlight | null
  lines: Array<SubobjectMaterialMetric>
  selectedCombination: MaterialMatrixRow | undefined
  selectedImportedCount: number
  selectedLineId: string
  tableFilterResetVersion: number
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

  return (
    <section
      ref={viewScrollRef}
      className="mt-5 grid min-w-0 grid-cols-1 gap-5"
    >
      <Card className="min-w-0">
        <CardHeader className="gap-3">
          <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] 2xl:items-start">
            <div className="min-w-0">
              <CardTitle>Общий проектный материал</CardTitle>
              <CardDescription>
                Материалы позициями, реквизиты отдельными колонками, шифры
                отдельными столбцами.
              </CardDescription>
            </div>
            <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto_160px] lg:items-start">
              <div className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="relative min-w-0">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={17}
                  />
                  <Input
                    className="h-10 bg-white pl-9 text-sm"
                    placeholder="Поиск по типу, наименованию, нормативному документу, составу, шифру или количеству"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <span className="whitespace-nowrap px-2 text-sm text-slate-500">
                  Найдено {visibleMatrixRows.length} из {matrixRows.length}{' '}
                  позиций
                </span>
              </div>
              <Button onClick={onAddMaterial}>
                <Plus size={16} />
                Материал
              </Button>
              <NativeSelect
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
          </div>
          <ProjectMatrixColumnSettings
            ciphers={matrixCiphers}
            hiddenColumns={hiddenColumns}
            onChange={changeHiddenColumns}
          />
        </CardHeader>
        <CardContent className="p-0">
          {selectedCombination || selectedImportedCount > 0 ? (
            <div className="border-t border-slate-200 bg-blue-50/40 px-4 py-3">
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
            <div className="overflow-hidden border-t border-stone-200">
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
              />
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center border-t border-stone-100 bg-stone-50/40 px-6 py-10">
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
  qualityWorkflow,
  onChangeQualityWorkflow,
  prepareRequestPrint,
  availableCiphers,
  configuredUnits,
  lines,
  materialIssues,
  materialReceipts,
  materialRequests,
  qualityControls,
  onAdjustProjectQuantity,
  onCreateIssues,
  onCreateQualityControls,
  onCreateReceipts,
  onCreateRequests,
  onDeleteRequests,
  onDeleteOperation,
  onUpdateQualityStatus,
  onUpdateReceipts,
  onUpdateRequests,
}: {
  qualityWorkflow?: QualityWorkflow
  onChangeQualityWorkflow: (next: QualityWorkflow) => void
  prepareRequestPrint: () => Promise<string>
  availableCiphers: Array<string>
  configuredUnits: Array<string>
  lines: Array<SubobjectMaterialMetric>
  materialIssues: Array<MaterialIssueEntry>
  materialReceipts: Array<MaterialReceiptEntry>
  materialRequests: Array<MaterialRequestEntry>
  qualityControls: Array<QualityControlEntry>
  onAdjustProjectQuantity: (lineId: string, quantity: number) => void
  onCreateIssues: (entries: Array<MaterialIssueEntry>) => void
  onCreateQualityControls: (entries: Array<QualityControlEntry>) => void
  onCreateReceipts: (entries: Array<MaterialReceiptEntry>) => void
  onCreateRequests: (entries: Array<MaterialRequestEntry>) => void
  onDeleteRequests: (number: string) => void
  onDeleteOperation: (target: OperationDeletion) => string
  onUpdateQualityStatus: (id: string, status: QualityControlStatus) => void
  onUpdateReceipts: (
    originalIds: Array<string>,
    entries: Array<MaterialReceiptEntry>,
  ) => void
  onUpdateRequests: (
    originalNumber: string,
    entries: Array<MaterialRequestEntry>,
  ) => void
}) {
  const [activeTab, setActiveTab] = useWorkspaceViewState<OperationDocumentTab>(
    'operations.tab',
    'overview',
    (value): value is OperationDocumentTab =>
      typeof value === 'string' &&
      ['overview', 'requests', 'receipts', 'quality', 'issues'].includes(value),
  )
  const viewScrollRef = useWorkspaceViewScroll(`operations:${activeTab}`)
  const [modal, setModal] = useState<OperationActionTab | null>(null)
  const [pendingDelete, setPendingDelete] = useState<OperationDeletion | null>(
    null,
  )
  const [deleteError, setDeleteError] = useState('')
  const deletionError = pendingDelete
    ? getOperationDeletionError(
        pendingDelete,
        materialReceipts,
        qualityControls,
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
  const [focusTarget, setFocusTarget] = useState<{
    tab: OperationActionTab
    targetId: string
  } | null>(null)
  const [overviewFocusKey, setOverviewFocusKey] = useState<string | null>(null)
  const lineById = useMemo(() => {
    const map = new Map<string, SubobjectMaterialMetric>()

    for (const line of lines) {
      map.set(getProjectLineId(line), line)
    }

    return map
  }, [lines])
  const operationSummary = useMemo(
    () =>
      buildOperationSummary({
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
    const normalizedSearch = normalizeSearchValue(requestSearch)

    if (normalizedSearch.length === 0) {
      return requestGroupMeta.length
    }

    return requestGroupMeta.filter((item) =>
      item.searchText.includes(normalizedSearch),
    ).length
  }, [requestGroupMeta, requestSearch])
  const receiptDocumentGroups = useMemo(
    () => groupReceiptRequests(materialReceipts, materialRequests),
    [materialReceipts, materialRequests],
  )
  const receiptGroupMeta = useMemo(
    () =>
      buildReceiptGroupMeta(receiptDocumentGroups, materialRequests, lineById),
    [lineById, materialRequests, receiptDocumentGroups],
  )
  const filteredReceiptCount = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(receiptSearch)

    if (normalizedSearch.length === 0) {
      return receiptGroupMeta.length
    }

    return receiptGroupMeta.filter((item) =>
      item.searchText.includes(normalizedSearch),
    ).length
  }, [receiptGroupMeta, receiptSearch])
  const qualitySearchMeta = useMemo(
    () =>
      buildOperationSearchMeta(
        qualityControls,
        materialReceipts,
        materialRequests,
        lineById,
      ),
    [qualityControls, materialReceipts, materialRequests, lineById],
  )
  const issueSearchMeta = useMemo(
    () =>
      buildOperationSearchMeta(
        materialIssues,
        materialReceipts,
        materialRequests,
        lineById,
      ),
    [materialIssues, materialReceipts, materialRequests, lineById],
  )
  const visibleQualityControls = useMemo(
    () => filterOperationEntries(qualitySearchMeta, qualitySearch),
    [qualitySearchMeta, qualitySearch],
  )
  const visibleIssues = useMemo(
    () => filterOperationEntries(issueSearchMeta, issueSearch),
    [issueSearchMeta, issueSearch],
  )
  const searches = {
    requests: {
      value: requestSearch,
      onChange: setRequestSearch,
      placeholder:
        'Поиск по номеру заявки, шифру, типу, заявителю или материалу',
      label: 'Поиск заявок',
      summary: `Найдено ${filteredRequestCount} из ${requestDocumentGroups.length} заявок`,
    },
    receipts: {
      value: receiptSearch,
      onChange: setReceiptSearch,
      placeholder: 'Поиск по дате, заявке, накладной, материалу или замене',
      label: 'Поиск получений',
      summary: `Найдено ${filteredReceiptCount} из ${receiptDocumentGroups.length} заявок`,
    },
    quality: {
      value: qualitySearch,
      onChange: setQualitySearch,
      placeholder:
        'Поиск по ЗНИ, АВК, АПП, материалу, партии, шифру или составителю',
      label: 'Поиск входного контроля',
      summary: qualityWorkflow?.cases.length
        ? `ЗНИ: ${qualityWorkflow.cases.length}`
        : `Найдено ${visibleQualityControls.length} из ${qualityControls.length} записей ВК`,
    },
    issues: {
      value: issueSearch,
      onChange: setIssueSearch,
      placeholder: 'Поиск по документу, материалу, шифру, дате или получателю',
      label: 'Поиск выдач',
      summary: `Найдено ${visibleIssues.length} из ${materialIssues.length} выдач`,
    },
  }
  const search = activeTab === 'overview' ? null : searches[activeTab]
  const overviewRows = useMemo(
    () =>
      buildOperationOverviewRows({
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
    ],
  )

  useEffect(() => {
    if (!modal) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setModal(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [modal])

  function changeActiveTab(tab: OperationDocumentTab) {
    setFocusTarget(null)
    setActiveTab(tab)
  }

  return (
    <section
      ref={viewScrollRef}
      className="mt-5 grid min-w-0 grid-cols-1 gap-5"
    >
      <OperationTabs
        activeTab={activeTab}
        counts={{
          qualityDocumentCount:
            (qualityWorkflow?.cases.length ?? 0) +
            qualityControls.filter(
              (entry) => !entry.id.startsWith('inspection:'),
            ).length,
          overviewCount: overviewRows.length,
          materialIssues,
          materialReceipts,
          materialRequests,
          qualityControls,
        }}
        onChange={changeActiveTab}
      />

      <Card className="min-w-0">
        {activeTab !== 'overview' && search ? (
          <CardHeader className="gap-3 border-b border-stone-200 px-4 py-3">
            <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="min-w-0">
                <CardTitle>{tabMeta.label}</CardTitle>
                <CardDescription>{tabMeta.description}</CardDescription>
              </div>
              <div className="grid w-full min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center 2xl:max-w-[1180px]">
                <div className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-1.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="relative min-w-0">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={17}
                    />
                    <Input
                      className="h-10 bg-white pl-9 text-sm"
                      aria-label={search.label}
                      placeholder={search.placeholder}
                      value={search.value}
                      onChange={(event) => search.onChange(event.target.value)}
                    />
                  </div>
                  <span className="whitespace-nowrap px-2 text-sm text-slate-500">
                    {search.summary}
                  </span>
                </div>
                {activeTab !== 'quality' && (
                  <Button
                    className="h-10 shrink-0"
                    disabled={lines.length === 0}
                    onClick={() => {
                      if (activeTab === 'requests') {
                        setEditingRequest(null)
                      }
                      if (activeTab === 'receipts') {
                        setEditingReceipt(null)
                      }
                      setModal(activeTab)
                    }}
                  >
                    {tabMeta.icon}
                    {tabMeta.action}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
        ) : null}
        <CardContent className="p-0">
          {activeTab === 'receipts' && (
            <TransferActs
              value={qualityWorkflow}
              receipts={materialReceipts}
              lines={lines}
              onChange={onChangeQualityWorkflow}
            />
          )}
          {activeTab === 'quality' && (
            <InspectionWorkspace
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
              legacyReceiptIds={qualityControls
                .filter((entry) => !entry.id.startsWith('inspection:'))
                .map((entry) => entry.receiptId)}
            />
          )}

          {activeTab === 'overview' ? (
            <OperationOverview
              focusRowKey={overviewFocusKey}
              rows={overviewRows}
              onOpenDocument={(tab, targetId) => {
                setFocusTarget({ tab, targetId })
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
                setActiveTab(tab)
              }}
              onOpenStage={(tab) => {
                setFocusTarget(null)
                setActiveTab(tab)
              }}
            />
          ) : null}
          {activeTab === 'requests' ? (
            <RequestsTable
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
              onEditRequest={(group) => {
                setEditingRequest(group)
                setModal('requests')
              }}
              onOpenOverviewLine={(line) => {
                setOverviewFocusKey(getMaterialIdentityKey(line))
                setFocusTarget(null)
                setActiveTab('overview')
              }}
            />
          ) : null}
          {activeTab === 'receipts' ? (
            <ReceiptsTable
              entries={materialReceipts}
              focusEntryId={
                focusTarget?.tab === 'receipts'
                  ? focusTarget.targetId
                  : undefined
              }
              lineById={lineById}
              receiptGroupMeta={receiptGroupMeta}
              requests={materialRequests}
              search={receiptSearch}
              onEditReceipt={(group) => {
                setEditingReceipt(group)
                setModal('receipts')
              }}
              onDeleteReceipt={(group) =>
                requestDelete({
                  kind: 'receipts',
                  ids: group.entries.map((entry) => entry.id),
                  title: 'Удалить получение?',
                  details: `${group.actualName || 'ТМЦ без наименования'} от ${formatDate(group.date)}. Позиций: ${group.entries.length}. Накладные: ${group.invoiceNumbers.join(', ') || 'не указаны'}.`,
                })
              }
              onOpenOverviewLine={(line) => {
                setOverviewFocusKey(getMaterialIdentityKey(line))
                setFocusTarget(null)
                setActiveTab('overview')
              }}
            />
          ) : null}
          {activeTab === 'quality' &&
          qualityControls.some(
            (entry) => !entry.id.startsWith('inspection:'),
          ) ? (
            <QualityTable
              entries={qualityControls.filter(
                (entry) => !entry.id.startsWith('inspection:'),
              )}
              visibleEntries={visibleQualityControls.filter(
                (entry) => !entry.id.startsWith('inspection:'),
              )}
              focusEntryId={
                focusTarget?.tab === 'quality'
                  ? focusTarget.targetId
                  : undefined
              }
              lineById={lineById}
              receipts={materialReceipts}
              issues={materialIssues}
              onUpdateStatus={onUpdateQualityStatus}
              onDelete={(entry) =>
                requestDelete({
                  kind: 'quality',
                  id: entry.id,
                  title: 'Удалить входной контроль?',
                  details: `ЗНИ ${entry.zniNumber} от ${formatDate(entry.date)}, АРВК ${entry.arvkNumber || 'не указан'}. ${materialReceipts.find((receipt) => receipt.id === entry.receiptId)?.actualName || lineById.get(entry.projectLineId)?.projectMaterialName || 'Материал не найден'}. Количество: ${formatQuantity(entry.quantity)}.`,
                })
              }
            />
          ) : null}
          {activeTab === 'issues' ? (
            <IssuesTable
              entries={visibleIssues}
              focusEntryId={
                focusTarget?.tab === 'issues' ? focusTarget.targetId : undefined
              }
              lineById={lineById}
              receipts={materialReceipts}
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
          {(activeTab === 'quality' &&
            qualityControls.some(
              (entry) => !entry.id.startsWith('inspection:'),
            ) &&
            visibleQualityControls.filter(
              (entry) => !entry.id.startsWith('inspection:'),
            ).length === 0) ||
          (activeTab === 'issues' &&
            materialIssues.length > 0 &&
            visibleIssues.length === 0) ? (
            <div className="p-4">
              <OperationFormEmpty
                text={
                  activeTab === 'quality'
                    ? 'Входной контроль по такому запросу не найден.'
                    : 'Выдачи по такому запросу не найдены.'
                }
              />
            </div>
          ) : null}
          {activeTab !== 'overview' &&
          activeTab !== 'quality' &&
          getOperationTabCount(activeTab, {
            materialIssues,
            materialReceipts,
            materialRequests,
            qualityControls,
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
              : pendingDelete?.kind === 'quality'
                ? 'Количество по этому акту перестанет учитываться во входном контроле.'
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
        editingReceipt={editingReceipt}
        lineById={lineById}
        open={modal === 'receipts'}
        requests={materialRequests}
        receipts={materialReceipts}
        summaryByLine={operationSummary.byLine}
        onClose={() => {
          setEditingReceipt(null)
          setModal(null)
        }}
        onSubmit={(entries) => {
          if (editingReceipt) {
            onUpdateReceipts(
              editingReceipt.entries.map((entry) => entry.id),
              entries,
            )
          } else {
            onCreateReceipts(entries)
          }
          setEditingReceipt(null)
          setModal(null)
          setActiveTab('receipts')
        }}
      />
      <QualityControlModal
        existingCount={qualityControls.length}
        open={modal === 'quality'}
        qualityControls={qualityControls}
        receipts={materialReceipts}
        onClose={() => setModal(null)}
        onSubmit={(entries) => {
          onCreateQualityControls(entries)
          setModal(null)
          setQualitySearch('')
          setActiveTab('quality')
        }}
      />
      <IssueModal
        existingCount={materialIssues.length}
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
        <div className="mt-1 text-sm leading-6 text-stone-500">
          Начните с создания документа. Все остатки пересчитаются автоматически.
        </div>
        <Button className="mt-4" onClick={onCreate}>
          <Plus size={16} />
          {action}
        </Button>
      </div>
    </div>
  )
}

function OperationOverview({
  focusRowKey,
  rows,
  onOpenDocument,
  onOpenStage,
}: {
  focusRowKey?: string | null
  rows: Array<OperationOverviewRow>
  onOpenDocument: (tab: OperationActionTab, targetId: string) => void
  onOpenStage: (tab: OperationActionTab) => void
}) {
  const [expandedRows, setExpandedRows] = useWorkspaceViewState<
    Record<string, boolean>
  >('overview.expanded', {}, isViewExpanded)
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
      rows.filter(
        (row) =>
          operationOverviewRowMatchesSearch(row, search) &&
          operationOverviewRowMatchesCipher(row, cipherFilter) &&
          operationOverviewRowMatchesMaterialType(row, materialTypeFilter),
      ),
    [cipherFilter, materialTypeFilter, rows, search],
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
    <div className="bg-stone-50/60">
      <div className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="grid gap-2 xl:grid-cols-[minmax(360px,1fr)_240px_280px_auto] xl:items-center">
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <Input
              className="h-11 pl-10 text-[15px]"
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
          <div className="whitespace-nowrap text-sm text-slate-500 xl:text-right">
            Найдено {filteredRows.length} из {rows.length} позиций
          </div>
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
            <div className="mt-1 text-sm leading-6 text-stone-500">
              Измените запрос или очистите поиск, чтобы снова увидеть все
              позиции.
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 p-4">
        {filteredRows.map((row) => {
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
              className={`overflow-hidden rounded-lg border-2 shadow-sm transition-colors ${rowTone.card} ${rowFocusClass}`}
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
                        ? 'border-blue-100 bg-blue-50 text-blue-500'
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
                      {row.projectMaterialName || 'Материал без наименования'}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
                      {row.deleted ? <DeletedProjectMaterialBadge /> : null}
                      <span>{row.materialType || 'Без типа'}</span>
                    </span>
                  </span>
                </button>

                <span className="grid min-w-[650px] gap-2 sm:grid-cols-5">
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
                <div className="border-t border-blue-100 bg-blue-50/20">
                  <div className="grid gap-3 px-4 py-3">
                    <div className="grid gap-0 overflow-hidden rounded-lg border border-blue-100 bg-white sm:grid-cols-2 lg:grid-cols-[minmax(280px,1.45fr)_170px_minmax(180px,1fr)_150px]">
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
                      className="overflow-auto rounded-lg border border-blue-100 bg-white"
                    >
                      <OperationsGrid
                        id={`overview:${row.key}`}
                        label={`Движение: ${row.projectMaterialName}`}
                        rows={row.ciphers.map((cipher) => ({
                          ...cipher,
                          unit: row.unit,
                          isTotal: false,
                        }))}
                        rowId={(item) => item.lineId}
                        totals={[
                          {
                            lineId: 'total',
                            cipher: 'Всего по проекту',
                            projectQuantity: row.totalProjectQuantity,
                            metrics: row.totals,
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
      </div>
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
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  const dialogTitle = tab === 'requests' ? `Заявки по шифру ${cipher}` : title

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/25 px-4 py-6">
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
          {documents.map((document) => (
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

function OperationTabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: OperationDocumentTab
  counts: {
    qualityDocumentCount?: number
    overviewCount: number
    materialIssues: Array<MaterialIssueEntry>
    materialReceipts: Array<MaterialReceiptEntry>
    materialRequests: Array<MaterialRequestEntry>
    qualityControls: Array<QualityControlEntry>
  }
  onChange: (tab: OperationDocumentTab) => void
}) {
  return (
    <div className="sticky top-0 z-20 rounded-lg border border-stone-200 bg-white/95 p-2 shadow-sm backdrop-blur">
      <div className="grid gap-2 md:grid-cols-5">
        {(Object.keys(operationTabMeta) as Array<OperationDocumentTab>).map(
          (tab) => (
            <button
              key={tab}
              className={`flex items-center gap-3 rounded-md px-3 py-3 text-left text-sm transition-colors ${
                activeTab === tab
                  ? 'bg-blue-50 text-blue-950 ring-1 ring-blue-100'
                  : 'text-stone-600 hover:bg-stone-50 hover:text-stone-950'
              }`}
              type="button"
              onClick={() => onChange(tab)}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                  activeTab === tab
                    ? 'bg-white text-blue-700'
                    : 'bg-stone-100 text-stone-500'
                }`}
              >
                {operationTabMeta[tab].icon}
              </span>
              <span>
                <span className="block font-medium">
                  {operationTabMeta[tab].label}
                </span>
                <span className="mt-0.5 block text-xs text-stone-500">
                  {getOperationTabCount(tab, counts)}
                </span>
              </span>
            </button>
          ),
        )}
      </div>
    </div>
  )
}

function RequestsTable({
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
  const [expandedGroups, setExpandedGroups] = useWorkspaceViewState<
    Record<string, boolean>
  >('requests.expanded', {}, isViewExpanded)
  const normalizedSearch = normalizeSearchValue(search)
  const filteredGroupMeta =
    normalizedSearch.length === 0
      ? requestGroupMeta
      : requestGroupMeta.filter((item) =>
          item.searchText.includes(normalizedSearch),
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

  if (entries.length === 0) {
    return null
  }

  return (
    <div className="grid gap-3 bg-stone-50/50 p-4">
      {filteredGroupMeta.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Заявки по такому запросу не найдены.
        </div>
      ) : null}

      {filteredGroupMeta.map(({ group, materialType: requestMaterialType }) => {
        const isExpanded = expandedGroups[group.number] ?? false
        const lineIds = Array.from(
          new Set(group.entries.map((entry) => entry.projectLineId)),
        )
        const exceededCount = lineIds.filter(
          (lineId) =>
            lineById.has(lineId) &&
            (summaryByLine.get(lineId)?.requestBalance ?? 0) < 0,
        ).length
        const requestBalance = lineIds.reduce(
          (total, lineId) =>
            total + Math.max(0, summaryByLine.get(lineId)?.requestBalance ?? 0),
          0,
        )

        return (
          <div
            key={group.number}
            id={operationAnchorId('requests', group.number)}
            className={`overflow-hidden rounded-lg border bg-white shadow-sm transition-colors ${
              isExpanded
                ? 'border-blue-200 shadow-blue-100/60 ring-1 ring-blue-100'
                : 'border-stone-200 shadow-stone-200/60'
            }`}
          >
            <div
              className={`grid min-w-0 gap-4 px-4 py-3.5 2xl:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.65fr)_auto] 2xl:items-center ${
                isExpanded ? 'bg-blue-50/25' : ''
              }`}
            >
              <button
                className="flex min-w-0 items-center gap-3 rounded-md text-left outline-none transition-colors hover:text-blue-900 focus-visible:ring-2 focus-visible:ring-stone-300"
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
                  </span>
                </span>
              </button>

              <span className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[0.85fr_1.35fr_0.7fr_0.85fr_0.85fr]">
                <RequestGroupMetric label="Шифр" value={group.cipher} />
                <RequestGroupMetric
                  label="Тип материала"
                  value={requestMaterialType}
                />
                <RequestGroupMetric
                  label="Позиций"
                  value={formatQuantity(group.entries.length)}
                />
                <RequestGroupMetric
                  label="Заявленное количество"
                  value={formatQuantity(group.quantity)}
                />
                <RequestGroupMetric
                  label="Остаток к заявке"
                  value={formatQuantity(requestBalance)}
                />
              </span>

              <div className="flex flex-wrap items-start gap-2">
                <RequestPrintButton
                  entryId={group.entries[0]!.id}
                  number={group.number}
                  prepare={prepareRequestPrint}
                />
                <Button
                  className="h-10 self-center justify-center whitespace-nowrap px-3"
                  variant="outline"
                  onClick={() => onEditRequest(group)}
                >
                  <Pencil size={15} />
                  Редактировать
                </Button>
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
                    label={`Заявка ${group.number}`}
                    rows={[
                      ...group.entries.map((entry) => {
                        const line = lineById.get(entry.projectLineId)
                        const isDeletedProjectMaterial = !line
                        const summary = summaryByLine.get(entry.projectLineId)
                        const referenceQuantity = referenceQuantityByLineId.get(
                          entry.projectLineId,
                        )
                        return {
                          entry,
                          line,
                          isDeletedProjectMaterial,
                          summary,
                          referenceQuantity,
                        }
                      }),
                    ]}
                    rowId={({ entry }) => entry.id}
                    columns={[
                      {
                        id: 'name',
                        title: 'Наименование по проекту',
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
                              {isDeletedProjectMaterial ? (
                                <DeletedProjectMaterialBadge />
                              ) : null}
                            </div>
                          </>
                        ),
                      },
                      {
                        id: 'projectQuantity',
                        title: 'По проекту сейчас',
                        value: ({ referenceQuantity }) =>
                          referenceQuantity?.projectQuantity,
                        numeric: true,
                        render: ({ entry, referenceQuantity }) => (
                          <>
                            <RequestProjectQuantity
                              current={referenceQuantity}
                              initial={entry.projectQuantitiesAtCreation}
                              kind="projectQuantity"
                            />
                          </>
                        ),
                      },
                      {
                        id: 'cipherQuantity',
                        title: 'По шифру сейчас',
                        value: ({ referenceQuantity }) =>
                          referenceQuantity?.cipherQuantity,
                        numeric: true,
                        render: ({ entry, referenceQuantity }) => (
                          <>
                            <RequestProjectQuantity
                              current={referenceQuantity}
                              initial={entry.projectQuantitiesAtCreation}
                              kind="cipherQuantity"
                            />
                          </>
                        ),
                      },
                      {
                        id: 'quantity',
                        title: 'Количество по заявке',
                        value: ({ entry }) => entry.quantity,
                        numeric: true,
                        render: ({ entry }) => (
                          <>{formatQuantity(entry.quantity)}</>
                        ),
                      },
                      {
                        id: 'unit',
                        title: 'Единица измерения проекта',
                        value: ({ entry }) => entry.projectUnit,
                        render: ({ entry }) => <>{entry.projectUnit}</>,
                      },
                      {
                        id: 'altQuantity',
                        title: 'Количество в альтернативной единице',
                        value: ({ entry }) => entry.altQuantity,
                        numeric: true,
                        render: ({ entry }) => (
                          <>{formatOptionalQuantity(entry.altQuantity)}</>
                        ),
                      },
                      {
                        id: 'altUnit',
                        title: 'Альтернативная единица измерения',
                        value: ({ entry }) => entry.altUnit,
                        render: ({ entry }) => <>{entry.altUnit || '-'}</>,
                      },
                      {
                        id: 'balance',
                        title: 'Остаток к заявке',
                        value: ({ summary }) =>
                          Math.max(0, summary?.requestBalance ?? 0),
                        numeric: true,
                        render: ({
                          entry,
                          line,
                          isDeletedProjectMaterial,
                          summary,
                        }) => (
                          <>
                            {formatQuantity(
                              Math.max(0, summary?.requestBalance ?? 0),
                            )}{' '}
                            {line?.unit ?? entry.projectUnit}
                            {!isDeletedProjectMaterial ? (
                              <RequestExcessWarning
                                quantity={Math.max(
                                  0,
                                  -(summary?.requestBalance ?? 0),
                                )}
                                unit={line?.unit ?? entry.projectUnit}
                              />
                            ) : null}
                          </>
                        ),
                      },
                      {
                        id: 'note',
                        title: 'Нормативный документ / примечание',
                        value: ({ entry, line }) =>
                          entry.note || line?.normativeDocument || '',
                        width: 300,
                        render: ({ entry, line }) => (
                          <>
                            <div className="grid gap-2">
                              <span>
                                {entry.note || line?.normativeDocument || '-'}
                              </span>
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
                    ]}
                    isDeleted={({ isDeletedProjectMaterial }) =>
                      isDeletedProjectMaterial
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function RequestProjectQuantity({
  current,
  initial,
  kind,
}: {
  current?: RequestProjectQuantities
  initial?: RequestProjectQuantities
  kind: 'projectQuantity' | 'cipherQuantity'
}) {
  return (
    <div className="grid gap-1">
      <span>
        {current ? `${formatQuantity(current[kind])} ${current.unit}` : '—'}
      </span>
      <span className="text-[11px] font-normal leading-4 text-slate-500">
        При создании:{' '}
        {initial
          ? `${formatQuantity(initial[kind])} ${initial.unit}`
          : 'не сохранено'}
      </span>
    </div>
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
}: {
  label: string
  value: string
}) {
  return (
    <span className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-200/40">
      <span className="block truncate text-[10px] font-medium uppercase leading-4 tracking-wide text-slate-400">
        {label}
      </span>
      <span className="mt-0.5 block truncate text-sm leading-5 text-slate-900">
        {value}
      </span>
    </span>
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
  focusEntryId,
  lineById,
  receiptGroupMeta,
  requests,
  search,
  onEditReceipt,
  onDeleteReceipt,
  onOpenOverviewLine,
}: {
  entries: Array<MaterialReceiptEntry>
  focusEntryId?: string
  lineById: Map<string, SubobjectMaterialMetric>
  receiptGroupMeta: Array<ReceiptGroupMeta>
  requests: Array<MaterialRequestEntry>
  search: string
  onEditReceipt: (group: ReceiptDocumentGroup) => void
  onDeleteReceipt: (group: ReceiptDocumentGroup) => void
  onOpenOverviewLine: (line: SubobjectMaterialMetric) => void
}) {
  const [expandedGroups, setExpandedGroups] = useWorkspaceViewState<
    Record<string, boolean>
  >('receipts.requests.expanded', {}, isViewExpanded)
  const focusedGroup = useMemo(() => {
    if (!focusEntryId) {
      return null
    }

    return (
      receiptGroupMeta.find(({ group }) =>
        group.entries.some(
          (entry) =>
            entry.id === focusEntryId ||
            entry.invoiceNumber === focusEntryId ||
            getReceiptGroupKey(entry) === focusEntryId,
        ),
      )?.group ?? null
    )
  }, [focusEntryId, receiptGroupMeta])

  useEffect(() => {
    if (!focusedGroup || expandedGroups[focusedGroup.key]) {
      return
    }

    setExpandedGroups((current) => ({
      ...current,
      [focusedGroup.key]: true,
    }))
  }, [expandedGroups, focusedGroup])

  useEffect(() => {
    if (!focusEntryId || !focusedGroup || !expandedGroups[focusedGroup.key]) {
      return
    }

    const focusedEntryId =
      focusedGroup.entries.find(
        (entry) =>
          entry.id === focusEntryId ||
          entry.invoiceNumber === focusEntryId ||
          getReceiptGroupKey(entry) === focusEntryId,
      )?.id ?? focusEntryId

    window.requestAnimationFrame(() => {
      const target =
        document.getElementById(
          operationAnchorId('receipts', focusedEntryId),
        ) ??
        document.getElementById(operationAnchorId('receipts', focusedGroup.key))

      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [expandedGroups, focusEntryId, focusedGroup])

  if (receiptGroupMeta.length === 0) {
    return null
  }
  const requestById = new Map(requests.map((request) => [request.id, request]))
  const normalizedSearch = normalizeSearchValue(search)
  const visibleGroups = normalizedSearch
    ? receiptGroupMeta.filter((item) =>
        item.searchText.includes(normalizedSearch),
      )
    : receiptGroupMeta

  return (
    <div className="grid gap-3 bg-stone-50/60 p-4">
      {visibleGroups.length === 0 ? (
        <OperationFormEmpty text="Заявки по такому запросу не найдены." />
      ) : null}
      {visibleGroups.map(({ group, materialType }) => {
        const isExpanded = expandedGroups[group.key] ?? false
        const requested = group.request?.entries ?? []
        const receivedByRequest = sumByKey(
          group.entries,
          'requestId',
          'quantity',
        )
        const unreceived = requested.filter(
          (entry) => !receivedByRequest.has(entry.id),
        )
        const remaining = requested.map((entry) => ({
          unit: entry.projectUnit,
          quantity: Math.max(
            0,
            Number(entry.quantity.toPrecision(15)) -
              Number((receivedByRequest.get(entry.id) ?? 0).toPrecision(15)),
          ),
        }))
        const fullyReceived =
          requested.some((entry) => entry.quantity > 0) &&
          remaining.every((entry) => entry.quantity === 0)
        const invoiceNumbers = unique(
          group.entries.map((entry) => entry.invoiceNumber).filter(Boolean),
        )
        return (
          <div
            key={group.key}
            id={operationAnchorId('receipts', group.key)}
            className={`min-w-0 overflow-hidden rounded-lg border shadow-sm ${
              fullyReceived
                ? `border-emerald-200 bg-emerald-50/60 ${isExpanded ? 'ring-1 ring-emerald-100' : ''}`
                : isExpanded
                  ? 'border-blue-200 bg-white ring-1 ring-blue-100'
                  : 'border-slate-200 bg-white'
            }`}
          >
            <div className="grid gap-4 px-4 py-3.5">
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
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${fullyReceived ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : isExpanded ? 'border-blue-100 bg-blue-50 text-blue-500' : 'border-slate-200 bg-white text-slate-400'}`}
                >
                  <ChevronDown
                    className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    size={17}
                  />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-[15px] font-medium leading-6 text-slate-900">
                      {group.request?.number ?? 'Заявка удалена'}
                    </span>
                    {fullyReceived ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                        <ClipboardCheck size={14} aria-hidden="true" />
                        Получено полностью
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-[13px] text-slate-500">
                    {group.request
                      ? `${formatDate(group.request.date)} · ${group.request.cipher} · ${materialType} · ${group.request.requester || 'без заявителя'}`
                      : 'Исторические получения без исходной заявки'}
                  </span>
                  <span className="mt-1 block text-[13px] text-slate-500">
                    Получений: {group.entries.length} · Накладных:{' '}
                    {invoiceNumbers.length}
                  </span>
                </span>
              </button>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <RequestGroupMetric
                  label="По заявке"
                  value={formatUnitTotals(
                    requested.map((entry) => ({
                      quantity: entry.quantity,
                      unit: entry.projectUnit,
                    })),
                  )}
                />
                <RequestGroupMetric
                  label="Поступило"
                  value={formatUnitTotals(
                    group.entries.map((entry) => ({
                      quantity: entry.quantity,
                      unit: entry.projectUnit,
                    })),
                  )}
                />
                <RequestGroupMetric
                  label="Альтернативно"
                  value={formatAlternativeTotals(group.entries)}
                />
                <RequestGroupMetric
                  label="Осталось получить"
                  value={formatUnitTotals(remaining)}
                />
                <RequestGroupMetric
                  label="Материалов"
                  value={String(
                    group.request
                      ? requested.length
                      : new Set(
                          group.entries.map((entry) => entry.projectLineId),
                        ).size,
                  )}
                />
              </div>
            </div>
            {isExpanded ? (
              <div
                className={`border-t p-3 ${fullyReceived ? 'border-emerald-100 bg-emerald-50/20' : 'border-blue-100 bg-blue-50/20'}`}
              >
                <div
                  data-workspace-scroll={`receipt:${group.key}`}
                  className={`overflow-x-auto rounded-lg border bg-white ${fullyReceived ? 'border-emerald-100' : 'border-blue-100'}`}
                >
                  <OperationsGrid
                    id={`receipt:${group.key}`}
                    label={`Получение ${group.request?.number ?? 'без заявки'}`}
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
                      ...unreceived.map((request) => ({
                        entry: null,
                        request,
                        line: lineById.get(request.projectLineId),
                        entryIsReplacement: false,
                        entryIsDeletedProjectMaterial: !lineById.has(
                          request.projectLineId,
                        ),
                      })),
                    ]}
                    rowId={({ entry, request }) =>
                      entry?.id ?? `unreceived:${request!.id}`
                    }
                    columns={[
                      {
                        id: 'actions',
                        title: 'Действия',
                        value: ({ entry }) => (entry ? null : null),
                        width: 120,
                        actions: true,
                        render: ({ entry, request }) =>
                          entry ? (
                            <>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Редактировать получение"
                                  title={
                                    request
                                      ? 'Редактировать получение'
                                      : 'Исходная заявка удалена'
                                  }
                                  disabled={!request}
                                  onClick={() =>
                                    onEditReceipt(
                                      receiptEditGroup(entry, request),
                                    )
                                  }
                                >
                                  <Pencil size={16} />
                                </Button>
                                <DeleteOperationButton
                                  label="Удалить получение"
                                  onClick={() =>
                                    onDeleteReceipt(
                                      receiptEditGroup(entry, request),
                                    )
                                  }
                                />
                              </div>
                            </>
                          ) : (
                            <>—</>
                          ),
                      },
                      {
                        id: 'name',
                        title: 'По заявке',
                        value: ({ entry, request, line }) =>
                          entry
                            ? (request?.projectMaterialName ??
                              line?.projectMaterialName ??
                              '')
                            : request.projectMaterialName,
                        width: 310,
                        render: ({
                          entry,
                          request,
                          line,
                          entryIsDeletedProjectMaterial,
                        }) =>
                          entry ? (
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
                                  <span>
                                    {request?.projectMaterialName ?? '-'}
                                  </span>
                                )}
                                {entryIsDeletedProjectMaterial ? (
                                  <DeletedProjectMaterialBadge />
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <>{request.projectMaterialName}</>
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
                        id: 'actualName',
                        title: 'Факт поступления',
                        value: ({ entry }) =>
                          entry ? entry.actualName : 'Ещё не получено',
                        width: 300,
                        render: ({ entry, entryIsReplacement }) =>
                          entry ? (
                            <>
                              <div className="grid gap-1">
                                <span>{entry.actualName}</span>
                                {entryIsReplacement ? (
                                  <ReplacementBadge />
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <>Ещё не получено</>
                          ),
                      },
                      {
                        id: 'quantity',
                        title: 'Поступило',
                        value: ({ entry }) => (entry ? entry.quantity : null),
                        numeric: true,
                        render: ({ entry }) =>
                          entry ? (
                            <>{formatQuantity(entry.quantity)}</>
                          ) : (
                            <>—</>
                          ),
                      },
                      {
                        id: 'unit',
                        title: 'Единица измерения проекта',
                        value: ({ entry }) =>
                          entry ? entry.projectUnit : null,
                        render: ({ entry }) =>
                          entry ? <>{entry.projectUnit}</> : <>—</>,
                      },
                      {
                        id: 'altQuantity',
                        title: 'Поступило в альтернативной единице',
                        value: ({ entry }) =>
                          entry ? entry.altQuantity : null,
                        numeric: true,
                        render: ({ entry }) =>
                          entry ? (
                            <>{formatOptionalQuantity(entry.altQuantity)}</>
                          ) : (
                            <>—</>
                          ),
                      },
                      {
                        id: 'altUnit',
                        title: 'Альтернативная единица измерения',
                        value: ({ entry }) => (entry ? entry.altUnit : null),
                        render: ({ entry }) =>
                          entry ? <>{entry.altUnit || '-'}</> : <>—</>,
                      },
                      {
                        id: 'date',
                        title: 'Дата получения',
                        value: ({ entry }) => (entry ? entry.date : null),
                        render: ({ entry }) =>
                          entry ? <>{formatDate(entry.date)}</> : <>—</>,
                      },
                      {
                        id: 'invoiceNumber',
                        title: 'Накладная',
                        value: ({ entry }) =>
                          entry ? entry.invoiceNumber : null,
                        render: ({ entry }) =>
                          entry ? <>{entry.invoiceNumber || '-'}</> : <>—</>,
                      },
                      {
                        id: 'factoryNumber',
                        title: 'Заводской номер',
                        value: ({ entry }) =>
                          entry ? entry.factoryNumber : null,
                        render: ({ entry }) =>
                          entry ? <>{entry.factoryNumber || '-'}</> : <>—</>,
                      },
                      {
                        id: 'manufacturer',
                        title: 'Завод-изготовитель',
                        value: ({ entry }) =>
                          entry ? entry.manufacturer : null,
                        render: ({ entry }) =>
                          entry ? <>{entry.manufacturer || '-'}</> : <>—</>,
                      },
                      {
                        id: 'heatBatch',
                        title: 'Партия плавки',
                        value: ({ entry }) => (entry ? entry.heatBatch : null),
                        render: ({ entry }) =>
                          entry ? <>{entry.heatBatch || '-'}</> : <>—</>,
                      },
                      {
                        id: 'customerReceiptDocument',
                        title: 'Номер документа о получении (Заказчика)',
                        value: ({ entry }) =>
                          entry ? entry.customerReceiptDocument : null,
                        render: ({ entry }) =>
                          entry ? (
                            <>{entry.customerReceiptDocument || '-'}</>
                          ) : (
                            <>—</>
                          ),
                      },
                      {
                        id: 'customerArvk',
                        title: 'АРВК заказчика',
                        value: ({ entry }) =>
                          entry ? entry.customerArvk : null,
                        render: ({ entry }) =>
                          entry ? <>{entry.customerArvk || '-'}</> : <>—</>,
                      },
                      {
                        id: 'qualityDocument',
                        title: 'Документ качества',
                        value: ({ entry }) =>
                          entry ? entry.qualityDocument : null,
                        render: ({ entry }) =>
                          entry ? <>{entry.qualityDocument || '-'}</> : <>—</>,
                      },
                      {
                        id: 'certificate',
                        title: 'Паспорт / сертификат',
                        value: ({ entry }) =>
                          entry ? entry.certificate : null,
                        render: ({ entry }) =>
                          entry ? <>{entry.certificate || '-'}</> : <>—</>,
                      },
                      {
                        id: 'technicalDecision',
                        title: 'Техническое решение',
                        value: ({ entry }) =>
                          entry ? entry.technicalDecision : null,
                        render: ({ entry }) =>
                          entry ? (
                            <>{entry.technicalDecision || '-'}</>
                          ) : (
                            <>—</>
                          ),
                      },
                      {
                        id: 'note',
                        title: 'Примечание',
                        value: ({ entry }) => (entry ? entry.note : null),
                        render: ({ entry }) =>
                          entry ? <>{entry.note || '-'}</> : <>—</>,
                      },
                    ]}
                    isDeleted={({ entryIsDeletedProjectMaterial }) =>
                      entryIsDeletedProjectMaterial
                    }
                    focusRowId={
                      group.entries.find(
                        (entry) =>
                          entry.id === focusEntryId ||
                          entry.invoiceNumber === focusEntryId ||
                          getReceiptGroupKey(entry) === focusEntryId,
                      )?.id
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
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

function QualityTable({
  entries,
  visibleEntries,
  focusEntryId,
  lineById,
  receipts,
  issues,
  onUpdateStatus,
  onDelete,
}: {
  entries: Array<QualityControlEntry>
  visibleEntries: Array<QualityControlEntry>
  focusEntryId?: string
  lineById: Map<string, SubobjectMaterialMetric>
  receipts: Array<MaterialReceiptEntry>
  issues: Array<MaterialIssueEntry>
  onUpdateStatus: (id: string, status: QualityControlStatus) => void
  onDelete: (entry: QualityControlEntry) => void
}) {
  useEffect(() => {
    if (!focusEntryId) {
      return
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById(operationAnchorId('quality', focusEntryId))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [focusEntryId])

  if (visibleEntries.length === 0) {
    return null
  }
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  const signedByReceipt = getSignedQuantityByReceipt(entries)
  const issuedByReceipt = sumByKey(issues, 'receiptId', 'quantity')

  return (
    <OperationsGrid
      id={'quality-legacy'}
      label={'Входной контроль'}
      rows={[
        ...visibleEntries.map((entry) => {
          const receipt = receiptById.get(entry.receiptId)
          const line = lineById.get(entry.projectLineId)
          const isDeletedProjectMaterial = !line
          const reopenError = getQualityReductionError(
            entry,
            signedByReceipt.get(entry.receiptId) ?? 0,
            issuedByReceipt.get(entry.receiptId) ?? 0,
          )
          return { entry, receipt, line, isDeletedProjectMaterial, reopenError }
        }),
      ]}
      rowId={({ entry }) => entry.id}
      columns={[
        {
          id: 'zniNumber',
          title: 'Номер ЗНИ',
          value: ({ entry }) => entry.zniNumber,
          render: ({ entry }) => <>{entry.zniNumber}</>,
        },
        {
          id: 'date',
          title: 'Дата ЗНИ',
          value: ({ entry }) => entry.date,
          render: ({ entry }) => <>{formatDate(entry.date)}</>,
        },
        {
          id: 'arvkNumber',
          title: 'Номер АРВК',
          value: ({ entry }) => entry.arvkNumber,
          render: ({ entry }) => <>{entry.arvkNumber || '-'}</>,
        },
        {
          id: 'arvkDate',
          title: 'Дата АРВК',
          value: ({ entry }) => entry.arvkDate,
          render: ({ entry }) => <>{formatDate(entry.arvkDate)}</>,
        },
        {
          id: 'name',
          title: 'ТМЦ',
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
          title: 'Количество по АРВК',
          value: ({ entry }) => entry.quantity,
          numeric: true,
          render: ({ entry }) => <>{formatQuantity(entry.quantity)}</>,
        },
        {
          id: 'status',
          title: 'Статус',
          value: ({ entry }) =>
            entry.status === 'signed' ? 'Подписан' : 'В работе',
          width: 320,
          render: ({ entry, reopenError }) => (
            <>
              <div className="grid justify-items-start gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${
                      entry.status === 'signed'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {entry.status === 'signed' ? 'Подписан' : 'В работе'}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    aria-label={
                      entry.status === 'signed'
                        ? 'Вернуть в работу'
                        : 'Подписать'
                    }
                    title={
                      entry.status === 'signed'
                        ? 'Вернуть в работу'
                        : 'Подписать'
                    }
                    disabled={Boolean(reopenError)}
                    onClick={() =>
                      onUpdateStatus(
                        entry.id,
                        entry.status === 'signed' ? 'in_progress' : 'signed',
                      )
                    }
                  >
                    {entry.status === 'signed' ? (
                      <Undo2 size={14} />
                    ) : (
                      <ClipboardCheck size={14} />
                    )}
                  </Button>
                </div>
                {reopenError ? (
                  <p className="max-w-64 text-xs leading-5 text-stone-500">
                    {reopenError}
                  </p>
                ) : null}
              </div>
            </>
          ),
        },
        {
          id: 'author',
          title: 'Составитель',
          value: ({ entry }) => entry.author,
          render: ({ entry }) => <>{entry.author || '-'}</>,
        },
        {
          id: 'comment',
          title: 'Комментарий',
          value: ({ entry }) => entry.comment,
          render: ({ entry }) => <>{entry.comment || '-'}</>,
        },
        {
          id: 'actions',
          title: 'Действия',
          value: (_row) => null,
          width: 110,
          actions: true,
          render: ({ entry }) => (
            <>
              <DeleteOperationButton
                label="Удалить входной контроль"
                onClick={() => onDelete(entry)}
              />
            </>
          ),
        },
      ]}
      isDeleted={({ isDeletedProjectMaterial }) => isDeletedProjectMaterial}
      focusRowId={focusEntryId}
    />
  )
}

function IssuesTable({
  entries,
  focusEntryId,
  lineById,
  receipts,
  onDelete,
}: {
  entries: Array<MaterialIssueEntry>
  focusEntryId?: string
  lineById: Map<string, SubobjectMaterialMetric>
  receipts: Array<MaterialReceiptEntry>
  onDelete: (entry: MaterialIssueEntry) => void
}) {
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

  if (entries.length === 0) {
    return null
  }
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))

  return (
    <OperationsGrid
      id={'issues'}
      label={'Выдача'}
      rows={[
        ...entries.map((entry) => {
          const receipt = receiptById.get(entry.receiptId)
          const line = lineById.get(entry.projectLineId)
          const isDeletedProjectMaterial = !line
          return { entry, receipt, line, isDeletedProjectMaterial }
        }),
      ]}
      rowId={({ entry }) => entry.id}
      columns={[
        {
          id: 'document',
          title: 'Документ передачи',
          value: ({ entry }) => entry.document,
          render: ({ entry }) => <>{entry.document}</>,
        },
        {
          id: 'name',
          title: 'ТМЦ',
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
          width: 110,
          actions: true,
          render: ({ entry }) => (
            <>
              <DeleteOperationButton
                label="Удалить выдачу"
                onClick={() => onDelete(entry)}
              />
            </>
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
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="shrink-0 text-red-700 hover:bg-red-50 hover:text-red-800"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Trash2 size={16} />
    </Button>
  )
}

function DeletedProjectMaterialBadge() {
  return (
    <span className="inline-flex w-fit items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-normal text-slate-600">
      Удален из проектной базы
    </span>
  )
}

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
  const [number, setNumber] = useState('')
  const alternativeUnits = unique(configuredUnits.map((unit) => unit.trim()))
  const [date, setDate] = useState('')
  const [requester, setRequester] = useState('')
  const [cipher, setCipher] = useState('')
  const [materialType, setMaterialType] = useState('')
  const [requestSearch, setRequestSearch] = useState('')
  const [requestListMode, setRequestListMode] = useState<'all' | 'filled'>(
    'all',
  )
  const [drafts, setDrafts] = useState<Record<string, RequestDraft>>({})
  const [requestImportOpen, setRequestImportOpen] = useState(false)
  const [requestImportDraft, setRequestImportDraft] =
    useState<MaterialRequestImportDraft | null>(null)
  const [overRequest, setOverRequest] = useState<OverRequestState | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
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
  const requestSourceLines = useMemo(() => {
    const allowedCiphers = new Set(ciphers)
    return [
      ...lines.filter((line) => allowedCiphers.has(line.cipher)),
      ...deletedRequestLines,
    ]
  }, [ciphers, deletedRequestLines, lines])

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
          (!materialType || getRequestLineMaterialType(line) === materialType),
      ),
    [cipher, materialType, requestSourceLines],
  )
  const requestScopeLines = useMemo(
    () =>
      requestCandidateLines.filter(
        (line) =>
          line.cipher === cipher &&
          getRequestLineMaterialType(line) === materialType,
      ),
    [cipher, materialType, requestCandidateLines],
  )
  const editingEntryByLineId = useMemo(
    () =>
      new Map(
        editingRequest?.entries.map((entry) => [entry.projectLineId, entry]) ??
          [],
      ),
    [editingRequest],
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
    if (requestListMode !== 'filled') {
      return filteredRequestLines
    }

    return filteredRequestLines.filter(
      (line) =>
        parsePositiveNumber(drafts[getProjectLineId(line)]?.quantity ?? '') > 0,
    )
  }, [drafts, filteredRequestLines, requestListMode])
  const visibleRequestLines = requestListModeLines.slice(0, 160)
  const hiddenFilteredCount =
    requestListModeLines.length - visibleRequestLines.length
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

  useEffect(() => {
    if (!open) {
      initializationKeyRef.current = null
      return
    }

    if (initializationKeyRef.current === initializationKey) {
      return
    }

    initializationKeyRef.current = initializationKey

    if (editingRequest) {
      const firstEntry = editingRequest.entries[0]
      const firstLine = firstEntry
        ? lineById.get(firstEntry.projectLineId)
        : null

      setNumber(editingRequest.number)
      setDate(firstEntry?.date ?? todayInputValue())
      setRequester(editingRequest.requester)
      setCipher(firstEntry?.cipher ?? ciphers[0] ?? '')
      setMaterialType(
        firstLine
          ? getRequestLineMaterialType(firstLine)
          : getRequestLineMaterialType(
              requestSourceLines.find(
                (line) => line.cipher === firstEntry?.cipher,
              ) ?? lines[0],
            ),
      )
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

      setNumber(makeMaterialRequestNumber(existingRequests, initialDate, ''))
      setDate(initialDate)
      setRequester('')
      setCipher('')
      setMaterialType('')
      setDrafts({})
    }
    setRequestSearch('')
    setRequestImportDraft(null)
    setRequestImportOpen(false)
    setOverRequest(null)
    setDeleteConfirmOpen(false)
  }, [
    ciphers,
    editingRequest,
    existingRequests,
    initializationKey,
    lineById,
    lines,
    open,
    requestSourceLines,
  ])

  useEffect(() => {
    if (
      !open ||
      !cipher ||
      !materialType ||
      materialTypesForCipher.length === 0
    ) {
      return
    }

    if (!materialTypesForCipher.includes(materialType)) {
      setMaterialType(materialTypesForCipher[0] ?? '')
      setRequestSearch('')
    }
  }, [materialType, materialTypesForCipher, open])

  useEffect(() => {
    if (!open || editingRequest) {
      return
    }

    setNumber(makeMaterialRequestNumber(existingRequests, date, materialType))
  }, [date, editingRequest, existingRequests, materialType, open])

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
      const line = lines.find((item) => getProjectLineId(item) === lineId)

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
    setMaterialType(nextMaterialType)
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
        number:
          number.trim() ||
          makeMaterialRequestNumber(existingRequests, date, materialType),
        projectLineId: lineId,
        projectMaterialName:
          line.projectMaterialName || line.material || 'Материал',
        projectUnit: line.unit,
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
      onSubmit(entries)
    }
  }

  return (
    <Modal
      open={open}
      size="xl"
      title={editingRequest ? 'Редактирование заявки' : 'Заявка на получение'}
      onClose={onClose}
    >
      <OperationModalLayout
        hint="Сначала выберите шифр проекта и тип материала. После этого справа появится список позиций для заполнения заявки."
        footerStart={
          editingRequest ? (
            <div className="flex items-center gap-2">
              {deleteConfirmOpen ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                  <div className="basis-full">
                    <p>Удалить заявку {editingRequest.number}?</p>
                    <p className="mt-1 text-xs leading-5">
                      {receiptCount > 0
                        ? `По заявке уже оформлены получения: ${receiptCount}. Они сохранятся во вкладке «Получение» как история удалённой заявки.`
                        : 'Получений по заявке нет. Её карточка также исчезнет из вкладки «Получение».'}
                    </p>
                  </div>
                  <Button
                    className="h-8 border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-100"
                    variant="outline"
                    onClick={() => onDelete(editingRequest.number)}
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
        primaryDisabled={!hasRows || hasInvalidConvertedQuantities}
        primaryLabel={
          editingRequest ? 'Сохранить изменения' : 'Сохранить заявку'
        }
        onCancel={onClose}
        onSubmit={submit}
      >
        {hasInvalidConvertedQuantities ? (
          <p role="alert" className="mb-3 text-sm text-amber-800">
            Не удалось пересчитать альтернативное количество. Проверьте
            количество и настройки пересчёта материала в проектной базе.
          </p>
        ) : null}
        <div className="grid min-h-[min(70vh,760px)] gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="grid content-start gap-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50/55 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-xs font-medium text-white">
                  1
                </span>
                <div>
                  <div className="text-sm font-medium text-slate-950">
                    Область заявки
                  </div>
                  <div className="text-xs leading-5 text-slate-500">
                    Сначала выберите шифр и тип
                  </div>
                </div>
              </div>
              <div className="grid gap-3">
                <Field label="Шифр проекта">
                  <NativeSelect
                    value={cipher}
                    onChange={(value) => {
                      setCipher(value)
                      setRequestSearch('')
                      if (!value) {
                        setMaterialType('')
                      }
                    }}
                    options={buildSelectOptions(
                      'Выберите шифр',
                      ciphers,
                      cipher,
                    )}
                  />
                </Field>
                <Field label="Тип материала">
                  <NativeSelect
                    value={materialType}
                    onChange={(value) => {
                      setMaterialType(value)
                      setRequestSearch('')
                    }}
                    options={buildSelectOptions(
                      'Выберите тип',
                      materialTypesForCipher,
                      materialType,
                    )}
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

            <div
              className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 transition-opacity ${
                requestScopeSelected ? '' : 'opacity-75'
              }`}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-medium text-slate-600">
                  2
                </span>
                <div>
                  <div className="text-sm font-medium text-slate-950">
                    Реквизиты заявки
                  </div>
                  <div className="text-xs leading-5 text-slate-500">
                    После выбора области заполните номер, дату и заявителя
                  </div>
                </div>
              </div>
              <div className="grid gap-3">
                <Field label="Номер заявки">
                  <Input
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                  />
                </Field>
                <Field label="Дата заявки">
                  <Input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </Field>
                <Field label="Заявитель">
                  <Input
                    value={requester}
                    onChange={(event) => setRequester(event.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500 shadow-sm shadow-slate-200/50">
              <div className="text-sm font-medium text-slate-900">
                Excel для больших заявок
              </div>
              <p className="mt-1">
                Шаблон формируется только по выбранному шифру и типу материала.
                Серые колонки в файле остаются справочными.
              </p>
              <Button
                className="mt-3 w-full justify-center bg-white"
                disabled={
                  !cipher || !materialType || requestScopeLines.length === 0
                }
                variant="outline"
                onClick={() => setRequestImportOpen(true)}
              >
                <FileInput size={16} />
                Импорт Excel
              </Button>
            </div>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
            <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-center">
              <div className="grid gap-1">
                <div className="text-sm font-medium text-slate-900">
                  {requestScopeSelected
                    ? 'Материалы выбранной области'
                    : 'Поиск материала по всей базе'}
                </div>
                <div className="text-xs leading-5 text-slate-500">
                  Найдено {filteredRequestLines.length} из{' '}
                  {requestCandidateLines.length} позиций. Заполнено:{' '}
                  {filledRowsCount}.
                </div>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-xs font-normal text-slate-500 ring-1 ring-slate-200">
                {cipher && materialType
                  ? `${cipher} · ${materialType}`
                  : 'Поиск по всей базе'}
              </div>
            </div>

            <div className="border-b border-slate-200 bg-white px-4 py-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={17}
                />
                <Input
                  className="h-11 bg-white pl-9 text-sm"
                  placeholder="Поиск по наименованию, нормативному документу, составу или массе"
                  value={requestSearch}
                  onChange={(event) => setRequestSearch(event.target.value)}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
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
            </div>

            {hiddenFilteredCount > 0 ? (
              <div className="mx-4 mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                Показаны первые {visibleRequestLines.length} позиций. Уточните
                поиск, чтобы быстрее найти нужный материал.
              </div>
            ) : null}

            <div className="grid gap-2 bg-slate-50/35 p-4">
              {visibleRequestLines.length > 0 ? (
                visibleRequestLines.map((line) => {
                  const lineId = getProjectLineId(line)
                  const draft = drafts[lineId]
                  const conversion = getRequestConversion(line)
                  const alternative = getRequestAlternative(line)
                  const alternativeQuantity = getAlternativeQuantity(line)
                  const altUnit = getAlternativeUnit(line)
                  const unknownAltUnit =
                    altUnit !== '' && !alternativeUnits.includes(altUnit)
                  const requestedQuantity = parsePositiveNumber(
                    draft?.quantity ?? '',
                  )
                  const lineMaterialType = getRequestLineMaterialType(line)
                  const lineIsInScope =
                    line.cipher === cipher && lineMaterialType === materialType
                  const lineIsDeletedProjectMaterial = !lineById.has(lineId)
                  const currentProjectQuantities =
                    referenceQuantityByLineId.get(lineId)
                  const initialProjectQuantities =
                    editingEntryByLineId.get(
                      lineId,
                    )?.projectQuantitiesAtCreation
                  const availableBalance = getRequestAvailableBalance(
                    line,
                    lineId,
                  )
                  const nextBalance = Math.max(
                    0,
                    availableBalance - requestedQuantity,
                  )
                  const exceeded = requestedQuantity > availableBalance
                  const progressTone = getMaterialProgressTone({
                    deleted: lineIsDeletedProjectMaterial,
                    summary: summaryByLine.get(lineId),
                  })

                  return (
                    <div
                      key={lineId}
                      className={`relative rounded-xl border-2 p-4 shadow-sm transition-colors ${progressTone.card} ${
                        !lineIsInScope
                          ? 'cursor-pointer hover:border-blue-300 hover:bg-blue-50/55'
                          : ''
                      } ${exceeded ? 'ring-1 ring-amber-300' : ''}`}
                      role={!lineIsInScope ? 'button' : undefined}
                      tabIndex={!lineIsInScope ? 0 : undefined}
                      onClick={() => {
                        if (!lineIsInScope) {
                          selectRequestScopeFromLine(line)
                        }
                      }}
                      onKeyDown={(event) => {
                        if (
                          lineIsInScope ||
                          (event.key !== 'Enter' && event.key !== ' ')
                        ) {
                          return
                        }

                        event.preventDefault()
                        selectRequestScopeFromLine(line)
                      }}
                    >
                      {requestedQuantity > 0 ? (
                        <span
                          className={`absolute bottom-3 left-0 top-3 w-1 rounded-r-full ${
                            exceeded ? 'bg-amber-300' : progressTone.accent
                          }`}
                        />
                      ) : null}
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start">
                        <div className="min-w-0">
                          <div className="max-w-5xl text-[15px] font-normal leading-6 text-slate-950">
                            {line.projectMaterialName ?? line.material}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-5 text-slate-500">
                            {lineIsDeletedProjectMaterial ? (
                              <DeletedProjectMaterialBadge />
                            ) : null}
                            <RequestMetaPill label="Шифр" value={line.cipher} />
                            <RequestMetaPill
                              label="Тип"
                              value={lineMaterialType}
                            />
                            <RequestMetaPill
                              label="Нормативный документ"
                              value={
                                line.normativeDocument ||
                                'нормативный документ не указан'
                              }
                            />
                            {line.material ? (
                              <RequestMetaPill
                                label="Состав"
                                value={line.material}
                              />
                            ) : null}
                            <RequestMetaPill
                              label="Единица измерения"
                              value={line.unit}
                            />
                          </div>
                        </div>

                        <div
                          className={`grid overflow-hidden rounded-lg border text-right sm:grid-cols-4 ${progressTone.metric}`}
                        >
                          <RequestMetric label="По проекту сейчас">
                            {lineIsDeletedProjectMaterial
                              ? 'удален'
                              : `${formatQuantity(currentProjectQuantities?.projectQuantity ?? 0)} ${line.unit}`}
                          </RequestMetric>
                          <RequestMetric label="По шифру сейчас">
                            {lineIsDeletedProjectMaterial
                              ? 'удален'
                              : `${formatQuantity(line.plannedQuantity)} ${line.unit}`}
                          </RequestMetric>
                          <RequestMetric label="Заявленное количество">
                            {requestedQuantity > 0
                              ? `${formatQuantity(requestedQuantity)} ${line.unit}`
                              : '-'}
                          </RequestMetric>
                          <RequestMetric
                            tone={exceeded ? 'warning' : 'default'}
                            label="Остаток к заявке"
                          >
                            {formatQuantity(nextBalance)} {line.unit}
                          </RequestMetric>
                        </div>
                      </div>

                      {editingEntryByLineId.has(lineId) ? (
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {initialProjectQuantities
                            ? `При создании заявки: по проекту ${formatQuantity(initialProjectQuantities.projectQuantity)} ${initialProjectQuantities.unit}, по шифру ${formatQuantity(initialProjectQuantities.cipherQuantity)} ${initialProjectQuantities.unit}.`
                            : 'Проектное количество при создании этой заявки не сохранялось.'}
                        </p>
                      ) : null}
                      {!lineIsDeletedProjectMaterial ? (
                        <RequestExcessWarning
                          quantity={Math.max(
                            0,
                            requestedQuantity - availableBalance,
                          )}
                          unit={line.unit}
                        />
                      ) : null}

                      {!lineIsInScope ? (
                        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm leading-5 text-blue-800">
                          Нажмите на позицию, чтобы выбрать шифр{' '}
                          <span className="font-medium">{line.cipher}</span> и
                          тип{' '}
                          <span className="font-medium">
                            {lineMaterialType}
                          </span>
                          .
                        </div>
                      ) : null}

                      {lineIsInScope ? (
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(0,3fr)]">
                            <RequestLineInputField
                              label={`Количество по заявке, ${line.unit}`}
                            >
                              <Input
                                className="h-10 bg-white text-sm"
                                inputMode="decimal"
                                placeholder={`Количество по заявке, ${line.unit}`}
                                value={draft?.quantity ?? ''}
                                onChange={(event) =>
                                  updateDraft(
                                    lineId,
                                    'quantity',
                                    event.target.value,
                                  )
                                }
                              />
                            </RequestLineInputField>
                            <RequestLineInputField label="Примечание">
                              <Input
                                className="h-10 bg-white text-sm"
                                placeholder="Примечание"
                                value={draft?.note ?? ''}
                                onChange={(event) =>
                                  updateDraft(
                                    lineId,
                                    'note',
                                    event.target.value,
                                  )
                                }
                              />
                              {draft?.sourceCipher && draft.sourceQuantity ? (
                                <TransferBadge
                                  sourceCipher={draft.sourceCipher}
                                  sourceQuantity={draft.sourceQuantity}
                                  unit={line.unit}
                                />
                              ) : null}
                            </RequestLineInputField>
                          </div>
                          {alternativeQuantity !== null ? (
                            <p className="mt-2 text-sm text-slate-600">
                              В альтернативной единице:{' '}
                              <output
                                aria-label="Количество в альтернативной единице"
                                className="font-medium text-slate-900"
                              >
                                {formatAlternativeQuantity(alternativeQuantity)}{' '}
                                {altUnit}
                              </output>
                            </p>
                          ) : null}
                          {conversion || alternativeQuantity !== null ? (
                            <p className="mt-2 text-xs text-slate-500">
                              {conversion
                                ? `1 ${editingEntryByLineId.get(lineId)?.projectUnit ?? line.unit} = ${formatAlternativeQuantity(conversion.factor)} ${altUnit}. Количество рассчитывается автоматически${getMaterialRequestConversion(lineById.get(lineId), editingEntryByLineId.get(lineId)?.projectUnit) ? ' по текущему коэффициенту материала' : ' по последнему сохранённому коэффициенту заявки'}.`
                                : 'Прежнее альтернативное количество сохранено. Для пересчёта задайте коэффициент в проектной базе.'}
                            </p>
                          ) : null}
                          {alternative.error ? (
                            <p
                              role="alert"
                              className="mt-2 text-sm text-rose-700"
                            >
                              {alternative.error}
                            </p>
                          ) : null}
                          {unknownAltUnit ? (
                            <p className="mt-1 text-xs text-amber-800">
                              Единицы «{altUnit}» нет в настройках.
                            </p>
                          ) : null}
                          {(conversion || alternativeQuantity !== null) &&
                          alternativeUnits.length === 0 ? (
                            <p className="mt-1 text-xs text-amber-800">
                              Добавьте единицы в настройках базы, в разделе
                              «Единицы измерения».
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  {!cipher && !materialType && requestSearch.trim().length === 0
                    ? 'Выберите шифр и тип слева или начните поиск по всей базе.'
                    : requestListMode === 'filled'
                      ? 'Заполненных позиций пока нет.'
                      : 'По выбранному шифру и типу материала позиций не найдено.'}
                </div>
              )}
            </div>
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
      </OperationModalLayout>
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
    <div className="fixed inset-0 z-[80] grid place-items-center bg-stone-950/35 px-4 py-6">
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
              <span>
                Сначала скачайте шаблон, заполните количество по нужным
                позициям, затем загрузите файл обратно и проверьте черновик.
              </span>
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
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Скачайте шаблон, заполните количество в Excel и загрузите файл
                  обратно. После проверки позиции можно будет применить к
                  заявке.
                </p>
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
    <div className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/35 px-4 py-6">
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
                  {formatQuantity(overRequest.quantity)} {overRequest.line.unit}
                </span>
              </div>
              <div>
                Не хватает:{' '}
                <span className="font-semibold">
                  {formatQuantity(overRequest.shortage)} {overRequest.line.unit}
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
  editingReceipt,
  lineById,
  open,
  receipts,
  requests,
  summaryByLine,
  onClose,
  onSubmit,
}: {
  editingReceipt: ReceiptDocumentGroup | null
  lineById: Map<string, SubobjectMaterialMetric>
  open: boolean
  receipts: Array<MaterialReceiptEntry>
  requests: Array<MaterialRequestEntry>
  summaryByLine: Map<string, OperationLineSummary>
  onClose: () => void
  onSubmit: (entries: Array<MaterialReceiptEntry>) => void
}) {
  const requestGroups = useMemo(
    () => groupRequestDocuments(requests),
    [requests],
  )
  const [submitError, setSubmitError] = useState('')
  const [requestNumber, setRequestNumber] = useState('')
  const [receiptMaterialTypeFilter, setReceiptMaterialTypeFilter] = useState('')
  const [drafts, setDrafts] = useState<Record<string, ReceiptDraft>>({})
  const [receiptListMode, setReceiptListMode] = useState<
    'all' | 'filled' | 'missing-invoice'
  >('all')
  const [receiptSearch, setReceiptSearch] = useState('')
  const [receiptRequestSearch, setReceiptRequestSearch] = useState('')
  const [receiptImportOpen, setReceiptImportOpen] = useState(false)
  const [receiptImportDraft, setStoredReceiptImportDraft] =
    useState<MaterialReceiptImportDraft | null>(null)
  const receiptImportDraftRef = useRef<MaterialReceiptImportDraft | null>(null)
  const receiptImportReadRef = useRef(0)
  const [receiptImportFileName, setReceiptImportFileName] = useState('')
  const [receiptImportError, setReceiptImportError] = useState('')
  const [receiptImportLoading, setReceiptImportLoading] = useState(false)
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const initializationKeyRef = useRef<string | null>(null)
  const initializationKey = editingReceipt
    ? `edit:${editingReceipt.key}`
    : 'create'

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
              actualName: entry.actualName,
              certificate: entry.certificate,
              customerArvk: entry.customerArvk,
              customerReceiptDocument: entry.customerReceiptDocument || '',
              date: entry.date,
              factoryNumber: entry.factoryNumber,
              heatBatch: entry.heatBatch || '',
              invoiceNumber: entry.invoiceNumber,
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
      setRequestNumber('')
      setReceiptMaterialTypeFilter('')
      setDrafts({})
    }

    setReceiptSearch('')
    setReceiptRequestSearch('')
    setReceiptListMode('all')
    setReceiptImportDraft(null)
    setReceiptImportOpen(false)
  }, [editingReceipt, initializationKey, lineById, open, requests])

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
  const receiptRequestOptions = useMemo(
    () => buildRequestGroupMeta(requestGroups, lineById),
    [lineById, requestGroups],
  )
  const filteredReceiptRequestOptions = useMemo(() => {
    const query = normalizeSearchValue(receiptRequestSearch)

    if (!query) {
      return receiptRequestOptions.slice(0, 8)
    }

    return receiptRequestOptions
      .filter((option) => option.searchText.includes(query))
      .slice(0, 12)
  }, [receiptRequestOptions, receiptRequestSearch])
  const selectedReceiptRequestOption = receiptRequestOptions.find(
    (option) => option.group.number === requestNumber,
  )
  const globalReceiptSearchMode = !editingReceipt && !requestNumber
  const receiptByRequest = sumByKey(receipts, 'requestId', 'quantity')
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

    return sourceRequests.map((request) => ({
      key: request.id,
      request,
      receipt: null,
    }))
  }, [
    editingReceipt,
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
      (draft?.invoiceNumber.trim().length ?? 0) === 0
    )
  }).length
  const receiptOverRestRowsCount = receiptWorkItems.filter(
    ({ key, request, receipt }) => {
      const quantity = parsePositiveNumber(drafts[key]?.quantity ?? '')

      return (
        quantity > 0 &&
        quantity > getReceiptRequestRest(request, receiptByRequest, receipt)
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

    if (receiptListMode === 'missing-invoice') {
      return sortReceiptItems(
        searchedReceiptWorkItems.filter(({ key }) => {
          const draft = drafts[key]

          return (
            parsePositiveNumber(draft?.quantity ?? '') > 0 &&
            (draft?.invoiceNumber.trim().length ?? 0) === 0
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
  const receiptSaveBlockedReason = !hasRows
    ? 'Укажите поступившее количество хотя бы по одной позиции.'
    : missingInvoiceRowsCount > 0
      ? `Заполните номер накладной: ${missingInvoiceRowsCount} поз.`
      : receiptOverRestRowsCount > 0
        ? `Поступление превышает остаток к получению: ${receiptOverRestRowsCount} поз.`
        : (alternativeErrors[0] ?? '')
  const receiptSaveDisabled = Boolean(receiptSaveBlockedReason)
  const selectedRequestGroup = requestGroups.find(
    (group) => group.number === requestNumber,
  )
  const selectedRequestMaterialTypes = unique(
    selectedRequests
      .map((request) =>
        getRequestLineMaterialType(lineById.get(request.projectLineId)),
      )
      .filter(Boolean),
  )
  const selectedRequestQuantity = selectedRequests.reduce(
    (total, request) => total + request.quantity,
    0,
  )

  function updateDraft(
    draftKey: string,
    request: MaterialRequestEntry,
    key: keyof ReceiptDraft,
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [draftKey]: {
        actualName:
          current[draftKey]?.actualName ?? request.projectMaterialName,
        certificate: current[draftKey]?.certificate ?? '',
        customerArvk: current[draftKey]?.customerArvk ?? '',
        customerReceiptDocument:
          current[draftKey]?.customerReceiptDocument ?? '',
        date: current[draftKey]?.date ?? localDateInputValue(),
        factoryNumber: current[draftKey]?.factoryNumber ?? '',
        heatBatch: current[draftKey]?.heatBatch ?? '',
        invoiceNumber: current[draftKey]?.invoiceNumber ?? '',
        manufacturer: current[draftKey]?.manufacturer ?? '',
        note: current[draftKey]?.note ?? '',
        qualityDocument: current[draftKey]?.qualityDocument ?? '',
        quantity: current[draftKey]?.quantity ?? '',
        technicalDecision: current[draftKey]?.technicalDecision ?? '',
        [key]: value,
      },
    }))
  }

  async function downloadReceiptTemplate() {
    const { createMaterialReceiptTemplateWorkbook } = await import('./excel')

    downloadWorkbook(
      await createMaterialReceiptTemplateWorkbook({
        lines: receiptTemplateWorkItems.map(({ key, request, receipt }) => ({
          altUnit: getReceiptConversion(request, receipt)?.unit,
          altUnitFactor: getReceiptConversion(request, receipt)?.factor,
          date: drafts[key]?.date || receipt?.date || localDateInputValue(),
          materialId: request.materialId,
          projectLineId: request.projectLineId,
          projectMaterialName: request.projectMaterialName,
          receivedQuantity:
            (receiptByRequest.get(request.id) ?? 0) - (receipt?.quantity ?? 0),
          requestId: request.id,
          requestQuantity: request.quantity,
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
      setReceiptImportDraft(buildReceiptImportDraft(rows))
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
      const date =
        row.date ||
        (item && (drafts[item.key]?.date || item.receipt?.date)) ||
        localDateInputValue()
      const hasEditableData =
        quantity > 0 ||
        (row.actualName.trim().length > 0 &&
          normalizeSearchValue(row.actualName) !==
            normalizeSearchValue(item?.request.projectMaterialName ?? '')) ||
        row.invoiceNumber.trim().length > 0 ||
        row.manufacturer.trim().length > 0 ||
        row.heatBatch.trim().length > 0 ||
        row.customerReceiptDocument.trim().length > 0 ||
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

      if (hasEditableData && row.invoiceNumber.trim().length === 0) {
        errors.push('Заполните номер накладной.')
      }

      if (hasEditableData && !normalizeCalendarDate(date)) {
        errors.push(
          'Некорректная дата поступления. Укажите дату в формате ДД.ММ.ГГГГ или ГГГГ-ММ-ДД.',
        )
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
          customerReceiptDocument: row.customerReceiptDocument,
          date,
          factoryNumber: row.factoryNumber,
          heatBatch: row.heatBatch,
          invoiceNumber: row.invoiceNumber,
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
        row,
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
    setReceiptImportOpen(false)
    setReceiptImportDraft(null)
  }

  function submit() {
    if (receiptSaveDisabled) {
      return
    }

    const entries: Array<MaterialReceiptEntry> = []

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

      if (quantity > requestRest) {
        return
      }

      const alternative = getReceiptAlternative(request, receipt, quantity)
      entries.push({
        actualName:
          draft?.actualName.trim() ||
          request.projectMaterialName ||
          'ТМЦ без наименования',
        altQuantity: alternative.altQuantity,
        altUnit: alternative.altUnit,
        altUnitFactor: alternative.altUnitFactor,
        certificate: draft?.certificate.trim() ?? '',
        customerArvk: draft?.customerArvk.trim() ?? '',
        customerReceiptDocument: draft?.customerReceiptDocument.trim() ?? '',
        date: draft?.date || localDateInputValue(),
        factoryNumber: draft?.factoryNumber.trim() ?? '',
        heatBatch: draft?.heatBatch.trim() ?? '',
        id: receipt?.id ?? createClientId('receipt'),
        invoiceNumber: draft?.invoiceNumber.trim() ?? '',
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

    if (entries.length > 0) {
      try {
        onSubmit(entries)
        setSubmitError('')
      } catch (cause) {
        setSubmitError(
          cause instanceof Error
            ? cause.message
            : 'Не удалось сохранить получение.',
        )
      }
    }
  }

  return (
    <Modal
      open={open}
      size="xl"
      title={editingReceipt ? 'Редактирование получения' : 'Оформить получение'}
      onClose={onClose}
    >
      {submitError && (
        <p role="alert" className="mb-3 text-red-700">
          {submitError}
        </p>
      )}
      <OperationModalLayout
        hint="Получение можно оформить по выбранной заявке или через поиск материала по всем заявкам. Если фактически пришла замена, укажите фактическое наименование ТМЦ."
        hideFooter
        primaryDisabled={receiptSaveDisabled}
        primaryLabel={
          editingReceipt ? 'Сохранить изменения' : 'Сохранить получение'
        }
        onCancel={onClose}
        onSubmit={submit}
      >
        <div className="grid min-h-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="grid content-start gap-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-blue-600 text-sm font-medium text-white">
                  1
                </span>
                <div>
                  <h3 className="text-sm font-medium text-slate-950">Заявка</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Можно выбрать заявку сразу или найти материал справа по всем
                    заявкам.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <Field label="Заявка">
                  <ReceiptRequestSearchPicker
                    options={filteredReceiptRequestOptions}
                    search={receiptRequestSearch}
                    selectedNumber={requestNumber}
                    selectedOption={selectedReceiptRequestOption}
                    totalCount={requestGroups.length}
                    onClear={() => {
                      setRequestNumber('')
                      setDrafts({})
                      setReceiptSearch('')
                      setReceiptImportDraft(null)
                    }}
                    onSearchChange={setReceiptRequestSearch}
                    onSelect={(value) => {
                      setRequestNumber(value)
                      setDrafts({})
                      setReceiptSearch('')
                      setReceiptImportDraft(null)
                    }}
                  />
                </Field>
                <Field label="Тип материала">
                  <NativeSelect
                    value={receiptMaterialTypeFilter}
                    onChange={(value) => {
                      setReceiptMaterialTypeFilter(value)
                      setDrafts({})
                      setReceiptImportDraft(null)
                    }}
                    options={buildSelectOptions(
                      'Все типы',
                      receiptMaterialTypeOptions,
                      receiptMaterialTypeFilter,
                    )}
                  />
                </Field>
                {selectedRequestGroup ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <RequestSidebarMetric
                      label="Шифр"
                      value={selectedRequestGroup.cipher}
                    />
                    <RequestSidebarMetric
                      label="Позиций"
                      value={String(selectedRequests.length)}
                    />
                    <RequestSidebarMetric
                      label="Тип"
                      value={selectedRequestMaterialTypes.join(', ') || '-'}
                    />
                    <RequestSidebarMetric
                      label="Заявлено"
                      value={formatQuantity(selectedRequestQuantity)}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-medium text-slate-950">
                Excel для больших получений
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Шаблон формируется по найденным позициям справа. Серые колонки в
                файле остаются справочными.
              </p>
              <Button
                className="mt-3 w-full"
                disabled={receiptTemplateWorkItems.length === 0}
                variant="outline"
                onClick={() => setReceiptImportOpen(true)}
              >
                <FileInput size={16} />
                Импорт Excel
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-medium text-slate-950">Сохранение</h3>
              {receiptSaveBlockedReason ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  Нельзя сохранить: {receiptSaveBlockedReason}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
                  Все обязательные поля заполнены, получение можно сохранить.
                </div>
              )}
              <div className="mt-3 grid gap-2">
                <Button disabled={receiptSaveDisabled} onClick={submit}>
                  {editingReceipt
                    ? 'Сохранить изменения'
                    : 'Сохранить получение'}
                </Button>
                <Button variant="outline" onClick={onClose}>
                  Отмена
                </Button>
              </div>
            </div>
          </aside>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60">
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
                      Номер накладной обязателен: {missingInvoiceRowsCount}.
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
                      ? 'Поиск по наименованию, накладной, составу или документу'
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
                  active={receiptListMode === 'missing-invoice'}
                  count={missingInvoiceRowsCount}
                  label="Без накладной"
                  tone="warning"
                  onClick={() => setReceiptListMode('missing-invoice')}
                />
              </div>

              {globalReceiptSearchMode &&
              !receiptMaterialTypeFilter &&
              receiptSearch.trim().length === 0 ? (
                <OperationFormEmpty text="Выберите заявку слева или начните поиск материала по всем заявкам." />
              ) : !globalReceiptSearchMode && selectedRequests.length === 0 ? (
                <OperationFormEmpty text="Выберите заявку слева или очистите выбор и найдите материал через поиск." />
              ) : visibleReceiptWorkItems.length > 0 ? (
                <div className="grid gap-4">
                  {visibleReceiptWorkItems.map(({ key, request, receipt }) => {
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
                    const currentActualName =
                      draft?.actualName ??
                      receipt?.actualName ??
                      request.projectMaterialName
                    const isReplacement =
                      normalizeSearchValue(currentActualName) !==
                      normalizeSearchValue(request.projectMaterialName)
                    const progressTone = getMaterialProgressTone({
                      deleted: !line,
                      summary: summaryByLine.get(request.projectLineId),
                    })

                    return (
                      <div
                        key={key}
                        className={`overflow-hidden rounded-xl border-2 shadow-md ring-1 transition-colors ${
                          exceedsReceiptRest
                            ? 'border-rose-300 bg-rose-50/40'
                            : progressTone.card
                        } ${
                          exceedsReceiptRest
                            ? 'ring-rose-200'
                            : isReplacement
                              ? 'ring-amber-200'
                              : progressTone.ring
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
                                value={line?.normativeDocument ?? request.note}
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
                          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(150px,1fr)]">
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
                            <RequestLineInputField
                              label={`Поступило, ${request.projectUnit}`}
                            >
                              <Input
                                className="h-10 bg-white text-sm"
                                aria-invalid={exceedsReceiptRest}
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
                            conversion={getReceiptConversion(request, receipt)}
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
                            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-900">
                              Нельзя получить больше остатка по заявке: доступно{' '}
                              {formatQuantity(rest)} {request.projectUnit}.
                              Создайте или исправьте заявку вручную, затем
                              вернитесь к получению.
                            </div>
                          ) : null}

                          <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2 xl:grid-cols-4">
                            <RequestLineInputField label="Дата поступления">
                              <Input
                                className="h-10 bg-white text-sm"
                                type="date"
                                value={draft?.date ?? localDateInputValue()}
                                onChange={(event) =>
                                  updateDraft(
                                    key,
                                    request,
                                    'date',
                                    event.target.value,
                                  )
                                }
                              />
                            </RequestLineInputField>
                            <RequestLineInputField label="Номер накладной">
                              <Input
                                className="h-10 bg-white text-sm"
                                aria-invalid={
                                  parsePositiveNumber(draft?.quantity ?? '') >
                                    0 &&
                                  (draft?.invoiceNumber.trim().length ?? 0) ===
                                    0
                                }
                                placeholder="Номер накладной *"
                                required
                                value={draft?.invoiceNumber ?? ''}
                                onChange={(event) =>
                                  updateDraft(
                                    key,
                                    request,
                                    'invoiceNumber',
                                    event.target.value,
                                  )
                                }
                              />
                            </RequestLineInputField>
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
                            <RequestLineInputField label="Номер документа о получении (Заказчика)">
                              <Input
                                className="h-10 bg-white text-sm"
                                placeholder="Номер документа о получении (Заказчика)"
                                value={draft?.customerReceiptDocument ?? ''}
                                onChange={(event) =>
                                  updateDraft(
                                    key,
                                    request,
                                    'customerReceiptDocument',
                                    event.target.value,
                                  )
                                }
                              />
                            </RequestLineInputField>
                            <RequestLineInputField label="АРВК заказчика">
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
                            <RequestLineInputField label="Дата и номер документа о качестве">
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
                            <RequestLineInputField label="Паспорт / сертификат">
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
                            <RequestLineInputField label="Техническое решение / согласование">
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
                        </div>
                      </div>
                    )
                  })}
                  {hiddenReceiptWorkItemCount > 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-500">
                      Показано 180 позиций. Уточните поиск, чтобы сузить список
                      еще на {hiddenReceiptWorkItemCount}.
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
  search,
  selectedNumber,
  selectedOption,
  totalCount,
  onClear,
  onSearchChange,
  onSelect,
}: {
  options: Array<RequestGroupMeta>
  search: string
  selectedNumber: string
  selectedOption: RequestGroupMeta | undefined
  totalCount: number
  onClear: () => void
  onSearchChange: (value: string) => void
  onSelect: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const selectedLabel = selectedNumber || 'Без выбранной заявки'

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <div ref={pickerRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={16}
        />
        <Input
          className="h-10 bg-white pl-9 pr-8 text-sm"
          placeholder={selectedLabel}
          value={open ? search : selectedNumber}
          onChange={(event) => {
            setOpen(true)
            onSearchChange(event.target.value)
          }}
          onFocus={() => {
            setOpen(true)
            onSearchChange('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              onSearchChange('')
            }
          }}
        />
        {open && search ? (
          <button
            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            type="button"
            aria-label="Очистить поиск заявки"
            onClick={() => onSearchChange('')}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {!open && selectedOption ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs leading-5 text-slate-500">
          <span className="font-medium text-slate-700">
            {selectedOption.group.cipher}
          </span>
          <span className="mx-1 text-slate-300">·</span>
          {selectedOption.materialType}
          <span className="mx-1 text-slate-300">·</span>
          {selectedOption.group.entries.length} поз.
        </div>
      ) : null}

      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-300/30">
          <div className="max-h-72 overflow-y-auto p-1.5">
            <button
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                selectedNumber
                  ? 'border-transparent text-slate-600 hover:bg-slate-50'
                  : 'border-blue-200 bg-blue-50 text-blue-800'
              }`}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
                onClear()
                onSearchChange('')
                setOpen(false)
              }}
            >
              Без выбранной заявки
              <span className="mt-0.5 block text-xs text-slate-400">
                Поиск материала по всем заявкам
              </span>
            </button>

            {selectedOption && !search ? (
              <ReceiptRequestOptionButton
                active
                option={selectedOption}
                onSelect={(value) => {
                  onSelect(value)
                  onSearchChange('')
                  setOpen(false)
                }}
              />
            ) : null}

            {options
              .filter((option) => option.group.number !== selectedNumber)
              .map((option) => (
                <ReceiptRequestOptionButton
                  key={option.group.number}
                  active={false}
                  option={option}
                  onSelect={(value) => {
                    onSelect(value)
                    onSearchChange('')
                    setOpen(false)
                  }}
                />
              ))}

            {options.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-400">
                Заявки не найдены
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
            Показано {options.length} из {totalCount}. Начните вводить, чтобы
            сузить список.
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ReceiptRequestOptionButton({
  active,
  option,
  onSelect,
}: {
  active: boolean
  option: RequestGroupMeta
  onSelect: (value: string) => void
}) {
  return (
    <button
      className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-left transition-colors ${
        active
          ? 'border-blue-200 bg-blue-50/80 text-blue-950'
          : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/50'
      }`}
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        onSelect(option.group.number)
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-medium leading-5">
          {option.group.number}
        </span>
        <span className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500">
          {option.group.entries.length} поз.
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-4 text-slate-500">
        <span>{formatDate(option.group.date)}</span>
        <span>Шифр: {option.group.cipher}</span>
        <span>{option.materialType}</span>
      </div>
    </button>
  )
}

function ReceiptImportDialog({
  draft,
  fileName,
  fileError,
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
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-stone-950/35 px-4 py-6"
      onKeyDownCapture={(event) => {
        const grid = gridRef.current
        if (
          event.key === 'Escape' &&
          grid &&
          !grid.isDestroyed() &&
          grid.getEditingCells().length > 0
        ) {
          event.preventDefault()
          event.stopPropagation()
          grid.stopEditing(true)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          // AG Grid handles Escape in its editor; do not also close the import.
          if (
            !(
              event.target instanceof Element &&
              event.target.closest('[grid-id]')
            )
          )
            onClose()
        }
      }}
    >
      <div className="flex h-[min(820px,calc(100vh-2rem))] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">
              Импорт получения из Excel
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Проверьте количество, дату и документы поступления. Значения можно
              исправить в таблице перед применением импорта.
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
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Сначала скачайте шаблон, заполните поступившее количество по
              нужным позициям, затем загрузите файл обратно и проверьте
              черновик.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={onDownloadTemplate}>
                <Download size={16} /> Скачать шаблон
              </Button>
              <Button onClick={onChooseFile}>
                <FileInput size={16} />
                {draft ? 'Загрузить исправленный файл' : 'Загрузить файл'}
              </Button>
              <span className="break-all text-sm text-slate-600" role="status">
                {loading ? 'Чтение файла…' : fileName}
              </span>
            </div>
            {draft ? (
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Дважды нажмите на ячейку, чтобы исправить значение. Enter или
                Tab — подтвердить, Escape — отменить правку. Серые колонки не
                редактируются. Новый файл заменит весь черновик, включая правки
                в таблице.
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
                      title: 'Факт поступления',
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
                    {
                      id: 'invoiceNumber',
                      title: 'Накладная',
                      value: ({ row }) => row.row.invoiceNumber,
                      onEdit: ({ row }, value) =>
                        onEdit(row.row.rowNumber, 'invoiceNumber', value),
                      render: ({ row }) => <>{row.row.invoiceNumber || '-'}</>,
                    },
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
                      id: 'customerReceiptDocument',
                      title: 'Номер документа о получении (Заказчика)',
                      value: ({ row }) => row.row.customerReceiptDocument,
                      onEdit: ({ row }, value) =>
                        onEdit(
                          row.row.rowNumber,
                          'customerReceiptDocument',
                          value,
                        ),
                      render: ({ row }) => (
                        <>{row.row.customerReceiptDocument || '-'}</>
                      ),
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
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Скачайте шаблон, заполните поступившее количество в Excel и
                  загрузите файл обратно. После проверки позиции можно будет
                  применить к получению.
                </p>
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
  )
}

function QualityControlModal({
  existingCount,
  open,
  qualityControls,
  receipts,
  onClose,
  onSubmit,
}: {
  existingCount: number
  open: boolean
  qualityControls: Array<QualityControlEntry>
  receipts: Array<MaterialReceiptEntry>
  onClose: () => void
  onSubmit: (entries: Array<QualityControlEntry>) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, QualityDraft>>({})

  useEffect(() => {
    if (open) {
      setDrafts({})
    }
  }, [open])

  const qcByReceipt = sumByKey(qualityControls, 'receiptId', 'quantity')
  const availableReceipts = receipts.filter(
    (receipt) => receipt.quantity - (qcByReceipt.get(receipt.id) ?? 0) > 0,
  )
  const hasRows = Object.values(drafts).some(
    (draft) => parsePositiveNumber(draft.quantity) > 0,
  )

  function updateDraft(
    receiptId: string,
    key: keyof QualityDraft,
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [receiptId]: {
        arvkDate: current[receiptId]?.arvkDate ?? todayInputValue(),
        arvkNumber: current[receiptId]?.arvkNumber ?? '',
        author: current[receiptId]?.author ?? '',
        comment: current[receiptId]?.comment ?? '',
        date: current[receiptId]?.date ?? todayInputValue(),
        quantity: current[receiptId]?.quantity ?? '',
        status: current[receiptId]?.status ?? 'in_progress',
        zniNumber:
          current[receiptId]?.zniNumber ??
          makeOperationNumber('ЗНИ', existingCount),
        [key]: value,
      },
    }))
  }

  function submit() {
    const entries = availableReceipts
      .map((receipt) => {
        const draft = drafts[receipt.id]
        const quantity = parsePositiveNumber(draft?.quantity ?? '')

        if (quantity <= 0) {
          return null
        }

        return {
          arvkDate: draft?.arvkDate ?? todayInputValue(),
          arvkNumber: draft?.arvkNumber.trim() ?? '',
          author: draft?.author.trim() ?? '',
          comment: draft?.comment.trim() ?? '',
          date: draft?.date ?? todayInputValue(),
          id: createClientId('quality'),
          projectLineId: receipt.projectLineId,
          quantity,
          receiptId: receipt.id,
          status: draft?.status ?? 'in_progress',
          zniNumber:
            draft?.zniNumber.trim() ||
            makeOperationNumber('ЗНИ', existingCount),
        } satisfies QualityControlEntry
      })
      .filter((entry): entry is QualityControlEntry => Boolean(entry))

    if (entries.length > 0) {
      onSubmit(entries)
    }
  }

  return (
    <Modal open={open} size="lg" title="Входной контроль" onClose={onClose}>
      <OperationModalLayout
        hint="Создайте ЗНИ/АРВК по поступившим позициям. Только статус «Подписан» считается пройденным входным контролем."
        primaryDisabled={!hasRows}
        primaryLabel="Сохранить входной контроль"
        onCancel={onClose}
        onSubmit={submit}
      >
        {availableReceipts.length === 0 ? (
          <OperationFormEmpty text="Нет поступивших позиций с остатком к входному контролю." />
        ) : (
          <div className="grid gap-4">
            {availableReceipts.map((receipt) => {
              const processed = qcByReceipt.get(receipt.id) ?? 0
              const rest = receipt.quantity - processed
              const draft = drafts[receipt.id]

              return (
                <div
                  key={receipt.id}
                  className="rounded-lg border border-stone-200 bg-white p-4"
                >
                  <div className="text-sm font-medium text-stone-950">
                    {receipt.actualName}
                  </div>
                  <div className="mt-1 text-xs text-stone-500">
                    Поступило {formatQuantity(receipt.quantity)}{' '}
                    {receipt.projectUnit} · к ВК {formatQuantity(rest)}
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-4">
                    <Field label="Номер ЗНИ">
                      <Input
                        value={
                          draft?.zniNumber ??
                          makeOperationNumber('ЗНИ', existingCount)
                        }
                        onChange={(event) =>
                          updateDraft(
                            receipt.id,
                            'zniNumber',
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="Дата ЗНИ">
                      <Input
                        type="date"
                        value={draft?.date ?? todayInputValue()}
                        onChange={(event) =>
                          updateDraft(receipt.id, 'date', event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Номер АРВК">
                      <Input
                        value={draft?.arvkNumber ?? ''}
                        onChange={(event) =>
                          updateDraft(
                            receipt.id,
                            'arvkNumber',
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="Дата АРВК">
                      <Input
                        type="date"
                        value={draft?.arvkDate ?? todayInputValue()}
                        onChange={(event) =>
                          updateDraft(
                            receipt.id,
                            'arvkDate',
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label={`Количество по АРВК, ${receipt.projectUnit}`}>
                      <Input
                        inputMode="decimal"
                        value={draft?.quantity ?? ''}
                        onChange={(event) =>
                          updateDraft(
                            receipt.id,
                            'quantity',
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="Статус">
                      <NativeSelect
                        value={draft?.status ?? 'in_progress'}
                        onChange={(value) =>
                          updateDraft(receipt.id, 'status', value)
                        }
                        options={[
                          { label: 'В работе', value: 'in_progress' },
                          { label: 'Подписан', value: 'signed' },
                        ]}
                      />
                    </Field>
                    <Field label="Составитель">
                      <Input
                        value={draft?.author ?? ''}
                        onChange={(event) =>
                          updateDraft(receipt.id, 'author', event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Комментарий">
                      <Input
                        value={draft?.comment ?? ''}
                        onChange={(event) =>
                          updateDraft(receipt.id, 'comment', event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </OperationModalLayout>
    </Modal>
  )
}

function IssueModal({
  existingCount,
  lineById,
  issues,
  open,
  qualityControls,
  receipts,
  onClose,
  onSubmit,
}: {
  existingCount: number
  lineById: Map<string, SubobjectMaterialMetric>
  issues: Array<MaterialIssueEntry>
  open: boolean
  qualityControls: Array<QualityControlEntry>
  receipts: Array<MaterialReceiptEntry>
  onClose: () => void
  onSubmit: (entries: Array<MaterialIssueEntry>) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, IssueDraft>>({})

  useEffect(() => {
    if (open) {
      setDrafts({})
    }
  }, [open])

  const issuesByReceipt = sumByKey(issues, 'receiptId', 'quantity')
  const signedByReceipt = getSignedQuantityByReceipt(qualityControls)
  function getAvailableQuantity(receipt: MaterialReceiptEntry) {
    const signedQuantity = Number(
      (signedByReceipt.get(receipt.id) ?? 0).toPrecision(15),
    )
    const issuedQuantity = Number(
      (issuesByReceipt.get(receipt.id) ?? 0).toPrecision(15),
    )
    return Math.max(
      0,
      Number(
        (
          Math.min(receipt.quantity, signedQuantity) - issuedQuantity
        ).toPrecision(15),
      ),
    )
  }
  const availableReceipts = receipts.filter(
    (receipt) => getAvailableQuantity(receipt) > 0,
  )
  function getQuantityError(receipt: MaterialReceiptEntry) {
    const value = drafts[receipt.id]?.quantity ?? ''
    if (!value.trim()) return ''
    const quantity = parseNullableNumber(value)
    if (quantity === null || quantity <= 0)
      return 'Введите положительное количество.'
    const available = getAvailableQuantity(receipt)
    return quantity > available
      ? `К выдаче доступно только ${formatQuantity(available)} ${receipt.projectUnit}.`
      : ''
  }
  const hasQuantityError = availableReceipts.some((receipt) =>
    Boolean(getQuantityError(receipt)),
  )
  const hasRows = Object.values(drafts).some(
    (draft) => parsePositiveNumber(draft.quantity) > 0,
  )

  function getIssueConversion(receipt: MaterialReceiptEntry) {
    return getOperationConversion(
      lineById.get(receipt.projectLineId),
      receipt.projectUnit,
      receipt,
    )
  }
  const hasAlternativeError = availableReceipts.some((receipt) => {
    const quantity = parsePositiveNumber(drafts[receipt.id]?.quantity ?? '')
    return (
      quantity > 0 &&
      Boolean(
        getOperationAlternative(quantity, getIssueConversion(receipt)).error,
      )
    )
  })
  function updateDraft(
    receiptId: string,
    key: keyof IssueDraft,
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [receiptId]: {
        date: current[receiptId]?.date ?? todayInputValue(),
        document:
          current[receiptId]?.document ??
          makeOperationNumber('ПМ', existingCount),
        note: current[receiptId]?.note ?? '',
        quantity: current[receiptId]?.quantity ?? '',
        receiver: current[receiptId]?.receiver ?? '',
        [key]: value,
      },
    }))
  }

  function submit() {
    if (hasAlternativeError || hasQuantityError) return
    const entries = availableReceipts
      .map((receipt): MaterialIssueEntry | null => {
        const draft = drafts[receipt.id]
        const quantity = parsePositiveNumber(draft?.quantity ?? '')

        if (quantity <= 0) {
          return null
        }

        const alternative = getOperationAlternative(
          quantity,
          getIssueConversion(receipt),
        )
        return {
          altQuantity: alternative.altQuantity,
          altUnit: alternative.altUnit,
          altUnitFactor: alternative.altUnitFactor,
          projectUnit: receipt.projectUnit,
          date: draft?.date ?? todayInputValue(),
          document:
            draft?.document.trim() || makeOperationNumber('ПМ', existingCount),
          id: createClientId('issue'),
          note: draft?.note.trim() ?? '',
          projectLineId: receipt.projectLineId,
          quantity,
          receiptId: receipt.id,
          receiver: draft?.receiver.trim() ?? '',
        } satisfies MaterialIssueEntry
      })
      .filter((entry): entry is MaterialIssueEntry => Boolean(entry))

    if (entries.length > 0) {
      onSubmit(entries)
    }
  }

  return (
    <Modal open={open} size="lg" title="Выдача в монтаж" onClose={onClose}>
      <OperationModalLayout
        hint="Выдавайте только материал с подписанным входным контролем. Количество уменьшит остаток к выдаче."
        primaryDisabled={!hasRows || hasAlternativeError || hasQuantityError}
        primaryLabel="Сохранить выдачу"
        onCancel={onClose}
        onSubmit={submit}
      >
        {availableReceipts.length === 0 ? (
          <OperationFormEmpty text="Нет материала с подписанным ВК и остатком к выдаче." />
        ) : (
          <div className="grid gap-4">
            {availableReceipts.map((receipt) => {
              const line = lineById.get(receipt.projectLineId)
              const rest = getAvailableQuantity(receipt)
              const quantityError = getQuantityError(receipt)
              const draft = drafts[receipt.id]

              return (
                <div
                  key={receipt.id}
                  className="rounded-lg border border-stone-200 bg-white p-4"
                >
                  <div className="text-sm font-medium text-stone-950">
                    {receipt.actualName || line?.projectMaterialName || '-'}
                  </div>
                  <div className="mt-1 text-xs text-stone-500">
                    ВК подписан{' '}
                    {formatQuantity(signedByReceipt.get(receipt.id) ?? 0)} · к
                    выдаче {formatQuantity(rest)}
                  </div>
                  <AutomaticAlternative
                    label="Выдано в альтернативной единице"
                    baseUnit={receipt.projectUnit}
                    conversion={getIssueConversion(receipt)}
                    value={getOperationAlternative(
                      quantityError
                        ? null
                        : parseNullableNumber(draft?.quantity ?? ''),
                      getIssueConversion(receipt),
                    )}
                  />
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <Field label="Документ передачи">
                      <Input
                        value={
                          draft?.document ??
                          makeOperationNumber('ПМ', existingCount)
                        }
                        onChange={(event) =>
                          updateDraft(
                            receipt.id,
                            'document',
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="Количество выдано">
                      <Input
                        inputMode="decimal"
                        aria-label={`Количество выдано: ${receipt.actualName}`}
                        aria-invalid={Boolean(quantityError)}
                        aria-describedby={
                          quantityError
                            ? `issue-quantity-error-${receipt.id}`
                            : undefined
                        }
                        value={draft?.quantity ?? ''}
                        onChange={(event) =>
                          updateDraft(
                            receipt.id,
                            'quantity',
                            event.target.value,
                          )
                        }
                      />
                      {quantityError ? (
                        <p
                          id={`issue-quantity-error-${receipt.id}`}
                          role="alert"
                          className="text-sm text-rose-700"
                        >
                          {quantityError}
                        </p>
                      ) : null}
                    </Field>
                    <Field label="Дата выдачи">
                      <Input
                        type="date"
                        value={draft?.date ?? todayInputValue()}
                        onChange={(event) =>
                          updateDraft(receipt.id, 'date', event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Получатель">
                      <Input
                        value={draft?.receiver ?? ''}
                        onChange={(event) =>
                          updateDraft(
                            receipt.id,
                            'receiver',
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="Примечание">
                      <Input
                        value={draft?.note ?? ''}
                        onChange={(event) =>
                          updateDraft(receipt.id, 'note', event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </OperationModalLayout>
    </Modal>
  )
}

function OperationModalLayout({
  children,
  footerStart,
  hideFooter = false,
  hint,
  primaryDisabled,
  primaryLabel,
  onCancel,
  onSubmit,
}: {
  children: React.ReactNode
  footerStart?: React.ReactNode
  hideFooter?: boolean
  hint: string
  primaryDisabled: boolean
  primaryLabel: string
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div
      className="grid gap-5"
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || primaryDisabled) {
          return
        }

        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="rounded-lg border border-blue-100 bg-blue-50/35 px-3 py-2 text-[13px] leading-6 text-blue-900">
        {hint}
      </div>
      {children}
      {hideFooter ? null : (
        <div className="-mx-5 -mb-5 mt-1 flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>{footerStart}</div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Отмена
            </Button>
            <Button disabled={primaryDisabled} onClick={onSubmit}>
              {primaryLabel}
            </Button>
          </div>
        </div>
      )}
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

type OperationLineSummary = {
  issuedQuantity: number
  issueBalance: number
  projectQuantity: number
  qcBalance: number
  qcSignedQuantity: number
  receiptBalance: number
  receivedQuantity: number
  requestBalance: number
  requestedQuantity: number
}
type OperationSummary = OperationLineSummary & {
  byLine: Map<string, OperationLineSummary>
}
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
  cipher: string
  lineId: string
  metrics: OperationOverviewMetrics
  projectQuantity: number
}
type OperationOverviewRow = {
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
type ReceiptDraft = {
  actualName: string
  certificate: string
  customerArvk: string
  date: string
  factoryNumber: string
  heatBatch: string
  invoiceNumber: string
  manufacturer: string
  customerReceiptDocument: string
  note: string
  qualityDocument: string
  quantity: string
  technicalDecision: string
}
type QualityDraft = {
  arvkDate: string
  arvkNumber: string
  author: string
  comment: string
  date: string
  quantity: string
  status: QualityControlStatus
  zniNumber: string
}
type IssueDraft = {
  date: string
  document: string
  note: string
  quantity: string
  receiver: string
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
  lines,
  materialIssues,
  materialReceipts,
  materialRequests,
  qualityControls,
}: {
  lines: Array<SubobjectMaterialMetric>
  materialIssues: Array<MaterialIssueEntry>
  materialReceipts: Array<MaterialReceiptEntry>
  materialRequests: Array<MaterialRequestEntry>
  qualityControls: Array<QualityControlEntry>
}): OperationSummary {
  const byLine = new Map<string, OperationLineSummary>()

  for (const line of lines) {
    byLine.set(getProjectLineId(line), {
      issuedQuantity: 0,
      issueBalance: 0,
      projectQuantity: line.plannedQuantity,
      qcBalance: 0,
      qcSignedQuantity: 0,
      receiptBalance: 0,
      receivedQuantity: 0,
      requestBalance: 0,
      requestedQuantity: 0,
    })
  }

  for (const request of materialRequests) {
    const summary = ensureOperationLineSummary(byLine, request.projectLineId)
    summary.requestedQuantity += request.quantity
  }

  for (const receipt of materialReceipts) {
    const summary = ensureOperationLineSummary(byLine, receipt.projectLineId)
    summary.receivedQuantity += receipt.quantity
  }

  for (const control of qualityControls) {
    if (control.status !== 'signed') {
      continue
    }

    const summary = ensureOperationLineSummary(byLine, control.projectLineId)
    summary.qcSignedQuantity += control.quantity
  }

  for (const issue of materialIssues) {
    const summary = ensureOperationLineSummary(byLine, issue.projectLineId)
    summary.issuedQuantity += issue.quantity
  }

  for (const summary of byLine.values()) {
    summary.requestBalance = summary.projectQuantity - summary.requestedQuantity
    summary.receiptBalance =
      summary.requestedQuantity - summary.receivedQuantity
    summary.qcBalance = summary.receivedQuantity - summary.qcSignedQuantity
    summary.issueBalance = summary.qcSignedQuantity - summary.issuedQuantity
  }

  const totals: OperationSummary = {
    byLine,
    issuedQuantity: 0,
    issueBalance: 0,
    projectQuantity: 0,
    qcBalance: 0,
    qcSignedQuantity: 0,
    receiptBalance: 0,
    receivedQuantity: 0,
    requestBalance: 0,
    requestedQuantity: 0,
  }

  for (const summary of byLine.values()) {
    totals.issuedQuantity += summary.issuedQuantity
    totals.issueBalance += summary.issueBalance
    totals.projectQuantity += summary.projectQuantity
    totals.qcBalance += summary.qcBalance
    totals.qcSignedQuantity += summary.qcSignedQuantity
    totals.receiptBalance += summary.receiptBalance
    totals.receivedQuantity += summary.receivedQuantity
    totals.requestBalance += summary.requestBalance
    totals.requestedQuantity += summary.requestedQuantity
  }

  return totals
}

function buildOperationOverviewRows({
  lines,
  materialIssues,
  materialReceipts,
  materialRequests,
  qualityControls,
}: {
  lines: Array<SubobjectMaterialMetric>
  materialIssues: Array<MaterialIssueEntry>
  materialReceipts: Array<MaterialReceiptEntry>
  materialRequests: Array<MaterialRequestEntry>
  qualityControls: Array<QualityControlEntry>
}): Array<OperationOverviewRow> {
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
    (entry) => entry.invoiceNumber || formatDate(entry.date),
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
    qualityControls.filter((entry) => entry.status === 'signed'),
    (entry) => entry.projectLineId,
    (entry) => entry.id,
    (entry) => entry.zniNumber || entry.arvkNumber || formatDate(entry.date),
    (entry) => entry.date,
    (entry) => entry.quantity,
  )
  const latestActivityByLineId = buildOperationActivityIndex({
    materialReceipts,
    materialRequests,
    qualityControls,
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

    current.ciphers.push({
      cipher: line.cipher,
      lineId,
      metrics,
      projectQuantity: line.plannedQuantity,
    })
    current.totalProjectQuantity += line.plannedQuantity
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
        totals: createEmptyOverviewMetrics(),
        unit: descriptor.unit,
        unitWeight: null,
      } satisfies OperationOverviewRow)

    current.latestActivityTime = Math.max(
      current.latestActivityTime,
      latestActivityByLineId.get(lineId) ?? 0,
    )

    current.ciphers.push({
      cipher: descriptor.cipher || 'удален',
      lineId,
      metrics,
      projectQuantity: 0,
    })
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
  qualityControls: Array<QualityControlEntry>
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
    issuedQuantity: 0,
    issueBalance: 0,
    projectQuantity: 0,
    qcBalance: 0,
    qcSignedQuantity: 0,
    receiptBalance: 0,
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

  return Array.from(groups.values())
}

function buildRequestGroupMeta(
  groups: Array<RequestDocumentGroup>,
  lineById: Map<string, SubobjectMaterialMetric>,
): Array<RequestGroupMeta> {
  return groups.map((group) => {
    const materialTypes = unique(
      group.entries
        .map((entry) =>
          getRequestLineMaterialType(lineById.get(entry.projectLineId)),
        )
        .filter(Boolean),
    )
    const materialType = materialTypes.join(', ') || 'не указан'

    return {
      group,
      materialType,
      searchText: normalizeSearchValue(
        [
          group.number,
          group.date,
          group.requester,
          group.cipher,
          materialType,
          ...group.entries.flatMap((entry) => [
            entry.materialId,
            entry.projectMaterialName,
            entry.note,
          ]),
        ].join(' '),
      ),
    }
  })
}

function formatAlternativeTotals(entries: Array<MaterialReceiptEntry>) {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    if (entry.altQuantity === null || !Number.isFinite(entry.altQuantity))
      continue
    const unit = entry.altUnit.trim()
    totals.set(unit, (totals.get(unit) ?? 0) + entry.altQuantity)
  }
  return (
    [...totals]
      .map(
        ([unit, quantity]) =>
          `${formatAlternativeQuantity(quantity)} ${unit || '(единица не указана)'}`,
      )
      .join(' · ') || '-'
  )
}

function groupReceiptRequests(
  entries: Array<MaterialReceiptEntry>,
  requests: Array<MaterialRequestEntry>,
): Array<ReceiptRequestGroup> {
  const groups = groupRequestDocuments(requests).map((request) => ({
    key: `request:${request.number}`,
    request,
    entries: [] as Array<MaterialReceiptEntry>,
  }))
  const byRequestId = new Map<string, ReceiptRequestGroup>()
  for (const group of groups) {
    for (const request of group.request.entries)
      byRequestId.set(request.id, group)
  }
  const orphans = new Map<string, ReceiptRequestGroup>()
  for (const entry of entries) {
    const group = byRequestId.get(entry.requestId)
    if (group) {
      group.entries.push(entry)
    } else {
      // The request number was not stored in receipts. Keep history by its
      // original entry ID without guessing a number or merging unrelated data.
      const key = `orphan:${entry.requestId || entry.id}`
      let orphan = orphans.get(key)
      if (!orphan) {
        orphan = { key, request: null, entries: [] }
        orphans.set(key, orphan)
      }
      orphan.entries.push(entry)
    }
  }
  return [...groups, ...orphans.values()]
}

function receiptEditGroup(
  entry: MaterialReceiptEntry,
  request?: MaterialRequestEntry,
): ReceiptDocumentGroup {
  return {
    key: entry.id,
    actualName: entry.actualName,
    date: entry.date,
    entries: [entry],
    invoiceNumbers: entry.invoiceNumber ? [entry.invoiceNumber] : [],
    latestChangeOrder: 0,
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

function buildOperationSearchMeta<
  T extends QualityControlEntry | MaterialIssueEntry,
>(
  entries: Array<T>,
  receipts: Array<MaterialReceiptEntry>,
  requests: Array<MaterialRequestEntry>,
  lineById: Map<string, SubobjectMaterialMetric>,
) {
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  const requestById = new Map(requests.map((request) => [request.id, request]))

  return entries.map((entry) => {
    const receipt = receiptById.get(entry.receiptId)
    const request = receipt ? requestById.get(receipt.requestId) : undefined
    const line = lineById.get(entry.projectLineId)
    const details =
      'zniNumber' in entry
        ? [
            entry.zniNumber,
            entry.arvkNumber,
            entry.arvkDate,
            formatDate(entry.arvkDate),
            entry.status === 'signed' ? 'Подписан' : 'В работе',
            entry.author,
            entry.comment,
          ]
        : [entry.document, entry.receiver, entry.note]

    return {
      entry,
      searchText: normalizeSearchValue(
        [
          ...details,
          entry.date,
          formatDate(entry.date),
          receipt?.actualName,
          receipt?.invoiceNumber,
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

function filterOperationEntries<T>(
  meta: Array<{ entry: T; searchText: string }>,
  search: string,
) {
  const query = normalizeSearchValue(search)
  return meta
    .filter((item) => !query || item.searchText.includes(query))
    .map((item) => item.entry)
}

function buildReceiptGroupMeta(
  groups: Array<ReceiptRequestGroup>,
  requests: Array<MaterialRequestEntry>,
  lineById: Map<string, SubobjectMaterialMetric>,
): Array<ReceiptGroupMeta> {
  const requestById = new Map(requests.map((request) => [request.id, request]))
  return groups.map((group) => {
    const requestMeta = group.request
      ? buildRequestGroupMeta([group.request], lineById)[0]!
      : null
    return {
      group,
      materialType: requestMeta?.materialType ?? '',
      searchText: normalizeSearchValue(
        [
          requestMeta?.searchText,
          group.request ? formatDate(group.request.date) : 'Заявка удалена',
          ...group.entries.flatMap((entry) => {
            const request = requestById.get(entry.requestId)
            const line = lineById.get(entry.projectLineId)
            return [
              entry.date,
              formatDate(entry.date),
              entry.actualName,
              entry.invoiceNumber,
              isReceiptReplacement(entry, request) ? 'замена' : '',
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
              entry.customerReceiptDocument,
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

function getReceiptGroupKey(entry: MaterialReceiptEntry) {
  return [
    entry.date,
    entry.projectLineId,
    normalizeSearchValue(entry.actualName),
    normalizeSearchValue(entry.invoiceNumber),
  ].join('|')
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
  return Math.max(0, request.quantity - received)
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
      item.receipt?.invoiceNumber,
      item.receipt?.factoryNumber,
      item.receipt?.manufacturer,
      item.receipt?.heatBatch,
      item.receipt?.customerReceiptDocument,
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
      category: fallbackMaterialType || 'Удален из проектной базы',
      changeNumber: null,
      cipher: entry.cipher,
      id: entry.projectLineId,
      issued: 0,
      material: '',
      materialId: entry.materialId,
      materialType: fallbackMaterialType || 'Удален из проектной базы',
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
  const projectQuantity = row.totalProjectQuantity
  const hasProjectQuantity = projectQuantity > 0
  const isOverProject =
    hasProjectQuantity &&
    (row.totals.requests.quantity > projectQuantity ||
      row.totals.receipts.quantity > projectQuantity ||
      row.totals.quality.quantity > projectQuantity)

  if (row.deleted) {
    return {
      card: 'border-slate-300 bg-slate-100/75 shadow-slate-200/70',
      expanded: 'ring-1 ring-slate-300',
      focus: 'ring-2 ring-slate-300',
      header: 'bg-slate-100/80',
    }
  }

  if (isOverProject) {
    return {
      card: 'border-rose-300 bg-rose-50/45 shadow-rose-100/70',
      expanded: 'ring-1 ring-rose-300',
      focus: 'ring-2 ring-rose-300',
      header: 'bg-rose-50/45',
    }
  }

  if (hasProjectQuantity && row.totals.quality.quantity >= projectQuantity) {
    return {
      card: 'border-emerald-200 bg-emerald-50/45 shadow-emerald-100/60',
      expanded: 'ring-1 ring-emerald-200',
      focus: 'ring-2 ring-emerald-200',
      header: 'bg-emerald-50/45',
    }
  }

  if (hasProjectQuantity && row.totals.receipts.quantity >= projectQuantity) {
    return {
      card: 'border-amber-200 bg-amber-50/45 shadow-amber-100/60',
      expanded: 'ring-1 ring-amber-200',
      focus: 'ring-2 ring-amber-200',
      header: 'bg-amber-50/45',
    }
  }

  if (row.totals.requests.quantity > 0) {
    return {
      card: 'border-blue-200 bg-blue-50/45 shadow-blue-100/60',
      expanded: 'ring-1 ring-blue-200',
      focus: 'ring-2 ring-blue-200',
      header: 'bg-blue-50/45',
    }
  }

  return {
    card: 'border-stone-200 bg-white shadow-stone-200/60',
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
  const projectQuantity = summary?.projectQuantity ?? 0
  const hasProjectQuantity = projectQuantity > 0
  const requestedQuantity = summary?.requestedQuantity ?? 0
  const receivedQuantity = summary?.receivedQuantity ?? 0
  const qcSignedQuantity = summary?.qcSignedQuantity ?? 0
  const isOverProject =
    hasProjectQuantity &&
    (requestedQuantity > projectQuantity ||
      receivedQuantity > projectQuantity ||
      qcSignedQuantity > projectQuantity)

  if (deleted) {
    return {
      accent: 'bg-slate-300',
      card: 'border-slate-300 bg-slate-100/75 shadow-slate-200/70',
      divider: 'border-slate-200',
      header: 'bg-slate-100/80',
      leftBorder: 'border-l-slate-300',
      metric: 'border-slate-200 bg-slate-50/80',
      ring: 'ring-slate-200',
    }
  }

  if (isOverProject) {
    return {
      accent: 'bg-rose-300',
      card: 'border-rose-300 bg-rose-50/45 shadow-rose-100/70',
      divider: 'border-rose-200',
      header: 'bg-rose-50/45',
      leftBorder: 'border-l-rose-300',
      metric: 'border-rose-200 bg-rose-50/65',
      ring: 'ring-rose-200',
    }
  }

  if (
    hasProjectQuantity &&
    receivedQuantity >= projectQuantity &&
    qcSignedQuantity > 0
  ) {
    return {
      accent: 'bg-emerald-300',
      card: 'border-emerald-200 bg-emerald-50/45 shadow-emerald-100/60',
      divider: 'border-emerald-200',
      header: 'bg-emerald-50/45',
      leftBorder: 'border-l-emerald-300',
      metric: 'border-emerald-200 bg-emerald-50/65',
      ring: 'ring-emerald-200',
    }
  }

  if (hasProjectQuantity && requestedQuantity >= projectQuantity) {
    return {
      accent: 'bg-amber-300',
      card: 'border-amber-200 bg-amber-50/45 shadow-amber-100/60',
      divider: 'border-amber-200',
      header: 'bg-amber-50/45',
      leftBorder: 'border-l-amber-300',
      metric: 'border-amber-200 bg-amber-50/65',
      ring: 'ring-amber-200',
    }
  }

  if (requestedQuantity > 0) {
    return {
      accent: 'bg-blue-300',
      card: 'border-blue-200 bg-blue-50/45 shadow-blue-100/60',
      divider: 'border-blue-200',
      header: 'bg-blue-50/45',
      leftBorder: 'border-l-blue-300',
      metric: 'border-blue-200 bg-blue-50/65',
      ring: 'ring-blue-200',
    }
  }

  return {
    accent: 'bg-stone-300',
    card: 'border-stone-200 bg-white shadow-stone-200/60',
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
    actualName: '',
    certificate: '',
    customerArvk: '',
    customerReceiptDocument: '',
    date: localDateInputValue(),
    factoryNumber: '',
    heatBatch: '',
    invoiceNumber: '',
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
    qualityDocumentCount?: number
    overviewCount?: number
    materialIssues: Array<MaterialIssueEntry>
    materialReceipts: Array<MaterialReceiptEntry>
    materialRequests: Array<MaterialRequestEntry>
    qualityControls: Array<QualityControlEntry>
  },
) {
  if (tab === 'overview') {
    return context.overviewCount ?? 0
  }

  if (tab === 'requests') {
    return groupRequestEntries(context.materialRequests).length
  }

  if (tab === 'receipts') {
    return groupReceiptRequests(
      context.materialReceipts,
      context.materialRequests,
    ).length
  }

  if (tab === 'quality') {
    return context.qualityDocumentCount ?? context.qualityControls.length
  }

  return context.materialIssues.length
}

function operationAnchorId(tab: OperationActionTab, targetId: string) {
  return `operation-${tab}-${targetId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function overviewAnchorId(targetId: string) {
  return `operation-overview-${encodeURIComponent(targetId)}`
}

function getSignedQuantityByReceipt(controls: Array<QualityControlEntry>) {
  return sumByKey(
    controls.filter((control) => control.status === 'signed'),
    'receiptId',
    'quantity',
  )
}

function getQualityReductionError(
  entry: QualityControlEntry,
  signedQuantity: number,
  issuedQuantity: number,
  action = 'вернуть в работу',
) {
  // Issues refer to the receipt, so the remaining signed acts must cover them.
  const remainingSigned = Number(
    (signedQuantity - entry.quantity).toPrecision(15),
  )
  if (
    entry.status === 'signed' &&
    remainingSigned < Number(issuedQuantity.toPrecision(15))
  ) {
    return `Нельзя ${action}: оставшегося подписанного количества не хватит для уже выданного материала.`
  }
  return ''
}

function getOperationDeletionError(
  target: OperationDeletion,
  receipts: Array<MaterialReceiptEntry>,
  controls: Array<QualityControlEntry>,
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
    if (workflow?.apps.some((app) => app.receiptIds.some((id) => ids.has(id))))
      return 'Получение связано с АПП. Сначала удалите или измените АПП; подписанные документы сохраняются в истории.'
    const controlCount = controls.filter((entry) =>
      ids.has(entry.receiptId),
    ).length
    const issueCount = issues.filter((entry) => ids.has(entry.receiptId)).length
    if (controlCount || issueCount)
      return `Нельзя удалить получение: есть связанные записи входного контроля (${controlCount}) или выдачи (${issueCount}). Сначала удалите выдачи, затем связанный входной контроль.`
    return ''
  }
  if (target.kind === 'quality') {
    const entry = controls.find((control) => control.id === target.id)
    if (!entry) return missing
    return getQualityReductionError(
      entry,
      getSignedQuantityByReceipt(controls).get(entry.receiptId) ?? 0,
      sumByKey(issues, 'receiptId', 'quantity').get(entry.receiptId) ?? 0,
      'удалить входной контроль',
    )
  }
  return issues.some((entry) => entry.id === target.id) ? '' : missing
}

function sumByKey<T extends Record<string, unknown>>(
  entries: Array<T>,
  key: keyof T,
  valueKey: keyof T,
) {
  const sums = new Map<string, number>()

  for (const entry of entries) {
    const id = String(entry[key] ?? '')
    const value = Number(entry[valueKey] ?? 0)
    sums.set(id, (sums.get(id) ?? 0) + (Number.isFinite(value) ? value : 0))
  }

  return sums
}

function createClientId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function makeOperationNumber(prefix: string, existingCount: number) {
  const year = new Date().getFullYear()
  return `${prefix}-${year}-${String(existingCount + 1).padStart(4, '0')}`
}

function makeMaterialRequestNumber(
  existingRequests: Array<MaterialRequestEntry>,
  dateValue: string,
  materialType: string,
) {
  const date = parseDocumentDate(dateValue)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  const monthKey = `${date.getFullYear()}-${month}`
  const sequence = getMaterialRequestMonthSequence(existingRequests, monthKey)
  const typeSuffix = normalizeRequestNumberType(materialType)

  return `ЗП-${month}-${year}-${String(sequence).padStart(4, '0')}-${typeSuffix}`
}

function getMaterialRequestMonthSequence(
  existingRequests: Array<MaterialRequestEntry>,
  monthKey: string,
) {
  const requestNumbers = new Set<string>()

  for (const request of existingRequests) {
    if (getDocumentMonthKey(request.date) === monthKey) {
      requestNumbers.add(request.number)
    }
  }

  return requestNumbers.size + 1
}

function normalizeRequestNumberType(materialType: string) {
  return materialType.trim().replace(/\s+/g, ' ') || 'Материалы'
}

function getDocumentMonthKey(dateValue: string) {
  const date = parseDocumentDate(dateValue)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function parseDocumentDate(dateValue: string) {
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date()

  return Number.isNaN(date.getTime()) ? new Date() : date
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(value: string) {
  if (!value) {
    return '-'
  }

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ru-RU').format(date)
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
      <div className="grid gap-4">
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
                    <div className="mt-1 text-[13px] leading-5 text-slate-500">
                      Ищите по нескольким признакам: труба 108, B16742, ГОСТ
                      9940-81.
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
                      <div className="mt-1 text-sm leading-6 text-slate-500">
                        Наименование по проекту вводится свободно, а значения
                        справочников выбираются из подсказок.
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
                      <div className="grid gap-3 rounded-md border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div>
                          <div className="text-xs font-medium uppercase text-blue-700">
                            Настройки
                          </div>
                          <div className="mt-1 text-sm leading-6 text-blue-900">
                            Если в подсказках нет нужного шифра, единицы,
                            нормативного документа или состава, добавьте
                            значение в справочник.
                          </div>
                        </div>
                        <Button variant="outline" onClick={onOpenSettings}>
                          <Settings size={16} />
                          Настройки
                        </Button>
                      </div>
                    </div>

                    <FormSection title="Основные данные">
                      <Field label="Тип материала">
                        <NativeSelect
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

                    <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-800">
                      Количество по шифрам заполняется в таблице после
                      сохранения паспорта.
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    {saveHint ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                        {saveHint}
                      </div>
                    ) : (
                      <div className="text-sm leading-6 text-slate-500">
                        Готово к сохранению. После сохранения заполните
                        количество по шифрам в таблице.
                      </div>
                    )}
                  </div>
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
  open,
  onAddMissingReferences,
  onApply,
  onClose,
  onDownloadTemplate,
  onImportFile,
}: {
  draft: MaterialImportDraft | null
  open: boolean
  onAddMissingReferences: () => void
  onApply: () => void
  onClose: () => void
  onDownloadTemplate: () => void
  onImportFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const canApply = draft !== null && draft.summary.errorRows === 0

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
              Загрузите шаблон Excel. Каждая позиция станет паспортом материала,
              а столбцы шифров заполнят количества в таблице.
            </div>
          </div>

          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-3 text-sm leading-6 text-blue-900">
            Новые наименования по проекту можно импортировать. Шифры, единицы,
            нормативные документы и составы должны быть заранее добавлены в
            настройках.
          </div>

          <Button
            className="justify-center"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            <FileInput size={16} />
            Выбрать Excel-файл
          </Button>
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                onImportFile(file)
                event.currentTarget.value = ''
              }
            }}
          />

          {draft ? (
            <div className="grid grid-cols-2 gap-2">
              <ImportStat label="Позиций" value={draft.summary.totalRows} />
              <ImportStat label="Готово" value={draft.summary.validRows} />
              <ImportStat label="Новые" value={draft.summary.newRows} />
              <ImportStat
                label="Ошибки"
                value={draft.summary.errorRows}
                tone="bad"
              />
            </div>
          ) : null}

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
              Применить
            </Button>
          </div>

          {!canApply && draft ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
              Применение станет доступно, когда в черновике не останется ошибок.
            </div>
          ) : null}
        </aside>

        <section className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-medium text-slate-900">
              Проверка перед импортом
            </div>
            <div className="mt-1 text-sm leading-6 text-slate-500">
              Сначала сверяем справочники и ищем уже существующие комбинации.
            </div>
          </div>

          {draft ? (
            <div className="min-h-0 overflow-auto">
              {draft.rows.map((entry) => (
                <ImportDraftRowCard
                  key={`${entry.row.rowNumber}-${entry.identityKey}-${entry.row.cipher}`}
                  entry={entry}
                />
              ))}
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
                <div className="mt-1 text-sm leading-6 text-slate-500">
                  Выберите файл, чтобы увидеть позиции, ошибки и совпадения с
                  существующей базой.
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

function ImportDraftRowCard({ entry }: { entry: MaterialImportDraftRow }) {
  const hasErrors = entry.errors.length > 0
  const toneClass = hasErrors
    ? 'border-red-100 bg-red-50/70'
    : entry.isExistingCombination
      ? 'border-blue-100 bg-blue-50/50'
      : 'border-emerald-100 bg-emerald-50/50'

  return (
    <div className={`border-b px-4 py-3 last:border-0 ${toneClass}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="material-name-clamp text-sm font-medium text-slate-900">
            {entry.row.projectMaterialName || `Позиция ${entry.row.rowNumber}`}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
            <span>Шифр: {entry.row.cipher || 'не указан'}</span>
            <span>Количество: {formatQuantity(entry.row.quantity)}</span>
            <span>Единица измерения: {entry.row.unit || 'не указана'}</span>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
            hasErrors
              ? 'border-red-200 bg-white text-red-700'
              : entry.isExistingCombination
                ? 'border-blue-200 bg-white text-blue-700'
                : 'border-emerald-200 bg-white text-emerald-700'
          }`}
        >
          {hasErrors
            ? 'Нужно исправить'
            : entry.isExistingCombination
              ? 'Найдена в базе'
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
            Позиция будет удалена из проектной базы вместе с количествами по
            шифрам. Это действие нельзя отменить.
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

function SettingsModal({
  qualityWorkflow,
  onChangeQualityWorkflow,
  draft,
  error,
  materialTypeSettings,
  open,
  onChangeDraft,
  onChangeMaterialTypeSettings,
  onClose,
  onSave,
}: {
  qualityWorkflow?: QualityWorkflow
  onChangeQualityWorkflow: (next: QualityWorkflow) => void
  draft: ReferenceSettingsDraft
  error: string
  materialTypeSettings: Array<MaterialTypeSetting>
  open: boolean
  onChangeDraft: (key: keyof ReferenceSettingsDraft, value: string) => void
  onChangeMaterialTypeSettings: (
    materialTypeSettings: Array<MaterialTypeSetting>,
  ) => void
  onClose: () => void
  onSave: () => void
}) {
  const [activeTab, setActiveTab] = useState<
    ReferenceSettingsKey | 'print' | 'quality'
  >('ciphers')
  const sections: Array<{
    key: ReferenceSettingsKey
    label: string
    shortLabel: string
    description: string
    emptyText: string
    placeholder: string
    readOnly?: boolean
  }> = [
    {
      key: 'materialTypes',
      label: 'Тип материала',
      shortLabel: 'Тип материала',
      description:
        'Системный справочник типов материала. Тип помогает группировать позиции и корректно суммировать их внутри единых групп.',
      emptyText: 'Список типов материала задан в приложении.',
      placeholder: '',
    },
    {
      key: 'ciphers',
      label: 'Шифры',
      shortLabel: 'Шифры',
      description:
        'Шифры могут быть несколькими для одного элемента: количество задается по каждому шифру.',
      emptyText: 'Добавьте первый шифр, чтобы он появился в таблице количеств.',
      placeholder: 'Например: 300-ТХ-1',
    },
    {
      key: 'units',
      label: 'Единицы измерения',
      shortLabel: 'Единица измерения',
      description:
        'У одного элемента выбирается только одна единица измерения.',
      emptyText: 'Добавьте единицу измерения для формы материала.',
      placeholder: 'Например: м',
    },
    {
      key: 'documents',
      label: 'Нормативные документы',
      shortLabel: 'Норм. документы',
      description:
        'У одного элемента выбирается только один нормативный или проектный документ.',
      emptyText:
        'Добавьте нормативный документ, если хотите выбирать его из списка.',
      placeholder: 'Например: ГОСТ 9940-81',
    },
    {
      key: 'alloys',
      label: 'Состав',
      shortLabel: 'Состав',
      description:
        'Состав элемента: марка стали или другое обозначение, например 09Г2С.',
      emptyText: 'Добавьте состав, если хотите выбирать его из списка.',
      placeholder: 'Например: 09Г2С',
    },
  ]
  const activeSection =
    sections.find((section) => section.key === activeTab) ?? sections[0]
  if (!activeSection) return null

  return (
    <Modal open={open} title="Настройки базы" size="lg" onClose={onClose}>
      <div className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="grid gap-2 rounded-md border border-stone-200 bg-stone-50/70 p-2 sm:grid-cols-5 md:block">
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
              ЗНИ и АВК · Реквизиты и шаблоны
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
                    <span className="hidden text-xs text-stone-400 md:block">
                      {section.label}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {activeTab === 'quality' ? (
            <QualitySettings
              value={qualityWorkflow}
              onChange={onChangeQualityWorkflow}
            />
          ) : activeTab === 'print' ? (
            <RequestPrintSettings />
          ) : activeSection.key === 'materialTypes' ? (
            <MaterialTypeSettingsSection
              description={activeSection.description}
              materialTypes={materialTypeSettings}
              onChange={onChangeMaterialTypeSettings}
            />
          ) : (
            <ReferenceSettingsSection
              description={activeSection.description}
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
        <div className="flex justify-between gap-2 border-t border-stone-200 pt-4">
          <Button variant="outline" onClick={onClose}>
            {activeTab === 'print' ? 'Закрыть' : 'Отмена'}
          </Button>
          {activeTab !== 'print' && activeTab !== 'quality' ? (
            <Button onClick={onSave}>Сохранить</Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

function MaterialTypeSettingsSection({
  description,
  materialTypes,
  onChange,
}: {
  description: string
  materialTypes: Array<MaterialTypeSetting>
  onChange: (materialTypes: Array<MaterialTypeSetting>) => void
}) {
  const [selectedTypeId, setSelectedTypeId] = useState(
    materialTypes[0]?.id ?? '',
  )
  const selectedType =
    materialTypes.find((item) => item.id === selectedTypeId) ?? materialTypes[0]
  const selectedDefaultType = selectedType
    ? defaultMaterialTypeSettings.find((item) => item.id === selectedType.id)
    : undefined
  const selectedTypeChanged =
    selectedType &&
    selectedDefaultType &&
    (selectedDefaultType.name !== selectedType.name ||
      selectedDefaultType.description !== selectedType.description)

  useEffect(() => {
    if (!materialTypes.some((item) => item.id === selectedTypeId)) {
      setSelectedTypeId(materialTypes[0]?.id ?? '')
    }
  }, [materialTypes, selectedTypeId])

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

  function resetMaterialType(id: string) {
    const defaultItem = defaultMaterialTypeSettings.find(
      (item) => item.id === id,
    )

    if (!defaultItem) {
      return
    }

    onChange(materialTypes.map((item) => (item.id === id ? defaultItem : item)))
  }

  return (
    <div className="grid min-h-[520px] grid-rows-[auto_1fr] gap-4 rounded-md border border-stone-200 bg-white p-4">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-medium text-stone-900">
              Тип материала
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-stone-400">
              {materialTypes.length} системных типов
            </div>
          </div>
          {selectedTypeChanged ? (
            <Button
              className="shrink-0"
              variant="outline"
              onClick={() => resetMaterialType(selectedType.id)}
            >
              Вернуть стандарт
            </Button>
          ) : null}
        </div>
        <div className="mt-3 max-w-3xl text-sm leading-6 text-stone-500">
          {description} Список зашит в систему: очистка базы не удаляет эти
          типы, но название и описание можно уточнять под ваш проект.
        </div>
      </div>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[310px_1fr]">
        <div className="min-h-0 overflow-hidden rounded-md border border-stone-200 bg-stone-50/70">
          <div className="border-b border-stone-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-stone-500">
            Список типов
          </div>
          <div className="grid max-h-[520px] overflow-auto p-2">
            {materialTypes.map((item) => {
              const defaultItem = defaultMaterialTypeSettings.find(
                (defaultType) => defaultType.id === item.id,
              )
              const isChanged =
                defaultItem &&
                (defaultItem.name !== item.name ||
                  defaultItem.description !== item.description)
              const active = selectedType?.id === item.id

              return (
                <button
                  key={item.id}
                  className={`grid gap-1 rounded-md px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'bg-white text-stone-950 shadow-sm ring-1 ring-stone-200'
                      : 'text-stone-600 hover:bg-white/70 hover:text-stone-950'
                  }`}
                  type="button"
                  onClick={() => setSelectedTypeId(item.id)}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {item.name || defaultItem?.name}
                    </span>
                    {isChanged ? (
                      <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-100">
                        изменен
                      </span>
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-xs leading-5 text-stone-500">
                    {item.description || defaultItem?.description}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="min-h-0 rounded-md border border-stone-200 bg-stone-50/40 p-4">
          {selectedType ? (
            <div className="grid h-full grid-rows-[auto_1fr] gap-4">
              <div className="rounded-md border border-stone-200 bg-white px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-stone-400">
                  Системный тип
                </div>
                <div className="mt-1 text-sm leading-6 text-stone-600">
                  {selectedDefaultType?.name ?? selectedType.name}
                </div>
              </div>

              <div className="grid content-start gap-4">
                <Field label="Название типа">
                  <Input
                    className="h-11"
                    value={selectedType.name}
                    onBlur={() => {
                      if (
                        selectedType.name.trim().length === 0 &&
                        selectedDefaultType
                      ) {
                        updateMaterialType(
                          selectedType.id,
                          'name',
                          selectedDefaultType.name,
                        )
                      }
                    }}
                    onChange={(event) =>
                      updateMaterialType(
                        selectedType.id,
                        'name',
                        event.target.value,
                      )
                    }
                  />
                </Field>
                <Field label="Описание">
                  <textarea
                    className="min-h-32 resize-y rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm leading-6 text-stone-900 shadow-sm outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100"
                    value={selectedType.description}
                    onChange={(event) =>
                      updateMaterialType(
                        selectedType.id,
                        'description',
                        event.target.value,
                      )
                    }
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center text-sm text-stone-500">
              Типы материала не найдены.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReferenceSettingsSection({
  description,
  emptyText,
  label,
  placeholder,
  readOnly = false,
  value,
  onChange,
}: {
  description: string
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
    <div className="grid min-h-[520px] grid-rows-[auto_auto_auto_1fr] gap-4 rounded-md border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div>
          <div className="text-base font-medium text-stone-900">{label}</div>
          <div className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
            {description}
          </div>
        </div>
      </div>

      {readOnly ? (
        <div className="rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2 text-sm leading-6 text-blue-900">
          Этот список фиксированный. Если нужно изменить классификацию, поменяем
          его осознанно в коде, чтобы старые записи не разъехались по
          категориям.
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

      {values.length > 0 ? (
        <div className="flex min-h-0 flex-wrap content-start gap-2 overflow-auto rounded-md border border-stone-200 bg-stone-50/60 p-3">
          {values.map((item) => (
            <span
              key={item}
              className="inline-flex max-w-full items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-normal leading-5 text-stone-800 shadow-sm"
            >
              <span className="break-words">{item}</span>
              {readOnly ? null : (
                <button
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                  type="button"
                  aria-label={`Удалить ${item}`}
                  onClick={() => setPendingDeleteValue(item)}
                >
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : (
        <div className="grid min-h-0 place-items-center rounded-md border border-dashed border-stone-300 bg-stone-50/60 px-4 py-6 text-center text-sm text-stone-500">
          {emptyText}
        </div>
      )}
    </div>
  )
}

function Modal({
  children,
  open,
  size = 'md',
  title,
  onClose,
}: {
  children: React.ReactNode
  open: boolean
  size?: 'md' | 'lg' | 'xl'
  title: string
  onClose: () => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/30 px-4 py-6">
      <div
        className={`flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl ${
          size === 'xl'
            ? 'h-[min(900px,calc(100vh-2rem))] max-w-[1500px]'
            : size === 'lg'
              ? 'h-[min(820px,calc(100vh-3rem))] max-w-6xl'
              : 'max-w-xl'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
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
        <div className="min-h-0 flex-1 overflow-auto px-5 py-5">{children}</div>
      </div>
    </div>
  )
}

function NavButton({
  active,
  collapsed = false,
  icon,
  label,
  onClick,
}: {
  active: boolean
  collapsed?: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`flex h-11 items-center rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-stone-300 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-100 ${
        active
          ? 'bg-stone-700 text-white'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
      } ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}`}
      type="button"
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon}
      <span className={collapsed ? 'sr-only' : ''}>{label}</span>
    </button>
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
  const [open, setOpen] = useState(false)
  const values = unique(options)
  const query = value.trim().toLocaleLowerCase('ru')
  const matches =
    query.length > 0
      ? values
          .filter((option) => option.toLocaleLowerCase('ru').includes(query))
          .slice(0, 12)
      : []

  return (
    <div className="relative">
      <Input
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={className}
        placeholder={placeholder}
        value={value}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120)
        }}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && query.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-56 overflow-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg">
          {matches.length > 0 ? (
            matches.map((option) => (
              <button
                key={option}
                className="block w-full rounded px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100"
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(option)
                  setOpen(false)
                }}
              >
                {option}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-stone-400">
              Совпадений не найдено
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function FilterAutocompleteInput({
  options,
  placeholder,
  value,
  onChange,
}: {
  options: Array<string>
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const values = unique(options.filter(Boolean))
  const query = normalizeSearchValue(value)
  const matches = (
    query
      ? values.filter((option) => normalizeSearchValue(option).includes(query))
      : values
  ).slice(0, 12)

  return (
    <div className="relative min-w-0">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        size={16}
      />
      <Input
        className="h-11 bg-white pl-9 pr-8 text-sm"
        placeholder={placeholder}
        value={value}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120)
        }}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {value ? (
        <button
          className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          type="button"
          aria-label={`Очистить фильтр ${placeholder.toLocaleLowerCase('ru')}`}
          onMouseDown={(event) => {
            event.preventDefault()
            onChange('')
            setOpen(false)
          }}
        >
          <X size={14} />
        </button>
      ) : null}
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg shadow-slate-200/80">
          {matches.length > 0 ? (
            matches.map((option) => (
              <button
                key={option}
                className="block w-full rounded px-3 py-2 text-left text-sm leading-5 text-slate-700 hover:bg-blue-50 hover:text-slate-950"
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(option)
                  setOpen(false)
                }}
              >
                {option}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-400">
              Значений не найдено
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function NativeSelect({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string }>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <select
      className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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

function getHorizontalScrollLeft(target: EventTarget | null) {
  if (target instanceof Element) {
    return target.scrollLeft
  }

  if (target instanceof Document) {
    return target.scrollingElement?.scrollLeft ?? 0
  }

  return 0
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
    qualityControls: Array.isArray(parsed.qualityControls)
      ? parsed.qualityControls
      : undefined,
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

    if (errors.length === 0) {
      warnings.push(
        isExistingCombination
          ? 'Такая комбинация уже есть: будет обновлено количество по указанному шифру.'
          : 'Будет создана новая комбинация материала и заполнено количество по шифру.',
      )
    }

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
    errors: entry.errors.filter((error) => !error.includes('настройках')),
    warnings:
      entry.errors.length > 0 &&
      entry.errors.every((error) => error.includes('настройках'))
        ? [
            ...entry.warnings,
            entry.isExistingCombination
              ? 'Такая комбинация уже есть: будет обновлено количество по указанному шифру.'
              : 'Будет создана новая комбинация материала и заполнено количество по шифру.',
          ]
        : entry.warnings,
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
    unknownReferenceRows: rows.filter((entry) =>
      entry.errors.some((error) => error.includes('настройках')),
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

function applyMaterialImportRows(
  current: Array<SubobjectMaterialMetric>,
  importRows: Array<NormalizedImportRow>,
) {
  const next = [...current]

  for (const row of importRows) {
    const importedLine = buildIdentityLineFromImport(row)
    const importedKey = getMaterialIdentityKey(importedLine)
    const existingIndex = next.findIndex(
      (line) =>
        getMaterialIdentityKey(line) === importedKey &&
        line.cipher === row.cipher,
    )

    const existingLine = next[existingIndex]
    if (existingLine) {
      next[existingIndex] = withStableId({
        ...existingLine,
        category: importedLine.category,
        materialId: importedLine.materialId,
        projectMaterialName: importedLine.projectMaterialName,
        changeNumber: importedLine.changeNumber,
        materialType: importedLine.materialType,
        normativeDocument: importedLine.normativeDocument,
        material: importedLine.material,
        unit: importedLine.unit,
        unitWeight: importedLine.unitWeight,
        alternativeUnit: importedLine.alternativeUnit,
        alternativeUnitFactor: importedLine.alternativeUnitFactor,
        plannedQuantity: row.quantity,
      })
    } else {
      next.unshift(
        withStableId({
          ...importedLine,
          id: createLocalId(),
        }),
      )
    }
  }

  return next
}

function buildIdentityLineFromImport(
  row: NormalizedImportRow,
): SubobjectMaterialMetric {
  return {
    id: 'identity-preview',
    project: row.project || 'Проектная база',
    cipher: row.cipher,
    category: row.materialType || row.category || 'Материалы',
    materialId: row.materialId,
    projectMaterialName: row.projectMaterialName,
    changeNumber: row.changeNumber,
    materialType: row.materialType,
    normativeDocument: row.normativeDocument,
    material: row.material,
    plannedQuantity: row.quantity,
    unit: row.unit,
    unitWeight: row.unitWeight,
    alternativeUnit: row.alternativeUnit,
    alternativeUnitFactor: row.alternativeUnitFactor,
    requested: 0,
    received: 0,
    qcPending: 0,
    accepted: 0,
    issued: 0,
    returned: 0,
    writtenOff: 0,
  }
}

function withStableId(line: SubobjectMaterialMetric): SubobjectMaterialMetric {
  return {
    ...line,
    id:
      line.id ??
      [
        line.project,
        line.cipher,
        line.materialType ?? line.category,
        line.materialId ?? '',
        line.projectMaterialName ?? '',
        line.normativeDocument ?? '',
        line.material,
        line.unit,
        line.unitWeight ?? '',
        line.alternativeUnit ?? '',
      ]
        .join('-')
        .toLocaleLowerCase('ru')
        .replace(/\s+/g, '-'),
  }
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

function normalizeSearchValue(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/×/g, 'x')
    .replace(/х/g, 'x')
    .replace(/ё/g, 'е')
    .replace(/[.,;:()[\]{}"']/g, ' ')
    .replace(/[-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
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

function getMaterialIdentityKey(line: SubobjectMaterialMetric) {
  return [
    line.projectMaterialName ?? '',
    line.materialType ?? line.category,
    line.materialId ?? '',
    line.normativeDocument ?? '',
    line.unit,
    line.material,
    line.unitWeight ?? '',
    line.alternativeUnit ?? '',
    line.alternativeUnitFactor ?? '',
  ]
    .join('|')
    .toLocaleLowerCase('ru')
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
