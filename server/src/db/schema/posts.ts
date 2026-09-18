import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const posts = sqliteTable(
  'posts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    markdownContent: text('markdown_content').notNull(),
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex('posts_slug_idx').on(table.slug),
    index('posts_published_at_created_at_idx').on(
      table.publishedAt,
      table.createdAt,
    ),
  ],
)

export const postRevisions = sqliteTable(
  'post_revisions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    revisionNumber: integer('revision_number').notNull(),
    title: text('title').notNull(),
    markdownContent: text('markdown_content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('post_revisions_post_id_idx').on(table.postId),
    uniqueIndex('post_revisions_post_id_revision_number_idx').on(
      table.postId,
      table.revisionNumber,
    ),
  ],
)
