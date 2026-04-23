import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { env } from '$env/dynamic/private';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { _resetProxyStartupLogged, proxyHandle } from '$lib/server/security/proxy-handle';

interface InvokeOptions {
	url: string;
	headers?: Record<string, string>;
}

interface InvokeResult {
	rewrittenUrl: URL;
}

async function invoke(options: InvokeOptions): Promise<InvokeResult> {
	const headers = new Headers();
	for (const [k, v] of Object.entries(options.headers ?? {})) {
		// Avoid the platform-level header sanitizer rejecting CR/LF before we see it.
		// Some runtimes refuse to set malicious values via Headers.set; for those tests
		// we construct the request via a Proxy below.
		headers.set(k, v);
	}

	const request = new Request(options.url, { method: 'GET', headers });
	const event = {
		request,
		url: new URL(options.url),
		route: { id: null }
	} as unknown as Parameters<typeof proxyHandle>[0]['event'];

	let observedUrl: URL = event.url;
	const resolve = mock(async (e: typeof event) => {
		observedUrl = e.url;
		return new Response('ok');
	});

	await proxyHandle({ event, resolve } as unknown as Parameters<typeof proxyHandle>[0]);

	return { rewrittenUrl: observedUrl };
}

// Build a request whose headers map can return CR/LF — the WHATWG Headers API
// strips/rejects these, so we use a fake headers object to exercise the
// header-injection guard inside proxyHandle.
async function invokeWithRawHeaders(options: {
	url: string;
	headerLookup: (name: string) => string | null;
}): Promise<InvokeResult> {
	const url = new URL(options.url);
	const fakeRequest = {
		headers: { get: options.headerLookup }
	} as unknown as Request;

	const event = {
		request: fakeRequest,
		url,
		route: { id: null }
	} as unknown as Parameters<typeof proxyHandle>[0]['event'];

	let observedUrl: URL = event.url;
	const resolve = mock(async (e: typeof event) => {
		observedUrl = e.url;
		return new Response('ok');
	});

	await proxyHandle({ event, resolve } as unknown as Parameters<typeof proxyHandle>[0]);
	return { rewrittenUrl: observedUrl };
}

describe('proxyHandle', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		// The env mock from tests/setup.ts is a shared mutable object; clean any
		// per-test mutations between runs.
		delete (env as Record<string, string | undefined>).TRUST_PROXY;
		_resetProxyStartupLogged();
	});

	afterEach(() => {
		delete (env as Record<string, string | undefined>).TRUST_PROXY;
	});

	describe('TRUST_PROXY=false (default)', () => {
		it('does NOT rewrite event.url even when malicious x-forwarded-* headers are present', async () => {
			const { rewrittenUrl } = await invoke({
				url: 'http://localhost:5173/some/path',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'evil.example.com'
				}
			});

			expect(rewrittenUrl.host).toBe('localhost:5173');
			expect(rewrittenUrl.protocol).toBe('http:');
		});
	});

	describe('TRUST_PROXY=true via DB', () => {
		beforeEach(async () => {
			await setAppSetting(AppSettingsKey.TRUST_PROXY, 'true');
		});

		it('rewrites event.url to the forwarded host and proto', async () => {
			const { rewrittenUrl } = await invoke({
				url: 'http://localhost:5173/some/path',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'real.example.com'
				}
			});

			expect(rewrittenUrl.protocol).toBe('https:');
			expect(rewrittenUrl.host).toBe('real.example.com');
			expect(rewrittenUrl.pathname).toBe('/some/path');
		});

		it('leaves event.url unchanged when both forwarded headers are missing', async () => {
			const { rewrittenUrl } = await invoke({
				url: 'http://localhost:5173/p'
			});

			expect(rewrittenUrl.host).toBe('localhost:5173');
			expect(rewrittenUrl.protocol).toBe('http:');
		});

		it('leaves event.url unchanged when only one forwarded header is present', async () => {
			const { rewrittenUrl } = await invoke({
				url: 'http://localhost:5173/p',
				headers: { 'x-forwarded-proto': 'https' }
			});

			expect(rewrittenUrl.host).toBe('localhost:5173');
		});

		it('takes the rightmost (last-hop) value when the host header is comma-separated', async () => {
			const { rewrittenUrl } = await invoke({
				url: 'http://localhost:5173/p',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'a.evil.example.com, real.example.com'
				}
			});

			expect(rewrittenUrl.host).toBe('real.example.com');
		});

		it('takes the rightmost (last-hop) value when the proto header is comma-separated', async () => {
			const { rewrittenUrl } = await invoke({
				url: 'http://localhost:5173/p',
				headers: {
					'x-forwarded-proto': 'http, https',
					'x-forwarded-host': 'real.example.com'
				}
			});

			expect(rewrittenUrl.protocol).toBe('https:');
		});

		it('rejects an invalid forwarded proto and skips the rewrite entirely', async () => {
			const { rewrittenUrl } = await invoke({
				url: 'http://localhost:5173/p',
				headers: {
					'x-forwarded-proto': 'javascript',
					'x-forwarded-host': 'real.example.com'
				}
			});

			expect(rewrittenUrl.protocol).toBe('http:');
			expect(rewrittenUrl.host).toBe('localhost:5173');
		});

		it('rejects a forwarded host containing CR/LF (header-injection defense)', async () => {
			const { rewrittenUrl } = await invokeWithRawHeaders({
				url: 'http://localhost:5173/p',
				headerLookup: (name) => {
					if (name === 'x-forwarded-proto') return 'https';
					if (name === 'x-forwarded-host') return 'evil.example.com\r\nSet-Cookie: x=1';
					return null;
				}
			});

			expect(rewrittenUrl.host).toBe('localhost:5173');
			expect(rewrittenUrl.protocol).toBe('http:');
		});

		it('rejects a forwarded host containing internal whitespace', async () => {
			const { rewrittenUrl } = await invokeWithRawHeaders({
				url: 'http://localhost:5173/p',
				headerLookup: (name) => {
					if (name === 'x-forwarded-proto') return 'https';
					if (name === 'x-forwarded-host') return 'evil .example.com';
					return null;
				}
			});

			expect(rewrittenUrl.host).toBe('localhost:5173');
		});

		it('rejects an empty / whitespace-only forwarded host', async () => {
			const { rewrittenUrl } = await invoke({
				url: 'http://localhost:5173/p',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': '   '
				}
			});

			expect(rewrittenUrl.host).toBe('localhost:5173');
		});
	});

	describe('TRUST_PROXY env override', () => {
		it('honors env=true regardless of DB value', async () => {
			await setAppSetting(AppSettingsKey.TRUST_PROXY, 'false');
			(env as Record<string, string | undefined>).TRUST_PROXY = 'true';

			const { rewrittenUrl } = await invoke({
				url: 'http://localhost:5173/p',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'real.example.com'
				}
			});

			expect(rewrittenUrl.host).toBe('real.example.com');
			expect(rewrittenUrl.protocol).toBe('https:');
		});

		it('honors env=false regardless of DB value', async () => {
			await setAppSetting(AppSettingsKey.TRUST_PROXY, 'true');
			(env as Record<string, string | undefined>).TRUST_PROXY = 'false';

			const { rewrittenUrl } = await invoke({
				url: 'http://localhost:5173/p',
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'real.example.com'
				}
			});

			expect(rewrittenUrl.host).toBe('localhost:5173');
		});
	});
});
