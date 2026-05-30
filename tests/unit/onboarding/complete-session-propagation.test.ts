import { beforeEach, describe, expect, it } from 'bun:test';
import { type Cookies, type fail, isActionFailure } from '@sveltejs/kit';
import { AppSettingsKey, getAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, sessions, users } from '$lib/server/db/schema';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken
} from '$lib/server/onboarding/bootstrap';
import { actions } from '../../../src/routes/onboarding/complete/+page.server';

/**
 * ISSUE-001 security guard — completing onboarding must never hand an admin
 * session to a non-owner. The completion action gates on `locals.user.isAdmin`
 * (resolved from the verified session) before doing anything; this test pins
 * that a non-admin caller is rejected and gains nothing.
 */

interface CookieCall {
	name: string;
	value?: string;
	options?: Record<string, unknown>;
}

interface TestCookies extends Cookies {
	sets: CookieCall[];
}

function createCookies(): TestCookies {
	const values = new Map<string, string>();
	const sets: CookieCall[] = [];

	return {
		sets,
		get: (name: string) => values.get(name),
		set: (name: string, value: string, options?: Record<string, unknown>) => {
			sets.push({ name, value, options });
			values.set(name, value);
		},
		delete: (name: string) => {
			values.delete(name);
		}
	} as unknown as TestCookies;
}

const COMPLETE_URL = new URL('http://localhost/onboarding/complete');

describe('ISSUE-001: onboarding completion authorization', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(sessions);
		await db.delete(users);
		clearBootstrapToken();
	});

	it('does NOT issue an admin session or complete onboarding for a non-owner (negative)', async () => {
		// A valid setup claim is present, but the caller is not an admin.
		const cookies = createCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');
		cookies.sets.length = 0;

		const nonAdminLocals = {
			user: { id: 2, plexId: 999, username: 'guest', isAdmin: false }
		} as unknown as App.Locals;

		const result = await actions.goToDashboard?.({
			locals: nonAdminLocals,
			cookies,
			url: COMPLETE_URL
		} as unknown as Parameters<NonNullable<typeof actions.goToDashboard>>[0]);

		// Rejected with 403 — no redirect, no admin grant.
		expect(isActionFailure(result)).toBe(true);
		expect((result as ReturnType<typeof fail>).status).toBe(403);

		// No session cookie was minted for the non-owner.
		expect(cookies.sets.find((c) => c.name === 'session')).toBeUndefined();

		// Onboarding was not marked complete by an unauthorized caller.
		expect(await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED)).not.toBe('true');
	});
});
