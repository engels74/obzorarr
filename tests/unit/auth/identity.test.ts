import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as settingsService from '$lib/server/admin/settings.service';
import {
	clearUsersCache,
	getRandomNonOwnerUser,
	getServerOwner,
	getServerUsers,
	getUserById,
	getUserByUsername,
	resolveUserIdentifier
} from '$lib/server/auth/dev-users';
import {
	identityRetry,
	isTransientIdentityError,
	messageForMembershipFailure,
	verifyServerMembership
} from '$lib/server/auth/membership';
import * as plexOAuth from '$lib/server/auth/plex-oauth';
import * as serverIdentityService from '$lib/server/plex/server-identity.service';
import { createMockJsonResponse } from '../../helpers/requests';

const DEV_MACHINE_ID = 'mock-machine-id-123456';
const RESOURCE_MACHINE_ID = 'a'.repeat(32);
function createMockHeaders(contentType = 'application/json') {
	return {
		get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null)
	};
}
function createMockIdentityResponse() {
	return {
		ok: true,
		headers: createMockHeaders(),
		json: () =>
			Promise.resolve({
				MediaContainer: {
					machineIdentifier: DEV_MACHINE_ID
				}
			})
	};
}
function createMockFriendsResponse(
	sharedUsers: Array<{ id: number; username: string; email?: string; thumb?: string }> = []
) {
	return {
		ok: true,
		headers: createMockHeaders(),
		json: () =>
			Promise.resolve(
				sharedUsers.map((u, index) => ({
					id: u.id,
					username: u.username,
					email: u.email,
					thumb: u.thumb,
					sharedServers: [{ id: 1000 + index, machineIdentifier: DEV_MACHINE_ID }]
				}))
			)
	};
}
describe('dev-users module', () => {
	let fetchMock: ReturnType<typeof spyOn>;
	let mockGetPlexUserInfo: ReturnType<typeof spyOn>;
	beforeEach(() => {
		clearUsersCache();
		mockGetPlexUserInfo = spyOn(plexOAuth, 'getPlexUserInfo').mockImplementation(() =>
			Promise.resolve({
				id: 12345,
				uuid: 'owner-uuid',
				username: 'ServerOwner',
				email: 'owner@example.com',
				thumb: 'https://plex.tv/users/owner/avatar'
			})
		);
	});
	afterEach(() => {
		if (fetchMock) {
			fetchMock.mockRestore();
		}
		mockGetPlexUserInfo.mockRestore();
	});
	const mockSharedUsers = [
		{ id: 1001, username: 'SharedUser1', email: 'user1@example.com', thumb: 'thumb1' },
		{ id: 1002, username: 'SharedUser2', email: 'user2@example.com', thumb: 'thumb2' },
		{ id: 1003, username: 'SharedUser3' }
	];
	function setupFetchMock(sharedUsers = mockSharedUsers) {
		fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
			const urlStr = url.toString();
			if (urlStr.includes('/identity')) {
				return Promise.resolve(createMockIdentityResponse() as Response);
			}
			if (urlStr.includes('/api/v2/friends')) {
				return Promise.resolve(createMockFriendsResponse(sharedUsers) as Response);
			}
			return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
		}) as typeof fetch);
	}
	describe('getServerUsers', () => {
		it('fetches owner and shared users from Plex API', async () => {
			setupFetchMock();
			const result = await getServerUsers();
			expect(result.owner).toBeDefined();
			expect(result.owner.plexId).toBe(12345);
			expect(result.owner.username).toBe('ServerOwner');
			expect(result.owner.email).toBe('owner@example.com');
			expect(result.owner.isOwner).toBe(true);
			expect(result.sharedUsers).toHaveLength(3);
			expect(result.sharedUsers[0]?.plexId).toBe(1001);
			expect(result.sharedUsers[0]?.isOwner).toBe(false);
		});
		it('handles shared users without optional fields', async () => {
			setupFetchMock();
			const result = await getServerUsers();
			const user3 = result.sharedUsers[2];
			expect(user3?.email).toBeNull();
			expect(user3?.thumb).toBeNull();
		});
		it('returns cached data on subsequent calls', async () => {
			setupFetchMock();
			await getServerUsers();
			expect(mockGetPlexUserInfo).toHaveBeenCalledTimes(1);
			const result2 = await getServerUsers();
			expect(mockGetPlexUserInfo).toHaveBeenCalledTimes(1);
			expect(result2.owner.username).toBe('ServerOwner');
		});
		it('handles empty shared users list', async () => {
			setupFetchMock([]);
			const result = await getServerUsers();
			expect(result.owner).toBeDefined();
			expect(result.sharedUsers).toHaveLength(0);
		});
	});
	describe('lookup helpers', () => {
		it('returns only the server owner', async () => {
			setupFetchMock();
			const owner = await getServerOwner();
			expect(owner).toMatchObject({ plexId: 12345, username: 'ServerOwner', isOwner: true });
		});
		it.each([
			['owner by plexId', () => getUserById(12345), { username: 'ServerOwner', isOwner: true }],
			[
				'shared user by plexId',
				() => getUserById(1002),
				{ username: 'SharedUser2', isOwner: false }
			],
			['missing plexId', () => getUserById(99999), null],
			[
				'owner by username',
				() => getUserByUsername('serverowner'),
				{ plexId: 12345, isOwner: true }
			],
			['shared user by username', () => getUserByUsername('SharedUser1'), { plexId: 1001 }],
			['case-insensitive username', () => getUserByUsername('SHAREDUSER2'), { plexId: 1002 }],
			['missing username', () => getUserByUsername('NonExistentUser'), null]
		] as const)('resolves %s', async (_name, lookup, expected) => {
			setupFetchMock();
			const user = await lookup();
			if (expected === null) expect(user).toBeNull();
			else expect(user).toMatchObject(expected);
		});
	});
	describe('getRandomNonOwnerUser', () => {
		it('returns a shared user (not owner)', async () => {
			setupFetchMock();
			const user = await getRandomNonOwnerUser();
			expect(user).not.toBeNull();
			expect(user?.isOwner).toBe(false);
			expect(user).toBeDefined();
			expect([1001, 1002, 1003]).toContain(user!.plexId);
		});
		it('returns null when no shared users exist', async () => {
			setupFetchMock([]);
			const user = await getRandomNonOwnerUser();
			expect(user).toBeNull();
		});
	});
	describe('resolveUserIdentifier', () => {
		it.each([
			['1001', { plexId: 1001, username: 'SharedUser1' }],
			['SharedUser2', { plexId: 1002 }],
			['nonexistent', null],
			['-123', null],
			['0', null]
		] as const)('resolves %p', async (identifier, expected) => {
			setupFetchMock();
			const user = await resolveUserIdentifier(identifier);
			if (expected === null) expect(user).toBeNull();
			else expect(user).toMatchObject(expected);
		});
	});
	describe('clearUsersCache', () => {
		it('forces re-fetch on next call', async () => {
			setupFetchMock();
			await getServerUsers();
			expect(mockGetPlexUserInfo).toHaveBeenCalledTimes(1);
			clearUsersCache();
			await getServerUsers();
			expect(mockGetPlexUserInfo).toHaveBeenCalledTimes(2);
		});
	});
	describe('error handling', () => {
		it('throws error when identity endpoint returns non-ok response', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve({
						ok: false,
						status: 401,
						statusText: 'Unauthorized',
						headers: createMockHeaders()
					} as Response);
				}
				return Promise.resolve(createMockFriendsResponse([]) as Response);
			}) as typeof fetch);
			await expect(getServerUsers()).rejects.toThrow('Failed to get server identity');
		});
		it('throws error when friends endpoint returns non-ok response', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve(createMockIdentityResponse() as Response);
				}
				if (urlStr.includes('/api/v2/friends')) {
					return Promise.resolve({
						ok: false,
						status: 403,
						statusText: 'Forbidden',
						headers: createMockHeaders()
					} as Response);
				}
				return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
			}) as typeof fetch);
			await expect(getServerUsers()).rejects.toThrow('Failed to get friends');
		});
		it('throws error when identity response has invalid schema', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve({
						ok: true,
						headers: createMockHeaders(),
						json: () => Promise.resolve({ invalid: 'data' })
					} as Response);
				}
				return Promise.resolve(createMockFriendsResponse([]) as Response);
			}) as typeof fetch);
			await expect(getServerUsers()).rejects.toThrow('Invalid server identity response');
		});
		it('returns empty shared users when friends response has invalid schema', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve(createMockIdentityResponse() as Response);
				}
				if (urlStr.includes('/api/v2/friends')) {
					return Promise.resolve({
						ok: true,
						headers: createMockHeaders(),
						json: () => Promise.resolve({ invalid: 'data' })
					} as Response);
				}
				return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
			}) as typeof fetch);
			const result = await getServerUsers();
			expect(result.owner).toBeDefined();
			expect(result.sharedUsers).toHaveLength(0);
		});
		it('throws error when friends response fails to parse as JSON', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve(createMockIdentityResponse() as Response);
				}
				if (urlStr.includes('/api/v2/friends')) {
					return Promise.resolve({
						ok: true,
						headers: createMockHeaders('application/xml; charset=utf-8'),
						json: () => Promise.reject(new Error('Unexpected token <'))
					} as Response);
				}
				return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
			}) as typeof fetch);
			await expect(getServerUsers()).rejects.toThrow('Unexpected token <');
		});
		it('throws error when JSON response is malformed', async () => {
			fetchMock = spyOn(globalThis, 'fetch').mockImplementation(((url: URL | RequestInfo) => {
				const urlStr = url.toString();
				if (urlStr.includes('/identity')) {
					return Promise.resolve(createMockIdentityResponse() as Response);
				}
				if (urlStr.includes('/api/v2/friends')) {
					return Promise.resolve({
						ok: true,
						headers: createMockHeaders('application/json'),
						json: () => Promise.reject(new Error('Unexpected end of JSON input'))
					} as Response);
				}
				return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
			}) as typeof fetch);
			await expect(getServerUsers()).rejects.toThrow('Unexpected end of JSON input');
		});
	});
});
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
type IdentityResult = Awaited<
	ReturnType<typeof serverIdentityService.refreshConfiguredServerMachineId>
>;
function identityResult(overrides: Partial<IdentityResult> = {}): IdentityResult {
	return { machineId: RESOURCE_MACHINE_ID, source: 'fresh', errorReason: null, ...overrides };
}
function plexResource(overrides: Record<string, unknown> = {}) {
	return {
		name: 'Home Server',
		product: 'Plex Media Server',
		clientIdentifier: RESOURCE_MACHINE_ID,
		owned: true,
		provides: 'server',
		connections: [],
		...overrides
	};
}
function plexDirectConnection(address: string, local = false) {
	return {
		protocol: 'https',
		address,
		port: 32400,
		uri: `https://${address.replaceAll('.', '-')}.${RESOURCE_MACHINE_ID}.plex.direct:32400`,
		local,
		relay: false
	};
}
describe('verifyServerMembership', () => {
	let fetchSpy: ReturnType<typeof spyOn>;
	let configSpy: ReturnType<typeof spyOn>;
	let identitySpy: ReturnType<typeof spyOn>;
	const originalIdentityRetryDelayMs = identityRetry.delayMs;
	const transientIdentity = identityResult({
		machineId: null,
		source: 'unavailable',
		errorReason: 'Connection timed out - the server may be unreachable'
	});
	beforeEach(() => {
		identityRetry.delayMs = 0;
	});
	afterEach(() => {
		fetchSpy?.mockRestore();
		configSpy?.mockRestore();
		identitySpy?.mockRestore();
		identityRetry.delayMs = originalIdentityRetryDelayMs;
	});
	function mockIdentity(result: IdentityResult) {
		identitySpy = spyOn(
			serverIdentityService,
			'refreshConfiguredServerMachineId'
		).mockResolvedValue(result);
	}
	function mockResources(resources: unknown[]) {
		fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(createMockJsonResponse(resources));
	}
	it.each([
		[
			'no matching server in resources',
			'http://test-plex-server:32400',
			identityResult(),
			[
				plexResource({
					name: 'Some Other Server',
					clientIdentifier: 'unrelated-machine-id',
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
				})
			],
			{
				isMember: false,
				isOwner: false,
				reason: 'not_in_resources',
				configuredMachineId: RESOURCE_MACHINE_ID
			}
		],
		[
			'plain LAN URL matches plex.direct resource through identity',
			'http://192.168.1.34:32400',
			identityResult(),
			[
				plexResource({
					publicAddress: '203.0.113.10',
					connections: [
						plexDirectConnection('192.168.1.34', true),
						plexDirectConnection('203.0.113.10')
					]
				})
			],
			{ isMember: true, isOwner: true, serverName: 'Home Server' }
		],
		[
			'hostname URL matches by identity machineIdentifier',
			'http://plex.local.timo.be:32400',
			identityResult(),
			[
				plexResource({
					name: 'X.A.N.A.',
					connections: [plexDirectConnection('10.244.0.25', true)]
				})
			],
			{
				isMember: true,
				isOwner: true,
				serverName: 'X.A.N.A.',
				configuredMachineId: RESOURCE_MACHINE_ID
			}
		],
		[
			'unreachable identity with no URL match',
			'http://plex.local.timo.be:32400',
			transientIdentity,
			[
				plexResource({
					name: 'Some Server',
					clientIdentifier: 'a-different-machine-id',
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
				})
			],
			{ isMember: false, reason: 'not_reachable', configuredMachineId: undefined }
		],
		[
			'identity succeeds but resource list has another server',
			'http://plex.local.timo.be:32400',
			identityResult(),
			[plexResource({ name: 'Unrelated Server', clientIdentifier: 'b'.repeat(32) })],
			{ isMember: false, reason: 'not_in_resources', configuredMachineId: RESOURCE_MACHINE_ID }
		],
		[
			'identity match on a server not owned by the user',
			'http://plex.local.timo.be:32400',
			identityResult({ source: 'cache' }),
			[plexResource({ name: "Friend's Server", owned: false })],
			{
				isMember: true,
				isOwner: false,
				reason: 'not_owner',
				configuredMachineId: RESOURCE_MACHINE_ID
			}
		]
	] as const)('%s', async (_name, configuredUrl, identity, resources, expected) => {
		configSpy = mockConfiguredUrl(configuredUrl);
		mockIdentity(identity);
		mockResources([...resources]);
		const result = await verifyServerMembership('user-token');
		const expectedRecord = expected as Record<string, unknown>;
		const { configuredMachineId: _configuredMachineId, ...matchExpected } = expectedRecord;
		expect(result).toMatchObject(matchExpected);
		if ('configuredMachineId' in expectedRecord) {
			const configuredMachineId = expectedRecord.configuredMachineId as string | undefined;
			expect(result.configuredMachineId).toBe(configuredMachineId);
		}
	});
	it('retries /identity once on transient failure and admits membership when the retry succeeds', async () => {
		configSpy = mockConfiguredUrl('http://plex.local.timo.be:32400');
		identitySpy = spyOn(serverIdentityService, 'refreshConfiguredServerMachineId')
			.mockResolvedValueOnce(transientIdentity)
			.mockResolvedValueOnce(identityResult());
		mockResources([
			plexResource({ name: 'X.A.N.A.', connections: [plexDirectConnection('10.0.0.1')] })
		]);
		const result = await verifyServerMembership('user-token');
		expect(identitySpy).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({
			isMember: true,
			isOwner: true,
			configuredMachineId: RESOURCE_MACHINE_ID
		});
	});
	it('does not retry /identity when the failure is an authentication error', async () => {
		configSpy = mockConfiguredUrl('http://plex.local.timo.be:32400');
		mockIdentity(
			identityResult({
				machineId: null,
				source: 'unavailable',
				errorReason:
					'Authentication failed - the PLEX_TOKEN may be invalid or no longer authorized for this server'
			})
		);
		mockResources([]);
		const result = await verifyServerMembership('user-token');
		const message = messageForMembershipFailure(result);
		expect(identitySpy).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ isMember: false, reason: 'not_reachable' });
		expect(message).not.toContain('Temporary connection issue');
		expect(message).not.toContain('Please try again');
		expect(message).toContain('Could not authenticate');
		expect(message).toContain('PLEX_TOKEN');
	});
	it('returns not_reachable when both /identity attempts fail transiently', async () => {
		configSpy = mockConfiguredUrl('http://plex.local.timo.be:32400');
		mockIdentity(transientIdentity);
		mockResources([]);
		const result = await verifyServerMembership('user-token');
		const message = messageForMembershipFailure(result);
		expect(identitySpy).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({
			isMember: false,
			reason: 'not_reachable',
			identityErrorReason: 'Connection timed out - the server may be unreachable'
		});
		expect(message).toContain('Temporary connection issue');
		expect(message).toContain('Connection timed out');
	});
});
describe('isTransientIdentityError', () => {
	it.each([
		['timeout', 'Connection timed out - the server may be unreachable', true],
		['connect hint', 'Could not connect to server - check the URL', true],
		['connection failed', 'Connection failed', true],
		['503', 'Server returned 503 Service Unavailable', true],
		['502', 'Server returned 502 Bad Gateway', true],
		['connection reset', 'Connection was reset', true],
		['host unreachable', 'Host unreachable', true],
		['network unreachable', 'Network unreachable', true],
		['closed unexpectedly', 'Connection closed unexpectedly', true],
		['ECONNREFUSED sanitized', 'Unable to connect to server', true],
		['ENOTFOUND sanitized', 'Server not found', true],
		['certificate error', 'SSL certificate error - check your server configuration', false],
		['TLS error', 'SSL/TLS error', false],
		[
			'auth error',
			'Authentication failed - the PLEX_TOKEN may be invalid or no longer authorized for this server',
			false
		],
		[
			'invalid identity response',
			'The server did not return a valid Plex identity response',
			false
		],
		['404', 'Server returned 404 Not Found', false],
		['401', 'Server returned 401 Unauthorized', false],
		['null', null, false],
		['undefined', undefined, false]
	] as const)('classifies %s as transient=%s', (_name, reason, expected) => {
		expect(isTransientIdentityError(reason)).toBe(expected);
	});
});
describe('messageForMembershipFailure', () => {
	it.each([
		[
			'invalid response shape',
			'The server did not return a valid Plex identity response',
			['PLEX_SERVER_URL', 'valid Plex server'],
			['Temporary connection issue', 'Please try again']
		],
		[
			'non-transient HTTP error',
			'Server returned 404 Not Found',
			['PLEX_SERVER_URL'],
			['Temporary connection issue']
		],
		[
			'SSL/TLS error',
			'SSL certificate error - check your server configuration',
			['PLEX_SERVER_URL', 'valid Plex server'],
			['Temporary connection issue', 'Please try again']
		],
		[
			'transient reachability blip',
			'Connection timed out - the server may be unreachable',
			['Temporary connection issue', 'Please try again'],
			[]
		]
	] as const)('uses expected copy for %s', (_name, identityErrorReason, includes, excludes) => {
		const message = messageForMembershipFailure({
			isMember: false,
			isOwner: false,
			reason: 'not_reachable',
			identityErrorReason
		});
		for (const text of includes) expect(message).toContain(text);
		for (const text of excludes) expect(message).not.toContain(text);
	});
});
