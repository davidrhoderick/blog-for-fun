CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`alt_text` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `posts` ADD `featured_media_id` text REFERENCES media_assets(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_object_key_idx` ON `media_assets` (`object_key`);