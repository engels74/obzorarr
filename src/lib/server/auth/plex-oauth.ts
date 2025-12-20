import {
	PlexPinResponseSchema,
	PlexUserSchema,
	PlexAuthApiError,
	PinExpiredError,
	PLEX_CLIENT_ID,
	PLEX_PRODUCT,
	PLEX_VERSION,
	type PlexPinResponse,
	type PlexUser,
	type PinInfo,
	type PollPinOptions
} from './types';

/**
 * Plex OAuth Module
 *
 * Implements Plex PIN-based OAuth authentication flow:
 * 1. Request a PIN from plex.tv
 * 2. User authorizes at Plex auth URL
 * 3. Poll PIN until authToken is present
 * 4. Use authToken to get user information
 *
 * Implements Requirement 1.1:
 * - Redirect to Plex OAuth authorization endpoint
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Plex.tv API base URL
 */
const PLEX_TV_URL = 'https://plex.tv';

/**
 * Plex auth webapp URL
 */
const PLEX_AUTH_URL = 'https://app.plex.tv/auth';

/**
 * Standard headers for Plex.tv API requests
 */
const PLEX_TV_HEADERS = {
	Accept: 'application/json',
	'Content-Type': 'application/x-www-form-urlencoded',
	'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
	'X-Plex-Product': PLEX_PRODUCT,
	'X-Plex-Version': PLEX_VERSION,
	'X-Plex-Platform': 'Web',
	'X-Plex-Platform-Version': '1.0',
	'X-Plex-Device': 'Browser',
	'X-Plex-Device-Name': PLEX_PRODUCT
} as const;

/**
 * Default polling options
 */
const DEFAULT_POLL_OPTIONS: Required<PollPinOptions> = {
	maxAttempts: 60, // 5 minutes at 5 second intervals
	intervalMs: 5000
};

// =============================================================================
// PIN Request
// =============================================================================

/**
 * Request a new PIN from Plex.tv
 *
 * Creates a new PIN that the user will authorize at the Plex auth URL.
 * The PIN expires after 15 minutes.
 *
 * @returns PIN response with id, code, and expiration
 * @throws PlexAuthApiError on network or API errors
 *
 * @example
 * ```typescript
 * const pin = await requestPin();
 * const authUrl = buildPlexOAuthUrl(pin.code);
 * // Redirect user to authUrl
 * ```
 */
export async function requestPin(): Promise<PlexPinResponse> {
	const endpoint = `${PLEX_TV_URL}/api/v2/pins`;

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: PLEX_TV_HEADERS,
			body: new URLSearchParams({
				strong: 'true',
				'X-Plex-Client-Identifier': PLEX_CLIENT_ID
			})
		});

		if (!response.ok) {
			throw new PlexAuthApiError(
				`Failed to request PIN: ${response.status} ${response.statusText}`,
				response.status,
				endpoint
			);
		}

		const data = await response.json();
		const result = PlexPinResponseSchema.safeParse(data);

		if (!result.success) {
			throw new PlexAuthApiError(
				`Invalid PIN response: ${result.error.message}`,
				undefined,
				endpoint,
				result.error
			);
		}

		return result.data;
	} catch (error) {
		if (error instanceof PlexAuthApiError) {
			throw error;
		}

		throw new PlexAuthApiError(
			`Failed to request PIN: ${error instanceof Error ? error.message : 'Unknown error'}`,
			undefined,
			endpoint,
			error
		);
	}
}

// =============================================================================
// PIN Polling
// =============================================================================

/**
 * Check the status of a PIN
 *
 * Queries the PIN to see if the user has authorized it.
 *
 * @param pinId - The PIN ID from requestPin()
 * @returns PIN response with authToken if authorized
 * @throws PlexAuthApiError on network or API errors
 */
export async function checkPinStatus(pinId: number): Promise<PlexPinResponse> {
	const endpoint = `${PLEX_TV_URL}/api/v2/pins/${pinId}`;

	try {
		const response = await fetch(endpoint, {
			method: 'GET',
			headers: PLEX_TV_HEADERS
		});

		if (!response.ok) {
			if (response.status === 404) {
				throw new PinExpiredError();
			}

			throw new PlexAuthApiError(
				`Failed to check PIN status: ${response.status} ${response.statusText}`,
				response.status,
				endpoint
			);
		}

		const data = await response.json();
		const result = PlexPinResponseSchema.safeParse(data);

		if (!result.success) {
			throw new PlexAuthApiError(
				`Invalid PIN response: ${result.error.message}`,
				undefined,
				endpoint,
				result.error
			);
		}

		return result.data;
	} catch (error) {
		if (error instanceof PlexAuthApiError || error instanceof PinExpiredError) {
			throw error;
		}

		throw new PlexAuthApiError(
			`Failed to check PIN status: ${error instanceof Error ? error.message : 'Unknown error'}`,
			undefined,
			endpoint,
			error
		);
	}
}

/**
 * Poll a PIN until the user authorizes it
 *
 * Continuously checks the PIN status until:
 * - authToken is present (success)
 * - maxAttempts is reached (timeout)
 * - PIN expires (error)
 *
 * @param pinId - The PIN ID from requestPin()
 * @param options - Polling options (maxAttempts, intervalMs)
 * @returns The auth token when authorized
 * @throws PinExpiredError if PIN expires or timeout reached
 * @throws PlexAuthApiError on network or API errors
 *
 * @example
 * ```typescript
 * const pin = await requestPin();
 * // User authorizes at Plex...
 * const authToken = await pollPinForToken(pin.id);
 * const user = await getPlexUserInfo(authToken);
 * ```
 */
export async function pollPinForToken(
	pinId: number,
	options: PollPinOptions = {}
): Promise<string> {
	const { maxAttempts, intervalMs } = { ...DEFAULT_POLL_OPTIONS, ...options };

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const pin = await checkPinStatus(pinId);

		if (pin.authToken) {
			return pin.authToken;
		}

		// Wait before next attempt
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	throw new PinExpiredError('Login timed out. Please try again.');
}

// =============================================================================
// User Info
// =============================================================================

/**
 * Get Plex user information using auth token
 *
 * Retrieves the user's profile information including:
 * - id (Plex user ID)
 * - uuid (unique identifier)
 * - username
 * - email
 * - thumb (avatar URL)
 *
 * @param authToken - The auth token from pollPinForToken()
 * @returns Plex user information
 * @throws PlexAuthApiError on network or API errors
 *
 * @example
 * ```typescript
 * const user = await getPlexUserInfo(authToken);
 * console.log(`Welcome, ${user.username}!`);
 * ```
 */
export async function getPlexUserInfo(authToken: string): Promise<PlexUser> {
	const endpoint = `${PLEX_TV_URL}/api/v2/user`;

	try {
		const response = await fetch(endpoint, {
			method: 'GET',
			headers: {
				...PLEX_TV_HEADERS,
				'X-Plex-Token': authToken
			}
		});

		if (!response.ok) {
			throw new PlexAuthApiError(
				`Failed to get user info: ${response.status} ${response.statusText}`,
				response.status,
				endpoint
			);
		}

		const data = await response.json();
		const result = PlexUserSchema.safeParse(data);

		if (!result.success) {
			throw new PlexAuthApiError(
				`Invalid user response: ${result.error.message}`,
				undefined,
				endpoint,
				result.error
			);
		}

		return result.data;
	} catch (error) {
		if (error instanceof PlexAuthApiError) {
			throw error;
		}

		throw new PlexAuthApiError(
			`Failed to get user info: ${error instanceof Error ? error.message : 'Unknown error'}`,
			undefined,
			endpoint,
			error
		);
	}
}

// =============================================================================
// OAuth URL Building
// =============================================================================

/**
 * Build the Plex OAuth authorization URL
 *
 * Constructs the URL where users will authorize the application.
 * The URL includes:
 * - Client identifier
 * - PIN code
 * - Product information
 * - Forward URL (where to return after auth)
 *
 * @param pinCode - The PIN code from requestPin()
 * @param forwardUrl - Optional URL to redirect after auth (defaults to close popup)
 * @returns The full Plex OAuth URL
 *
 * @example
 * ```typescript
 * const pin = await requestPin();
 * const authUrl = buildPlexOAuthUrl(pin.code);
 * window.open(authUrl, 'plex-auth', 'width=800,height=600');
 * ```
 */
export function buildPlexOAuthUrl(pinCode: string, forwardUrl?: string): string {
	const params = new URLSearchParams({
		clientID: PLEX_CLIENT_ID,
		code: pinCode,
		'context[device][product]': PLEX_PRODUCT,
		'context[device][version]': PLEX_VERSION,
		'context[device][platform]': 'Web',
		'context[device][platformVersion]': '1.0',
		'context[device][device]': 'Browser',
		'context[device][deviceName]': PLEX_PRODUCT,
		'context[device][model]': 'hosted'
	});

	// Add forward URL if provided
	if (forwardUrl) {
		params.set('forwardUrl', forwardUrl);
	}

	return `${PLEX_AUTH_URL}#?${params.toString()}`;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Get complete PIN info for client-side OAuth flow
 *
 * Requests a PIN and returns all information needed to initiate
 * the OAuth flow from the client.
 *
 * @returns PIN info including id, code, authUrl, and expiresAt
 * @throws PlexAuthApiError on network or API errors
 *
 * @example
 * ```typescript
 * const pinInfo = await getPinInfo();
 * // Return to client:
 * // { pinId: 123, code: 'ABC123', authUrl: 'https://...', expiresAt: '...' }
 * ```
 */
export async function getPinInfo(): Promise<PinInfo> {
	const pin = await requestPin();

	return {
		pinId: pin.id,
		code: pin.code,
		authUrl: buildPlexOAuthUrl(pin.code),
		expiresAt: pin.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString()
	};
}
