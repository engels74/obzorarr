import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import * as settingsService from '$lib/server/admin/settings.service';
import {
	identityRetry,
	isTransientIdentityError,
	messageForMembershipFailure,
	verifyServerMembership
} from '$lib/server/auth/membership';
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
	const originalIdentityRetryDelayMs = identityRetry.delayMs;

	beforeEach(() => {
		// Shrink the transient-failure retry delay so retry-path tests don't burn
		// 250ms of wall-clock each. bun:test does not currently mock setTimeout, so
		// we mutate the exported wrapper directly instead of using fake timers.
		identityRetry.delayMs = 0;
	});

	afterEach(() => {
		fetchSpy?.mockRestore();
		configSpy?.mockRestore();
		identitySpy?.mockRestore();
		identityRetry.delayMs = originalIdentityRetryDelayMs;
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
		// Mock /identity explicitly so the outcome does not depend on the
		// shared fetch mock being (accidentally) rejected as an invalid
		// identity response. With /identity succeeding and the returned
		// machineId absent from /resources, the result must be not_in_resources.
		identitySpy = spyOn(
			serverIdentityService,
			'refreshConfiguredServerMachineId'
		).mockResolvedValue({
			machineId: MOCK_MACHINE_ID,
			source: 'fresh',
			errorReason: null
		});
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
		expect(result.reason).toBe('not_in_resources');
		expect(result.configuredMachineId).toBe(MOCK_MACHINE_ID);
	});

	it('matches a plain-host configured URL against a .plex.direct-only server when /identity is reachable', async () => {
		// Regression coverage for obzorarr-docker #5: plain http://<lan-ip>:<port>
		// configured URL, server advertises .plex.direct URIs. With the reachability
		// gate in place, /identity must be reachable for membership to be granted;
		// once it is, Strategy 0 (machineId) pins the match.
		configSpy = mockConfiguredUrl('http://192.168.1.34:32400');
		identitySpy = spyOn(
			serverIdentityService,
			'refreshConfiguredServerMachineId'
		).mockResolvedValue({
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
		identitySpy = spyOn(
			serverIdentityService,
			'refreshConfiguredServerMachineId'
		).mockResolvedValue({
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
		identitySpy = spyOn(
			serverIdentityService,
			'refreshConfiguredServerMachineId'
		).mockResolvedValue({
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
		identitySpy = spyOn(
			serverIdentityService,
			'refreshConfiguredServerMachineId'
		).mockResolvedValue({
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
		identitySpy = spyOn(
			serverIdentityService,
			'refreshConfiguredServerMachineId'
		).mockResolvedValue({
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

	it('retries /identity once on transient failure and admits membership when the retry succeeds', async () => {
		configSpy = mockConfiguredUrl('http://plex.local.timo.be:32400');
		identitySpy = spyOn(serverIdentityService, 'refreshConfiguredServerMachineId')
			.mockResolvedValueOnce({
				machineId: null,
				source: 'unavailable',
				errorReason: 'Connection timed out - the server may be unreachable'
			})
			.mockResolvedValueOnce({
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
							address: '10.0.0.1',
							port: 32400,
							uri: `https://10-0-0-1.${MOCK_MACHINE_ID}.plex.direct:32400`,
							local: false,
							relay: false
						}
					]
				}
			])
		);

		const result = await verifyServerMembership('user-token');

		expect(identitySpy).toHaveBeenCalledTimes(2);
		expect(result.isMember).toBe(true);
		expect(result.isOwner).toBe(true);
		expect(result.configuredMachineId).toBe(MOCK_MACHINE_ID);
	});

	it('does not retry /identity when the failure is an authentication error', async () => {
		configSpy = mockConfiguredUrl('http://plex.local.timo.be:32400');
		identitySpy = spyOn(
			serverIdentityService,
			'refreshConfiguredServerMachineId'
		).mockResolvedValue({
			machineId: null,
			source: 'unavailable',
			errorReason:
				'Authentication failed - the PLEX_TOKEN may be invalid or no longer authorized for this server'
		});
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(createMockResponse([]));

		const result = await verifyServerMembership('user-token');

		expect(identitySpy).toHaveBeenCalledTimes(1);
		expect(result.isMember).toBe(false);
		expect(result.reason).toBe('not_reachable');

		// Copy must reflect a misconfiguration, not a transient blip — auth failures
		// will not heal on retry.
		const message = messageForMembershipFailure(result);
		expect(message).not.toContain('Temporary connection issue');
		expect(message).not.toContain('Please try again');
		expect(message).toContain('Could not authenticate');
		expect(message).toContain('PLEX_TOKEN');
	});

	it('returns not_reachable when both /identity attempts fail transiently', async () => {
		configSpy = mockConfiguredUrl('http://plex.local.timo.be:32400');
		identitySpy = spyOn(
			serverIdentityService,
			'refreshConfiguredServerMachineId'
		).mockResolvedValue({
			machineId: null,
			source: 'unavailable',
			errorReason: 'Connection timed out - the server may be unreachable'
		});
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(createMockResponse([]));

		const result = await verifyServerMembership('user-token');

		expect(identitySpy).toHaveBeenCalledTimes(2);
		expect(result.isMember).toBe(false);
		expect(result.reason).toBe('not_reachable');
		expect(result.identityErrorReason).toBe('Connection timed out - the server may be unreachable');

		const message = messageForMembershipFailure(result);
		expect(message).toContain('Temporary connection issue');
		expect(message).toContain('Connection timed out');
	});
});

describe('isTransientIdentityError', () => {
	it('classifies timeouts, connection failures, and 5xx as transient', () => {
		expect(isTransientIdentityError('Connection timed out - the server may be unreachable')).toBe(
			true
		);
		expect(isTransientIdentityError('Could not connect to server - check the URL')).toBe(true);
		expect(isTransientIdentityError('Connection failed')).toBe(true);
		expect(isTransientIdentityError('Server returned 503 Service Unavailable')).toBe(true);
		expect(isTransientIdentityError('Server returned 502 Bad Gateway')).toBe(true);
	});

	it('does not classify SSL/TLS errors as transient (they are misconfiguration)', () => {
		// Self-signed certs, expired certs, hostname mismatches, and reverse-proxy
		// SSL misconfigs do not heal on a 250ms retry — the user needs the targeted
		// PLEX_SERVER_URL copy, not the generic "please try again" blip message.
		expect(
			isTransientIdentityError('SSL certificate error - check your server configuration')
		).toBe(false);
		expect(isTransientIdentityError('SSL/TLS error')).toBe(false);
	});

	it('classifies OS-level transient network errors emitted by sanitizeConnectionError as transient', () => {
		// ECONNRESET / EHOSTUNREACH / ENETUNREACH / EPIPE all fall through
		// classifyConnectionError's explicit branches into sanitizeConnectionError,
		// which emits these exact strings. They are genuinely transient and should
		// trigger the 250ms retry rather than the louder misconfiguration copy.
		expect(isTransientIdentityError('Connection was reset')).toBe(true);
		expect(isTransientIdentityError('Host unreachable')).toBe(true);
		expect(isTransientIdentityError('Network unreachable')).toBe(true);
		expect(isTransientIdentityError('Connection closed unexpectedly')).toBe(true);
		// "Unable to connect to server" (ECONNREFUSED) and "Server not found"
		// (ENOTFOUND) reach errorReason when error.message contains only the
		// lowercase POSIX code — classifyConnectionError's uppercase check
		// misses, falls through to sanitizeConnectionError which lowercases
		// before matching.
		expect(isTransientIdentityError('Unable to connect to server')).toBe(true);
		expect(isTransientIdentityError('Server not found')).toBe(true);
	});

	it('does not classify auth or invalid response errors as transient', () => {
		expect(
			isTransientIdentityError(
				'Authentication failed - the PLEX_TOKEN may be invalid or no longer authorized for this server'
			)
		).toBe(false);
		expect(
			isTransientIdentityError('The server did not return a valid Plex identity response')
		).toBe(false);
		expect(isTransientIdentityError('Server returned 404 Not Found')).toBe(false);
		expect(isTransientIdentityError('Server returned 401 Unauthorized')).toBe(false);
		expect(isTransientIdentityError(null)).toBe(false);
		expect(isTransientIdentityError(undefined)).toBe(false);
	});
});

describe('messageForMembershipFailure', () => {
	it('uses misconfiguration copy when /identity returned an invalid response shape', () => {
		// Parse failure (server-identity.service.ts:85) is non-transient: a
		// reverse proxy returning HTML, the wrong port (e.g. a non-Plex service),
		// or a misconfigured URL won't heal on retry. The user needs to be told
		// to verify PLEX_SERVER_URL — not "please try again".
		const message = messageForMembershipFailure({
			isMember: false,
			isOwner: false,
			reason: 'not_reachable',
			identityErrorReason: 'The server did not return a valid Plex identity response'
		});

		expect(message).not.toContain('Temporary connection issue');
		expect(message).not.toContain('Please try again');
		expect(message).toContain('PLEX_SERVER_URL');
		expect(message).toContain('valid Plex server');
	});

	it('uses misconfiguration copy when /identity returned a non-transient HTTP error (e.g. 404)', () => {
		const message = messageForMembershipFailure({
			isMember: false,
			isOwner: false,
			reason: 'not_reachable',
			identityErrorReason: 'Server returned 404 Not Found'
		});

		expect(message).not.toContain('Temporary connection issue');
		expect(message).toContain('PLEX_SERVER_URL');
	});

	it('uses misconfiguration copy when /identity hit an SSL/TLS error', () => {
		// SSL errors are configuration (self-signed, expired, hostname mismatch,
		// wrong scheme, reverse-proxy SSL misconfig) — surface PLEX_SERVER_URL
		// guidance, not the transient blip copy.
		const message = messageForMembershipFailure({
			isMember: false,
			isOwner: false,
			reason: 'not_reachable',
			identityErrorReason: 'SSL certificate error - check your server configuration'
		});

		expect(message).not.toContain('Temporary connection issue');
		expect(message).not.toContain('Please try again');
		expect(message).toContain('PLEX_SERVER_URL');
		expect(message).toContain('valid Plex server');
	});

	it('keeps the temporary-blip copy when identityErrorReason is genuinely transient', () => {
		const message = messageForMembershipFailure({
			isMember: false,
			isOwner: false,
			reason: 'not_reachable',
			identityErrorReason: 'Connection timed out - the server may be unreachable'
		});

		expect(message).toContain('Temporary connection issue');
		expect(message).toContain('Please try again');
	});
});
