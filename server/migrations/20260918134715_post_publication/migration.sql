ALTER TABLE `posts` ADD `published_at` integer;--> statement-breakpoint
UPDATE `posts` SET `published_at` = `updated_at`;--> statement-breakpoint
CREATE INDEX `posts_published_at_created_at_idx` ON `posts` (`published_at`,`created_at`);
