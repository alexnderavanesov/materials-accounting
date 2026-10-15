import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { projectWorkspaceStore } from './workspace-snapshot.server'
import { saveWorkspaceInputSchema } from './workspace-snapshot'
import { z } from 'zod'

import {
  assertAvailableBalance,
  generateDocumentNumber,
  getIssueWarnings,
  validateImportDraft,
} from './domain'
import {
  demoCategorySummary,
  demoDocuments,
  demoMaterialMetrics,
  demoObjects,
} from './demo-data'
import type { DocumentType } from './types'

const documentTypeSchema = z.enum([
  'material_request',
  'receipt',
  'quality_control',
  'issue',
  'return',
  'write_off',
  'inventory_adjustment',
])

const importRowSchema = z.object({
  project: z.string().optional(),
  cipher: z.string().optional(),
  title: z.string().optional(),
  category: z.string().optional(),
  materialId: z.string().optional(),
  projectMaterialName: z.string().optional(),
  changeNumber: z.string().optional(),
  materialType: z.string().optional(),
  normativeDocument: z.string().optional(),
  material: z.string().optional(),
  unit: z.string().optional(),
  unitWeight: z.union([z.string(), z.number()]).optional(),
  alternativeUnit: z.string().optional(),
  alternativeUnitFactor: z.union([z.string(), z.number()]).optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional(),
})

const documentLineSchema = z.object({
  projectMaterialLineId: z.string(),
  materialId: z.string().optional(),
  lotId: z.string().optional(),
  quantity: z.number().positive(),
  qcStatus: z
    .enum(['pending', 'accepted', 'rejected', 'accepted_with_notes'])
    .optional(),
})

const createDocumentSchema = z.object({
  type: documentTypeSchema,
  documentDate: z.string().optional(),
  operatorName: z.string().optional(),
  comment: z.string().optional(),
  lines: z.array(documentLineSchema).min(1).default([]),
})

export const getSubobjectMaterialPlan = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        subobjectId: z.string().default('subobject-1'),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const subobjectId = data?.subobjectId ?? 'subobject-1'
    const object = demoObjects[0]
    if (!object) throw new Error('Проект не настроен')
    const subobject =
      object.subobjects.find((item) => item.id === subobjectId) ??
      object.subobjects[0]

    return {
      object,
      subobject,
      categories: demoCategorySummary,
      documents: demoDocuments,
    }
  })

export const getStockBalances = createServerFn({ method: 'GET' }).handler(
  async () => [],
)

export const getLotMovements = createServerFn({ method: 'GET' })
  .validator(z.object({ lotId: z.string() }))
  .handler(async ({ data }) => ({
    lotId: data.lotId,
    movements: [],
  }))

export const createImportDraft = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      subobjectId: z.string(),
      fileName: z.string(),
      rows: z.array(importRowSchema),
    }),
  )
  .handler(async ({ data }) => {
    const validation = validateImportDraft(data.rows)

    return {
      id: crypto.randomUUID(),
      subobjectId: data.subobjectId,
      fileName: data.fileName,
      status: 'draft',
      ...validation,
    }
  })

export const validateImportDraftServer = createServerFn({ method: 'POST' })
  .validator(z.object({ rows: z.array(importRowSchema) }))
  .handler(async ({ data }) => validateImportDraft(data.rows))

export const applyImportDraft = createServerFn({ method: 'POST' })
  .validator(z.object({ importDraftId: z.string() }))
  .handler(async ({ data }) => ({
    importDraftId: data.importDraftId,
    status: 'applied',
    appliedAt: new Date().toISOString(),
  }))

export const createMaterialRequest = createDocumentFunction('material_request')
export const createReceiptFromRequest = createDocumentFunction('receipt')
export const createQualityControl = createDocumentFunction('quality_control')
export const createIssue = createDocumentFunction('issue')
export const createReturn = createDocumentFunction('return')
export const createWriteOff = createDocumentFunction('write_off')
export const createInventoryAdjustment = createDocumentFunction(
  'inventory_adjustment',
)

export const postMaterialRequest = postDocumentFunction('material_request')
export const postReceipt = postDocumentFunction('receipt')
export const postQualityControl = postDocumentFunction('quality_control')
export const postIssue = postDocumentFunction('issue')

export const downloadDocumentPdf = createServerFn({ method: 'GET' })
  .validator(z.object({ documentId: z.string() }))
  .handler(async ({ data }) => ({
    url: `/api/documents/${data.documentId}/pdf`,
  }))

export const loadProjectWorkspaceSnapshot = createServerFn({
  method: 'GET',
}).handler(() => {
  setResponseHeader('Cache-Control', 'no-store')
  return projectWorkspaceStore.load()
})

export const saveProjectWorkspaceSnapshot = createServerFn({ method: 'POST' })
  .validator(saveWorkspaceInputSchema)
  .handler(({ data }) =>
    projectWorkspaceStore.save(data.workspace, data.expectedRevision),
  )

function createDocumentFunction(type: DocumentType) {
  return createServerFn({ method: 'POST' })
    .validator(createDocumentSchema.omit({ type: true }))
    .handler(async ({ data }) => ({
      id: crypto.randomUUID(),
      type,
      status: 'draft',
      number: generateDocumentNumber(
        type,
        new Date(data.documentDate ?? Date.now()),
        1,
      ),
      ...data,
    }))
}

function postDocumentFunction(type: DocumentType) {
  return createServerFn({ method: 'POST' })
    .validator(
      z.object({
        documentId: z.string(),
        availableQuantity: z.number().optional(),
        requestedQuantity: z.number().optional(),
        qcStatus: z
          .enum(['pending', 'accepted', 'rejected', 'accepted_with_notes'])
          .optional(),
      }),
    )
    .handler(async ({ data }) => {
      if (
        data.availableQuantity !== undefined &&
        data.requestedQuantity !== undefined
      ) {
        assertAvailableBalance(data.availableQuantity, data.requestedQuantity)
      }

      const warnings =
        type === 'issue' && data.qcStatus ? getIssueWarnings(data.qcStatus) : []

      return {
        documentId: data.documentId,
        type,
        status: 'posted',
        postedAt: new Date().toISOString(),
        warnings,
      }
    })
}

export function getDemoMetrics() {
  return demoMaterialMetrics
}
