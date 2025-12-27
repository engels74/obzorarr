import type { RequestHandler } from './$types';
import { getSyncProgress, type LiveSyncProgress } from '$lib/server/sync/progress';

/**
 * Public SSE Endpoint for Sync Status Streaming
 *
 * Streams simplified sync status to connected clients using Server-Sent Events.
 * This endpoint is public (no auth required) for use on wrapped pages.
 *
 * Polls the in-memory progress store every 500ms.
 *
 * @module api/sync/status/stream
 */

const POLL_INTERVAL_MS = 500;

export const GET: RequestHandler = async ({ request }) => {
	// Create a readable stream for SSE
	const stream = new ReadableStream({
		async start(controller) {
			// Send initial connection event with current status
			const initialProgress = getSyncProgress();
			controller.enqueue(
				formatSSE({
					type: 'connected',
					inProgress: initialProgress?.status === 'running',
					progress: simplifyProgress(initialProgress)
				})
			);

			// Poll for status updates
			let lastProgress: LiveSyncProgress | null = initialProgress;
			let terminalEventSent = false;
			const intervalId = setInterval(() => {
				try {
					const currentProgress = getSyncProgress();

					// Send update when status changes
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

						// Send terminal event (only once) with proper status
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
						// Progress was cleared (sync ended)
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
					// Silently ignore errors, keep connection open
				}
			}, POLL_INTERVAL_MS);

			// Handle client disconnect
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

/**
 * Simplify progress data for public consumption
 */
function simplifyProgress(progress: LiveSyncProgress | null): SimpleProgress | null {
	if (!progress || progress.status !== 'running') return null;

	return {
		phase: progress.phase ?? 'fetching',
		recordsProcessed: progress.recordsProcessed,
		recordsInserted: progress.recordsInserted,
		enrichmentTotal: progress.enrichmentTotal,
		enrichmentProcessed: progress.enrichmentProcessed
	};
}

/**
 * Format data as SSE event
 */
function formatSSE(data: SSEEvent): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Simplified progress for public display
 * Compatible with SyncIndicator and onboarding sync page requirements
 */
interface SimpleProgress {
	phase: 'fetching' | 'enriching';
	recordsProcessed: number;
	recordsInserted: number;
	enrichmentTotal?: number;
	enrichmentProcessed?: number;
}

/**
 * SSE event types
 */
type SSEEvent =
	| { type: 'connected'; inProgress: boolean; progress: SimpleProgress | null }
	| { type: 'update'; inProgress: boolean; progress: SimpleProgress | null }
	| { type: 'completed'; inProgress: false; progress: null }
	| { type: 'failed'; inProgress: false; progress: null }
	| { type: 'cancelled'; inProgress: false; progress: null }
	| { type: 'idle'; inProgress: false; progress: null };
