/** Transform Plex thumbnail paths to proxied URLs via /plex/thumb endpoint. */
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
