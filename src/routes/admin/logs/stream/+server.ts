import type { RequestHandler } from './$types';
import { getLogsAfterId, getLatestLogId, type LogEntry } from '$lib/server/logging';

const POLL_INTERVAL_BASE_MS = 1000;
const POLL_INTERVAL_MAX_MS = 5000;
const BACKOFF_MULTIPLIER = 1.5;

export const GET: RequestHandler = async ({ request }) => {
	const url = new URL(request.url);
	const initialCursor = url.searchParams.get('cursor');
	let lastId = initialCursor ? parseInt(initialCursor, 10) : await getLatestLogId();

	const stream = new ReadableStream({
		async start(controller) {
			controller.enqueue(formatSSE({ type: 'connected', lastId }));

			let currentInterval = POLL_INTERVAL_BASE_MS;
			let intervalId: ReturnType<typeof setInterval>;

			const poll = async () => {
				try {
					const newLogs = await getLogsAfterId(lastId);

					if (newLogs.length > 0) {
						for (const log of newLogs) {
							controller.enqueue(formatSSE({ type: 'log', log }));
						}

						const lastLog = newLogs[newLogs.length - 1];
						if (lastLog) {
							lastId = lastLog.id;
						}

						if (currentInterval !== POLL_INTERVAL_BASE_MS) {
							currentInterval = POLL_INTERVAL_BASE_MS;
							clearInterval(intervalId);
							intervalId = setInterval(poll, currentInterval);
						}
					} else {
						const newInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, POLL_INTERVAL_MAX_MS);
						if (newInterval !== currentInterval) {
							currentInterval = newInterval;
							clearInterval(intervalId);
							intervalId = setInterval(poll, currentInterval);
						}
					}
				} catch (error) {
					controller.enqueue(
						formatSSE({
							type: 'error',
							message: 'Failed to fetch logs'
						})
					);
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

function formatSSE(data: SSEEvent): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}

type SSEEvent =
	| { type: 'connected'; lastId: number }
	| { type: 'log'; log: LogEntry }
	| { type: 'error'; message: string };
