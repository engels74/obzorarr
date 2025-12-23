CREATE TABLE `plex_accounts` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`plex_id` integer NOT NULL,
	`username` text NOT NULL,
	`thumb` text,
	`is_owner` integer DEFAULT false,
	`updated_at` integer
);
