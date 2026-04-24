ALTER TABLE `app_settings` ADD `updated_at` integer DEFAULT (unixepoch()) NOT NULL;
