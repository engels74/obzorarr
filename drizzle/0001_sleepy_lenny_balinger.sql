CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`source` text,
	`metadata` text,
	`timestamp` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `idx_logs_timestamp` ON `logs` (`timestamp`);
--> statement-breakpoint
CREATE INDEX `idx_logs_level` ON `logs` (`level`);
--> statement-breakpoint
CREATE INDEX `idx_logs_level_timestamp` ON `logs` (`level`, `timestamp`);
