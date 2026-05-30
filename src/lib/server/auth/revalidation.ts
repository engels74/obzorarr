import { logger } from '$lib/server/logging';
import { requiresOnboarding } from '$lib/server/onboarding';
import { isTransientIdentityError, verifyServerMembership } from './membership';
import { type MembershipResult, PlexAuthApiError } from './types';

const REVALIDATION_INTERVAL_MS = 15 * 60 * 1000;
const GRACE_PERIOD_MS = 60 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 4;

interface RevalidationEntry {
	lastChecked: number;
	consecutiveFailures: number;
	firstFailureAt: number | null;
	// Diagnostic record of the most recent membership probe. MUST NOT feed any
	// authorization decision: isAdmin is sourced from the session/DB row, and a
	// fresh live probe (the 'valid' branch) is the only thing allowed to change
	// it. Trusting this cached value for authz would let a stale/seeded result
	// grant access — keep it write-only.
	lastResult: MembershipResult | null;
}

export type RevalidationResult =
	| { status: 'valid'; membership: MembershipResult }
	| { status: 'revoked'; reason: string }
	| { status: 'error_within_grace' }
	| { status: 'error_grace_expired' };

const revalidationCache = new Map<string, RevalidationEntry>();
const inFlightRevalidations = new Map<string, Promise<RevalidationResult>>();

export async function shouldRevalidateSession(): Promise<boolean> {
	try {
		return !(await requiresOnboarding());
	} catch (error) {
		logger.warn(
			`Failed to check onboarding status for revalidation; skipping revalidation: ${error instanceof Error ? error.message : String(error)}`,
			'Revalidation'
		);
		return false;
	}
}

export function needsRevalidation(sessionId: string): boolean {
	const entry = revalidationCache.get(sessionId);
	if (!entry) return true;
	return Date.now() - entry.lastChecked >= REVALIDATION_INTERVAL_MS;
}

/**
 * Prime the revalidation cache for a session whose membership was just verified
 * (e.g. at login/session creation). Marks the session as freshly checked so
 * `needsRevalidation` returns false for the next `REVALIDATION_INTERVAL_MS`,
 * avoiding a redundant — and potentially flaky — immediate re-probe on the very
 * first request after login. Resets the failure counters since the live
 * verification just succeeded.
 */
export function markSessionRevalidated(sessionId: string, membership: MembershipResult): void {
	revalidationCache.set(sessionId, {
		lastChecked: Date.now(),
		consecutiveFailures: 0,
		firstFailureAt: null,
		lastResult: membership
	});
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
			// A transient reachability failure (timeout, 5xx, connection error) means
			// the configured server could not be probed this round — NOT that the user
			// lost membership. Route it through the same grace machinery as a thrown
			// transient error so a single blip cannot revoke a valid session. Genuine
			// non-membership (`not_in_resources`) still revokes immediately below, and
			// invalid tokens (401) revoke via the catch block.
			if (
				membership.reason === 'not_reachable' &&
				isTransientIdentityError(membership.identityErrorReason)
			) {
				const now = Date.now();
				const consecutiveFailures = entry.consecutiveFailures + 1;
				const firstFailureAt = entry.firstFailureAt ?? now;

				revalidationCache.set(sessionId, {
					...entry,
					lastChecked: now,
					consecutiveFailures,
					firstFailureAt
				});

				logger.warn(
					`Revalidation reachability blip for session ${sessionId.slice(0, 8)}… (attempt ${consecutiveFailures}): ${membership.identityErrorReason ?? 'not_reachable'}`,
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
