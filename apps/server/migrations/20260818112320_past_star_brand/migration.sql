PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`markdown_content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_posts`(`id`, `slug`, `title`, `markdown_content`, `created_at`, `updated_at`) SELECT printf('00000000-0000-4000-8000-%012x', `id`), `slug`, `title`, `markdown_content`, `created_at`, `updated_at` FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
CREATE TABLE `__new_post_revisions` (
	`id` text PRIMARY KEY,
	`post_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`title` text NOT NULL,
	`markdown_content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_post_revisions_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_post_revisions`(`id`, `post_id`, `revision_number`, `title`, `markdown_content`, `created_at`) SELECT printf('00000000-0000-4000-8000-%012x', `id`), printf('00000000-0000-4000-8000-%012x', `post_id`), `revision_number`, `title`, `markdown_content`, `created_at` FROM `post_revisions`;--> statement-breakpoint
DROP TABLE `post_revisions`;--> statement-breakpoint
ALTER TABLE `__new_post_revisions` RENAME TO `post_revisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `post_revisions_post_id_idx` ON `post_revisions` (`post_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `post_revisions_post_id_revision_number_idx` ON `post_revisions` (`post_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_idx` ON `posts` (`slug`);
