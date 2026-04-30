import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { parse } from 'devalue';
import { clearRateLimitStore } from '$lib/server/ratelimit';
import { rateLimitHandle } from '$lib/server/security/rate-limit-handle';

function makeEvent(method: string, url: string, ip = '198.51.100.10', init: RequestInit = {}) {
	const request = new Request(url, { ...init, method });
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

	it('returns a SvelteKit action failure for enhanced POST username lookups', async () => {
		let blockedResponse: Response | null = null;

		for (let i = 0; i < 11; i++) {
			blockedResponse = await invoke(
				makeEvent('POST', 'https://example.com/?/lookupUser', '198.51.100.20', {
					headers: {
						accept: 'application/json',
						'content-type': 'application/x-www-form-urlencoded',
						'x-sveltekit-action': 'true'
					},
					body: new URLSearchParams({ username: 'alice' })
				})
			);
		}

		expect(blockedResponse?.status).toBe(429);
		const retryAfterHeader = blockedResponse?.headers.get('Retry-After');
		expect(retryAfterHeader).toBeTruthy();
		const retryAfterSeconds = Number(retryAfterHeader);
		expect(retryAfterSeconds).toBeGreaterThan(0);
		const body = await blockedResponse?.json();
		expect(body).toMatchObject({ type: 'failure', status: 429 });
		expect(parse(body.data)).toEqual({
			error: `Too many requests. Please try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}.`,
			requiresAuth: false
		});
	});
});
