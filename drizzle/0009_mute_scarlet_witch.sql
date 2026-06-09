ALTER TABLE `share_settings` ADD `public_slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `share_settings_public_slug_unique` ON `share_settings` (`public_slug`);
