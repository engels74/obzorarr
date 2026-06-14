import { requiresOnboarding } from '$lib/server/onboarding';
import { getSyncProgress, type LiveSyncProgress } from '$lib/server/sync/progress';
import type { SyncStatusStreamEvent, SyncStatusStreamProgress } from '$lib/sync/types';
import type { RequestHandler } from './$types';

/**
 * SSE stream of sync status.
 *
 * CONDITIONALLY PUBLIC: anonymous access is allowed only while onboarding is
 * incomplete (i.e. before any user account exists), so the onboarding wizard
 * can poll sync progress. Once onboarding is complete, a valid authenticated
 * session is required; anonymous requests receive 401.
 *
 * `onboardingHandle` in `src/hooks.server.ts` skips `/api/sync` from its
 * onboarding-redirect guard so this endpoint remains reachable during setup.
 * `authHandle` still runs for every request, so `event.locals.user` is
 * populated whenever a valid session cookie is present.
 *
 * Exposed fields per frame: event `type` ∈ {'connected','update','completed',
 * 'failed','cancelled','idle'}, boolean `inProgress`, and (for connected/update)
 * `progress` with string `phase` ∈ {'fetching','enriching'} plus small integer
 * counters (recordsProcessed, recordsInserted, enrichmentTotal, enrichmentProcessed).
 * No titles, usernames, tokens, account IDs, or error bodies.
 *
 * `simplifyProgress()` enforces the payload shape; do not widen it without
 * re-evaluating PII exposure.
 *
 * Rate-limited by the `api` bucket in `rateLimitHandle`.
 *
 * In-flight transition (G2): the connection-open gate is re-validated on every
 * poll tick. An anonymous stream that was opened during onboarding is closed as
 * soon as onboarding completes, so an adversarial client that does NOT navigate
 * away (e.g. a raw `EventSource`/`curl` left open) cannot keep receiving frames
 * past the auth gate. Authenticated streams and still-onboarding anonymous
 * streams are unaffected.
 */

const POLL_INTERVAL_ACTIVE_MS = 500;
const POLL_INTERVAL_IDLE_MS = 2000;

export const GET: RequestHandler = async ({ request, locals }) => {
	// Gate: allow anonymous access only while onboarding is incomplete.
	// ISSUE-008 — denial contract: this programmatic endpoint returns 401 JSON,
	// whereas admin stream routes are denied with a 303 by `authorizationHandle`
	// in hooks.server.ts (see the rationale there). The split is intentional and
	// cosmetic for SSE consumers — a browser `EventSource` cannot read either a
	// 401 body or follow a 303, so both surface only as `onerror`; it is observable
	// only to curl/fetch-style clients, for which a 401 status is the cleaner
	// contract on an API surface.
	const onboardingPending = await requiresOnboarding();
	if (!onboardingPending && !locals.user) {
		return new Response(JSON.stringify({ message: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	}
	// Capture the auth state at connection open. The poll loop re-validates
	// against this on every tick so an anonymous stream opened during onboarding
	// is terminated the moment onboarding completes (see the G2 note above).
	const capturedUser = locals.user ?? null;

	const stream = new ReadableStream({
		async start(controller) {
			const initialProgress = getSyncProgress();
			controller.enqueue(
				formatSSE({
					type: 'connected',
					inProgress: initialProgress?.status === 'running',
					progress: simplifyProgress(initialProgress)
				})
			);

			let lastProgress: LiveSyncProgress | null = initialProgress;
			let terminalEventSent = false;
			let currentInterval =
				initialProgress?.status === 'running' ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS;
			let intervalId: ReturnType<typeof setInterval>;
			let closed = false;
			// Guards against overlapping ticks: the auth re-check awaits a DB read,
			// so a slow read must not let the next interval fire reentrantly.
			let polling = false;

			const stop = () => {
				if (closed) return;
				closed = true;
				clearInterval(intervalId);
				controller.close();
			};

			const poll = async () => {
				if (closed || polling) return;
				polling = true;
				try {
					// Anonymous streams are allowed only while onboarding is incomplete; once
					// setup finishes, the unauthenticated connection must be closed.
					if (!capturedUser) {
						const onboardingStillPending = await requiresOnboarding();
						if (!onboardingStillPending) {
							stop();
							return;
						}
					}

					const currentProgress = getSyncProgress();
					const isActive = currentProgress?.status === 'running';
					const newInterval = isActive ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS;

					if (newInterval !== currentInterval) {
						currentInterval = newInterval;
						clearInterval(intervalId);
						intervalId = setInterval(poll, currentInterval);
					}

					if (currentProgress) {
						const hasChanged =
							!lastProgress ||
							currentProgress.status !== lastProgress.status ||
							currentProgress.phase !== lastProgress.phase ||
							currentProgress.recordsProcessed !== lastProgress.recordsProcessed ||
							currentProgress.enrichmentProcessed !== lastProgress.enrichmentProcessed;

						if (hasChanged) {
							controller.enqueue(
								formatSSE({
									type: 'update',
									inProgress: currentProgress.status === 'running',
									progress: simplifyProgress(currentProgress)
								})
							);
							lastProgress = { ...currentProgress };
						}

						if (
							!terminalEventSent &&
							(currentProgress.status === 'completed' ||
								currentProgress.status === 'failed' ||
								currentProgress.status === 'cancelled')
						) {
							controller.enqueue(
								formatSSE({
									type: currentProgress.status,
									inProgress: false,
									progress: null
								})
							);
							terminalEventSent = true;
						}
					} else if (lastProgress !== null) {
						controller.enqueue(
							formatSSE({
								type: 'idle',
								inProgress: false,
								progress: null
							})
						);
						lastProgress = null;
						terminalEventSent = false;
					}
				} catch {
					// Keep the stream best-effort: transient onboarding DB checks,
					// progress reads, or client disconnects should not leak error bodies
					// or leave overlapping polls armed.
				} finally {
					polling = false;
				}
			};

			intervalId = setInterval(poll, currentInterval);

			request.signal.addEventListener('abort', stop);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};

function simplifyProgress(progress: LiveSyncProgress | null): SyncStatusStreamProgress | null {
	if (!progress || (progress.status !== 'running' && progress.status !== 'completed')) return null;

	return {
		phase: progress.phase ?? 'fetching',
		recordsProcessed: progress.recordsProcessed,
		recordsInserted: progress.recordsInserted,
		enrichmentTotal: progress.enrichmentTotal,
		enrichmentProcessed: progress.enrichmentProcessed
	};
}

function formatSSE(data: SyncStatusStreamEvent): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}
