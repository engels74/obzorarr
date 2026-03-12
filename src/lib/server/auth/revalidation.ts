import { logger } from '$lib/server/logging';
import { verifyServerMembership } from './membership';
import { type MembershipResult, PlexAuthApiError } from './types';

const REVALIDATION_INTERVAL_MS = 15 * 60 * 1000;
const GRACE_PERIOD_MS = 60 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 4;

interface RevalidationEntry {
	lastChecked: number;
	consecutiveFailures: number;
	firstFailureAt: number | null;
	lastResult: MembershipResult | null;
}

export type RevalidationResult =
	| { status: 'valid'; membership: MembershipResult }
	| { status: 'revoked'; reason: string }
	| { status: 'error_within_grace' }
	| { status: 'error_grace_expired' };

const revalidationCache = new Map<string, RevalidationEntry>();
const inFlightRevalidations = new Map<string, Promise<RevalidationResult>>();

export function needsRevalidation(sessionId: string): boolean {
	const entry = revalidationCache.get(sessionId);
	if (!entry) return true;
	return Date.now() - entry.lastChecked >= REVALIDATION_INTERVAL_MS;
}

export async function revalidateMembership(
	sessionId: string,
	plexToken: string
): Promise<RevalidationResult> {
	const existing = inFlightRevalidations.get(sessionId);
	if (existing) return existing;

	const promise = doRevalidation(sessionId, plexToken);
	inFlightRevalidations.set(sessionId, promise);

	try {
		return await promise;
	} finally {
		inFlightRevalidations.delete(sessionId);
	}
}

async function doRevalidation(sessionId: string, plexToken: string): Promise<RevalidationResult> {
	const entry = revalidationCache.get(sessionId) ?? {
		lastChecked: 0,
		consecutiveFailures: 0,
		firstFailureAt: null,
		lastResult: null
	};

	try {
		const membership = await verifyServerMembership(plexToken);

		if (!membership.isMember) {
			revalidationCache.set(sessionId, {
				...entry,
				lastChecked: Date.now(),
				consecutiveFailures: 0,
				firstFailureAt: null,
				lastResult: membership
			});
			return { status: 'revoked', reason: 'User is no longer a member of the Plex server' };
		}

		revalidationCache.set(sessionId, {
			lastChecked: Date.now(),
			consecutiveFailures: 0,
			firstFailureAt: null,
			lastResult: membership
		});
		return { status: 'valid', membership };
	} catch (error) {
		const now = Date.now();
		const isAuthFailure = error instanceof PlexAuthApiError && error.statusCode === 401;

		if (isAuthFailure) {
			revalidationCache.set(sessionId, {
				...entry,
				lastChecked: now,
				consecutiveFailures: 0,
				firstFailureAt: null,
				lastResult: null
			});
			return { status: 'revoked', reason: 'Plex token is no longer valid (401)' };
		}

		const consecutiveFailures = entry.consecutiveFailures + 1;
		const firstFailureAt = entry.firstFailureAt ?? now;

		revalidationCache.set(sessionId, {
			...entry,
			lastChecked: now,
			consecutiveFailures,
			firstFailureAt
		});

		logger.warn(
			`Revalidation failed for session ${sessionId.slice(0, 8)}… (attempt ${consecutiveFailures}): ${error instanceof Error ? error.message : String(error)}`,
			'Revalidation'
		);

		if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
			return { status: 'error_grace_expired' };
		}

		if (now - firstFailureAt >= GRACE_PERIOD_MS) {
			return { status: 'error_grace_expired' };
		}

		return { status: 'error_within_grace' };
	}
}

export function clearRevalidationEntry(sessionId: string): void {
	revalidationCache.delete(sessionId);
}
