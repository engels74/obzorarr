-- ISSUE-001: enforce one share_settings row per (user_id, year).
--
-- Shipped installs may already contain duplicate (user_id, year) rows produced
-- by the non-atomic read-then-insert race in getOrCreateShareSettings (e.g. two
-- concurrent loads of /dashboard/settings). We MUST collapse those duplicates
-- before the unique index can be created, or the CREATE UNIQUE INDEX itself
-- would fail on a corrupted DB.
--
-- drizzle's bun-sqlite migrate() wraps this whole file in one transaction, so
-- the salvage -> delete -> index steps below are atomic together. Do NOT add a
-- manual BEGIN/COMMIT (it would double-nest and throw). The dedup is a no-op on
-- a clean DB (the GROUP BY ... HAVING COUNT(*) > 1 subqueries match nothing).
--
-- Survivor selection (highest priority first): a row that already carries a
-- public_slug, then one with a share_token, then an explicit (user/admin-set)
-- mode, then the lowest id. This keeps the row holding the most valuable
-- identifiers; the slug/token columns are unique, so they are intentionally NOT
-- copied between rows (that would trip their own unique constraint mid-migration
-- and the survivor priority already retains whichever row holds them).

-- (a) Salvage the only divergent field that is unambiguous to merge: a non-null
-- show_logo preference set on a duplicate row. We deliberately do NOT salvage
-- mode/mode_source: copying an explicit mode off a deleted loser onto a slug-
-- holding survivor could leave it private-link with no token (a broken share
-- URL) or silently pick the less-private of two explicit modes. The survivor
-- priority already prefers an explicit row when it also holds a slug/token, and
-- the global privacy floor still clamps the effective mode at read time, so the
-- worst case here is reverting a stray duplicate's mode flag to default-sourced.
UPDATE `share_settings` AS s
SET `show_logo` = COALESCE(s.`show_logo`, m.`salvaged_show_logo`)
FROM (
	SELECT
		`user_id`,
		`year`,
		MAX(`show_logo`) AS `salvaged_show_logo`
	FROM `share_settings`
	GROUP BY `user_id`, `year`
	HAVING COUNT(*) > 1
) AS m
WHERE s.`user_id` = m.`user_id`
	AND s.`year` = m.`year`
	AND s.`id` = (
		SELECT d.`id`
		FROM `share_settings` d
		WHERE d.`user_id` = m.`user_id` AND d.`year` = m.`year`
		ORDER BY (d.`public_slug` IS NOT NULL) DESC, (d.`share_token` IS NOT NULL) DESC, (d.`mode_source` = 'explicit') DESC, d.`id` ASC
		LIMIT 1
	);
--> statement-breakpoint
-- (b) Delete the losing duplicate rows, keeping exactly the ranked survivor per
-- (user_id, year). Safe: nothing FKs INTO share_settings (user_id is an outbound
-- cascade FK only).
DELETE FROM `share_settings`
WHERE `id` IN (
	SELECT `id` FROM (
		SELECT
			`id`,
			ROW_NUMBER() OVER (
				PARTITION BY `user_id`, `year`
				ORDER BY (`public_slug` IS NOT NULL) DESC, (`share_token` IS NOT NULL) DESC, (`mode_source` = 'explicit') DESC, `id` ASC
			) AS `rn`
		FROM `share_settings`
	) ranked
	WHERE ranked.`rn` > 1
);
--> statement-breakpoint
-- (c) Now that each (user_id, year) is unique, add the constraint.
CREATE UNIQUE INDEX `share_settings_user_year_unq` ON `share_settings` (`user_id`,`year`);
