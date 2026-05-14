import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// Mock $app/forms before importing the helper that depends on it.
mock.module('$app/forms', () => ({
	deserialize: (text: string) => {
		const parsed = JSON.parse(text);
		// SvelteKit's `data` field is a `devalue`-encoded string; for tests we
		// pass plain objects through the parsed payload so the helper sees the
		// same shape callers do at runtime.
		if (parsed?.data && typeof parsed.data === 'string') {
			try {
				const decoded = JSON.parse(parsed.data);
				return { ...parsed, data: Array.isArray(decoded) ? hydrateDevalue(decoded) : decoded };
			} catch {
				return parsed;
			}
		}
		return parsed;
	}
}));

function hydrateDevalue(input: unknown[]): unknown {
	const head = input[0];
	if (typeof head !== 'object' || head === null) return head;
	const result: Record<string, unknown> = {};
	for (const [key, idx] of Object.entries(head as Record<string, number>)) {
		result[key] = input[idx];
	}
	return result;
}

const { submitAction } = await import('$lib/utils/submit-action');

type FetchFn = typeof fetch;

const originalFetch = globalThis.fetch;

function installMockFetch(
	impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) {
	globalThis.fetch = mock(impl) as unknown as FetchFn;
}

describe('submitAction', () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	beforeEach(() => {
		// reset
	});

	it('sends POST with x-sveltekit-action header', async () => {
		let capturedInit: RequestInit | undefined;
		installMockFetch(async (_input, init) => {
			capturedInit = init;
			return new Response(JSON.stringify({ type: 'success', status: 200, data: '[null]' }), {
				status: 200
			});
		});

		await submitAction('?/noop');

		expect(capturedInit?.method).toBe('POST');
		const headers = new Headers(capturedInit?.headers);
		expect(headers.get('x-sveltekit-action')).toBe('true');
	});

	it('returns success outcome with parsed data', async () => {
		installMockFetch(
			async () =>
				new Response(
					JSON.stringify({
						type: 'success',
						status: 200,
						data: '[{"count":1},42]'
					}),
					{ status: 200 }
				)
		);

		const result = await submitAction<{ count: number }>('?/getCount');
		expect(result.type).toBe('success');
		if (result.type === 'success') {
			expect(result.data).toEqual({ count: 42 });
		}
	});

	it('returns failure outcome with error data', async () => {
		installMockFetch(
			async () =>
				new Response(
					JSON.stringify({
						type: 'failure',
						status: 400,
						data: '[{"error":1},"bad input"]'
					}),
					{ status: 400 }
				)
		);

		const result = await submitAction<{ error?: string }>('?/badForm');
		expect(result.type).toBe('failure');
		if (result.type === 'failure') {
			expect(result.data.error).toBe('bad input');
		}
	});

	it('returns error outcome when the wire format reports an error', async () => {
		installMockFetch(
			async () =>
				new Response(
					JSON.stringify({
						type: 'error',
						error: { message: 'boom' },
						status: 500
					}),
					{ status: 500 }
				)
		);

		const result = await submitAction('?/explodes');
		expect(result.type).toBe('error');
		if (result.type === 'error') {
			expect(result.error.message).toBe('boom');
		}
	});

	it('propagates fetch network errors', async () => {
		installMockFetch(async () => {
			throw new Error('network down');
		});

		await expect(submitAction('?/anything')).rejects.toThrow('network down');
	});

	it('accepts a FormData body', async () => {
		let capturedBody: BodyInit | null | undefined;
		installMockFetch(async (_input, init) => {
			capturedBody = init?.body;
			return new Response(JSON.stringify({ type: 'success', status: 200, data: '[null]' }), {
				status: 200
			});
		});

		const fd = new FormData();
		fd.set('year', '2024');
		await submitAction('?/withBody', fd);

		expect(capturedBody).toBe(fd);
	});
});
