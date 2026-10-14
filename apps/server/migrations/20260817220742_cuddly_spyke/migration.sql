CREATE TABLE `post_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`post_id` integer NOT NULL,
	`revision_number` integer NOT NULL,
	`title` text NOT NULL,
	`markdown_content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_post_revisions_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`markdown_content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `post_revisions_post_id_idx` ON `post_revisions` (`post_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `post_revisions_post_id_revision_number_idx` ON `post_revisions` (`post_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_idx` ON `posts` (`slug`);