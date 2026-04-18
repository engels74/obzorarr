import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import * as settingsService from '$lib/server/admin/settings.service';
import { verifyServerMembership } from '$lib/server/auth/membership';

function createMockResponse(data: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		statusText: ok ? 'OK' : 'Error',
		json: () => Promise.resolve(data),
		headers: new Headers(),
		redirected: false,
		type: 'basic',
		url: '',
		clone: () => createMockResponse(data, ok, status),
		body: null,
		bodyUsed: false,
		arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
		blob: () => Promise.resolve(new Blob()),
		formData: () => Promise.resolve(new FormData()),
		text: () => Promise.resolve(JSON.stringify(data))
	} as Response;
}

const MOCK_MACHINE_ID = 'a'.repeat(32);

function mockConfiguredUrl(url: string): ReturnType<typeof spyOn> {
	return spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue({
		plex: {
			serverUrl: { value: url, source: 'env', isLocked: false },
			token: { value: 'test-token', source: 'env', isLocked: false }
		},
		openai: {
			apiKey: { value: '', source: 'default', isLocked: false },
			baseUrl: { value: 'https://api.openai.com/v1', source: 'default', isLocked: false },
			model: { value: 'gpt-5-mini', source: 'default', isLocked: false }
		}
	});
}

describe('verifyServerMembership', () => {
	let fetchSpy: ReturnType<typeof spyOn>;
	let configSpy: ReturnType<typeof spyOn>;

	afterEach(() => {
		fetchSpy?.mockRestore();
		configSpy?.mockRestore();
	});

	it('returns { isMember: false, isOwner: false } when no server matches the configured URL', async () => {
		// Onboarding precondition: when the admin has not yet set a Plex server URL
		// (or the URL simply does not match any server the user has access to),
		// findConfiguredServer returns undefined and verifyServerMembership resolves
		// to { isMember: false }. This is the contract that motivates gating
		// periodic session revalidation on onboarding completion — during onboarding
		// there is no meaningful configured server to check against, and without the
		// gate the revalidator would incorrectly revoke the freshly-created session.
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse([
				{
					name: 'Some Other Server',
					product: 'Plex Media Server',
					clientIdentifier: 'unrelated-machine-id',
					owned: true,
					provides: 'server',
					connections: [
						{
							protocol: 'https',
							address: '10.0.0.1',
							port: 32400,
							uri: 'https://10-0-0-1.unrelated-machine-id.plex.direct:32400',
							local: false,
							relay: false
						}
					]
				}
			])
		);

		const result = await verifyServerMembership('user-token');

		expect(result.isMember).toBe(false);
		expect(result.isOwner).toBe(false);
	});

	it('matches a plain-host configured URL against a .plex.direct-only server (obzorarr-docker #5)', async () => {
		// Regression: when PLEX_SERVER_URL is a plain http://<lan-ip>:<port> but the
		// server only advertises .plex.direct URIs (which is the norm once https is
		// enabled), the previous matcher's three strategies all failed and users saw
		// "No matching server found" during onboarding.
		configSpy = mockConfiguredUrl('http://192.168.1.34:32400');
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse([
				{
					name: 'Home Server',
					product: 'Plex Media Server',
					clientIdentifier: MOCK_MACHINE_ID,
					owned: true,
					provides: 'server',
					publicAddress: '203.0.113.10',
					connections: [
						{
							protocol: 'https',
							address: '192.168.1.34',
							port: 32400,
							uri: `https://192-168-1-34.${MOCK_MACHINE_ID}.plex.direct:32400`,
							local: true,
							relay: false
						},
						{
							protocol: 'https',
							address: '203.0.113.10',
							port: 32400,
							uri: `https://203-0-113-10.${MOCK_MACHINE_ID}.plex.direct:32400`,
							local: false,
							relay: false
						}
					]
				}
			])
		);

		const result = await verifyServerMembership('user-token');

		expect(result.isMember).toBe(true);
		expect(result.isOwner).toBe(true);
		expect(result.serverName).toBe('Home Server');
	});

	it('matches a plain-host configured URL via the embedded IP of a .plex.direct URI', async () => {
		// When a server only advertises a .plex.direct URI that embeds the public IP
		// (no structured connection with a matching address), the plain-host matcher
		// still succeeds by extracting the IP from the URI itself.
		configSpy = mockConfiguredUrl('http://203.0.113.10:32400');
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse([
				{
					name: 'Remote Server',
					product: 'Plex Media Server',
					clientIdentifier: MOCK_MACHINE_ID,
					owned: false,
					provides: 'server',
					connections: [
						{
							protocol: 'https',
							address: 'some-internal-host',
							port: 32400,
							uri: `https://203-0-113-10.${MOCK_MACHINE_ID}.plex.direct:32400`,
							local: false,
							relay: false
						}
					]
				}
			])
		);

		const result = await verifyServerMembership('user-token');

		expect(result.isMember).toBe(true);
		expect(result.isOwner).toBe(false);
	});

	it('matches a plain-host configured URL via server.publicAddress', async () => {
		// If the configured host equals publicAddress and any advertised connection
		// uses the configured port, treat it as the same server.
		configSpy = mockConfiguredUrl('http://203.0.113.10:32400');
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse([
				{
					name: 'Public IP Server',
					product: 'Plex Media Server',
					clientIdentifier: MOCK_MACHINE_ID,
					owned: true,
					provides: 'server',
					publicAddress: '203.0.113.10',
					connections: [
						{
							protocol: 'https',
							address: 'internal.example.com',
							port: 32400,
							uri: 'https://internal.example.com:32400',
							local: true,
							relay: false
						}
					]
				}
			])
		);

		const result = await verifyServerMembership('user-token');

		expect(result.isMember).toBe(true);
		expect(result.isOwner).toBe(true);
	});
});
