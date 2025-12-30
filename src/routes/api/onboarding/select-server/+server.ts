import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	setAppSetting,
	AppSettingsKey,
	setCachedServerName
} from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';
import {
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexServerIdentitySchema
} from '$lib/server/auth/types';
import { sanitizeConnectionError } from '$lib/server/security/error-sanitizer';

const PLEX_SERVER_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

const CONNECTION_TIMEOUT_MS = 15000;

const SelectServerSchema = z.object({
	serverUrl: z.string().url('Invalid server URL'),
	accessToken: z.string().min(1, 'Access token is required'),
	serverName: z.string().min(1, 'Server name is required')
});

interface ConnectionTestResult {
	success: boolean;
	error?: string;
	machineIdentifier?: string;
}

async function testConnection(url: string, accessToken: string): Promise<ConnectionTestResult> {
	const normalizedUrl = url.replace(/\/+$/, '');
	const endpoint = `${normalizedUrl}/identity`;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

	try {
		const response = await fetch(endpoint, {
			headers: {
				...PLEX_SERVER_HEADERS,
				'X-Plex-Token': accessToken
			},
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		if (response.status === 401) {
			return { success: false, error: 'Authentication failed - the access token may be invalid' };
		}

		if (!response.ok) {
			return {
				success: false,
				error: `Server returned error: ${response.status} ${response.statusText}`
			};
		}

		const data = await response.json();
		const identityResult = PlexServerIdentitySchema.safeParse(data);

		if (!identityResult.success) {
			return { success: false, error: 'This does not appear to be a Plex Media Server' };
		}

		return {
			success: true,
			machineIdentifier: identityResult.data.MediaContainer.machineIdentifier
		};
	} catch (fetchError) {
		clearTimeout(timeoutId);

		if (fetchError instanceof Error) {
			if (fetchError.name === 'AbortError') {
				return { success: false, error: 'Connection timed out - the server may be unreachable' };
			}

			if (
				fetchError.message.includes('certificate') ||
				fetchError.message.includes('SSL') ||
				fetchError.message.includes('TLS')
			) {
				return {
					success: false,
					error:
						'SSL certificate error - try a different connection type or check your server configuration'
				};
			}

			if (
				fetchError.message.includes('ENOTFOUND') ||
				fetchError.message.includes('ECONNREFUSED') ||
				fetchError.message.includes('getaddrinfo')
			) {
				return {
					success: false,
					error:
						'Could not connect to server - check the URL and ensure the server is reachable from this host'
				};
			}

			return { success: false, error: sanitizeConnectionError(fetchError) };
		}

		return { success: false, error: 'Connection failed - please try a different connection type' };
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Authentication required');
	}

	if (!locals.user.isAdmin) {
		error(403, 'Only server owners can configure Obzorarr');
	}

	try {
		const body = await request.json();
		const parseResult = SelectServerSchema.safeParse(body);

		if (!parseResult.success) {
			const errorMessage = parseResult.error.issues[0]?.message ?? 'Invalid request';
			error(400, errorMessage);
		}

		const { serverUrl, accessToken, serverName } = parseResult.data;

		logger.debug(`Testing connection to: ${serverUrl}`, 'Onboarding');
		const testResult = await testConnection(serverUrl, accessToken);

		if (!testResult.success) {
			logger.warn(`Connection test failed for ${serverUrl}: ${testResult.error}`, 'Onboarding');
			return json({
				success: false,
				error: testResult.error
			});
		}

		await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, serverUrl);
		await setAppSetting(AppSettingsKey.PLEX_TOKEN, accessToken);
		await setCachedServerName(serverName);

		logger.info(`Onboarding: Server configured - ${serverName} (${serverUrl})`, 'Onboarding');

		return json({
			success: true,
			serverName
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		logger.error(
			`Failed to save server config: ${err instanceof Error ? err.message : String(err)}`,
			'Onboarding'
		);
		error(500, 'Failed to save server configuration');
	}
};
