import { describe, expect, it } from 'bun:test';
import { isSafeReturnPath, resolveSafeReturnPath } from '$lib/client/plex-login';

/**
 * ISSUE-002 (dogfood 2026-06-04) — open-redirect guard for the post-login target.
 *
 * The client landing page assigns `window.location.href = targetUrl`, so the
 * returnTo path it consumes is the real open-redirect surface. These tests pin
 * the pure validator that BOTH the server hook (returnTo carrier) and the client
 * navigation share, so a forged `?returnTo=` can never reach an external host.
 *
 * Hostile strings are built with String.fromCharCode so backslash / control-char
 * cases are unambiguous in source (no escape-sequence surprises).
 */
const BACKSLASH = String.fromCharCode(92);
const NEWLINE = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const NUL = String.fromCharCode(0);

describe('isSafeReturnPath — open-redirect guard', () => {
	it('accepts a same-origin absolute path', () => {
		expect(isSafeReturnPath('/admin/settings')).toBe(true);
		expect(isSafeReturnPath('/admin')).toBe(true);
		expect(isSafeReturnPath('/dashboard?tab=x')).toBe(true);
		expect(isSafeReturnPath('/admin/users#section')).toBe(true);
	});

	it('rejects protocol-relative // hosts', () => {
		expect(isSafeReturnPath('//evil.com')).toBe(false);
		expect(isSafeReturnPath('//evil.com/admin')).toBe(false);
	});

	it('rejects backslash protocol-relative tricks (/\\ and \\)', () => {
		expect(isSafeReturnPath(`/${BACKSLASH}evil.com`)).toBe(false);
		expect(isSafeReturnPath(`${BACKSLASH}evil`)).toBe(false);
		expect(isSafeReturnPath(`${BACKSLASH}${BACKSLASH}evil.com`)).toBe(false);
		expect(isSafeReturnPath(`/admin${BACKSLASH}evil`)).toBe(false);
	});

	it('rejects absolute URLs and scheme payloads', () => {
		expect(isSafeReturnPath('https://evil.com')).toBe(false);
		expect(isSafeReturnPath('http://evil.com/admin')).toBe(false);
		expect(isSafeReturnPath('javascript:alert(1)')).toBe(false);
		expect(isSafeReturnPath('data:text/html,<script>')).toBe(false);
	});

	it('rejects non-path / empty / non-string / control-char inputs', () => {
		expect(isSafeReturnPath('')).toBe(false);
		expect(isSafeReturnPath('admin/settings')).toBe(false);
		expect(isSafeReturnPath('relative')).toBe(false);
		expect(isSafeReturnPath(null)).toBe(false);
		expect(isSafeReturnPath(undefined)).toBe(false);
		expect(isSafeReturnPath(42)).toBe(false);
		expect(isSafeReturnPath(`/admin${NEWLINE}/evil`)).toBe(false);
		expect(isSafeReturnPath(`/admin${TAB}x`)).toBe(false);
		expect(isSafeReturnPath(`/admin${NUL}`)).toBe(false);
	});
});

describe('resolveSafeReturnPath — falls back to the role default', () => {
	it('returns the candidate when it is a safe path', () => {
		expect(resolveSafeReturnPath('/admin/settings', '/admin')).toBe('/admin/settings');
		expect(resolveSafeReturnPath('/dashboard', '/dashboard')).toBe('/dashboard');
	});

	it('returns the fallback for every external / forged value', () => {
		const hostile = ['//evil.com', 'https://evil.com', 'javascript:alert(1)', `${BACKSLASH}evil`];
		for (const value of hostile) {
			expect(resolveSafeReturnPath(value, '/admin')).toBe('/admin');
			expect(resolveSafeReturnPath(value, '/dashboard')).toBe('/dashboard');
		}
	});

	it('returns the fallback for null/undefined (no returnTo present)', () => {
		expect(resolveSafeReturnPath(null, '/admin')).toBe('/admin');
		expect(resolveSafeReturnPath(undefined, '/dashboard')).toBe('/dashboard');
	});
});

/**
 * Source-regression guards for the layers that consume the validator. The
 * onboarding-context branch MUST win over any returnTo, and both the hook and the
 * landing page must route returnTo through the shared guard before navigating.
 */
async function readSource(path: string): Promise<string> {
	return Bun.file(path).text();
}

describe('ISSUE-002 — returnTo threading wiring', () => {
	it('redirect load validates returnTo before putting it in PageData', async () => {
		const source = await readSource('src/routes/auth/plex/redirect/+page.server.ts');
		expect(source).toContain("import { isSafeReturnPath } from '$lib/client/plex-login';");
		expect(source).toContain("url.searchParams.get('returnTo')");
		expect(source).toContain('isSafeReturnPath(rawReturnTo) ? rawReturnTo : null');
	});

	it('redirect page lets onboarding win and otherwise resolves the safe returnTo', async () => {
		const source = await readSource('src/routes/auth/plex/redirect/+page.svelte');
		expect(source).toContain('resolveSafeReturnPath');
		// Onboarding branch precedence is preserved (checked before returnTo is used).
		const onboardingIdx = source.indexOf("pinData.context === 'onboarding'");
		const resolveIdx = source.indexOf('resolveSafeReturnPath(data.returnTo');
		expect(onboardingIdx).toBeGreaterThan(-1);
		expect(resolveIdx).toBeGreaterThan(onboardingIdx);
	});

	it('landing page threads a validated returnTo into both auth flows', async () => {
		const source = await readSource('src/routes/+page.svelte');
		expect(source).toContain("params.get('returnTo')");
		expect(source).toContain('isSafeReturnPath(rawReturnTo)');
		expect(source).toContain('returnTo,');
		expect(source).toContain('resolveSafeReturnPath(');
	});
});
