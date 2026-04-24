ALTER TABLE `app_settings` ADD `updated_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `app_settings` SET `updated_at` = unixepoch() WHERE `updated_at` = 0;
