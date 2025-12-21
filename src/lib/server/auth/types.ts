import { z } from 'zod';

/**
 * Authentication Types and Zod Schemas
 *
 * These types are used for:
 * 1. Plex OAuth PIN-based authentication
 * 2. Session management
 * 3. Server membership verification
 *
 * Based on Plex.tv API documentation.
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Session duration in milliseconds (7 days)
 */
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Plex OAuth client identifier
 */
export const PLEX_CLIENT_ID = 'obzorarr';

/**
 * Plex OAuth product name
 */
export const PLEX_PRODUCT = 'Obzorarr';

/**
 * Plex OAuth product version
 */
export const PLEX_VERSION = '1.0.0';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error for authentication failures
 */
export class AuthError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'AuthError';
	}
}

/**
 * Error when user is not a member of the configured Plex server
 */
export class NotServerMemberError extends AuthError {
	constructor(message = 'You are not a member of this Plex server.') {
		super(message, 'NOT_SERVER_MEMBER');
		this.name = 'NotServerMemberError';
	}
}

/**
 * Error when Plex OAuth PIN has expired
 */
export class PinExpiredError extends AuthError {
	constructor(message = 'Login session expired. Please try again.') {
		super(message, 'PIN_EXPIRED');
		this.name = 'PinExpiredError';
	}
}

/**
 * Error when session is invalid or expired
 */
export class SessionExpiredError extends AuthError {
	constructor(message = 'Your session has expired. Please log in again.') {
		super(message, 'SESSION_EXPIRED');
		this.name = 'SessionExpiredError';
	}
}

/**
 * Error when Plex API request fails
 */
export class PlexAuthApiError extends AuthError {
	constructor(
		message: string,
		public readonly statusCode?: number,
		public readonly endpoint?: string,
		cause?: unknown
	) {
		super(message, 'PLEX_API_ERROR', cause);
		this.name = 'PlexAuthApiError';
	}
}

// =============================================================================
// Zod Schemas for Plex OAuth API
// =============================================================================

/**
 * Plex PIN response from POST /api/v2/pins
 *
 * Used to initiate the OAuth flow.
 */
export const PlexPinResponseSchema = z.object({
	id: z.number().int(),
	code: z.string(),
	product: z.string().optional(),
	trusted: z.boolean().optional(),
	qr: z.string().optional(),
	clientIdentifier: z.string().optional(),
	location: z
		.object({
			code: z.string().optional(),
			european_union_member: z.boolean().optional(),
			country: z.string().optional(),
			city: z.string().optional(),
			time_zone: z.string().optional(),
			subdivisions: z.string().nullable().optional(),
			coordinates: z.string().optional()
		})
		.optional(),
	expiresIn: z.number().int().optional(),
	createdAt: z.string().optional(),
	expiresAt: z.string().optional(),
	authToken: z.string().nullable().optional(),
	newRegistration: z.boolean().nullable().optional()
});

/**
 * Plex user info response from GET /api/v2/user
 *
 * Contains user profile information after successful authentication.
 */
export const PlexUserSchema = z.object({
	id: z.number().int(),
	uuid: z.string(),
	username: z.string(),
	title: z.string().optional(),
	email: z.string().email(),
	friendlyName: z.string().optional(),
	locale: z.string().nullable().optional(),
	confirmed: z.boolean().optional(),
	joinedAt: z.number().int().optional(),
	emailOnlyAuth: z.boolean().optional(),
	hasPassword: z.boolean().optional(),
	protected: z.boolean().optional(),
	thumb: z.string().optional(),
	authToken: z.string().optional(),
	mailingListStatus: z.string().optional(),
	mailingListActive: z.boolean().optional(),
	scrobbleTypes: z.string().optional(),
	country: z.string().optional(),
	subscription: z
		.object({
			active: z.boolean().optional(),
			subscribedAt: z.string().nullable().optional(),
			status: z.string().optional(),
			paymentService: z.string().nullable().optional(),
			plan: z.string().nullable().optional(),
			features: z.array(z.string()).optional()
		})
		.optional(),
	subscriptionDescription: z.string().nullable().optional(),
	restricted: z.boolean().optional(),
	anonymous: z.boolean().nullable().optional(),
	home: z.boolean().optional(),
	guest: z.boolean().optional(),
	homeSize: z.number().int().optional(),
	homeAdmin: z.boolean().optional(),
	maxHomeSize: z.number().int().optional(),
	rememberExpiresAt: z.number().int().optional(),
	profile: z
		.object({
			autoSelectAudio: z.boolean().optional(),
			defaultAudioLanguage: z.string().nullable().optional(),
			defaultSubtitleLanguage: z.string().nullable().optional(),
			autoSelectSubtitle: z.number().int().optional(),
			defaultSubtitleAccessibility: z.number().int().optional(),
			defaultSubtitleForced: z.number().int().optional()
		})
		.optional(),
	entitlements: z.array(z.string()).optional(),
	roles: z.array(z.string()).optional(),
	services: z.array(z.unknown()).optional(),
	adsConsent: z.boolean().nullable().optional(),
	adsConsentSetAt: z.number().int().nullable().optional(),
	adsConsentReminderAt: z.number().int().nullable().optional(),
	experimentalFeatures: z.boolean().optional(),
	twoFactorEnabled: z.boolean().optional(),
	backupCodesCreated: z.boolean().optional()
});

/**
 * Plex resource (server) from GET /api/v2/resources
 *
 * Used to check server membership and ownership.
 */
export const PlexResourceSchema = z.object({
	name: z.string(),
	product: z.string().optional(),
	productVersion: z.string().optional(),
	platform: z.string().optional(),
	platformVersion: z.string().optional(),
	device: z.string().optional(),
	clientIdentifier: z.string(),
	createdAt: z.string().optional(),
	lastSeenAt: z.string().optional(),
	provides: z.string().optional(),
	ownerId: z.number().int().nullable().optional(),
	sourceTitle: z.string().nullable().optional(),
	publicAddress: z.string().optional(),
	accessToken: z.string().nullable().optional(),
	owned: z.boolean(),
	home: z.boolean().optional(),
	synced: z.boolean().optional(),
	relay: z.boolean().optional(),
	presence: z.boolean().optional(),
	httpsRequired: z.boolean().optional(),
	publicAddressMatches: z.boolean().optional(),
	dnsRebindingProtection: z.boolean().optional(),
	natLoopbackSupported: z.boolean().optional(),
	connections: z
		.array(
			z.object({
				protocol: z.string().optional(),
				address: z.string(),
				port: z.number().int(),
				uri: z.string(),
				local: z.boolean().optional(),
				relay: z.boolean().optional(),
				IPv6: z.boolean().optional()
			})
		)
		.optional()
});

/**
 * Array of Plex resources response
 */
export const PlexResourcesResponseSchema = z.array(PlexResourceSchema);

// =============================================================================
// TypeScript Types (inferred from Zod schemas)
// =============================================================================

export type PlexPinResponse = z.infer<typeof PlexPinResponseSchema>;
export type PlexUser = z.infer<typeof PlexUserSchema>;
export type PlexResource = z.infer<typeof PlexResourceSchema>;

// =============================================================================
// Session Types
// =============================================================================

/**
 * Data returned when validating a session
 */
export interface SessionData {
	id: string;
	userId: number;
	plexId: number;
	username: string;
	isAdmin: boolean;
	expiresAt: Date;
}

/**
 * Options for creating a session
 */
export interface CreateSessionOptions {
	userId: number;
	plexToken: string;
	isAdmin: boolean;
	durationMs?: number;
}

/**
 * Result of server membership verification
 */
export interface MembershipResult {
	isMember: boolean;
	isOwner: boolean;
	serverName?: string;
}

// =============================================================================
// OAuth Flow Types
// =============================================================================

/**
 * PIN info returned to client for OAuth initiation
 */
export interface PinInfo {
	pinId: number;
	code: string;
	authUrl: string;
	expiresAt: string;
}

/**
 * Options for polling a PIN
 */
export interface PollPinOptions {
	maxAttempts?: number;
	intervalMs?: number;
}

// =============================================================================
// Zod Schemas for Plex Shared Servers API
// =============================================================================

/**
 * Section shared with a user from GET /api/servers/{machineId}/shared_servers
 */
export const PlexSharedSectionSchema = z.object({
	id: z.number().int(),
	key: z.number().int(),
	title: z.string(),
	type: z.string().optional(),
	shared: z.boolean().optional()
});

/**
 * Shared server user from GET /api/servers/{machineId}/shared_servers
 *
 * Represents a user who has access to the Plex server.
 */
export const PlexSharedServerUserSchema = z.object({
	id: z.number().int(),
	username: z.string(),
	email: z.string().optional(),
	thumb: z.string().optional(),
	protected: z.boolean().optional(),
	home: z.boolean().optional(),
	allowSync: z.boolean().optional(),
	allowCameraUpload: z.boolean().optional(),
	allowChannels: z.boolean().optional(),
	allowTuners: z.boolean().optional(),
	allowSubtitleAdmin: z.boolean().optional(),
	filterAll: z.string().optional(),
	filterMovies: z.string().optional(),
	filterMusic: z.string().optional(),
	filterPhotos: z.string().optional(),
	filterTelevision: z.string().optional(),
	restricted: z.boolean().optional(),
	sections: z.array(PlexSharedSectionSchema).optional()
});

/**
 * Response from GET /api/servers/{machineId}/shared_servers
 *
 * Contains the MediaContainer with SharedServer array.
 */
export const PlexSharedServersResponseSchema = z.object({
	MediaContainer: z.object({
		friendlyName: z.string().optional(),
		identifier: z.string().optional(),
		machineIdentifier: z.string().optional(),
		size: z.number().int().optional(),
		SharedServer: z.array(PlexSharedServerUserSchema).optional()
	})
});

/**
 * Server identity response from GET /identity
 */
export const PlexServerIdentitySchema = z.object({
	MediaContainer: z.object({
		machineIdentifier: z.string(),
		friendlyName: z.string().optional(),
		version: z.string().optional(),
		claimed: z.boolean().optional()
	})
});

// =============================================================================
// TypeScript Types for Shared Servers
// =============================================================================

export type PlexSharedSection = z.infer<typeof PlexSharedSectionSchema>;
export type PlexSharedServerUser = z.infer<typeof PlexSharedServerUserSchema>;
export type PlexSharedServersResponse = z.infer<typeof PlexSharedServersResponseSchema>;
export type PlexServerIdentity = z.infer<typeof PlexServerIdentitySchema>;

/**
 * Normalized server user for dev-bypass
 *
 * Combines data from either the owner (PlexUser) or shared users (PlexSharedServerUser)
 */
export interface NormalizedServerUser {
	plexId: number;
	username: string;
	email: string | null;
	thumb: string | null;
	isOwner: boolean;
}
