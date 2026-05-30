import { and, between, eq, inArray, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db/client';
import { appSettings, cachedStats, playHistory, shareSettings } from '$lib/server/db/schema';
import {
	CredentialedUrlError,
	envAllowsInsecureLocalPlexHttp,
	normalizePlexServerUrl,
	shouldPersistPlexInsecureLocalHttpOptIn
} from '$lib/server/security/credentialed-url';
import { ShareMode, ShareModeSource, ShareSettingsKey } from '$lib/server/sharing/types';
import { createYearFilter } from '$lib/server/stats/utils';

export const AppSettingsKey = {
	PLEX_SERVER_URL: 'plex_server_url',
	PLEX_TOKEN: 'plex_token',
	PLEX_ALLOW_INSECURE_LOCAL_HTTP: 'plex_allow_insecure_local_http',
	OPENAI_API_KEY: 'openai_api_key',
	OPENAI_BASE_URL: 'openai_base_url',
	OPENAI_MODEL: 'openai_model',
	/**
	 * Bookkeeping marker bumped on every successful `setApiConfigAtomic` mutation
	 * (write OR clear). Included in `API_CONFIG_KEYS` so the optimistic-concurrency
	 * version always advances, even when the only mutation was a row deletion.
	 * Never read as configuration; only its `updatedAt` matters.
	 */
	API_CONFIG_VERSION: 'api_config_version',
	UI_THEME: 'ui_theme',
	WRAPPED_THEME: 'wrapped_theme',
	/** @deprecated Use WRAPPED_THEME instead - kept for backward compatibility */
	CURRENT_THEME: 'current_theme',
	DEFAULT_YEAR: 'default_year',
	ENABLED_YEARS: 'enabled_years',
	ANONYMIZATION_MODE: 'anonymization_mode',
	SYNC_CRON_EXPRESSION: 'sync_cron_expression',
	WRAPPED_LOGO_MODE: 'wrapped_logo_mode',
	SERVER_NAME: 'server_name',
	SERVER_MACHINE_ID: 'server_machine_id',
	FUN_FACT_FREQUENCY: 'fun_fact_frequency',
	FUN_FACT_CUSTOM_COUNT: 'fun_fact_custom_count',
	FUN_FACTS_AI_PERSONA: 'fun_facts_ai_persona',
	ENABLE_LIVE_SYNC: 'enable_live_sync',
	ONBOARDING_COMPLETED: 'onboarding_completed',
	ONBOARDING_CURRENT_STEP: 'onboarding_current_step',
	ONBOARDING_CLAIMED: 'onboarding_claimed',
	ONBOARDING_CLAIM_PROOF_HASH: 'onboarding_claim_proof_hash',
	ONBOARDING_CLAIMED_AT: 'onboarding_claimed_at',
	CSRF_ORIGIN: 'csrf_origin',
	CSRF_ORIGIN_SKIPPED: 'csrf_origin_skipped',
	CSRF_WARNING_DISMISSED: 'csrf_warning_dismissed',
	TRUST_PROXY: 'trust_proxy',
	THUMBNAIL_SIGNING_SECRET: 'thumbnail_signing_secret',
	/**
	 * Admin opt-in for the public username lookup form on the landing page. When
	 * absent, `getPublicLandingLookupEnabled()` defaults to `false` (login-only).
	 * DB-only (no ENV companion) so it is NOT subject to `clearConflictingDbSettings`;
	 * `ensurePublicLandingLookupDefault()` seeds `true` for already-onboarded servers
	 * on upgrade so a live public landing page never silently flips to login-required.
	 */
	PUBLIC_LANDING_LOOKUP: 'public_landing_lookup'
} as const;

export type AppSettingsKeyType = (typeof AppSettingsKey)[keyof typeof AppSettingsKey];

export const ThemePresets = {
	MODERN_MINIMAL: 'modern-minimal',
	SUPABASE: 'supabase',
	DOOM_64: 'doom-64',
	AMBER_MINIMAL: 'amber-minimal',
	SOVIET_RED: 'soviet-red'
} as const;

export type ThemePresetType = (typeof ThemePresets)[keyof typeof ThemePresets];

export const AnonymizationMode = {
	REAL: 'real',
	ANONYMOUS: 'anonymous',
	HYBRID: 'hybrid'
} as const;

export type AnonymizationModeType = (typeof AnonymizationMode)[keyof typeof AnonymizationMode];

export const WrappedLogoMode = {
	ALWAYS_SHOW: 'always_show',
	ALWAYS_HIDE: 'always_hide',
	USER_CHOICE: 'user_choice'
} as const;

export type WrappedLogoModeType = (typeof WrappedLogoMode)[keyof typeof WrappedLogoMode];

export const FunFactFrequency = {
	FEW: 'few',
	NORMAL: 'normal',
	MANY: 'many',
	CUSTOM: 'custom'
} as const;

export type FunFactFrequencyType = (typeof FunFactFrequency)[keyof typeof FunFactFrequency];

export interface FunFactFrequencyConfig {
	mode: FunFactFrequencyType;
	count: number;
}

export async function getAppSetting(key: AppSettingsKeyType): Promise<string | null> {
	const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);

	return result[0]?.value ?? null;
}

export async function setAppSetting(key: AppSettingsKeyType, value: string): Promise<void> {
	const now = new Date();
	await db
		.insert(appSettings)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value, updatedAt: now }
		});
}

/**
 * Returns the latest `updatedAt` across the given app-settings keys, or `null`
 * if none of the keys exist. Used by the admin settings page to detect
 * concurrent saves from another tab: the load path returns an ISO timestamp,
 * and each form action compares it against the current max before writing.
 */
export async function getAppSettingsUpdatedAt(keys: readonly string[]): Promise<Date | null> {
	if (keys.length === 0) return null;
	const rows = await db
		.select({ updatedAt: appSettings.updatedAt })
		.from(appSettings)
		.where(inArray(appSettings.key, keys as string[]));
	if (rows.length === 0) return null;
	let max = 0;
	for (const row of rows) {
		const t = row.updatedAt.getTime();
		if (t > max) max = t;
	}
	return new Date(max);
}

/**
 * Keys covered by the "Server-wide Wrapped" privacy form (anonymization +
 * server-wide share mode). Each form has its own optimistic-locking version so
 * a stale value on one form doesn't false-409 the other.
 */
export const SERVER_WRAPPED_SETTINGS_KEYS = [
	AppSettingsKey.ANONYMIZATION_MODE,
	ShareSettingsKey.SERVER_WRAPPED_SHARE_MODE
] as const;

/**
 * Keys covered by the "User Sharing Defaults" privacy form (per-user default
 * share mode + allow-user-control flag).
 */
export const USER_DEFAULTS_SETTINGS_KEYS = [
	ShareSettingsKey.DEFAULT_SHARE_MODE,
	ShareSettingsKey.ALLOW_USER_CONTROL
] as const;

/**
 * Keys covered by the System tab Logging form (retention days + max log count
 * + debug flag). The three values land via `setLogRetentionDays`,
 * `setLogMaxCount`, and `setDebugEnabled` from `$lib/server/logging/service`;
 * each writes its own `app_settings` row, so the OCC version is the max of
 * their `updatedAt` columns. Used for the inline `settingsVersion` retrofit on
 * `updateLogSettings` (US-020 partial / inline-OCC pattern).
 */
export const LOG_SETTINGS_KEYS = [
	'log_retention_days',
	'log_max_count',
	'log_debug_enabled'
] as const;

/**
 * Single-key OCC tuple for the Security tab Trust Proxy toggle. The form has
 * exactly one persisted value (`AppSettingsKey.TRUST_PROXY`) so the version
 * is just that row's `updatedAt`. Wrapped in a tuple to share the
 * `getAppSettingsUpdatedAt(...)` helper that the multi-key OCC paths use.
 */
export const TRUST_PROXY_SETTINGS_KEYS = [AppSettingsKey.TRUST_PROXY] as const;

/**
 * Single-key OCC tuple for the Privacy tab "Allow public Wrapped lookup" toggle.
 * Intentionally NOT folded into `SERVER_WRAPPED_SETTINGS_KEYS` or
 * `USER_DEFAULTS_SETTINGS_KEYS`: each privacy form keeps its own optimistic-lock
 * version so the toggle and the server-wide / user-default share-mode forms can
 * never false-409 one another (same rationale as the split between the existing
 * server-wide and user-default groups above).
 */
export const PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS = [AppSettingsKey.PUBLIC_LANDING_LOOKUP] as const;

/**
 * Single-key OCC tuple for the Security tab CSRF Origin field (the textarea
 * + "Save CSRF Origin" / "Clear" form). Only covers the origin value; the
 * skip flag (`CSRF_ORIGIN_SKIPPED`) has its own toggle and is intentionally
 * NOT part of this group so the two controls don't false-409 each other.
 */
export const CSRF_ORIGIN_SETTINGS_KEYS = [AppSettingsKey.CSRF_ORIGIN] as const;

/**
 * Single-key OCC tuples for the three Appearance-tab `z.enum` forms. Per
 * v3 plan §A5 Table D2 these use EXTERNAL OCC (validated before
 * `safeParse` in the action) because the schemas are top-level `z.enum`,
 * not `z.object`, and wrapping them in `z.object({...})` would change the
 * payload shape.
 */
export const UI_THEME_SETTINGS_KEYS = [AppSettingsKey.UI_THEME] as const;
export const WRAPPED_THEME_SETTINGS_KEYS = [AppSettingsKey.WRAPPED_THEME] as const;
export const WRAPPED_LOGO_MODE_SETTINGS_KEYS = [AppSettingsKey.WRAPPED_LOGO_MODE] as const;

/**
 * Keys covered by the API configuration panel (Plex + OpenAI connections).
 * Used for the optimistic-concurrency timestamp on `updateApiConfig`.
 *
 * `API_CONFIG_VERSION` is a write-only bookkeeping row included so a successful
 * mutation that *only deletes* config rows still advances `max(updatedAt)` — without
 * it, a clear in tab A could leave the version unchanged and let stale tab B
 * resurrect the cleared value while passing the OCC check.
 */
export const API_CONFIG_KEYS = [
	AppSettingsKey.PLEX_SERVER_URL,
	AppSettingsKey.PLEX_TOKEN,
	AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP,
	AppSettingsKey.OPENAI_API_KEY,
	AppSettingsKey.OPENAI_BASE_URL,
	AppSettingsKey.OPENAI_MODEL,
	AppSettingsKey.API_CONFIG_VERSION
] as const;

/**
 * Returns a `Date` whose ms value is strictly greater than `dbFloorMs` (the
 * highest existing `updatedAt` over the OCC key group, read inside the same
 * transaction). `new Date()` only has ms resolution, so two writes against the
 * same key group landing in the same wall-clock millisecond would store
 * identical `updatedAt` timestamps; the OCC check uses strict `<`, so an
 * exact-ms collision lets a stale tab pass and clobber a value just written by
 * the first writer.
 *
 * Reading the floor from the DB (rather than only from in-process state) also
 * survives server restarts and backward clock corrections (NTP, container
 * drift): if `Date.now()` regresses below the persisted `max(updatedAt)`, the
 * new write would otherwise lower `max(updatedAt)` and reopen the OCC window
 * for stale tabs holding the previous higher version. SQLite serializes
 * transactions, so within a single process two concurrent writers will each
 * see the other's stored value via the SELECT that produces `dbFloorMs`.
 *
 * Used by every atomic write path that participates in OCC (the
 * API_CONFIG_VERSION bump in `setApiConfigAtomic`/`clearApiConfigKey`, and the
 * row writes in `setServerWrappedSettingsAtomic`/`setUserDefaultsAtomic`) so
 * `max(updatedAt)` over each key group strictly advances on every successful
 * mutation.
 */
function nextOccVersionDate(dbFloorMs: number): Date {
	return new Date(Math.max(Date.now(), dbFloorMs + 1));
}

/**
 * Atomically validates that the "Server-wide Wrapped" settings (anonymization
 * mode + server-wide share mode) have not changed since `submittedVersion`
 * and, if so, writes both values in a single SQLite transaction. Returns
 * `'conflict'` when the submitted version is stale.
 */
export async function setServerWrappedSettingsAtomic(opts: {
	anonymizationMode: AnonymizationModeType;
	serverWrappedShareMode: string;
	submittedVersion: string;
}): Promise<'ok' | 'conflict'> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ updatedAt: appSettings.updatedAt })
			.from(appSettings)
			.where(inArray(appSettings.key, SERVER_WRAPPED_SETTINGS_KEYS as unknown as string[]));

		// Treat a missing/blank submittedVersion as a stale tab regardless of row
		// count — defends against the fresh-install/all-cleared loophole where the
		// row-count gate would silently skip OCC.
		const submittedMs = opts.submittedVersion ? Date.parse(opts.submittedVersion) : Number.NaN;
		if (Number.isNaN(submittedMs)) {
			return 'conflict';
		}
		// Compute `maxMs` over the existing rows so the OCC check and the write
		// timestamp share the same DB floor. With no rows, `maxMs = 0` is fine —
		// `Date.now()` dominates inside `nextOccVersionDate`.
		let maxMs = 0;
		for (const row of rows) {
			const t = row.updatedAt.getTime();
			if (t > maxMs) maxMs = t;
		}
		if (rows.length > 0 && submittedMs < maxMs) {
			return 'conflict';
		}

		const now = nextOccVersionDate(maxMs);

		await tx
			.insert(appSettings)
			.values({
				key: AppSettingsKey.ANONYMIZATION_MODE,
				value: opts.anonymizationMode,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: opts.anonymizationMode, updatedAt: now }
			});

		await tx
			.insert(appSettings)
			.values({
				key: ShareSettingsKey.SERVER_WRAPPED_SHARE_MODE,
				value: opts.serverWrappedShareMode,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: opts.serverWrappedShareMode, updatedAt: now }
			});

		return 'ok';
	});
}

/**
 * Atomically validates that the "User Sharing Defaults" settings (default
 * share mode + allow-user-control flag) have not changed since
 * `submittedVersion` and, if so, writes both values in a single SQLite
 * transaction. Returns `'conflict'` when the submitted version is stale.
 */
export async function setUserDefaultsAtomic(opts: {
	defaultShareMode: string;
	allowUserControl: boolean;
	submittedVersion: string;
}): Promise<'ok' | 'conflict'> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ updatedAt: appSettings.updatedAt })
			.from(appSettings)
			.where(inArray(appSettings.key, USER_DEFAULTS_SETTINGS_KEYS as unknown as string[]));

		// Treat a missing/blank submittedVersion as a stale tab regardless of row
		// count — defends against the fresh-install/all-cleared loophole.
		const submittedMs = opts.submittedVersion ? Date.parse(opts.submittedVersion) : Number.NaN;
		if (Number.isNaN(submittedMs)) {
			return 'conflict';
		}
		// Compute `maxMs` over the existing rows so the OCC check and the write
		// timestamp share the same DB floor. With no rows, `maxMs = 0` is fine —
		// `Date.now()` dominates inside `nextOccVersionDate`.
		let maxMs = 0;
		for (const row of rows) {
			const t = row.updatedAt.getTime();
			if (t > maxMs) maxMs = t;
		}
		if (rows.length > 0 && submittedMs < maxMs) {
			return 'conflict';
		}

		const now = nextOccVersionDate(maxMs);

		await tx
			.insert(appSettings)
			.values({
				key: ShareSettingsKey.DEFAULT_SHARE_MODE,
				value: opts.defaultShareMode,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: opts.defaultShareMode, updatedAt: now }
			});

		await tx
			.insert(appSettings)
			.values({
				key: ShareSettingsKey.ALLOW_USER_CONTROL,
				value: String(opts.allowUserControl),
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: String(opts.allowUserControl), updatedAt: now }
			});

		if (opts.defaultShareMode !== ShareMode.PRIVATE_LINK) {
			await tx
				.update(shareSettings)
				.set({ shareToken: null })
				.where(eq(shareSettings.modeSource, ShareModeSource.DEFAULT));
		}

		return 'ok';
	});
}

/**
 * Per-field intent for `setApiConfigAtomic`:
 *  - `undefined` — field was not present in the submitted form (e.g. saved from
 *    the OpenAI panel which doesn't include Plex fields). The row must NOT be
 *    touched.
 *  - `''` — field was present and submitted empty. For echoed-back keys
 *    (PLEX_SERVER_URL, OPENAI_BASE_URL, OPENAI_MODEL) this clears the row so
 *    `resolveConfigValue` falls through to env / default. For secret keys
 *    (PLEX_TOKEN, OPENAI_API_KEY) the value is never echoed to the client, so
 *    an empty submission means "leave the stored secret alone" — clearing those
 *    is done via dedicated actions (e.g. `clearOpenaiKey`).
 *  - non-empty string — write the new value (subject to the lock check).
 */
export interface SetApiConfigInput {
	plexServerUrl: string | undefined;
	plexToken: string | undefined;
	plexAllowInsecureLocalHttp?: boolean;
	openaiApiKey: string | undefined;
	openaiBaseUrl: string | undefined;
	openaiModel: string | undefined;
}

export interface SetApiConfigLocks {
	plexServerUrl: boolean;
	plexToken: boolean;
	openaiApiKey: boolean;
	openaiBaseUrl: boolean;
	openaiModel: boolean;
}

export interface SetApiConfigResult {
	status: 'ok' | 'conflict';
	plexCredentialsChanged: boolean;
}

/**
 * Atomically validates that the API config keys have not changed since
 * `submittedVersion` and, if so, writes any non-empty, non-locked values in a
 * single SQLite transaction. Returns `'conflict'` when the submitted version
 * is stale; the caller should run cache-invalidation side effects (e.g.
 * `clearCachedServerMachineId`) after commit when `plexCredentialsChanged`.
 */
export async function setApiConfigAtomic(opts: {
	values: SetApiConfigInput;
	locks: SetApiConfigLocks;
	submittedVersion: string;
}): Promise<SetApiConfigResult> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ updatedAt: appSettings.updatedAt })
			.from(appSettings)
			.where(inArray(appSettings.key, API_CONFIG_KEYS as unknown as string[]));

		// Treat a missing/blank submittedVersion as a stale tab regardless of row
		// count — defends against the fresh-install/all-cleared loophole where the
		// row-count gate would silently skip OCC.
		const submittedMs = opts.submittedVersion ? Date.parse(opts.submittedVersion) : Number.NaN;
		if (Number.isNaN(submittedMs)) {
			return { status: 'conflict', plexCredentialsChanged: false };
		}
		// Compute `maxMs` over the existing rows so the OCC check and the
		// version bump share the same DB floor. With no rows, `maxMs = 0` is
		// fine — `Date.now()` dominates inside `nextOccVersionDate`.
		let maxMs = 0;
		for (const row of rows) {
			const t = row.updatedAt.getTime();
			if (t > maxMs) maxMs = t;
		}
		if (rows.length > 0 && submittedMs < maxMs) {
			return { status: 'conflict', plexCredentialsChanged: false };
		}

		const now = nextOccVersionDate(maxMs);
		let plexCredentialsChanged = false;

		const upsert = async (key: AppSettingsKeyType, value: string) => {
			await tx
				.insert(appSettings)
				.values({ key, value, updatedAt: now })
				.onConflictDoUpdate({
					target: appSettings.key,
					set: { value, updatedAt: now }
				});
		};

		// Secret keys: never echoed back to the client. `undefined` (field absent)
		// AND `''` (field present but blank) both mean "leave the stored secret
		// alone" — explicit clearing is done via dedicated actions.
		const writeSecret = async (
			key: AppSettingsKeyType,
			value: string | undefined,
			locked: boolean
		) => {
			if (locked) return;
			if (value === undefined || value === '') return;
			await upsert(key, value);
		};

		// Echoed-back keys (URLs, model name): the client renders the current
		// value into the input. `undefined` (field absent — e.g. saved from a
		// different panel that doesn't include this field) is a strict no-op.
		// `''` means "user cleared the field" → delete the row so
		// resolveConfigValue falls through to env / default.
		const writeOrClearEchoed = async (
			key: AppSettingsKeyType,
			value: string | undefined,
			locked: boolean
		) => {
			if (locked) return;
			if (value === undefined) return;
			if (value === '') {
				await tx.delete(appSettings).where(eq(appSettings.key, key));
				return;
			}
			await upsert(key, value);
		};

		// PLEX_SERVER_URL is an echoed-back key: a non-undefined submission means the
		// user touched the field. Both a write (non-empty) and an explicit clear ('')
		// are credential changes — clearing the URL invalidates the cached machineId
		// just as much as pointing at a different server, since the next resolution
		// falls through to env / default which may target a different Plex instance.
		if (opts.values.plexServerUrl !== undefined && !opts.locks.plexServerUrl) {
			plexCredentialsChanged = true;
		}
		// PLEX_TOKEN is a secret key: writeSecret no-ops on both `undefined` and `''`,
		// so a non-truthy submission causes no DB change. Flag only when the value
		// will actually be written.
		if (opts.values.plexToken && !opts.locks.plexToken) {
			plexCredentialsChanged = true;
		}

		await writeOrClearEchoed(
			AppSettingsKey.PLEX_SERVER_URL,
			opts.values.plexServerUrl,
			opts.locks.plexServerUrl
		);
		if (opts.values.plexServerUrl !== undefined && !opts.locks.plexServerUrl) {
			if (opts.values.plexServerUrl === '') {
				await tx
					.delete(appSettings)
					.where(eq(appSettings.key, AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP));
			} else if (
				opts.values.plexAllowInsecureLocalHttp &&
				shouldPersistPlexInsecureLocalHttpOptIn(opts.values.plexServerUrl)
			) {
				await upsert(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP, 'true');
			} else {
				await tx
					.delete(appSettings)
					.where(eq(appSettings.key, AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP));
			}
		}
		await writeSecret(AppSettingsKey.PLEX_TOKEN, opts.values.plexToken, opts.locks.plexToken);
		await writeSecret(
			AppSettingsKey.OPENAI_API_KEY,
			opts.values.openaiApiKey,
			opts.locks.openaiApiKey
		);
		await writeOrClearEchoed(
			AppSettingsKey.OPENAI_BASE_URL,
			opts.values.openaiBaseUrl,
			opts.locks.openaiBaseUrl
		);
		await writeOrClearEchoed(
			AppSettingsKey.OPENAI_MODEL,
			opts.values.openaiModel,
			opts.locks.openaiModel
		);

		// Bookkeeping: bump the API_CONFIG_VERSION marker on every successful
		// transaction so `max(updatedAt)` over API_CONFIG_KEYS strictly advances —
		// even if the only mutation above was a delete (which would otherwise
		// leave the version unchanged or regressed, defeating the OCC check).
		await upsert(AppSettingsKey.API_CONFIG_VERSION, now.toISOString());

		return { status: 'ok', plexCredentialsChanged };
	});
}

/**
 * Clears a single API_CONFIG row and advances the `API_CONFIG_VERSION` marker in
 * the same transaction so `max(updatedAt)` over `API_CONFIG_KEYS` strictly
 * advances. Without the bump, a clear performed via the dedicated clear-* admin
 * actions would leave `max(updatedAt)` pinned to the last `setApiConfigAtomic`
 * write and let a stale tab resurrect the cleared value while still passing
 * OCC. Use this for admin "clear OpenAI key/model" style actions; the
 * cross-field write path (`setApiConfigAtomic`) already bumps the version
 * itself.
 */
export async function clearApiConfigKey(key: (typeof API_CONFIG_KEYS)[number]): Promise<void> {
	await db.transaction(async (tx) => {
		// Read `max(updatedAt)` over ALL `API_CONFIG_KEYS` rows BEFORE the DELETE
		// so the row about to be cleared still contributes to `dbFloorMs`. If we
		// scanned after deleting, the deleted row's prior `updatedAt` would be
		// missing from the result set; under a clock regression (NTP step / VM
		// migration) plus a legacy state where the deleted row held the highest
		// `updatedAt`, `nextOccVersionDate` could then mint a version below
		// that prior timestamp, letting a stale tab pass the strict-less-than OCC
		// check in `setApiConfigAtomic` and resurrect the cleared value. Reading
		// inside the transaction keeps the floor consistent with concurrent
		// writers and mirrors the floor scan in `setApiConfigAtomic` so both
		// write paths share the same OCC window.
		const rows = await tx
			.select({ updatedAt: appSettings.updatedAt })
			.from(appSettings)
			.where(inArray(appSettings.key, API_CONFIG_KEYS as unknown as string[]));
		let dbFloorMs = 0;
		for (const row of rows) {
			const t = row.updatedAt.getTime();
			if (t > dbFloorMs) dbFloorMs = t;
		}

		await tx.delete(appSettings).where(eq(appSettings.key, key));

		const now = nextOccVersionDate(dbFloorMs);
		await tx
			.insert(appSettings)
			.values({
				key: AppSettingsKey.API_CONFIG_VERSION,
				value: now.toISOString(),
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: now.toISOString(), updatedAt: now }
			});
	});
}

export async function getOrCreateAppSetting(
	key: AppSettingsKeyType,
	createValue: () => string
): Promise<string> {
	const existing = await getAppSetting(key);
	if (existing !== null && existing !== '') {
		return existing;
	}

	const generated = createValue();
	const now = new Date();
	await db
		.insert(appSettings)
		.values({ key, value: generated, updatedAt: now })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: generated, updatedAt: now },
			setWhere: eq(appSettings.value, '')
		});

	const persisted = await getAppSetting(key);
	return persisted === null || persisted === '' ? generated : persisted;
}

export async function deleteAppSetting(key: AppSettingsKeyType): Promise<void> {
	await db.delete(appSettings).where(eq(appSettings.key, key));
}

export async function getAllAppSettings(): Promise<Record<string, string>> {
	const result = await db.select().from(appSettings);

	const settings: Record<string, string> = {};
	for (const row of result) {
		settings[row.key] = row.value;
	}

	return settings;
}

export async function getUITheme(): Promise<ThemePresetType> {
	const theme = await getAppSetting(AppSettingsKey.UI_THEME);
	if (theme && Object.values(ThemePresets).includes(theme as ThemePresetType)) {
		return theme as ThemePresetType;
	}
	return ThemePresets.MODERN_MINIMAL;
}

export async function setUITheme(theme: ThemePresetType): Promise<void> {
	await setAppSetting(AppSettingsKey.UI_THEME, theme);
}

export async function getWrappedTheme(): Promise<ThemePresetType> {
	const theme = await getAppSetting(AppSettingsKey.WRAPPED_THEME);
	if (theme && Object.values(ThemePresets).includes(theme as ThemePresetType)) {
		return theme as ThemePresetType;
	}

	// Fall back to legacy CURRENT_THEME for backward compatibility
	const legacyTheme = await getAppSetting(AppSettingsKey.CURRENT_THEME);
	if (legacyTheme && Object.values(ThemePresets).includes(legacyTheme as ThemePresetType)) {
		return legacyTheme as ThemePresetType;
	}

	return ThemePresets.MODERN_MINIMAL;
}

export async function setWrappedTheme(theme: ThemePresetType): Promise<void> {
	await setAppSetting(AppSettingsKey.WRAPPED_THEME, theme);
}

/** @deprecated Use getWrappedTheme() instead */
export async function getCurrentTheme(): Promise<ThemePresetType> {
	return getWrappedTheme();
}

/** @deprecated Use setWrappedTheme() instead */
export async function setCurrentTheme(theme: ThemePresetType): Promise<void> {
	await setWrappedTheme(theme);
}

export async function getAnonymizationMode(): Promise<AnonymizationModeType> {
	const mode = await getAppSetting(AppSettingsKey.ANONYMIZATION_MODE);
	if (mode && Object.values(AnonymizationMode).includes(mode as AnonymizationModeType)) {
		return mode as AnonymizationModeType;
	}
	return AnonymizationMode.REAL;
}

export async function setAnonymizationMode(mode: AnonymizationModeType): Promise<void> {
	await setAppSetting(AppSettingsKey.ANONYMIZATION_MODE, mode);
}

export async function getDefaultYear(): Promise<number> {
	const year = await getAppSetting(AppSettingsKey.DEFAULT_YEAR);
	if (year) {
		const parsed = parseInt(year, 10);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
	}
	return new Date().getFullYear();
}

export async function setDefaultYear(year: number): Promise<void> {
	await setAppSetting(AppSettingsKey.DEFAULT_YEAR, year.toString());
}

export async function getWrappedLogoMode(): Promise<WrappedLogoModeType> {
	const mode = await getAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE);
	if (mode && Object.values(WrappedLogoMode).includes(mode as WrappedLogoModeType)) {
		return mode as WrappedLogoModeType;
	}
	return WrappedLogoMode.ALWAYS_SHOW;
}

export async function setWrappedLogoMode(mode: WrappedLogoModeType): Promise<void> {
	await setAppSetting(AppSettingsKey.WRAPPED_LOGO_MODE, mode);
}

export async function getCachedServerName(): Promise<string | null> {
	return getAppSetting(AppSettingsKey.SERVER_NAME);
}

export async function setCachedServerName(name: string): Promise<void> {
	await setAppSetting(AppSettingsKey.SERVER_NAME, name);
}

export async function getCachedServerMachineId(): Promise<string | null> {
	return getAppSetting(AppSettingsKey.SERVER_MACHINE_ID);
}

export async function setCachedServerMachineId(machineId: string): Promise<void> {
	await setAppSetting(AppSettingsKey.SERVER_MACHINE_ID, machineId);
}

export async function clearCachedServerMachineId(): Promise<void> {
	await deleteAppSetting(AppSettingsKey.SERVER_MACHINE_ID);
}

export async function getFunFactFrequency(): Promise<FunFactFrequencyConfig> {
	const mode = await getAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY);
	const customCountStr = await getAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT);

	const validMode =
		mode && Object.values(FunFactFrequency).includes(mode as FunFactFrequencyType)
			? (mode as FunFactFrequencyType)
			: FunFactFrequency.NORMAL;

	let count: number;
	switch (validMode) {
		case FunFactFrequency.FEW:
			count = 2;
			break;
		case FunFactFrequency.NORMAL:
			count = 4;
			break;
		case FunFactFrequency.MANY:
			count = 8;
			break;
		case FunFactFrequency.CUSTOM:
			count = customCountStr ? parseInt(customCountStr, 10) : 4;
			if (Number.isNaN(count) || count < 1) count = 1;
			if (count > 15) count = 15;
			break;
		default:
			count = 4;
	}

	return { mode: validMode, count };
}

export async function setFunFactFrequency(
	mode: FunFactFrequencyType,
	customCount?: number
): Promise<void> {
	await setAppSetting(AppSettingsKey.FUN_FACT_FREQUENCY, mode);

	if (mode === FunFactFrequency.CUSTOM && customCount !== undefined) {
		const clampedCount = Math.max(1, Math.min(15, customCount));
		await setAppSetting(AppSettingsKey.FUN_FACT_CUSTOM_COUNT, clampedCount.toString());
	}
}

export async function countStatsCache(year?: number): Promise<number> {
	if (year !== undefined) {
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(cachedStats)
			.where(eq(cachedStats.year, year));
		return result[0]?.count ?? 0;
	} else {
		const result = await db.select({ count: sql<number>`count(*)` }).from(cachedStats);
		return result[0]?.count ?? 0;
	}
}

export async function clearStatsCache(year?: number): Promise<number> {
	if (year !== undefined) {
		const result = await db.delete(cachedStats).where(eq(cachedStats.year, year)).returning();
		return result.length;
	} else {
		const result = await db.delete(cachedStats).returning();
		return result.length;
	}
}

export async function clearUserStatsCache(userId: number, year?: number): Promise<number> {
	if (year !== undefined) {
		const result = await db
			.delete(cachedStats)
			.where(and(eq(cachedStats.userId, userId), eq(cachedStats.year, year)))
			.returning();
		return result.length;
	} else {
		const result = await db.delete(cachedStats).where(eq(cachedStats.userId, userId)).returning();
		return result.length;
	}
}

export async function countPlayHistory(year?: number): Promise<number> {
	if (year !== undefined) {
		const { startTimestamp, endTimestamp } = createYearFilter(year);
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(playHistory)
			.where(between(playHistory.viewedAt, startTimestamp, endTimestamp));
		return Number(result[0]?.count ?? 0);
	} else {
		const result = await db.select({ count: sql<number>`count(*)` }).from(playHistory);
		return Number(result[0]?.count ?? 0);
	}
}

export async function clearPlayHistory(year?: number): Promise<number> {
	if (year !== undefined) {
		const { startTimestamp, endTimestamp } = createYearFilter(year);
		const result = await db
			.delete(playHistory)
			.where(between(playHistory.viewedAt, startTimestamp, endTimestamp))
			.returning();

		// Invalidate cached stats since they're now stale
		await clearStatsCache(year);

		return result.length;
	} else {
		const result = await db.delete(playHistory).returning();

		await clearStatsCache();

		return result.length;
	}
}

export type ConfigSource = 'env' | 'db' | 'default';

export interface ConfigValue<T> {
	value: T;
	source: ConfigSource;
	isLocked: boolean;
}

/**
 * Shape exposed to the client for secret fields. Omits the raw value so it never
 * crosses the wire during SvelteKit hydration.
 */
export interface SafeConfigValue {
	source: ConfigSource;
	isLocked: boolean;
	hasValue: boolean;
}

export interface ApiConfigWithSources {
	plex: {
		serverUrl: ConfigValue<string>;
		token: ConfigValue<string>;
	};
	openai: {
		apiKey: ConfigValue<string>;
		baseUrl: ConfigValue<string>;
		model: ConfigValue<string>;
	};
}

export function toSafeConfigValue(config: ConfigValue<string>): SafeConfigValue {
	return {
		source: config.source,
		isLocked: config.isLocked,
		hasValue: Boolean(config.value)
	};
}

function getPlexEnvConfig() {
	return {
		serverUrl: env.PLEX_SERVER_URL ?? '',
		token: env.PLEX_TOKEN ?? ''
	};
}

function getOpenAIEnvConfig() {
	return {
		apiKey: env.OPENAI_API_KEY ?? '',
		baseUrl: env.OPENAI_API_URL ?? '',
		model: env.OPENAI_MODEL ?? ''
	};
}

/**
 * Some `.env.example` shipped values are obvious placeholders that new deployers
 * forget to clear when they copy the template into `.env` (ISSUE-004). Treating
 * them as authoritative makes the onboarding flow attempt to reach a non-existent
 * server and surfaces a misleading "transient" error. Detect them here and let
 * `resolveConfigValue` fall through to the DB / default branch.
 *
 * Matches:
 *   - exactly the shipped sentinel strings (e.g. `your-plex-token-here`)
 *   - generic placeholders following common conventions (`your-*-here`,
 *     `change-me`, `placeholder`)
 *   - the literal `http://localhost:32400` shipped as the example Plex URL.
 *     This is treated as a placeholder unconditionally so the `.env.example`
 *     default can never be mistaken for real config; a genuine localhost
 *     deployment must be configured via the DB / admin UI, which
 *     `resolveConfigValue` falls through to.
 */
export function isPlaceholderSentinel(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) return false;

	const exact = new Set<string>([
		'your-plex-token-here',
		'http://localhost:32400',
		'http://plex-url-here:32400',
		'plex-url-here'
	]);
	if (exact.has(trimmed)) return true;

	const lowered = trimmed.toLowerCase();
	if (/^your-.*-here$/.test(lowered)) return true;
	if (/^change-?me$/.test(lowered)) return true;
	if (lowered === 'placeholder') return true;

	return false;
}

/**
 * An env value locks configuration (source: 'env') only when it is non-empty
 * AND not a shipped `.env.example` placeholder sentinel. This is the single
 * predicate behind every "is this env value authoritative?" check —
 * resolveConfigValue, hasPlexEnvConfig, and the machineId cache invalidation —
 * so the env-lock semantics can never drift between them.
 */
export function isAuthoritativeEnvValue(value: string): boolean {
	return Boolean(value) && !isPlaceholderSentinel(value);
}

function resolveConfigValue(
	dbSettings: Record<string, string>,
	dbKey: string,
	envValue: string,
	defaultValue: string = ''
): ConfigValue<string> {
	if (isAuthoritativeEnvValue(envValue)) {
		return { value: envValue, source: 'env', isLocked: true };
	}
	const dbValue = dbSettings[dbKey];
	if (dbValue) {
		return { value: dbValue, source: 'db', isLocked: false };
	}
	return { value: defaultValue, source: 'default', isLocked: false };
}

export async function getApiConfigWithSources(): Promise<ApiConfigWithSources> {
	const dbSettings = await getAllAppSettings();
	const plexEnv = getPlexEnvConfig();
	const openaiEnv = getOpenAIEnvConfig();

	return {
		plex: {
			serverUrl: resolveConfigValue(dbSettings, AppSettingsKey.PLEX_SERVER_URL, plexEnv.serverUrl),
			token: resolveConfigValue(dbSettings, AppSettingsKey.PLEX_TOKEN, plexEnv.token)
		},
		openai: {
			apiKey: resolveConfigValue(dbSettings, AppSettingsKey.OPENAI_API_KEY, openaiEnv.apiKey),
			baseUrl: resolveConfigValue(
				dbSettings,
				AppSettingsKey.OPENAI_BASE_URL,
				openaiEnv.baseUrl,
				'https://api.openai.com/v1'
			),
			model: resolveConfigValue(
				dbSettings,
				AppSettingsKey.OPENAI_MODEL,
				openaiEnv.model,
				'gpt-5-mini'
			)
		}
	};
}

export function hasPlexEnvConfig(): boolean {
	// Uses isAuthoritativeEnvValue so a placeholder-only template copy is NOT
	// reported as env config: otherwise the onboarding Connect step flips into
	// the env-locked flow (ENV badge, no manual picker, forceManualSelection ->
	// 400) while getApiConfigWithSources resolves those placeholders to empty —
	// stranding the operator with no usable config and no UI escape (ISSUE-004).
	const { serverUrl, token } = getPlexEnvConfig();
	return isAuthoritativeEnvValue(serverUrl) || isAuthoritativeEnvValue(token);
}

export function hasOpenAIEnvConfig(): boolean {
	return Boolean(env.OPENAI_API_KEY || env.OPENAI_API_URL || env.OPENAI_MODEL);
}

export async function isPlexInsecureLocalHttpAllowed(): Promise<boolean> {
	if (envAllowsInsecureLocalPlexHttp()) return true;
	return (await getAppSetting(AppSettingsKey.PLEX_ALLOW_INSECURE_LOCAL_HTTP)) === 'true';
}

export interface PlexConfig {
	serverUrl: string;
	token: string;
}

/**
 * Get the merged Plex configuration (environment takes priority over database).
 * This should be used by all Plex-related services to ensure they use
 * settings configured via environment variables when available.
 */
export async function getPlexConfig(): Promise<PlexConfig> {
	const config = await getApiConfigWithSources();
	let serverUrl = '';
	if (config.plex.serverUrl.value) {
		try {
			serverUrl = normalizePlexServerUrl(config.plex.serverUrl.value, {
				allowInsecureLocalHttp: await isPlexInsecureLocalHttpAllowed()
			});
		} catch (err) {
			if (!(err instanceof CredentialedUrlError)) throw err;
		}
	}
	return {
		serverUrl,
		token: config.plex.token.value
	};
}

/** Check if Plex is configured (either via database or environment variables). */
export async function isPlexConfigured(): Promise<boolean> {
	const config = await getPlexConfig();
	return Boolean(config.serverUrl && config.token);
}

export interface CsrfConfigWithSource {
	origin: ConfigValue<string>;
}

export async function getCsrfConfigWithSource(): Promise<CsrfConfigWithSource> {
	const dbSettings = await getAllAppSettings();
	const envOrigin = env.ORIGIN ?? '';

	return {
		origin: resolveConfigValue(dbSettings, AppSettingsKey.CSRF_ORIGIN, envOrigin)
	};
}

export async function getCsrfOrigin(): Promise<string | null> {
	const config = await getCsrfConfigWithSource();
	return config.origin.value || null;
}

export interface TrustProxyConfigWithSource {
	trustProxy: ConfigValue<string>;
}

export async function getTrustProxyConfigWithSource(): Promise<TrustProxyConfigWithSource> {
	const dbSettings = await getAllAppSettings();
	// resolveConfigValue treats any non-empty envValue as "env-locked" and returns
	// it verbatim. getTrustProxy() / proxyHandle then compare with === 'true', so a
	// raw env like 'TRUE' or ' true ' would lock the UI on while runtime stays off.
	// Normalize to the canonical 'true'/'false' the rest of the pipeline expects.
	// An empty string means "not set" (no lock). Mirrors the case-insensitive
	// 'true' convention used by isLiveSyncEnabled() in sync/live-sync.ts.
	const rawEnv = (env.TRUST_PROXY ?? '').trim();
	const envValue = rawEnv === '' ? '' : rawEnv.toLowerCase() === 'true' ? 'true' : 'false';

	return {
		trustProxy: resolveConfigValue(dbSettings, AppSettingsKey.TRUST_PROXY, envValue, 'false')
	};
}

export async function getTrustProxy(): Promise<boolean> {
	const config = await getTrustProxyConfigWithSource();
	return config.trustProxy.value === 'true';
}

/**
 * Clear database settings that conflict with environment variables.
 * When ENV takes precedence, we auto-clear conflicting DB values to avoid confusion.
 * Returns the list of setting labels that were cleared.
 */
export async function clearConflictingDbSettings(): Promise<string[]> {
	const clearedSettings: string[] = [];
	const plexEnv = getPlexEnvConfig();
	const openaiEnv = getOpenAIEnvConfig();
	const csrfEnvOrigin = env.ORIGIN ?? '';
	const trustProxyEnv = (env.TRUST_PROXY ?? '').trim();

	const envToDbMapping: Array<{ envValue: string; dbKey: AppSettingsKeyType; label: string }> = [
		{
			envValue: plexEnv.serverUrl,
			dbKey: AppSettingsKey.PLEX_SERVER_URL,
			label: 'PLEX_SERVER_URL'
		},
		{ envValue: plexEnv.token, dbKey: AppSettingsKey.PLEX_TOKEN, label: 'PLEX_TOKEN' },
		{ envValue: openaiEnv.apiKey, dbKey: AppSettingsKey.OPENAI_API_KEY, label: 'OPENAI_API_KEY' },
		{
			envValue: openaiEnv.baseUrl,
			dbKey: AppSettingsKey.OPENAI_BASE_URL,
			label: 'OPENAI_BASE_URL'
		},
		{ envValue: openaiEnv.model, dbKey: AppSettingsKey.OPENAI_MODEL, label: 'OPENAI_MODEL' },
		{ envValue: csrfEnvOrigin, dbKey: AppSettingsKey.CSRF_ORIGIN, label: 'CSRF_ORIGIN' },
		{ envValue: trustProxyEnv, dbKey: AppSettingsKey.TRUST_PROXY, label: 'TRUST_PROXY' }
	];

	const dbSettings = await getAllAppSettings();

	for (const { envValue, dbKey, label } of envToDbMapping) {
		// Only an env value that resolveConfigValue would actually treat as
		// authoritative (non-empty AND not a placeholder sentinel) may clear a
		// conflicting DB row. Otherwise a shipped .env.example placeholder like
		// `http://localhost:32400` would delete a real admin-configured value and
		// resolveConfigValue would then fall through to the empty default.
		if (envValue && !isPlaceholderSentinel(envValue) && dbSettings[dbKey]) {
			await deleteAppSetting(dbKey);
			clearedSettings.push(label);
		}
	}

	// If either Plex config key is driven by an env var, the cached machineId may
	// have been derived from a different PLEX_SERVER_URL/PLEX_TOKEN (e.g. the env
	// changed between restarts). Drop the cache so the next call to
	// getConfiguredServerMachineId() re-fetches /identity against the current config.
	const plexServerUrlAuthoritative = isAuthoritativeEnvValue(plexEnv.serverUrl);
	const plexTokenAuthoritative = isAuthoritativeEnvValue(plexEnv.token);
	if (
		(plexServerUrlAuthoritative || plexTokenAuthoritative) &&
		dbSettings[AppSettingsKey.SERVER_MACHINE_ID]
	) {
		await deleteAppSetting(AppSettingsKey.SERVER_MACHINE_ID);
		clearedSettings.push('SERVER_MACHINE_ID');
	}

	return clearedSettings;
}

/**
 * Whether the landing page should offer the public username-lookup form.
 * Defaults to `false` (login-only) when no row exists, so a brand-new install is
 * never accidentally public before the admin makes the choice in onboarding.
 * Mirrors the `getGlobalAllowUserControl` boolean-row pattern.
 */
export async function getPublicLandingLookupEnabled(): Promise<boolean> {
	return (await getAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP)) === 'true';
}

export async function setPublicLandingLookupEnabled(enabled: boolean): Promise<void> {
	await setAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP, String(enabled));
}

/**
 * Atomically validates that the "Allow public Wrapped lookup" toggle has not
 * changed since `submittedVersion` and, if so, writes the value in a single
 * SQLite transaction. Returns `'conflict'` when the submitted version is stale.
 *
 * Mirrors `setServerWrappedSettingsAtomic`/`setUserDefaultsAtomic`: the inline
 * `inlineOccCheck` in the action is only a pre-write guard, so the same
 * second OCC check inside the transaction (plus `nextOccVersionDate` for
 * monotonic `updatedAt`) is required to close the TOCTOU window where two
 * concurrent admin submissions both pass the pre-check. The blind
 * `setPublicLandingLookupEnabled` upsert remains for the onboarding path,
 * which writes the value with no optimistic-concurrency version.
 */
export async function setPublicLandingLookupEnabledAtomic(opts: {
	enabled: boolean;
	submittedVersion: string;
}): Promise<'ok' | 'conflict'> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ updatedAt: appSettings.updatedAt })
			.from(appSettings)
			.where(inArray(appSettings.key, PUBLIC_LANDING_LOOKUP_SETTINGS_KEYS as unknown as string[]));

		// Treat a missing/blank submittedVersion as a stale tab regardless of row
		// count — defends against the fresh-install/all-cleared loophole.
		const submittedMs = opts.submittedVersion ? Date.parse(opts.submittedVersion) : Number.NaN;
		if (Number.isNaN(submittedMs)) {
			return 'conflict';
		}
		// Compute `maxMs` over the existing rows so the OCC check and the write
		// timestamp share the same DB floor. With no rows, `maxMs = 0` is fine —
		// `Date.now()` dominates inside `nextOccVersionDate`.
		let maxMs = 0;
		for (const row of rows) {
			const t = row.updatedAt.getTime();
			if (t > maxMs) maxMs = t;
		}
		if (rows.length > 0 && submittedMs < maxMs) {
			return 'conflict';
		}

		const now = nextOccVersionDate(maxMs);
		const value = String(opts.enabled);

		await tx
			.insert(appSettings)
			.values({ key: AppSettingsKey.PUBLIC_LANDING_LOOKUP, value, updatedAt: now })
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value, updatedAt: now }
			});

		return 'ok';
	});
}

/**
 * DB-idempotent backfill for `PUBLIC_LANDING_LOOKUP`. Seeds `'true'` for servers
 * that completed onboarding *before* this toggle existed, so upgrading never
 * silently flips a live public landing page to login-required. Correctness is
 * guaranteed by the DB row-absence check (safe across replicas/restarts); the
 * caller (`initializationHandle`) wraps this in a process-local "attempted" flag
 * purely as a hot-path optimisation — that flag is never the idempotency guard.
 *
 * Seeds ONLY when `ONBOARDING_COMPLETED === 'true'` AND no row exists:
 *   - a not-yet-onboarded install is left untouched (onboarding writes the
 *     toggle explicitly so the admin sees the choice);
 *   - an explicit `'true'`/`'false'` is never overwritten — the leading
 *     null-check skips the write, and `onConflictDoNothing` makes the insert a
 *     no-op under a concurrent first-request race.
 *
 * This is a *backfill*, not a schema migration: `app_settings` is a generic
 * key/value table, so no `db:generate` is required (per CLAUDE.md, the
 * "add a table/column" workflow does not apply to key/value rows).
 */
export async function ensurePublicLandingLookupDefault(): Promise<void> {
	const onboardingCompleted = await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED);
	if (onboardingCompleted !== 'true') return;

	const existing = await getAppSetting(AppSettingsKey.PUBLIC_LANDING_LOOKUP);
	if (existing !== null) return;

	const now = new Date();
	await db
		.insert(appSettings)
		.values({ key: AppSettingsKey.PUBLIC_LANDING_LOOKUP, value: 'true', updatedAt: now })
		.onConflictDoNothing({ target: appSettings.key });
}

export async function isCsrfWarningDismissed(): Promise<boolean> {
	const dismissed = await getAppSetting(AppSettingsKey.CSRF_WARNING_DISMISSED);
	return dismissed === 'true';
}

export async function dismissCsrfWarning(): Promise<void> {
	await setAppSetting(AppSettingsKey.CSRF_WARNING_DISMISSED, 'true');
}

export async function resetCsrfWarningDismissal(): Promise<void> {
	await deleteAppSetting(AppSettingsKey.CSRF_WARNING_DISMISSED);
}
