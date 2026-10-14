ALTER TABLE `media_assets` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_assets` ADD `attached_post_id` text REFERENCES posts(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `media_assets` ADD `width` integer;--> statement-breakpoint
ALTER TABLE `media_assets` ADD `height` integer;--> statement-breakpoint
ALTER TABLE `media_assets` ADD `finalized_at` integer;--> statement-breakpoint
UPDATE `media_assets` SET `status` = 'ready', `finalized_at` = `created_at`;--> statement-breakpoint
CREATE INDEX `media_assets_status_created_at_idx` ON `media_assets` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `media_assets_attached_post_id_idx` ON `media_assets` (`attached_post_id`);
