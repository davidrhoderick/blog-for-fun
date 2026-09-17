import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const authUsers = sqliteTable(
  'auth_users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    status: text('status', { enum: ['active', 'disabled'] })
      .notNull()
      .default('active'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    check(
      'auth_users_status_check',
      sql`${table.status} in ('active', 'disabled')`,
    ),
  ],
)

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const authPasswordCredentials = sqliteTable(
  'auth_password_credentials',
  {
    authUserId: text('auth_user_id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    passwordChangedAt: integer('password_changed_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex('auth_password_credentials_email_idx').on(table.email),
  ],
)

export const authUserRoles = sqliteTable(
  'auth_user_roles',
  {
    authUserId: text('auth_user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['administrator'] }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    primaryKey({ columns: [table.authUserId, table.role] }),
    check(
      'auth_user_roles_role_check',
      sql`${table.role} in ('administrator')`,
    ),
  ],
)

export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    authUserId: text('auth_user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    absoluteExpiresAt: integer('absolute_expires_at', {
      mode: 'timestamp',
    }).notNull(),
  },
  (table) => [
    index('auth_sessions_auth_user_id_idx').on(table.authUserId),
    index('auth_sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const authAuditEvents = sqliteTable(
  'auth_audit_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorAuthUserId: text('actor_auth_user_id').references(() => authUsers.id, {
      onDelete: 'set null',
    }),
    subjectAuthUserId: text('subject_auth_user_id').references(
      () => authUsers.id,
      { onDelete: 'set null' },
    ),
    eventType: text('event_type').notNull(),
    metadata: text('metadata', { mode: 'json' })
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('auth_audit_events_actor_idx').on(table.actorAuthUserId),
    index('auth_audit_events_subject_idx').on(table.subjectAuthUserId),
    index('auth_audit_events_created_at_idx').on(table.createdAt),
  ],
)
