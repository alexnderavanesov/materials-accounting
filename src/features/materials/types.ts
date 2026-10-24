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
  alternativeUnitFactor?: string | number
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
  alternativeUnitFactor: number | null
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
  alternativeUnitFactor?: number | null
  plannedQuantity: number
  requested: number
  received: number
  qcPending: number
  accepted: number
  issued: number
  returned: number
  writtenOff: number
}
