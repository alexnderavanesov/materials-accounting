export type DocumentType =
  | 'material_request'
  | 'receipt'
  | 'quality_control'
  | 'issue'
  | 'return'
  | 'write_off'
  | 'inventory_adjustment'

export type QcStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'accepted_with_notes'

export type LedgerDirection = 'in' | 'out'

export type ImportRowInput = {
  project?: string
  cipher?: string
  title?: string
  category?: string
  material?: string
  materialId?: string
  projectMaterialName?: string
  changeNumber?: string
  materialType?: string
  normativeDocument?: string
  unit?: string
  unitWeight?: string | number
  alternativeUnit?: string
  quantity?: string | number
  notes?: string
}

export type NormalizedImportRow = {
  rowNumber: number
  project: string
  cipher: string
  title: string | null
  category: string
  material: string
  materialId: string | null
  projectMaterialName: string | null
  changeNumber: string | null
  materialType: string | null
  normativeDocument: string | null
  unit: string
  unitWeight: number | null
  alternativeUnit: string | null
  quantity: number
  notes: string | null
  fingerprint: string
  errors: Array<string>
  warnings: Array<string>
}

export type ImportDraftValidation = {
  rows: Array<NormalizedImportRow>
  summary: {
    totalRows: number
    validRows: number
    errorRows: number
    duplicateRows: number
    newMaterialCandidates: Array<string>
  }
}

export type LedgerMovement = {
  lotId: string
  projectMaterialLineId: string
  direction: LedgerDirection
  quantity: number
  reason: DocumentType
}

export type LotBalance = {
  lotId: string
  projectMaterialLineId: string
  quantity: number
}

export type SubobjectMaterialMetric = {
  id?: string
  project: string
  category: string
  cipher: string
  material: string
  materialId?: string | null
  projectMaterialName?: string | null
  changeNumber?: string | null
  materialType?: string | null
  normativeDocument?: string | null
  unit: string
  unitWeight?: number | null
  alternativeUnit?: string | null
  plannedQuantity: number
  requested: number
  received: number
  qcPending: number
  accepted: number
  issued: number
  returned: number
  writtenOff: number
}

export type SubobjectMaterialSummaryRow = SubobjectMaterialMetric & {
  balance: number
  deviation: number
}

export type CategorySummary = {
  category: string
  rows: Array<SubobjectMaterialSummaryRow>
  totals: {
    plannedQuantity: number
    requested: number
    received: number
    qcPending: number
    accepted: number
    issued: number
    returned: number
    writtenOff: number
    balance: number
    deviation: number
  }
}
