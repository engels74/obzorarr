import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { POST } from '../../../src/routes/api/onboarding/test-connection/+server';

type HandlerArgs = Parameters<typeof POST>[0];

function runPost(locals: HandlerArgs['locals'], body: unknown): ReturnType<typeof POST> {
	const request = new Request('http://localhost/api/onboarding/test-connection', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	return POST({ request, locals } as unknown as HandlerArgs);
}

function makeIdentityResponse(): Response {
	return new Response(
		JSON.stringify({
			MediaContainer: {
				machineIdentifier: 'a'.repeat(32),
				friendlyName: 'Test Server'
			}
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	);
}

const adminLocals = {
	user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
} as HandlerArgs['locals'];

describe('POST /api/onboarding/test-connection token alias', () => {
	let fetchSpy: ReturnType<typeof spyOn>;

	afterEach(() => {
		fetchSpy?.mockRestore();
	});

	it('accepts the canonical accessToken field', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(makeIdentityResponse());

		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400',
			accessToken: 'plex-token-abc'
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { success: boolean; serverName?: string };
		expect(body.success).toBe(true);
		expect(body.serverName).toBe('Test Server');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as
			| Record<string, string>
			| undefined;
		expect(headers?.['X-Plex-Token']).toBe('plex-token-abc');
	});

	it('accepts the legacy token alias and uses it as X-Plex-Token', async () => {
		fetchSpy = spyOn(global, 'fetch').mockResolvedValue(makeIdentityResponse());

		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400',
			token: 'plex-token-xyz'
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { success: boolean };
		expect(body.success).toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as
			| Record<string, string>
			| undefined;
		expect(headers?.['X-Plex-Token']).toBe('plex-token-xyz');
	});

	it('rejects requests with neither accessToken nor token', async () => {
		const response = await runPost(adminLocals, {
			url: 'http://plex.local:32400'
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { success: boolean; error?: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain('Access token');
	});
});
