import { requireAdmin } from '$lib/server/auth/guards';
import { getSyncProgress, type LiveSyncProgress } from '$lib/server/sync/progress';
import type { RequestHandler } from './$types';

const POLL_INTERVAL_MS = 500;

export const GET: RequestHandler = async ({ locals, request }) => {
	requireAdmin(locals);

	const stream = new ReadableStream({
		async start(controller) {
			const initialProgress = getSyncProgress();
			controller.enqueue(
				formatSSE({
					type: 'connected',
					progress: initialProgress
				})
			);

			let lastProgress: LiveSyncProgress | null = initialProgress;
			let terminalEventSent = false;
			const intervalId = setInterval(() => {
				try {
					const currentProgress = getSyncProgress();

					if (currentProgress) {
						const hasChanged =
							!lastProgress ||
							currentProgress.recordsProcessed !== lastProgress.recordsProcessed ||
							currentProgress.status !== lastProgress.status ||
							currentProgress.phase !== lastProgress.phase ||
							currentProgress.enrichmentProcessed !== lastProgress.enrichmentProcessed ||
							currentProgress.enrichmentTotal !== lastProgress.enrichmentTotal;

						if (hasChanged) {
							controller.enqueue(
								formatSSE({
									type: 'progress',
									progress: currentProgress
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
									progress: currentProgress
								})
							);
							terminalEventSent = true;
						}
					} else if (lastProgress !== null) {
						controller.enqueue(formatSSE({ type: 'idle' }));
						lastProgress = null;
						terminalEventSent = false;
					}
				} catch (_error) {
					controller.enqueue(
						formatSSE({
							type: 'error',
							message: 'Failed to fetch sync progress'
						})
					);
				}
			}, POLL_INTERVAL_MS);

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

function formatSSE(data: SSEEvent): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}

type SSEEvent =
	| { type: 'connected'; progress: LiveSyncProgress | null }
	| { type: 'progress'; progress: LiveSyncProgress }
	| { type: 'completed'; progress: LiveSyncProgress }
	| { type: 'failed'; progress: LiveSyncProgress }
	| { type: 'cancelled'; progress: LiveSyncProgress }
	| { type: 'idle' }
	| { type: 'error'; message: string };
