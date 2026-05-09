import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { isPlexInsecureLocalHttpAllowed } from '$lib/server/admin/settings.service';
import {
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	PlexServerIdentitySchema
} from '$lib/server/auth/types';
import { logger } from '$lib/server/logging';
import { OnboardingClaimRequiredError, requireActiveOnboardingClaim } from '$lib/server/onboarding';
import { resolveOwnedServerToken } from '$lib/server/onboarding/plex-server-selection';
import { fingerprintPlexIdentifier, formatPlexUrlDiagnostic } from '$lib/server/plex/diagnostics';
import { classifyConnectionError } from '$lib/server/security';
import { normalizePlexServerUrl } from '$lib/server/security/credentialed-url';
import type { RequestHandler } from './$types';

const PLEX_SERVER_HEADERS = {
	Accept: 'application/json',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION
} as const;

const TestConnectionSchema = z
	.object({
		url: z.string().url('Invalid URL format'),
		accessToken: z.string().min(1).optional(),
		token: z.string().min(1).optional(),
		allowInsecureLocalHttp: z.boolean().optional(),
		clientIdentifier: z.string().min(1).optional()
	})
	.refine((body) => Boolean(body.accessToken ?? body.token ?? body.clientIdentifier), {
		message: 'Access token is required',
		path: ['accessToken']
	});

const CONNECTION_TIMEOUT_MS = 10000;

export const POST: RequestHandler = async ({ request, locals, cookies, url }) => {
	// Require authenticated admin user
	if (!locals.user) {
		error(401, 'Authentication required');
	}

	if (!locals.user.isAdmin) {
		error(403, 'Only server owners can configure Obzorarr');
	}
	try {
		await requireActiveOnboardingClaim(cookies, { requestUrl: url });
	} catch (err) {
		if (err instanceof OnboardingClaimRequiredError) {
			error(403, err.message);
		}
		throw err;
	}

	try {
		// Parse and validate request body
		const body = await request.json();
		const parseResult = TestConnectionSchema.safeParse(body);

		if (!parseResult.success) {
			const errorMessage = parseResult.error.issues[0]?.message ?? 'Invalid request';
			return json({ success: false, error: errorMessage }, { status: 400 });
		}

		const { clientIdentifier } = parseResult.data;
		let url: string;
		try {
			url = normalizePlexServerUrl(parseResult.data.url, {
				allowInsecureLocalHttp:
					parseResult.data.allowInsecureLocalHttp === true ||
					(await isPlexInsecureLocalHttpAllowed())
			});
		} catch (err) {
			return json(
				{
					success: false,
					error: err instanceof Error ? err.message : 'Invalid Plex server URL'
				},
				{ status: 400 }
			);
		}
		const accessToken =
			parseResult.data.accessToken ??
			parseResult.data.token ??
			(await resolveOwnedServerToken({
				sessionId: cookies.get('session'),
				clientIdentifier: clientIdentifier!
			}));

		// Normalize URL - remove trailing slash
		const normalizedUrl = url.replace(/\/+$/, '');
		const endpoint = `${normalizedUrl}/identity`;

		logger.debug(
			`Testing connection diagnostic=${formatPlexUrlDiagnostic(endpoint, 'default')}`,
			'Onboarding'
		);

		// Create abort controller for timeout
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

			// Check for authentication errors
			if (response.status === 401) {
				logger.debug('Connection test failed: Authentication failed', 'Onboarding');
				return json(
					{
						success: false,
						error: 'Authentication failed - the access token may be invalid'
					},
					{ status: 401 }
				);
			}

			if (!response.ok) {
				logger.debug(
					`Connection test failed: ${response.status} ${response.statusText}`,
					'Onboarding'
				);
				return json(
					{
						success: false,
						error: `Server returned error: ${response.status} ${response.statusText}`
					},
					{ status: 502 }
				);
			}

			// Parse and validate response. A non-JSON body (e.g. an HTML gateway page
			// from a non-Plex service) means the endpoint is reachable but is not a
			// Plex Media Server — surface that as 422, not as a 503 connectivity error.
			let data: unknown;
			try {
				data = await response.json();
			} catch {
				logger.debug('Connection test failed: Response body was not valid JSON', 'Onboarding');
				return json(
					{
						success: false,
						error: 'This does not appear to be a Plex Media Server'
					},
					{ status: 422 }
				);
			}
			const identityResult = PlexServerIdentitySchema.safeParse(data);

			if (!identityResult.success) {
				logger.debug('Connection test failed: Not a valid Plex server response', 'Onboarding');
				return json(
					{
						success: false,
						error: 'This does not appear to be a Plex Media Server'
					},
					{ status: 422 }
				);
			}

			const { machineIdentifier, friendlyName } = identityResult.data.MediaContainer;
			const serverName = friendlyName || 'Plex Media Server';

			logger.info(
				`Connection test successful serverNameHash=${fingerprintPlexIdentifier(
					serverName
				)} machineHash=${fingerprintPlexIdentifier(machineIdentifier)}`,
				'Onboarding'
			);

			return json({
				success: true,
				serverName,
				machineIdentifier
			});
		} catch (fetchError) {
			if (fetchError instanceof Error) {
				const errorMessage = classifyConnectionError(fetchError);
				logger.debug(`Connection test failed: ${errorMessage}`, 'Onboarding');
				return json(
					{
						success: false,
						error: errorMessage
					},
					{ status: 503 }
				);
			}

			logger.debug('Connection test failed: Unknown error', 'Onboarding');
			return json(
				{
					success: false,
					error: 'Connection failed'
				},
				{ status: 503 }
			);
		} finally {
			// Keep the timer armed until after response.json() + parsing complete so
			// CONNECTION_TIMEOUT_MS caps the whole /identity call, not just the
			// initial fetch resolving its headers.
			clearTimeout(timeoutId);
		}
	} catch (err) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		logger.error(
			`Test connection error: ${err instanceof Error ? err.message : String(err)}`,
			'Onboarding'
		);
		return json(
			{
				success: false,
				error: 'An unexpected error occurred'
			},
			{ status: 500 }
		);
	}
};
