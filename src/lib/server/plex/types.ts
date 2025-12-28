import { z } from 'zod';

export class PlexApiError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number,
		public readonly endpoint?: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'PlexApiError';
	}
}

export class PlexValidationError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'PlexValidationError';
	}
}

/**
 * Individual play history metadata item from Plex.
 * ratingKey and title are optional because Plex can return history items
 * without them for deleted media, corrupted entries, or non-library content.
 */
export const PlexHistoryMetadataSchema = z.object({
	historyKey: z.string(),
	ratingKey: z.string().optional(),
	librarySectionID: z.union([z.string(), z.number()]).transform((val) => String(val)),
	title: z.string().optional(),
	type: z.string(),
	viewedAt: z.number().int(),
	accountID: z.number().int(),
	key: z.string().optional(),
	thumb: z.string().optional().nullable(),
	originallyAvailableAt: z.string().optional(),
	deviceID: z.number().int().optional(),
	duration: z.number().int().optional(),
	grandparentTitle: z.string().optional(),
	parentTitle: z.string().optional(),
	grandparentKey: z.string().optional(),
	parentKey: z.string().optional(),
	grandparentThumb: z.string().optional(),
	parentThumb: z.string().optional(),
	index: z.number().int().optional(),
	parentIndex: z.number().int().optional(),
	year: z.number().int().optional(),
	contentRating: z.string().optional()
});

export const PlexMediaContainerSchema = z.object({
	size: z.number().int(),
	totalSize: z.number().int().optional(),
	offset: z.number().int().optional().default(0),
	Metadata: z.array(PlexHistoryMetadataSchema).optional().default([])
});

export const PlexHistoryResponseSchema = z.object({
	MediaContainer: PlexMediaContainerSchema
});

export const PlexGenreTagSchema = z.object({
	tag: z.string()
});

export type PlexGenreTag = z.infer<typeof PlexGenreTagSchema>;

/** Metadata from library endpoint - includes duration, genres, and year not in history */
export const PlexLibraryMetadataItemSchema = z.object({
	ratingKey: z.string(),
	duration: z.number().int().optional(),
	year: z.number().int().optional(),
	Genre: z.array(PlexGenreTagSchema).optional().default([])
});

export const PlexLibraryMetadataContainerSchema = z.object({
	Metadata: z.array(PlexLibraryMetadataItemSchema).optional().default([])
});

export const PlexLibraryMetadataResponseSchema = z.object({
	MediaContainer: PlexLibraryMetadataContainerSchema
});

export type PlexLibraryMetadataItem = z.infer<typeof PlexLibraryMetadataItemSchema>;
export type PlexLibraryMetadataResponse = z.infer<typeof PlexLibraryMetadataResponseSchema>;
export type PlexHistoryMetadata = z.infer<typeof PlexHistoryMetadataSchema>;
export type PlexMediaContainer = z.infer<typeof PlexMediaContainerSchema>;
export type PlexHistoryResponse = z.infer<typeof PlexHistoryResponseSchema>;

export const PlexShowMetadataItemSchema = z.object({
	ratingKey: z.string(),
	title: z.string(),
	leafCount: z.number().int().optional(),
	childCount: z.number().int().optional(),
	thumb: z.string().optional()
});

export const PlexShowMetadataContainerSchema = z.object({
	Metadata: z.array(PlexShowMetadataItemSchema).optional().default([])
});

export const PlexShowMetadataResponseSchema = z.object({
	MediaContainer: PlexShowMetadataContainerSchema
});

export type PlexShowMetadataItem = z.infer<typeof PlexShowMetadataItemSchema>;
export type PlexShowMetadataResponse = z.infer<typeof PlexShowMetadataResponseSchema>;

/** History metadata with guaranteed ratingKey and title */
export type ValidPlexHistoryMetadata = PlexHistoryMetadata & { ratingKey: string; title: string };

/** Type guard to filter out items without ratingKey or title before database insertion */
export function hasRequiredFields(item: PlexHistoryMetadata): item is ValidPlexHistoryMetadata {
	return (
		typeof item.ratingKey === 'string' &&
		item.ratingKey.length > 0 &&
		typeof item.title === 'string' &&
		item.title.length > 0
	);
}

export interface FetchHistoryOptions {
	pageSize?: number;
	/** Minimum viewedAt timestamp (Unix seconds) for incremental sync */
	minViewedAt?: number;
	accountId?: number;
	librarySectionId?: number;
	signal?: AbortSignal;
}

export interface HistoryPageResult {
	items: ValidPlexHistoryMetadata[];
	totalSize: number;
	offset: number;
	size: number;
	skippedCount: number;
}

export interface HistoryPageWithStats {
	items: ValidPlexHistoryMetadata[];
	skippedCount: number;
}
