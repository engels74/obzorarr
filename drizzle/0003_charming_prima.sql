CREATE INDEX `idx_cached_stats_lookup` ON `cached_stats` (`user_id`,`year`,`stats_type`);--> statement-breakpoint
CREATE INDEX `idx_play_history_account_id` ON `play_history` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_play_history_viewed_at` ON `play_history` (`viewed_at`);--> statement-breakpoint
CREATE INDEX `idx_play_history_account_viewed` ON `play_history` (`account_id`,`viewed_at`);
