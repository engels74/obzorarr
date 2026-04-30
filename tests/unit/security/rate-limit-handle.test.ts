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

	it('allows up to 10 POST username lookups and blocks the 11th with Retry-After', async () => {
		const statuses: number[] = [];
		let blockedResponse: Response | null = null;

		for (let i = 0; i < 11; i++) {
			const res = await invoke(makeEvent('POST', 'https://example.com/'));
			statuses.push(res.status);
			blockedResponse = res;
		}

		expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
		expect(statuses[10]).toBe(429);
		expect(blockedResponse?.headers.get('Retry-After')).toBeTruthy();
	});
});
