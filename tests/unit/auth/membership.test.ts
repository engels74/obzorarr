import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import * as settingsService from '$lib/server/admin/settings.service';
import { verifyServerMembership } from '$lib/server/auth/membership';
import * as serverIdentityService from '$lib/server/plex/server-identity.service';

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
	let identitySpy: ReturnType<typeof spyOn>;

	afterEach(() => {
		fetchSpy?.mockRestore();
		configSpy?.mockRestore();
		identitySpy?.mockRestore();
	});

	it('returns { isMember: false, isOwner: false } when no server matches the configured URL', async () => {
		// Onboarding precondition: when the admin has not yet set a Plex server URL
		// (or the URL simply does not match any server the user has access to),
		// findConfiguredServer returns undefined and verifyServerMembership resolves
		// to { isMember: false }. This is the contract that motivates gating
		// periodic session revalidation on onboarding completion — during onboarding
		// there is no meaningful configured server to check against, and without the
		// gate the revalidator would incorrectly revoke the freshly-created session.
		configSpy = mockConfiguredUrl('http://test-plex-server:32400');
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

	it('matches a plain-host configured URL against a .plex.direct-only server when /identity is reachable', async () => {
		// Regression coverage for obzorarr-docker #5: plain http://<lan-ip>:<port>
		// configured URL, server advertises .plex.direct URIs. With the reachability
		// gate in place, /identity must be reachable for membership to be granted;
		// once it is, Strategy 0 (machineId) pins the match.
		configSpy = mockConfiguredUrl('http://192.168.1.34:32400');
		identitySpy = spyOn(serverIdentityService, 'getConfiguredServerMachineId').mockResolvedValue({
			machineId: MOCK_MACHINE_ID,
			source: 'fresh',
			errorReason: null
		});
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

	it('matches by /identity machineIdentifier when URL strategies cannot (obzorarr-docker #5)', async () => {
		// Reporter's config: hostname-based PLEX_SERVER_URL against a server that only
		// advertises .plex.direct/IP connections. None of the URL-string strategies
		// match. Strategy 0 uses GET /identity to fetch the real machineIdentifier
		// and compares it directly against each resource's clientIdentifier.
		configSpy = mockConfiguredUrl('http://plex.local.timo.be:32400');
		identitySpy = spyOn(serverIdentityService, 'getConfiguredServerMachineId').mockResolvedValue({
			machineId: MOCK_MACHINE_ID,
			source: 'fresh',
			errorReason: null
		});
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse([
				{
					name: 'X.A.N.A.',
					product: 'Plex Media Server',
					clientIdentifier: MOCK_MACHINE_ID,
					owned: true,
					provides: 'server',
					connections: [
						{
							protocol: 'https',
							address: '10.244.0.25',
							port: 32400,
							uri: `https://10-244-0-25.${MOCK_MACHINE_ID}.plex.direct:32400`,
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
		expect(result.serverName).toBe('X.A.N.A.');
		expect(result.configuredMachineId).toBe(MOCK_MACHINE_ID);
	});

	it('returns reason "not_reachable" when /identity is unreachable and URL strategies fail', async () => {
		configSpy = mockConfiguredUrl('http://plex.local.timo.be:32400');
		identitySpy = spyOn(serverIdentityService, 'getConfiguredServerMachineId').mockResolvedValue({
			machineId: null,
			source: 'unavailable',
			errorReason: 'Connection timed out - the server may be unreachable'
		});
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse([
				{
					name: 'Some Server',
					product: 'Plex Media Server',
					clientIdentifier: 'a-different-machine-id',
					owned: true,
					provides: 'server',
					connections: [
						{
							protocol: 'https',
							address: '10.0.0.1',
							port: 32400,
							uri: 'https://10-0-0-1.a-different-machine-id.plex.direct:32400',
							local: false,
							relay: false
						}
					]
				}
			])
		);

		const result = await verifyServerMembership('user-token');

		expect(result.isMember).toBe(false);
		expect(result.reason).toBe('not_reachable');
		expect(result.configuredMachineId).toBeUndefined();
	});

	it('returns reason "not_in_resources" when /identity succeeds but the server is not in plex.tv resources', async () => {
		configSpy = mockConfiguredUrl('http://plex.local.timo.be:32400');
		identitySpy = spyOn(serverIdentityService, 'getConfiguredServerMachineId').mockResolvedValue({
			machineId: MOCK_MACHINE_ID,
			source: 'fresh',
			errorReason: null
		});
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse([
				{
					name: 'Unrelated Server',
					product: 'Plex Media Server',
					clientIdentifier: 'b'.repeat(32),
					owned: true,
					provides: 'server',
					connections: []
				}
			])
		);

		const result = await verifyServerMembership('user-token');

		expect(result.isMember).toBe(false);
		expect(result.reason).toBe('not_in_resources');
		expect(result.configuredMachineId).toBe(MOCK_MACHINE_ID);
	});

	it('returns reason "not_owner" when Strategy 0 matches but the server is not owned', async () => {
		configSpy = mockConfiguredUrl('http://plex.local.timo.be:32400');
		identitySpy = spyOn(serverIdentityService, 'getConfiguredServerMachineId').mockResolvedValue({
			machineId: MOCK_MACHINE_ID,
			source: 'cache',
			errorReason: null
		});
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse([
				{
					name: "Friend's Server",
					product: 'Plex Media Server',
					clientIdentifier: MOCK_MACHINE_ID,
					owned: false,
					provides: 'server',
					connections: []
				}
			])
		);

		const result = await verifyServerMembership('user-token');

		expect(result.isMember).toBe(true);
		expect(result.isOwner).toBe(false);
		expect(result.reason).toBe('not_owner');
		expect(result.configuredMachineId).toBe(MOCK_MACHINE_ID);
	});
});
