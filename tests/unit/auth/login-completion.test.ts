import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import * as settingsService from '$lib/server/admin/settings.service';
import * as membership from '$lib/server/auth/membership';
import * as plexOauth from '$lib/server/auth/plex-oauth';
import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import * as onboarding from '$lib/server/onboarding';
import {
	claimOnboardingInstance,
	clearBootstrapToken,
	createBootstrapToken,
	OnboardingClaimRequiredError
} from '$lib/server/onboarding/bootstrap';

interface CookieCall {
	name: string;
	value?: string;
	options?: unknown;
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
		set: (name: string, value: string, options?: unknown) => {
			sets.push({ name, value, options });
			values.set(name, value);
		},
		delete: (name: string) => {
			values.delete(name);
		}
	} as unknown as TestCookies;
}

describe('createSessionFromPlexToken', () => {
	let spies: Array<{ mockRestore(): void }> = [];

	beforeEach(async () => {
		await db.delete(sessions);
		await db.delete(users);
		clearBootstrapToken();

		spies = [
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue({
				plex: {
					serverUrl: {
						value: 'http://test-plex-server:32400',
						source: 'env',
						isLocked: false
					},
					token: {
						value: 'test-token',
						source: 'env',
						isLocked: false
					}
				},
				openai: {
					apiKey: {
						value: '',
						source: 'default',
						isLocked: false
					},
					baseUrl: {
						value: 'https://api.openai.com/v1',
						source: 'default',
						isLocked: false
					},
					model: {
						value: 'gpt-5-mini',
						source: 'default',
						isLocked: false
					}
				}
			}),
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(false),
			spyOn(membership, 'requireServerMembership').mockResolvedValue({
				isMember: true,
				isOwner: false,
				serverName: 'Test Plex'
			}),
			spyOn(plexOauth, 'getPlexUserInfo').mockResolvedValue({
				id: 12345,
				uuid: 'plex-user-uuid',
				username: 'alice',
				email: 'alice@example.com',
				thumb: 'https://plex.example/avatar.png',
				authToken: 'plex-user-token-from-profile',
				services: [{ identifier: 'metadata-provider', secret: 'service-secret' }]
			})
		];
	});

	afterEach(() => {
		for (const spy of spies) {
			spy.mockRestore();
		}
	});

	it('redacts Plex and internal identifiers from the browser-facing completion response', async () => {
		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		const cookies = createCookies();

		const result = await createSessionFromPlexToken('secret-auth-token', cookies);

		expect(result).toEqual({
			user: {
				username: 'alice',
				isAdmin: false
			},
			redirectTo: '/dashboard'
		});
		expect(cookies.sets[0]?.name).toBe('session');

		const responseText = JSON.stringify(result);
		for (const forbidden of [
			'authToken',
			'token',
			'secret',
			'plexToken',
			'plexId',
			'email',
			'services',
			'accessToken',
			'clientIdentifier',
			'connections',
			'resources'
		]) {
			expect(responseText).not.toContain(forbidden);
		}
		expect(responseText).not.toContain('secret-auth-token');
		expect(responseText).not.toContain('plex-user-token-from-profile');
		expect(responseText).not.toContain('service-secret');
	});

	it('rejects first-admin creation during fresh onboarding without an active setup claim', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue({
				plex: {
					serverUrl: { value: '', source: 'default', isLocked: false },
					token: { value: '', source: 'default', isLocked: false }
				},
				openai: {
					apiKey: { value: '', source: 'default', isLocked: false },
					baseUrl: { value: 'https://api.openai.com/v1', source: 'default', isLocked: false },
					model: { value: 'gpt-5-mini', source: 'default', isLocked: false }
				}
			})
		);

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		await expect(
			createSessionFromPlexToken('secret-auth-token', createCookies())
		).rejects.toBeInstanceOf(OnboardingClaimRequiredError);
	});

	it('propagates unexpected setup claim renewal errors during fresh onboarding', async () => {
		const unexpectedError = new Error('claim storage failed');

		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue({
				plex: {
					serverUrl: { value: '', source: 'default', isLocked: false },
					token: { value: '', source: 'default', isLocked: false }
				},
				openai: {
					apiKey: { value: '', source: 'default', isLocked: false },
					baseUrl: { value: 'https://api.openai.com/v1', source: 'default', isLocked: false },
					model: { value: 'gpt-5-mini', source: 'default', isLocked: false }
				}
			}),
			spyOn(onboarding, 'requireActiveOnboardingClaim').mockRejectedValue(unexpectedError)
		);

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		try {
			await createSessionFromPlexToken('secret-auth-token', createCookies());
			throw new Error('Expected setup claim renewal to fail');
		} catch (err) {
			expect(err).toBe(unexpectedError);
			expect(err).not.toBeInstanceOf(OnboardingClaimRequiredError);
		}
	});

	it('allows first-admin creation during fresh onboarding with an active setup claim', async () => {
		spies.push(
			spyOn(onboarding, 'requiresOnboarding').mockResolvedValue(true),
			spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue({
				plex: {
					serverUrl: { value: '', source: 'default', isLocked: false },
					token: { value: '', source: 'default', isLocked: false }
				},
				openai: {
					apiKey: { value: '', source: 'default', isLocked: false },
					baseUrl: { value: 'https://api.openai.com/v1', source: 'default', isLocked: false },
					model: { value: 'gpt-5-mini', source: 'default', isLocked: false }
				}
			}),
			spyOn(membership, 'verifyServerOwnership').mockResolvedValue({
				isOwner: true,
				serverName: 'Owned Plex'
			})
		);

		const cookies = createCookies();
		const token = createBootstrapToken();
		expect(await claimOnboardingInstance(cookies, token)).toBe('claimed');

		const { createSessionFromPlexToken } = await import('$lib/server/auth/login-completion');
		const result = await createSessionFromPlexToken('secret-auth-token', cookies);

		expect(result).toEqual({
			user: { username: 'alice', isAdmin: true },
			redirectTo: '/admin'
		});
	});
});
