import type { RequestHandler } from './$types';
import { getLogsAfterId, getLatestLogId, type LogEntry } from '$lib/server/logging';

const POLL_INTERVAL_MS = 1000;

export const GET: RequestHandler = async ({ request }) => {
	const url = new URL(request.url);
	const initialCursor = url.searchParams.get('cursor');
	let lastId = initialCursor ? parseInt(initialCursor, 10) : await getLatestLogId();

	const stream = new ReadableStream({
		async start(controller) {
			controller.enqueue(formatSSE({ type: 'connected', lastId }));

			const intervalId = setInterval(async () => {
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
					}
				} catch (error) {
					controller.enqueue(
						formatSSE({
							type: 'error',
							message: 'Failed to fetch logs'
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
	| { type: 'connected'; lastId: number }
	| { type: 'log'; log: LogEntry }
	| { type: 'error'; message: string };
