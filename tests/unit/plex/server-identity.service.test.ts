import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as settingsService from '$lib/server/admin/settings.service';
import {
	fetchServerIdentity,
	getConfiguredServerMachineId,
	refreshConfiguredServerMachineId
} from '$lib/server/plex/server-identity.service';

const MOCK_MACHINE_ID = 'a'.repeat(32);
const MOCK_URL = 'http://plex.example.com:32400';
const MOCK_TOKEN = 'plex-token';

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

function mockApiConfig(serverUrl: string, token: string): ReturnType<typeof spyOn> {
	return spyOn(settingsService, 'getApiConfigWithSources').mockResolvedValue({
		plex: {
			serverUrl: { value: serverUrl, source: 'env', isLocked: false },
			token: { value: token, source: 'env', isLocked: false }
		},
		openai: {
			apiKey: { value: '', source: 'default', isLocked: false },
			baseUrl: { value: 'https://api.openai.com/v1', source: 'default', isLocked: false },
			model: { value: 'gpt-5-mini', source: 'default', isLocked: false }
		}
	});
}

describe('fetchServerIdentity', () => {
	let fetchSpy: ReturnType<typeof spyOn>;

	afterEach(() => {
		fetchSpy?.mockRestore();
	});

	it('returns machineIdentifier and friendlyName for a valid /identity response', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse({
				MediaContainer: {
					machineIdentifier: MOCK_MACHINE_ID,
					friendlyName: 'X.A.N.A.',
					version: '1.32.0',
					claimed: true
				}
			})
		);

		const result = await fetchServerIdentity(MOCK_URL, MOCK_TOKEN);

		expect(result.identity).toEqual({
			machineIdentifier: MOCK_MACHINE_ID,
			friendlyName: 'X.A.N.A.'
		});
		expect(result.errorReason).toBeNull();
	});

	it('returns identity with null friendlyName when the field is missing', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse({
				MediaContainer: { machineIdentifier: MOCK_MACHINE_ID }
			})
		);

		const result = await fetchServerIdentity(MOCK_URL, MOCK_TOKEN);

		expect(result.identity?.friendlyName).toBeNull();
		expect(result.identity?.machineIdentifier).toBe(MOCK_MACHINE_ID);
	});

	it('returns a specific auth error reason on 401', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(createMockResponse(null, false, 401));

		const result = await fetchServerIdentity(MOCK_URL, MOCK_TOKEN);

		expect(result.identity).toBeNull();
		expect(result.errorReason).toContain('Authentication failed');
	});

	it('returns errorReason on non-401 HTTP error', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(createMockResponse(null, false, 500));

		const result = await fetchServerIdentity(MOCK_URL, MOCK_TOKEN);

		expect(result.identity).toBeNull();
		expect(result.errorReason).toContain('500');
	});

	it('classifies AbortError (timeout) using security.classifyConnectionError', async () => {
		const abortError = new Error('aborted');
		abortError.name = 'AbortError';
		fetchSpy = spyOn(global, 'fetch').mockRejectedValue(abortError);

		const result = await fetchServerIdentity(MOCK_URL, MOCK_TOKEN);

		expect(result.identity).toBeNull();
		expect(result.errorReason).toContain('timed out');
	});

	it('returns invalid-shape error when /identity returns unexpected JSON', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse({ notAPlexServer: true })
		);

		const result = await fetchServerIdentity(MOCK_URL, MOCK_TOKEN);

		expect(result.identity).toBeNull();
		expect(result.errorReason).toContain('valid Plex identity');
	});

	it('returns "not configured" reason when URL or token is empty', async () => {
		const result = await fetchServerIdentity('', MOCK_TOKEN);
		expect(result.identity).toBeNull();
		expect(result.errorReason).toContain('not configured');
	});

	it('strips trailing slashes from the server URL before calling /identity', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse({
				MediaContainer: { machineIdentifier: MOCK_MACHINE_ID }
			})
		);

		await fetchServerIdentity(`${MOCK_URL}///`, MOCK_TOKEN);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const firstCall = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(firstCall[0]).toBe(`${MOCK_URL}/identity`);
	});
});

describe('getConfiguredServerMachineId', () => {
	let fetchSpy: ReturnType<typeof spyOn>;
	let configSpy: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		await settingsService.clearCachedServerMachineId();
	});

	afterEach(async () => {
		fetchSpy?.mockRestore();
		configSpy?.mockRestore();
		await settingsService.clearCachedServerMachineId();
	});

	it('returns the cached machineId without making an HTTP call', async () => {
		await settingsService.setCachedServerMachineId(MOCK_MACHINE_ID);
		fetchSpy = spyOn(global, 'fetch');

		const result = await getConfiguredServerMachineId();

		expect(result.machineId).toBe(MOCK_MACHINE_ID);
		expect(result.source).toBe('cache');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('fetches /identity on cache miss and writes the result back to the cache', async () => {
		configSpy = mockApiConfig(MOCK_URL, MOCK_TOKEN);
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse({
				MediaContainer: { machineIdentifier: MOCK_MACHINE_ID, friendlyName: 'X.A.N.A.' }
			})
		);

		const result = await getConfiguredServerMachineId();

		expect(result.machineId).toBe(MOCK_MACHINE_ID);
		expect(result.source).toBe('fresh');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(await settingsService.getCachedServerMachineId()).toBe(MOCK_MACHINE_ID);
	});

	it('returns unavailable + errorReason when /identity fails and no cache is present', async () => {
		configSpy = mockApiConfig(MOCK_URL, MOCK_TOKEN);
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(createMockResponse(null, false, 401));

		const result = await getConfiguredServerMachineId();

		expect(result.machineId).toBeNull();
		expect(result.source).toBe('unavailable');
		expect(result.errorReason).toContain('Authentication failed');
		expect(await settingsService.getCachedServerMachineId()).toBeNull();
	});
});

describe('refreshConfiguredServerMachineId', () => {
	let fetchSpy: ReturnType<typeof spyOn>;
	let configSpy: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		await settingsService.clearCachedServerMachineId();
	});

	afterEach(async () => {
		fetchSpy?.mockRestore();
		configSpy?.mockRestore();
		await settingsService.clearCachedServerMachineId();
	});

	it('bypasses the cache and always hits /identity', async () => {
		await settingsService.setCachedServerMachineId('stale-id');
		configSpy = mockApiConfig(MOCK_URL, MOCK_TOKEN);
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(
			createMockResponse({
				MediaContainer: { machineIdentifier: MOCK_MACHINE_ID }
			})
		);

		const result = await refreshConfiguredServerMachineId();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(result.machineId).toBe(MOCK_MACHINE_ID);
		expect(result.source).toBe('fresh');
		expect(await settingsService.getCachedServerMachineId()).toBe(MOCK_MACHINE_ID);
	});
});
