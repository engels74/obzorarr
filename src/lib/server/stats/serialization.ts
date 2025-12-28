import {
	UserStatsSchema,
	ServerStatsSchema,
	type UserStats,
	type ServerStats,
	type Stats,
	isUserStats
} from './types';

export class StatsParseError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'StatsParseError';
	}
}

export function serializeStats(stats: Stats): string {
	return JSON.stringify(stats);
}

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

export function roundTripStats(stats: Stats): Stats {
	const json = serializeStats(stats);
	if (isUserStats(stats)) {
		return parseUserStats(json);
	}
	return parseServerStats(json);
}
