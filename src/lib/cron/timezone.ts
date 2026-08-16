export const TIMEZONE_REQUIRED_MESSAGE = 'Timezone is required';
export const TIMEZONE_UNKNOWN_MESSAGE =
	'Unknown timezone. Use an IANA name such as Europe/Copenhagen';

/**
 * Zone used when neither the `TZ` environment variable nor the stored setting
 * resolves to a real zone. Every scheduler shares it, so an unconfigured
 * instance keeps the historical UTC behaviour instead of silently drifting with
 * the host clock.
 */
export const DEFAULT_TIMEZONE = 'UTC';

let canonicalZones: Map<string, string> | null = null;

/**
 * Lowercased identifier -> canonical IANA identifier, built once per process
 * (the runtime's zone table cannot change while it runs).
 *
 * Keeps timezone validation app-owned for the same reason `validation.ts` keeps
 * cron validation app-owned: croner throws a generic error for an unknown zone,
 * so values are canonicalized and rejected here with stable messages before any
 * scheduler is constructed. `Intl.DateTimeFormat` is deliberately NOT used as
 * the predicate — it also accepts fixed offsets such as `+02:00`, which have no
 * DST rules and would make a "midnight local time" schedule wrong for half the
 * year.
 */
function zoneIndex(): Map<string, string> {
	if (canonicalZones) return canonicalZones;
	const index = new Map<string, string>();
	// UTC is seeded explicitly: it is the app default and must resolve even if a
	// runtime ever omits it from the supported-values list.
	index.set(DEFAULT_TIMEZONE.toLowerCase(), DEFAULT_TIMEZONE);
	for (const zone of Intl.supportedValuesOf('timeZone')) {
		index.set(zone.toLowerCase(), zone);
	}
	canonicalZones = index;
	return index;
}

/** Every zone the runtime accepts, sorted for the admin picker. */
export function listSupportedTimezones(): string[] {
	return [...zoneIndex().values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Canonical IANA identifier for `value`, or `null` when the runtime does not
 * know the zone. Case-insensitive, so a `TZ=europe/copenhagen` container env
 * still resolves.
 */
export function normalizeTimezone(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	return zoneIndex().get(trimmed.toLowerCase()) ?? null;
}

export function isSupportedTimezone(value: string): boolean {
	return normalizeTimezone(value) !== null;
}

/** Mirrors `validateCronExpression`: returns `''` when the value is usable. */
export function validateTimezone(value: string): string {
	if (!value.trim()) return TIMEZONE_REQUIRED_MESSAGE;
	return isSupportedTimezone(value) ? '' : TIMEZONE_UNKNOWN_MESSAGE;
}
