/**
 * Slide Messaging Context
 *
 * Provides context-aware messaging for wrapped slides.
 * Supports personal ("You"/"Your"), server with name ("{Name}"s"), and
 * collective ("We"/"Our") messaging modes.
 *
 * @module components/slides/messaging-context
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Context for determining slide messaging
 */
export interface SlideMessagingContext {
	/** Whether this is a server-wide wrapped (true) or personal wrapped (false) */
	isServerWrapped: boolean;
	/** The server's friendly name from Plex, or null if unavailable */
	serverName: string | null;
}

// =============================================================================
// Messaging Functions
// =============================================================================

/**
 * Get the subject for slide messaging
 *
 * Returns the appropriate subject based on context:
 * - Personal: "You"
 * - Server (with name): The server name (e.g., "MovieNight")
 * - Server (no name): "We"
 *
 * @param ctx - The messaging context
 * @returns The subject string
 *
 * @example
 * // Personal wrapped
 * getSubject({ isServerWrapped: false, serverName: null }) // "You"
 *
 * // Server wrapped with name
 * getSubject({ isServerWrapped: true, serverName: "MovieNight" }) // "MovieNight"
 *
 * // Server wrapped without name
 * getSubject({ isServerWrapped: true, serverName: null }) // "We"
 */
export function getSubject(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'You';
	}
	return ctx.serverName ?? 'We';
}

/**
 * Get the possessive form for slide messaging
 *
 * Returns the appropriate possessive based on context:
 * - Personal: "Your"
 * - Server (with name): "{Name}'s" (e.g., "MovieNight's")
 * - Server (no name): "Our"
 *
 * @param ctx - The messaging context
 * @returns The possessive string
 *
 * @example
 * // Personal wrapped
 * getPossessive({ isServerWrapped: false, serverName: null }) // "Your"
 *
 * // Server wrapped with name
 * getPossessive({ isServerWrapped: true, serverName: "MovieNight" }) // "MovieNight's"
 *
 * // Server wrapped without name
 * getPossessive({ isServerWrapped: true, serverName: null }) // "Our"
 */
export function getPossessive(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'Your';
	}
	if (ctx.serverName) {
		return `${ctx.serverName}'s`;
	}
	return 'Our';
}

/**
 * Get "have/has" verb conjugation based on context
 *
 * Returns the appropriate verb form:
 * - Personal: "have"
 * - Server (with name or without): "has"
 *
 * @param ctx - The messaging context
 * @returns "have" or "has"
 */
export function getHaveVerb(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'have';
	}
	// "We have" or "{ServerName} has"
	return ctx.serverName ? 'has' : 'have';
}

/**
 * Get "are/is" verb conjugation based on context
 *
 * Returns the appropriate verb form:
 * - Personal: "are"
 * - Server (with name): "is"
 * - Server (no name, "We"): "are"
 *
 * @param ctx - The messaging context
 * @returns "are" or "is"
 */
export function getAreVerb(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'are';
	}
	// "{ServerName} is" vs "We are"
	return ctx.serverName ? 'is' : 'are';
}

/**
 * Create a default personal messaging context
 */
export function createPersonalContext(): SlideMessagingContext {
	return {
		isServerWrapped: false,
		serverName: null
	};
}

/**
 * Create a server messaging context
 *
 * @param serverName - The server's friendly name, or null for collective messaging
 */
export function createServerContext(serverName: string | null): SlideMessagingContext {
	return {
		isServerWrapped: true,
		serverName
	};
}
