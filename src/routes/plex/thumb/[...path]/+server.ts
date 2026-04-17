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

// Intentionally unauthenticated: shared/public wrapped pages render thumbnails
// via getThumbUrl() without a user session. Path validation (ALLOWED_PATH_PATTERNS)
// restricts access to Plex library metadata thumbnails only.
export const GET: RequestHandler = async ({ params, request }) => {
	const { path } = params;

	if (!path) {
		error(400, { message: 'Missing thumbnail path' });
	}

	if (!isAllowedPath(path)) {
		error(400, { message: 'Invalid thumbnail path' });
	}

	const config = await getPlexConfig();

	if (!config.serverUrl) {
		error(503, { message: 'Plex server is not configured' });
	}

	const plexUrl = new URL(`/${path}`, config.serverUrl);

	try {
		const upstreamHeaders: Record<string, string> = getPlexHeaders(config.token);
		const ifNoneMatch = request.headers.get('if-none-match');
		const ifModSince = request.headers.get('if-modified-since');
		if (ifNoneMatch) upstreamHeaders['If-None-Match'] = ifNoneMatch;
		if (ifModSince) upstreamHeaders['If-Modified-Since'] = ifModSince;

		const response = await fetch(plexUrl.toString(), {
			method: 'GET',
			headers: upstreamHeaders
		});

		if (response.status === 304) {
			const notModHeaders: Record<string, string> = {
				'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, immutable`
			};
			const etag = response.headers.get('etag');
			const lastMod = response.headers.get('last-modified');
			if (etag) notModHeaders['ETag'] = etag;
			if (lastMod) notModHeaders['Last-Modified'] = lastMod;
			return new Response(null, { status: 304, headers: notModHeaders });
		}

		if (!response.ok) {
			if (response.status === 404) {
				error(404, { message: 'Thumbnail not found' });
			}

			console.error(
				`[Plex Thumb] Error fetching thumbnail: ${response.status} ${response.statusText}`
			);
			error(502, { message: 'Thumbnail unavailable' });
		}

		const imageData = await response.arrayBuffer();
		const contentType = response.headers.get('content-type') || 'image/jpeg';
		const etag = response.headers.get('etag');
		const lastMod = response.headers.get('last-modified');

		const headers: Record<string, string> = {
			'Content-Type': contentType,
			'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, immutable`,
			'Content-Length': String(imageData.byteLength)
		};
		if (etag) headers['ETag'] = etag;
		if (lastMod) headers['Last-Modified'] = lastMod;

		return new Response(imageData, {
			status: 200,
			headers
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}

		console.error('[Plex Thumb] Network error:', err);
		error(502, { message: 'Thumbnail unavailable' });
	}
};
