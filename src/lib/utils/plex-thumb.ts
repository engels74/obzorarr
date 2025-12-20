/**
 * Plex Thumbnail URL Utilities
 *
 * Transforms Plex thumbnail paths to proxied URLs that work through
 * SvelteKit's thumbnail proxy route.
 *
 * Plex returns relative paths like `/library/metadata/70612/thumb/1765677730`
 * which need to be transformed to `/plex/thumb/library/metadata/70612/thumb/1765677730`
 * to work through the proxy.
 */

/**
 * Transform a Plex thumbnail path to a proxied URL
 *
 * Handles various input formats:
 * - null/undefined: returns null
 * - Already proxied URL (starts with /plex/thumb/): returns as-is
 * - Plex relative path (starts with /): transforms to proxy URL
 * - Absolute URL (http:// or https://): returns as-is (external URLs)
 *
 * @param thumb - The thumbnail path from Plex (or null)
 * @returns Proxied URL for the thumbnail, or null if no thumb
 *
 * @example
 * ```ts
 * // Plex relative path
 * getThumbUrl('/library/metadata/70612/thumb/1765677730')
 * // => '/plex/thumb/library/metadata/70612/thumb/1765677730'
 *
 * // Null input
 * getThumbUrl(null)
 * // => null
 *
 * // External URL (passed through)
 * getThumbUrl('https://image.tmdb.org/poster.jpg')
 * // => 'https://image.tmdb.org/poster.jpg'
 * ```
 */
export function getThumbUrl(thumb: string | null | undefined): string | null {
	// Handle null/undefined
	if (!thumb) {
		return null;
	}

	// Already proxied - return as-is
	if (thumb.startsWith('/plex/thumb/')) {
		return thumb;
	}

	// External URL - return as-is
	if (thumb.startsWith('http://') || thumb.startsWith('https://')) {
		return thumb;
	}

	// Plex relative path - transform to proxy URL
	if (thumb.startsWith('/')) {
		// Remove leading slash and prepend proxy path
		return `/plex/thumb${thumb}`;
	}

	// Unknown format - return as-is (shouldn't happen in practice)
	return thumb;
}

