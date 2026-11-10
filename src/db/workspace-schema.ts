import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Each material, operation and inspection (including its revisions) is an independent record.
// JSONB preserves the established document format; indexed links bound validation to its dependencies.
export const workspaceRecords = pgTable(
  'workspace_records',
  {
    key: text('key').primaryKey(),
    collection: text('collection').notNull(),
    id: text('id').notNull(),
    value: jsonb('value').notNull(),
    version: bigint('version', { mode: 'number' }).notNull(),
    position: doublePrecision('position').notNull(),
    links: text('links').array().notNull(),
    uniqueKeys: text('unique_keys').array().notNull(),
  },
  (table) => [
    uniqueIndex('workspace_records_collection_id_idx').on(
      table.collection,
      table.id,
    ),
    index('workspace_records_links_idx').using('gin', table.links),
    index('workspace_records_unique_keys_idx').using('gin', table.uniqueKeys),
  ],
)
export const workspaceMeta = pgTable('workspace_meta', {
  id: integer('id').primaryKey(),
  revision: bigint('revision', { mode: 'number' }).notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
export const workspaceGroups = pgTable('workspace_groups', {
  key: text('key').primaryKey(),
  version: bigint('version', { mode: 'number' }).notNull(),
})
export const workspaceCommits = pgTable(
  'workspace_commits',
  {
    revision: bigint('revision', { mode: 'number' }).primaryKey(),
    mutationId: uuid('mutation_id').notNull(),
    actor: text('actor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    changes: jsonb('changes').notNull(),
    groups: jsonb('groups').notNull(),
    requestHash: text('request_hash').notNull(),
  },
  (table) => [
    uniqueIndex('workspace_commits_mutation_idx').on(table.mutationId),
  ],
)

export const workspaceUsers = pgTable('workspace_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  login: text('login').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('editor'),
  disabled: integer('disabled').notNull().default(0),
})
export const workspaceSessions = pgTable('workspace_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => workspaceUsers.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
export const workspaceLoginAttempts = pgTable('workspace_login_attempts', {
  key: text('key').primaryKey(),
  attempts: integer('attempts').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
