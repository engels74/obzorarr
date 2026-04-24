CREATE TABLE `pin_transactions` (
	`state` text PRIMARY KEY NOT NULL,
	`pin_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`callback_verified` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pin_transactions_expires_at` ON `pin_transactions` (`expires_at`);
