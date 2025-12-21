CREATE TABLE `metadata_cache` (
	`rating_key` text PRIMARY KEY NOT NULL,
	`duration` integer,
	`genres` text,
	`fetched_at` integer NOT NULL,
	`fetch_failed` integer DEFAULT false
);
--> statement-breakpoint
CREATE INDEX `idx_play_history_rating_key` ON `play_history` (`rating_key`);