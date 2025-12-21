CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cached_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`year` integer NOT NULL,
	`stats_type` text NOT NULL,
	`stats_json` text NOT NULL,
	`calculated_at` integer
);
--> statement-breakpoint
CREATE TABLE `custom_slides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`enabled` integer DEFAULT true,
	`sort_order` integer NOT NULL,
	`year` integer
);
--> statement-breakpoint
CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`source` text,
	`metadata` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_logs_timestamp` ON `logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_logs_level` ON `logs` (`level`);--> statement-breakpoint
CREATE INDEX `idx_logs_level_timestamp` ON `logs` (`level`,`timestamp`);--> statement-breakpoint
CREATE TABLE `play_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`history_key` text NOT NULL,
	`rating_key` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`viewed_at` integer NOT NULL,
	`account_id` integer NOT NULL,
	`library_section_id` integer NOT NULL,
	`thumb` text,
	`duration` integer,
	`grandparent_title` text,
	`parent_title` text,
	`genres` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_history_history_key_unique` ON `play_history` (`history_key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`plex_token` text NOT NULL,
	`is_admin` integer DEFAULT false,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `share_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`year` integer NOT NULL,
	`mode` text DEFAULT 'public' NOT NULL,
	`share_token` text,
	`can_user_control` integer DEFAULT false,
	`show_logo` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_settings_share_token_unique` ON `share_settings` (`share_token`);--> statement-breakpoint
CREATE TABLE `slide_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slide_type` text NOT NULL,
	`enabled` integer DEFAULT true,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_status` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`records_processed` integer DEFAULT 0,
	`last_viewed_at` integer,
	`status` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plex_id` integer NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`thumb` text,
	`is_admin` integer DEFAULT false,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_plex_id_unique` ON `users` (`plex_id`);