import type { RequestHandler } from './$types';
import { getSyncProgress, type LiveSyncProgress } from '$lib/server/sync/progress';

const POLL_INTERVAL_ACTIVE_MS = 500;
const POLL_INTERVAL_IDLE_MS = 2000;

export const GET: RequestHandler = async ({ request }) => {
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

function simplifyProgress(progress: LiveSyncProgress | null): SimpleProgress | null {
	if (!progress || (progress.status !== 'running' && progress.status !== 'completed')) return null;

	return {
		phase: progress.phase ?? 'fetching',
		recordsProcessed: progress.recordsProcessed,
		recordsInserted: progress.recordsInserted,
		enrichmentTotal: progress.enrichmentTotal,
		enrichmentProcessed: progress.enrichmentProcessed
	};
}

function formatSSE(data: SSEEvent): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}

interface SimpleProgress {
	phase: 'fetching' | 'enriching';
	recordsProcessed: number;
	recordsInserted: number;
	enrichmentTotal?: number;
	enrichmentProcessed?: number;
}

type SSEEvent =
	| { type: 'connected'; inProgress: boolean; progress: SimpleProgress | null }
	| { type: 'update'; inProgress: boolean; progress: SimpleProgress | null }
	| { type: 'completed'; inProgress: false; progress: null }
	| { type: 'failed'; inProgress: false; progress: null }
	| { type: 'cancelled'; inProgress: false; progress: null }
	| { type: 'idle'; inProgress: false; progress: null };
