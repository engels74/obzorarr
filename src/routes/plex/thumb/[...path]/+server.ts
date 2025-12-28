import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

// 7 days - thumbnails are immutable (URL timestamp changes on update)
const CACHE_MAX_AGE = 7 * 24 * 60 * 60;

function getPlexHeaders() {
	return {
		'X-Plex-Token': env.PLEX_TOKEN ?? '',
		'X-Plex-Client-Identifier': 'obzorarr',
		'X-Plex-Product': 'Obzorarr',
		'X-Plex-Version': '1.0.0'
	};
}

const ALLOWED_PATH_PATTERNS = [/^library\/metadata\/\d+\/thumb\/\d+$/];

function isAllowedPath(path: string): boolean {
	return ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

export const GET: RequestHandler = async ({ params }) => {
	const { path } = params;

	// Validate path exists
	if (!path) {
		error(400, { message: 'Missing thumbnail path' });
	}

	// Validate path is allowed (prevent arbitrary Plex API access)
	if (!isAllowedPath(path)) {
		error(400, { message: 'Invalid thumbnail path' });
	}

	// Construct Plex URL
	const plexUrl = new URL(`/${path}`, env.PLEX_SERVER_URL ?? '');

	try {
		// Fetch from Plex server
		const response = await fetch(plexUrl.toString(), {
			method: 'GET',
			headers: getPlexHeaders()
		});

		if (!response.ok) {
			// Return 404 for missing thumbnails
			if (response.status === 404) {
				error(404, { message: 'Thumbnail not found' });
			}

			// Return 502 for other Plex errors
			console.error(
				`[Plex Thumb] Error fetching thumbnail: ${response.status} ${response.statusText}`
			);
			error(502, { message: 'Failed to fetch thumbnail from Plex' });
		}

		// Get the image data
		const imageData = await response.arrayBuffer();

		// Determine content type from response or default to JPEG
		const contentType = response.headers.get('content-type') || 'image/jpeg';

		// Return the image with caching headers
		return new Response(imageData, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, immutable`,
				'Content-Length': String(imageData.byteLength)
			}
		});
	} catch (err) {
		// Handle network errors
		if (err instanceof Error && 'status' in err) {
			// Re-throw SvelteKit errors
			throw err;
		}

		console.error('[Plex Thumb] Network error:', err);
		error(502, { message: 'Unable to connect to Plex server' });
	}
};
