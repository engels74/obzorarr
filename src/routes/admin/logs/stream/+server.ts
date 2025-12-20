import type { RequestHandler } from './$types';
import { getLogsAfterId, getLatestLogId, type LogEntry } from '$lib/server/logging';

/**
 * SSE Endpoint for Real-Time Log Streaming
 *
 * Streams new log entries to connected clients using Server-Sent Events.
 * Polls the database every second for new logs.
 *
 * Authorization is handled by hooks.server.ts (requires admin).
 */

const POLL_INTERVAL_MS = 1000;

export const GET: RequestHandler = async ({ request }) => {
	// Get the initial cursor from query params (optional)
	const url = new URL(request.url);
	const initialCursor = url.searchParams.get('cursor');
	let lastId = initialCursor ? parseInt(initialCursor, 10) : await getLatestLogId();

	// Create a readable stream for SSE
	const stream = new ReadableStream({
		async start(controller) {
			// Send initial connection event
			controller.enqueue(formatSSE({ type: 'connected', lastId }));

			// Poll for new logs
			const intervalId = setInterval(async () => {
				try {
					const newLogs = await getLogsAfterId(lastId);

					if (newLogs.length > 0) {
						// Send each log as a separate event
						for (const log of newLogs) {
							controller.enqueue(formatSSE({ type: 'log', log }));
						}

						// Update cursor to the last log's ID
						const lastLog = newLogs[newLogs.length - 1];
						if (lastLog) {
							lastId = lastLog.id;
						}
					}
				} catch (error) {
					// Send error event but keep connection open
					controller.enqueue(
						formatSSE({
							type: 'error',
							message: 'Failed to fetch logs'
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
	| { type: 'connected'; lastId: number }
	| { type: 'log'; log: LogEntry }
	| { type: 'error'; message: string };
