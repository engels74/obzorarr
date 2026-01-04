import { error } from '@sveltejs/kit';
import { getPlexConfig } from '$lib/server/admin/settings.service';
import type { RequestHandler } from './$types';

const CACHE_MAX_AGE = 7 * 24 * 60 * 60;

function getPlexHeaders(token: string) {
	return {
		'X-Plex-Token': token,
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

	if (!path) {
		error(400, { message: 'Missing thumbnail path' });
	}

	if (!isAllowedPath(path)) {
		error(400, { message: 'Invalid thumbnail path' });
	}

	// Get merged config (database takes priority over environment)
	const config = await getPlexConfig();

	if (!config.serverUrl) {
		error(503, { message: 'Plex server is not configured' });
	}

	const plexUrl = new URL(`/${path}`, config.serverUrl);

	try {
		const response = await fetch(plexUrl.toString(), {
			method: 'GET',
			headers: getPlexHeaders(config.token)
		});

		if (!response.ok) {
			if (response.status === 404) {
				error(404, { message: 'Thumbnail not found' });
			}

			console.error(
				`[Plex Thumb] Error fetching thumbnail: ${response.status} ${response.statusText}`
			);
			error(502, { message: 'Failed to fetch thumbnail from Plex' });
		}

		const imageData = await response.arrayBuffer();
		const contentType = response.headers.get('content-type') || 'image/jpeg';

		return new Response(imageData, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, immutable`,
				'Content-Length': String(imageData.byteLength)
			}
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}

		console.error('[Plex Thumb] Network error:', err);
		error(502, { message: 'Unable to connect to Plex server' });
	}
};
