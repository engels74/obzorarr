import {
	UserStatsSchema,
	ServerStatsSchema,
	type UserStats,
	type ServerStats,
	type Stats,
	isUserStats
} from './types';

/**
 * Error thrown when stats parsing fails
 */
export class StatsParseError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'StatsParseError';
	}
}

/**
 * Serialize a UserStats or ServerStats object to a JSON string
 *
 * @param stats - The stats object to serialize
 * @returns JSON string representation
 */
export function serializeStats(stats: Stats): string {
	return JSON.stringify(stats);
}

/**
 * Parse and validate a JSON string as UserStats
 *
 * Uses Zod safeParse for validation as per bun-svelte-pro.md guidelines.
 *
 * @param json - The JSON string to parse
 * @returns Validated UserStats object
 * @throws StatsParseError if parsing or validation fails
 */
export function parseUserStats(json: string): UserStats {
	let parsed: unknown;

	try {
		parsed = JSON.parse(json);
	} catch (error) {
		throw new StatsParseError('Invalid JSON string', error);
	}

	const result = UserStatsSchema.safeParse(parsed);

	if (!result.success) {
		throw new StatsParseError(`Invalid UserStats: ${result.error.message}`, result.error);
	}

	return result.data;
}

/**
 * Parse and validate a JSON string as ServerStats
 *
 * Uses Zod safeParse for validation as per bun-svelte-pro.md guidelines.
 *
 * @param json - The JSON string to parse
 * @returns Validated ServerStats object
 * @throws StatsParseError if parsing or validation fails
 */
export function parseServerStats(json: string): ServerStats {
	let parsed: unknown;

	try {
		parsed = JSON.parse(json);
	} catch (error) {
		throw new StatsParseError('Invalid JSON string', error);
	}

	const result = ServerStatsSchema.safeParse(parsed);

	if (!result.success) {
		throw new StatsParseError(`Invalid ServerStats: ${result.error.message}`, result.error);
	}

	return result.data;
}

/**
 * Parse and validate a JSON string as either UserStats or ServerStats
 *
 * Automatically detects the stats type based on presence of discriminating fields.
 *
 * @param json - The JSON string to parse
 * @returns Validated Stats object (UserStats or ServerStats)
 * @throws StatsParseError if parsing or validation fails
 */
export function parseStats(json: string): Stats {
	let parsed: unknown;

	try {
		parsed = JSON.parse(json);
	} catch (error) {
		throw new StatsParseError('Invalid JSON string', error);
	}

	// Try to determine the type based on discriminating fields
	if (typeof parsed === 'object' && parsed !== null) {
		if ('userId' in parsed) {
			const result = UserStatsSchema.safeParse(parsed);
			if (!result.success) {
				throw new StatsParseError(`Invalid UserStats: ${result.error.message}`, result.error);
			}
			return result.data;
		}

		if ('totalUsers' in parsed) {
			const result = ServerStatsSchema.safeParse(parsed);
			if (!result.success) {
				throw new StatsParseError(`Invalid ServerStats: ${result.error.message}`, result.error);
			}
			return result.data;
		}
	}

	throw new StatsParseError('Unable to determine stats type: missing userId or totalUsers field');
}

/**
 * Serialize stats to JSON and parse it back, validating round-trip
 *
 * This is primarily used for testing the round-trip property.
 *
 * @param stats - The stats object to round-trip
 * @returns The parsed stats object after round-trip
 */
export function roundTripStats(stats: Stats): Stats {
	const json = serializeStats(stats);
	if (isUserStats(stats)) {
		return parseUserStats(json);
	}
	return parseServerStats(json);
}
