DELETE FROM `cached_stats` WHERE `user_id` IS NOT NULL AND `user_id` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
DELETE FROM `share_settings` WHERE `user_id` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cached_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`year` integer NOT NULL,
	`stats_type` text NOT NULL,
	`stats_json` text NOT NULL,
	`calculated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_cached_stats`("id", "user_id", "year", "stats_type", "stats_json", "calculated_at") SELECT "id", "user_id", "year", "stats_type", "stats_json", "calculated_at" FROM `cached_stats`;--> statement-breakpoint
DROP TABLE `cached_stats`;--> statement-breakpoint
ALTER TABLE `__new_cached_stats` RENAME TO `cached_stats`;--> statement-breakpoint
CREATE INDEX `idx_cached_stats_lookup` ON `cached_stats` (`user_id`,`year`,`stats_type`);--> statement-breakpoint
CREATE TABLE `__new_share_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`year` integer NOT NULL,
	`mode` text DEFAULT 'public' NOT NULL,
	`mode_source` text DEFAULT 'explicit' NOT NULL,
	`share_token` text,
	`can_user_control` integer DEFAULT false,
	`show_logo` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_share_settings`("id", "user_id", "year", "mode", "mode_source", "share_token", "can_user_control", "show_logo") SELECT "id", "user_id", "year", "mode", "mode_source", "share_token", "can_user_control", "show_logo" FROM `share_settings`;--> statement-breakpoint
DROP TABLE `share_settings`;--> statement-breakpoint
ALTER TABLE `__new_share_settings` RENAME TO `share_settings`;--> statement-breakpoint
CREATE UNIQUE INDEX `share_settings_share_token_unique` ON `share_settings` (`share_token`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
