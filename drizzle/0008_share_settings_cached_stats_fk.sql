DELETE FROM `share_settings` WHERE `user_id` NOT IN (SELECT `id` FROM `users`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
