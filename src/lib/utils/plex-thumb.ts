/**
 * Transform Plex thumbnail paths to proxied URLs.
 * Plex returns paths like `/library/metadata/123/thumb/456` which need
 * to be transformed to `/plex/thumb/library/metadata/123/thumb/456`.
 */
export function getThumbUrl(thumb: string | null | undefined): string | null {
	if (!thumb) {
		return null;
	}

	if (thumb.startsWith('/plex/thumb/')) {
		return thumb;
	}

	if (thumb.startsWith('http://') || thumb.startsWith('https://')) {
		return thumb;
	}

	if (thumb.startsWith('/')) {
		return `/plex/thumb${thumb}`;
	}

	return thumb;
}
