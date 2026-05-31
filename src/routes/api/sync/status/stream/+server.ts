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
 * In-flight transition (G2): an anonymous stream opened during onboarding that
 * is still open when onboarding completes is left to drain naturally. The
 * onboarding wizard navigates away on completion, which drops the client
 * connection and triggers the `request.signal` abort handler. No additional
 * close-on-completion logic is needed.
 */

const POLL_INTERVAL_ACTIVE_MS = 500;
const POLL_INTERVAL_IDLE_MS = 2000;

export const GET: RequestHandler = async ({ request, locals }) => {
	// Gate: allow anonymous access only while onboarding is incomplete.
	// Once onboarding is done, a valid session is required.
	const onboardingPending = await requiresOnboarding();
	if (!onboardingPending && !locals.user) {
		return new Response(JSON.stringify({ message: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	}
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

			const poll = () => {
				try {
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
					// Silently ignore errors
				}
			};

			intervalId = setInterval(poll, currentInterval);

			request.signal.addEventListener('abort', () => {
				clearInterval(intervalId);
				controller.close();
			});
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
