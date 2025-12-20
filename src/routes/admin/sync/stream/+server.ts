import type { RequestHandler } from './$types';
import { getSyncProgress, type LiveSyncProgress } from '$lib/server/sync/progress';

/**
 * SSE Endpoint for Real-Time Sync Progress Streaming
 *
 * Streams sync progress to connected clients using Server-Sent Events.
 * Polls the in-memory progress store every 500ms.
 *
 * Authorization is handled by hooks.server.ts (requires admin).
 */

const POLL_INTERVAL_MS = 500;

export const GET: RequestHandler = async ({ request }) => {
	// Create a readable stream for SSE
	const stream = new ReadableStream({
		async start(controller) {
			// Send initial connection event with current progress
			const initialProgress = getSyncProgress();
			controller.enqueue(
				formatSSE({
					type: 'connected',
					progress: initialProgress
				})
			);

			// Poll for progress updates
			let lastProgress: LiveSyncProgress | null = initialProgress;
			let terminalEventSent = false; // Track if terminal event was already sent
			const intervalId = setInterval(() => {
				try {
					const currentProgress = getSyncProgress();

					// Always send updates while running, or when status changes
					if (currentProgress) {
						const hasChanged =
							!lastProgress ||
							currentProgress.recordsProcessed !== lastProgress.recordsProcessed ||
							currentProgress.status !== lastProgress.status;

						if (hasChanged) {
							controller.enqueue(
								formatSSE({
									type: 'progress',
									progress: currentProgress
								})
							);
							lastProgress = { ...currentProgress };
						}

						// Send completion events (only once per sync)
						if (
							!terminalEventSent &&
							(currentProgress.status === 'completed' ||
								currentProgress.status === 'failed' ||
								currentProgress.status === 'cancelled')
						) {
							controller.enqueue(
								formatSSE({
									type: currentProgress.status,
									progress: currentProgress
								})
							);
							terminalEventSent = true;
							// Client should disconnect after receiving completion event
						}
					} else if (lastProgress !== null) {
						// Progress was cleared (sync ended)
						controller.enqueue(formatSSE({ type: 'idle' }));
						lastProgress = null;
						terminalEventSent = false; // Reset for next sync
					}
				} catch (error) {
					// Send error event but keep connection open
					controller.enqueue(
						formatSSE({
							type: 'error',
							message: 'Failed to fetch sync progress'
						})
					);
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
 * Format data as SSE event
 */
function formatSSE(data: SSEEvent): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * SSE event types
 */
type SSEEvent =
	| { type: 'connected'; progress: LiveSyncProgress | null }
	| { type: 'progress'; progress: LiveSyncProgress }
	| { type: 'completed'; progress: LiveSyncProgress }
	| { type: 'failed'; progress: LiveSyncProgress }
	| { type: 'cancelled'; progress: LiveSyncProgress }
	| { type: 'idle' }
	| { type: 'error'; message: string };
