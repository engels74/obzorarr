import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import * as serverIdentityModule from '$lib/server/plex/server-identity.service';
import { load } from '../../../src/routes/onboarding/plex/+page.server';

/**
 * Tests that the onboarding/plex/+page.server.ts load function exposes
 * per-field ENV lock information (plexServerUrlLocked, plexTokenLocked,
 * plexTokenHasValue) so the Svelte page can render individual ENV badges.
 *
 * ISSUE-002: ENV badge + lock on the onboarding Plex step.
 *
 * Note: The test environment mocks $env/dynamic/private with non-placeholder
 * PLEX_SERVER_URL and PLEX_TOKEN values, so both fields always appear ENV-locked
 * in this test suite. The tests verify the load correctly threads those lock
 * flags through from getApiConfigWithSources().
 */

describe('onboarding plex load — per-field ENV lock info (C1)', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	it('exposes plexServerUrlLocked and plexTokenLocked reflecting the env configuration', async () => {
		// The test setup mock sets PLEX_SERVER_URL + PLEX_TOKEN as non-placeholder
		// env values — both should be reported as locked.
		const result = (await load({
			parent: async () => ({
				hasEnvConfig: false,
				isAuthenticated: false,
				isAdmin: false,
				username: null,
				plexConfigured: false,
				plexServerUrl: '',
				plexConfigSource: 'default' as const,
				plexServerName: null,
				uiTheme: 'default'
			})
		} as unknown as Parameters<typeof load>[0])) as {
			plexServerUrlLocked: boolean;
			plexTokenLocked: boolean;
			plexTokenHasValue: boolean;
		};

		// Both fields are locked because the test env mock provides real-looking values
		expect(result.plexServerUrlLocked).toBe(true);
		expect(result.plexTokenLocked).toBe(true);
		expect(result.plexTokenHasValue).toBe(true);
	});

	it('exposes plexTokenHasValue=true and keeps lock flags when token is in env', async () => {
		// Calling load with hasEnvConfig=false (no server probe needed) still reads
		// the config lock state from getApiConfigWithSources() — lock flags come
		// from env, not from hasEnvConfig.
		const result = (await load({
			parent: async () => ({
				hasEnvConfig: false,
				isAuthenticated: true,
				isAdmin: true,
				username: 'admin',
				plexConfigured: true,
				plexServerUrl: 'https://test-plex-server:32400',
				plexConfigSource: 'env' as const,
				plexServerName: null,
				uiTheme: 'default'
			})
		} as unknown as Parameters<typeof load>[0])) as {
			plexServerUrlLocked: boolean;
			plexTokenLocked: boolean;
			plexTokenHasValue: boolean;
		};

		expect(result.plexServerUrlLocked).toBe(true);
		expect(result.plexTokenLocked).toBe(true);
		expect(result.plexTokenHasValue).toBe(true);
	});

	it('calls refreshConfiguredServerMachineId and threads configuredMachineId when hasEnvConfig=true', async () => {
		const spy = spyOn(serverIdentityModule, 'refreshConfiguredServerMachineId').mockResolvedValue({
			machineId: 'mock-machine-id',
			source: 'fresh' as const,
			errorReason: null
		});

		try {
			const result = (await load({
				parent: async () => ({
					hasEnvConfig: true,
					isAuthenticated: true,
					isAdmin: true,
					username: 'admin',
					plexConfigured: true,
					plexServerUrl: 'https://test-plex-server:32400',
					plexConfigSource: 'env' as const,
					plexServerName: 'My Plex',
					uiTheme: 'default'
				})
			} as unknown as Parameters<typeof load>[0])) as {
				plexServerUrlLocked: boolean;
				plexTokenLocked: boolean;
				plexTokenHasValue: boolean;
				configuredMachineId: string | null;
				configuredUrlReachable: boolean;
			};

			// Identity probe is called when hasEnvConfig=true
			expect(spy).toHaveBeenCalledTimes(1);
			expect(result.configuredMachineId).toBe('mock-machine-id');
			expect(result.configuredUrlReachable).toBe(true);
			// Lock flags are still threaded through
			expect(result.plexServerUrlLocked).toBe(true);
			expect(result.plexTokenLocked).toBe(true);
			expect(result.plexTokenHasValue).toBe(true);
		} finally {
			spy.mockRestore();
		}
	});
});
