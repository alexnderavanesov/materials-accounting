import { relations, sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const documentTypeEnum = pgEnum('document_type', [
  'material_request',
  'receipt',
  'quality_control',
  'issue',
  'return',
  'write_off',
  'inventory_adjustment',
])

export const documentStatusEnum = pgEnum('document_status', [
  'draft',
  'posted',
  'cancelled',
])

export const qcStatusEnum = pgEnum('qc_status', [
  'pending',
  'accepted',
  'rejected',
  'accepted_with_notes',
])

export const ledgerDirectionEnum = pgEnum('ledger_direction', ['in', 'out'])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
}

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  taxId: text('tax_id'),
  notes: text('notes'),
  ...timestamps,
})

export const objects = pgTable('objects', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  code: text('code'),
  address: text('address'),
  ...timestamps,
})

export const subobjects = pgTable(
  'subobjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    objectId: uuid('object_id')
      .notNull()
      .references(() => objects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    ...timestamps,
  },
  (table) => ({
    objectCodeIdx: uniqueIndex('subobjects_object_code_idx').on(
      table.objectId,
      table.code,
    ),
  }),
)

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(100),
  ...timestamps,
})

export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  ...timestamps,
})

export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    sku: text('sku'),
    description: text('description'),
    defaultUnitId: uuid('default_unit_id').references(() => units.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => ({
    skuIdx: uniqueIndex('materials_sku_idx').on(table.sku),
    nameIdx: index('materials_name_idx').on(table.name),
  }),
)

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  roleLabel: text('role_label'),
  phone: text('phone'),
  ...timestamps,
})

export const storageLocations = pgTable('storage_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  code: text('code'),
  notes: text('notes'),
  ...timestamps,
})

export const projectMaterialLines = pgTable(
  'project_material_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subobjectId: uuid('subobject_id')
      .notNull()
      .references(() => subobjects.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    cipher: text('cipher').notNull(),
    title: text('title'),
    plannedQuantity: numeric('planned_quantity', {
      precision: 14,
      scale: 3,
    }).notNull(),
    sourceRowHash: text('source_row_hash'),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => ({
    subobjectCipherMaterialIdx: index(
      'project_material_lines_subobject_cipher_material_idx',
    ).on(table.subobjectId, table.cipher, table.materialId),
  }),
)

export const importDrafts = pgTable('import_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  subobjectId: uuid('subobject_id')
    .notNull()
    .references(() => subobjects.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  status: text('status').notNull().default('draft'),
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull(),
  rows: jsonb('rows').$type<Array<Record<string, unknown>>>().notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  ...timestamps,
})

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: documentTypeEnum('type').notNull(),
    status: documentStatusEnum('status').notNull().default('draft'),
    number: text('number').notNull(),
    documentDate: timestamp('document_date', { withTimezone: true })
      .notNull()
      .defaultNow(),
    objectId: uuid('object_id').references(() => objects.id, {
      onDelete: 'set null',
    }),
    subobjectId: uuid('subobject_id').references(() => subobjects.id, {
      onDelete: 'set null',
    }),
    sourceDocumentId: uuid('source_document_id'),
    operatorName: text('operator_name'),
    comment: text('comment'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    numberTypeIdx: uniqueIndex('documents_type_number_idx').on(
      table.type,
      table.number,
    ),
    subobjectIdx: index('documents_subobject_idx').on(table.subobjectId),
  }),
)

export const documentLines = pgTable('document_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  projectMaterialLineId: uuid('project_material_line_id').references(
    () => projectMaterialLines.id,
    { onDelete: 'set null' },
  ),
  materialId: uuid('material_id')
    .notNull()
    .references(() => materials.id, { onDelete: 'restrict' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'restrict' }),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  lotId: uuid('lot_id'),
  employeeId: uuid('employee_id').references(() => employees.id, {
    onDelete: 'set null',
  }),
  storageLocationId: uuid('storage_location_id').references(
    () => storageLocations.id,
    { onDelete: 'set null' },
  ),
  qcStatus: qcStatusEnum('qc_status'),
  comment: text('comment'),
  meta: jsonb('meta')
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`),
  ...timestamps,
})

export const materialLots = pgTable(
  'material_lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectMaterialLineId: uuid('project_material_line_id')
      .notNull()
      .references(() => projectMaterialLines.id, { onDelete: 'restrict' }),
    receiptDocumentId: uuid('receipt_document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'restrict' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    storageLocationId: uuid('storage_location_id').references(
      () => storageLocations.id,
      { onDelete: 'set null' },
    ),
    initialQuantity: numeric('initial_quantity', {
      precision: 14,
      scale: 3,
    }).notNull(),
    qcStatus: qcStatusEnum('qc_status').notNull().default('pending'),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => ({
    projectLineIdx: index('material_lots_project_line_idx').on(
      table.projectMaterialLineId,
    ),
  }),
)

export const stockLedger = pgTable(
  'stock_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'restrict' }),
    documentLineId: uuid('document_line_id').references(
      () => documentLines.id,
      {
        onDelete: 'set null',
      },
    ),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => materialLots.id, { onDelete: 'restrict' }),
    projectMaterialLineId: uuid('project_material_line_id')
      .notNull()
      .references(() => projectMaterialLines.id, { onDelete: 'restrict' }),
    direction: ledgerDirectionEnum('direction').notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
    reason: documentTypeEnum('reason').notNull(),
    happenedAt: timestamp('happened_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => ({
    lotIdx: index('stock_ledger_lot_idx').on(table.lotId),
    projectLineIdx: index('stock_ledger_project_line_idx').on(
      table.projectMaterialLineId,
    ),
  }),
)

export const objectRelations = relations(objects, ({ one, many }) => ({
  customer: one(customers, {
    fields: [objects.customerId],
    references: [customers.id],
  }),
  subobjects: many(subobjects),
}))

export const subobjectRelations = relations(subobjects, ({ one, many }) => ({
  object: one(objects, {
    fields: [subobjects.objectId],
    references: [objects.id],
  }),
  projectMaterialLines: many(projectMaterialLines),
}))

export const projectMaterialLineRelations = relations(
  projectMaterialLines,
  ({ one, many }) => ({
    subobject: one(subobjects, {
      fields: [projectMaterialLines.subobjectId],
      references: [subobjects.id],
    }),
    category: one(categories, {
      fields: [projectMaterialLines.categoryId],
      references: [categories.id],
    }),
    material: one(materials, {
      fields: [projectMaterialLines.materialId],
      references: [materials.id],
    }),
    unit: one(units, {
      fields: [projectMaterialLines.unitId],
      references: [units.id],
    }),
    lots: many(materialLots),
  }),
)

export type DocumentType = (typeof documentTypeEnum.enumValues)[number]
export type DocumentStatus = (typeof documentStatusEnum.enumValues)[number]
export type QcStatus = (typeof qcStatusEnum.enumValues)[number]
