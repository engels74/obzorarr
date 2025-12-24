/**
 * Server Slides Types
 *
 * Re-exports from the shared location for backward compatibility,
 * plus server-only error class.
 *
 * @module server/slides/types
 */

// Re-export everything from shared types
export * from '$lib/slides/types';

// =============================================================================
// Server-Only Exports
// =============================================================================

/**
 * Error class for slide operations
 */
export class SlideError extends Error {
	constructor(
		message: string,
		public readonly code: string
	) {
		super(message);
		this.name = 'SlideError';
	}
}
