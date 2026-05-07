import { beforeEach, describe, expect, it } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { AppSettingsKey, getAppSetting } from '$lib/server/admin/settings.service';
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
	validateBootstrapToken
} from '$lib/server/onboarding/bootstrap';

function createCookies() {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => values.delete(name),
		values
	};
}

describe('onboarding bootstrap token and claim', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		clearBootstrapToken();
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
