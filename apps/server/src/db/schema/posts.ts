import { sql } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
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
    featuredMediaId: text('featured_media_id').references(
      (): AnySQLiteColumn => mediaAssets.id,
      {
        onDelete: 'set null',
      },
    ),
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

export const mediaAssets = sqliteTable(
  'media_assets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    objectKey: text('object_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    altText: text('alt_text').notNull(),
    status: text('status', { enum: ['pending', 'ready'] })
      .notNull()
      .default('pending'),
    attachedPostId: text('attached_post_id').references(
      (): AnySQLiteColumn => posts.id,
      {
        onDelete: 'set null',
      },
    ),
    width: integer('width'),
    height: integer('height'),
    finalizedAt: integer('finalized_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex('media_assets_object_key_idx').on(table.objectKey),
    index('media_assets_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
    index('media_assets_attached_post_id_idx').on(table.attachedPostId),
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
