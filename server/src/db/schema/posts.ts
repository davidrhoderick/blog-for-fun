import { defineRelations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    markdownContent: text('markdown_content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [uniqueIndex('posts_slug_idx').on(table.slug)],
);

export const postRevisions = sqliteTable(
  'post_revisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    postId: integer('post_id')
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
);

export const relations = defineRelations({ posts, postRevisions }, (r) => ({
  posts: {
    revisions: r.many.postRevisions(),
  },
  postRevisions: {
    post: r.one.posts({
      from: r.postRevisions.postId,
      to: r.posts.id,
      optional: false,
    }),
  },
}));
