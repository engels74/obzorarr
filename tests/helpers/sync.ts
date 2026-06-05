import type { ValidPlexHistoryMetadata } from '$lib/server/plex/types';

export function createPlexHistoryItem(
	overrides: Partial<ValidPlexHistoryMetadata> = {}
): ValidPlexHistoryMetadata {
	return {
		historyKey: `history-${crypto.randomUUID()}`,
		ratingKey: `rating-${crypto.randomUUID()}`,
		title: 'Test Movie',
		type: 'movie',
		viewedAt: 1_704_067_200,
		accountID: 1,
		librarySectionID: '1',
		duration: 7_200_000,
		...overrides
	};
}
