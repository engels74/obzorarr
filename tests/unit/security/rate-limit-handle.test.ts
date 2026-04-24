import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { clearRateLimitStore } from '$lib/server/ratelimit';
import { rateLimitHandle } from '$lib/server/security/rate-limit-handle';

function makeEvent(method: string, url: string, ip = '198.51.100.10') {
	const request = new Request(url, { method });
	return {
		request,
		url: new URL(url),
		getClientAddress: () => ip
	} as unknown as Parameters<typeof rateLimitHandle>[0]['event'];
}

async function invoke(event: ReturnType<typeof makeEvent>): Promise<Response> {
	const sentinel = new Response('resolved', { status: 200 });
	const resolve = mock(async () => sentinel);
	const result = await rateLimitHandle({
		event,
		resolve
	} as unknown as Parameters<typeof rateLimitHandle>[0]);
	return result as Response;
}

describe('rateLimitHandle landing page bucket', () => {
	beforeEach(() => {
		clearRateLimitStore();
	});

	it('allows up to 30 GET requests to / within the window and blocks the 31st', async () => {
		const statuses: number[] = [];
		for (let i = 0; i < 31; i++) {
			const res = await invoke(makeEvent('GET', 'https://example.com/'));
			statuses.push(res.status);
		}

		expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
		expect(statuses[30]).toBe(429);
	});

	it('does not throttle POST requests to / under the landingPage bucket', async () => {
		// POST / is governed by the default bucket (60/min). Issue 31 GETs to exhaust
		// the landingPage bucket, then POST with the same IP — it should still be 200.
		for (let i = 0; i < 30; i++) {
			await invoke(makeEvent('GET', 'https://example.com/'));
		}

		const res = await invoke(makeEvent('POST', 'https://example.com/'));
		expect(res.status).toBe(200);
	});
});
