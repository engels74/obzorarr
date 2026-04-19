import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { testOpenAIConnection } from '$lib/server/funfacts/test-connection';

let originalFetch: typeof fetch;

beforeEach(() => {
	originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('testOpenAIConnection', () => {
	it('returns error without calling fetch when API key is empty', async () => {
		let fetchCalled = false;
		globalThis.fetch = mock(async () => {
			fetchCalled = true;
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection('');

		expect(result).toEqual({ success: false, error: 'API key is required' });
		expect(fetchCalled).toBe(false);
	});

	it('returns error without calling fetch when API key is whitespace-only', async () => {
		let fetchCalled = false;
		globalThis.fetch = mock(async () => {
			fetchCalled = true;
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection('   \t\n');

		expect(result).toEqual({ success: false, error: 'API key is required' });
		expect(fetchCalled).toBe(false);
	});

	it('returns success with resolved model name on 200', async () => {
		const captured: { url?: string; init?: RequestInit } = {};

		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			captured.url = typeof input === 'string' ? input : input.toString();
			captured.init = init;
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection('sk-test-key');

		expect(result).toEqual({ success: true, message: 'Connected (model: gpt-5-mini)' });
		expect(captured.url).toBe('https://api.openai.com/v1/chat/completions');
		expect(captured.init?.method).toBe('POST');
		const headers = captured.init?.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer sk-test-key');
		expect(headers['Content-Type']).toBe('application/json');
		const body = JSON.parse(captured.init?.body as string);
		expect(body).toEqual({
			model: 'gpt-5-mini',
			messages: [{ role: 'user', content: 'ping' }],
			max_tokens: 1
		});
	});

	it('uses custom baseUrl and model when provided', async () => {
		const captured: { url?: string; body?: string } = {};

		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			captured.url = typeof input === 'string' ? input : input.toString();
			captured.body = init?.body as string;
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection(
			'sk-test',
			'https://custom.example.com/v1',
			'gpt-4o-mini'
		);

		expect(result).toEqual({ success: true, message: 'Connected (model: gpt-4o-mini)' });
		expect(captured.url).toBe('https://custom.example.com/v1/chat/completions');
		expect(JSON.parse(captured.body ?? '{}').model).toBe('gpt-4o-mini');
	});

	it('maps 401 to authentication error', async () => {
		globalThis.fetch = mock(async () => {
			return new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' });
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection('sk-bad');

		expect(result).toEqual({
			success: false,
			error: 'Authentication failed — check your API key'
		});
	});

	it('maps 404 to model-not-found error', async () => {
		globalThis.fetch = mock(async () => {
			return new Response('Not Found', { status: 404, statusText: 'Not Found' });
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection('sk-test');

		expect(result).toEqual({
			success: false,
			error: 'Model not found or base URL is incorrect'
		});
	});

	it('maps other non-OK responses to status/statusText message', async () => {
		globalThis.fetch = mock(async () => {
			return new Response('Server Error', { status: 500, statusText: 'Internal Server Error' });
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection('sk-test');

		expect(result).toEqual({
			success: false,
			error: 'Request failed: 500 Internal Server Error'
		});
	});

	it('maps AbortError to timeout message', async () => {
		globalThis.fetch = mock(async () => {
			const error = new Error('The operation was aborted');
			error.name = 'AbortError';
			throw error;
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection('sk-test');

		expect(result).toEqual({ success: false, error: 'Connection timed out' });
	});

	it('returns the error message for any other thrown error', async () => {
		globalThis.fetch = mock(async () => {
			throw new Error('network down');
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection('sk-test');

		expect(result).toEqual({ success: false, error: 'network down' });
	});

	it('trims whitespace from the API key before sending the Authorization header', async () => {
		const captured: { init?: RequestInit } = {};

		globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
			captured.init = init;
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection('  sk-padded  ');

		expect(result.success).toBe(true);
		const headers = captured.init?.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer sk-padded');
	});

	it('strips trailing slash from baseUrl before building the endpoint URL', async () => {
		const captured: { url?: string } = {};

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			captured.url = typeof input === 'string' ? input : input.toString();
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		const result = await testOpenAIConnection('sk-test', 'https://custom.example.com/v1/');

		expect(result.success).toBe(true);
		expect(captured.url).toBe('https://custom.example.com/v1/chat/completions');
	});
});
