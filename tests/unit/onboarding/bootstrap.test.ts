import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { AppSettingsKey, getAppSetting, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	clearOnboardingClaim,
	createBootstrapToken,
	generateBootstrapToken,
	hasActiveOnboardingClaim,
	isBootstrapTokenExpired,
	ONBOARDING_CLAIM_COOKIE,
	printOnboardingBootstrapBanner,
	validateBootstrapToken
} from '$lib/server/onboarding/bootstrap';

function createCookies() {
	const values = new Map<string, string>();
	const options = new Map<string, { secure?: boolean }>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string, nextOptions: { secure?: boolean } = {}) => {
			values.set(name, value);
			options.set(name, nextOptions);
		},
		delete: (name: string) => {
			values.delete(name);
			options.delete(name);
		},
		values,
		options
	};
}

function printedBootstrapTokens(consoleInfoSpy: ReturnType<typeof spyOn>): string[] {
	return (consoleInfoSpy.mock.calls as Array<[unknown]>)
		.map(([message]) => String(message))
		.filter((message) => message.startsWith('Bootstrap token: '))
		.map((message) => message.replace('Bootstrap token: ', ''));
}

function printedSetupUrls(consoleInfoSpy: ReturnType<typeof spyOn>): string[] {
	return (consoleInfoSpy.mock.calls as Array<[unknown]>)
		.map(([message]) => String(message))
		.filter((message) => message.startsWith('Setup URL: '))
		.map((message) => message.replace('Setup URL: ', ''));
}

describe('onboarding bootstrap token and claim', () => {
	let consoleInfoSpy: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		await db.delete(appSettings);
		clearBootstrapToken();
		consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleInfoSpy.mockRestore();
	});

	it('generates lowercase fixed-format bootstrap tokens', () => {
		expect(generateBootstrapToken()).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
	});

	it('validates active tokens, expires them, and clears them', () => {
		const token = createBootstrapToken(20);
		expect(validateBootstrapToken(token)).toBe(true);
		expect(validateBootstrapToken(`${token}x`)).toBe(false);
		clearBootstrapToken();
		expect(isBootstrapTokenExpired()).toBe(true);
		expect(validateBootstrapToken(token)).toBe(false);
	});

	it('prints the configured CSRF origin for the setup URL', async () => {
		await setAppSetting(AppSettingsKey.CSRF_ORIGIN, 'https://trusted.example.com');

		await printOnboardingBootstrapBanner();

		expect(printedSetupUrls(consoleInfoSpy)).toEqual([
			'https://trusted.example.com/onboarding/claim'
		]);
	});

	it('prints a relative setup URL when no trusted origin is configured', async () => {
		await printOnboardingBootstrapBanner();

		expect(printedSetupUrls(consoleInfoSpy)).toEqual(['/onboarding/claim']);
	});

	it('prints only one valid bootstrap token when banner calls race', async () => {
		await Promise.all(Array.from({ length: 5 }, () => printOnboardingBootstrapBanner()));

		const tokens = printedBootstrapTokens(consoleInfoSpy);
		expect(tokens).toHaveLength(1);
		expect(validateBootstrapToken(tokens[0] ?? '')).toBe(true);
	});

	it('prints a replacement token after the current banner token expires', async () => {
		await printOnboardingBootstrapBanner();
		const firstToken = printedBootstrapTokens(consoleInfoSpy)[0] ?? '';
		expect(validateBootstrapToken(firstToken)).toBe(true);

		createBootstrapToken(0);
		await printOnboardingBootstrapBanner();

		const tokens = printedBootstrapTokens(consoleInfoSpy);
		const replacementToken = tokens[1] ?? '';
		expect(tokens).toHaveLength(2);
		expect(replacementToken).not.toBe(firstToken);
		expect(validateBootstrapToken(replacementToken)).toBe(true);
	});

	it('caches completed onboarding after claim cleanup resets banner state', async () => {
		await printOnboardingBootstrapBanner();
		expect(printedBootstrapTokens(consoleInfoSpy)).toHaveLength(1);
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
		await clearOnboardingClaim();

		await printOnboardingBootstrapBanner();
		await db.delete(appSettings);
		await printOnboardingBootstrapBanner();

		expect(printedBootstrapTokens(consoleInfoSpy)).toHaveLength(1);
	});

	it('stores only the claim proof hash and renews the same claimant', async () => {
		const cookies = createCookies();
		const token = createBootstrapToken();

		expect(await claimOnboardingInstance(cookies as unknown as Cookies, token)).toBe('claimed');
		expect(await hasActiveOnboardingClaim(cookies as unknown as Cookies)).toBe(true);
		expect(await claimOnboardingInstance(cookies as unknown as Cookies, token)).toBe('renewed');

		const rawProof = cookies.values.get(ONBOARDING_CLAIM_COOKIE);
		const storedHash = await getAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH);
		expect(rawProof).toBeTruthy();
		expect(storedHash).toBeTruthy();
		expect(storedHash).not.toBe(rawProof);
	});

	it('sets a non-secure claim cookie for HTTP request URLs', async () => {
		const cookies = createCookies();
		const token = createBootstrapToken();

		expect(
			await claimOnboardingInstance(cookies as unknown as Cookies, token, {
				requestUrl: new URL('http://example.com/onboarding/claim')
			})
		).toBe('claimed');

		expect(cookies.options.get(ONBOARDING_CLAIM_COOKIE)?.secure).toBe(false);
	});

	it('sets a secure claim cookie for HTTPS request URLs', async () => {
		const cookies = createCookies();
		const token = createBootstrapToken();

		expect(
			await claimOnboardingInstance(cookies as unknown as Cookies, token, {
				requestUrl: new URL('https://example.com/onboarding/claim')
			})
		).toBe('claimed');

		expect(cookies.options.get(ONBOARDING_CLAIM_COOKIE)?.secure).toBe(true);
	});

	it('rejects a competing claimant while the claim is active', async () => {
		const token = createBootstrapToken();
		const first = createCookies();
		const second = createCookies();

		expect(await claimOnboardingInstance(first as unknown as Cookies, token)).toBe('claimed');
		expect(await claimOnboardingInstance(second as unknown as Cookies, token)).toBe(
			'already-claimed'
		);
	});

	it('clears claim state', async () => {
		const cookies = createCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies as unknown as Cookies, token)).toBe('claimed');

		await clearOnboardingClaim();

		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED)).toBeNull();
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH)).toBeNull();
		expect(await hasActiveOnboardingClaim(cookies as unknown as Cookies)).toBe(false);
	});
});
