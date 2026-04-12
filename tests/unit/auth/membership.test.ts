import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';

// Stub the settings service so the "no match" precondition is not sensitive to
// whatever .env.test / DB defaults resolve to at runtime. We pin the configured
// Plex server URL to a value that clearly does not match the mocked resource's
// machine id ('unrelated-machine-id') or address, forcing findConfiguredServer
// to return undefined.
mock.module('$lib/server/admin/settings.service', () => ({
	getApiConfigWithSources: () =>
		Promise.resolve({
			plex: {
				serverUrl: {
					value: 'https://plex.example.com:32400',
					source: 'db',
					isLocked: false
				},
				token: { value: '', source: 'default', isLocked: false }
			},
			openai: {
				apiKey: { value: '', source: 'default', isLocked: false },
				baseUrl: {
					value: 'https://api.openai.com/v1',
					source: 'default',
					isLocked: false
				},
				model: { value: 'gpt-5-mini', source: 'default', isLocked: false }
			}
		})
}));

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

describe('verifyServerMembership', () => {
	let fetchSpy: ReturnType<typeof spyOn>;

	afterEach(() => {
		fetchSpy?.mockRestore();
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
});
