CREATE TABLE `app_settings_new` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
);
--> statement-breakpoint
INSERT INTO `app_settings_new` (`key`, `value`, `updated_at`)
SELECT `key`, `value`, `updated_at` * 1000 FROM `app_settings`;
--> statement-breakpoint
DROP TABLE `app_settings`;
--> statement-breakpoint
ALTER TABLE `app_settings_new` RENAME TO `app_settings`;
