CREATE TABLE `auth_audit_events` (
	`id` text PRIMARY KEY,
	`actor_auth_user_id` text,
	`subject_auth_user_id` text,
	`event_type` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_auth_audit_events_actor_auth_user_id_auth_users_id_fk` FOREIGN KEY (`actor_auth_user_id`) REFERENCES `auth_users`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_auth_audit_events_subject_auth_user_id_auth_users_id_fk` FOREIGN KEY (`subject_auth_user_id`) REFERENCES `auth_users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `auth_password_credentials` (
	`auth_user_id` text PRIMARY KEY,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_changed_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_auth_password_credentials_auth_user_id_auth_users_id_fk` FOREIGN KEY (`auth_user_id`) REFERENCES `auth_users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY,
	`auth_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL,
	`absolute_expires_at` integer NOT NULL,
	CONSTRAINT `fk_auth_sessions_auth_user_id_auth_users_id_fk` FOREIGN KEY (`auth_user_id`) REFERENCES `auth_users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `auth_user_roles` (
	`auth_user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `auth_user_roles_pk` PRIMARY KEY(`auth_user_id`, `role`),
	CONSTRAINT `fk_auth_user_roles_auth_user_id_auth_users_id_fk` FOREIGN KEY (`auth_user_id`) REFERENCES `auth_users`(`id`) ON DELETE CASCADE,
	CONSTRAINT "auth_user_roles_role_check" CHECK("role" in ('administrator'))
);
--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "auth_users_status_check" CHECK("status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`display_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_users_id_auth_users_id_fk` FOREIGN KEY (`id`) REFERENCES `auth_users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `auth_audit_events_actor_idx` ON `auth_audit_events` (`actor_auth_user_id`);--> statement-breakpoint
CREATE INDEX `auth_audit_events_subject_idx` ON `auth_audit_events` (`subject_auth_user_id`);--> statement-breakpoint
CREATE INDEX `auth_audit_events_created_at_idx` ON `auth_audit_events` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_password_credentials_email_idx` ON `auth_password_credentials` (`email`);--> statement-breakpoint
CREATE INDEX `auth_sessions_auth_user_id_idx` ON `auth_sessions` (`auth_user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_at_idx` ON `auth_sessions` (`expires_at`);