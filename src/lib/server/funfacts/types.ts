import { z } from 'zod';

/**
 * Fun Facts Types and Zod Schemas
 *
 * Defines types for fun fact generation, including:
 * - Output types matching FunFactSlide component props
 * - Template structures for predefined fun facts
 * - Configuration for AI-based generation
 *
 * Implements Requirements:
 * - 10.1: AI generation support
 * - 10.2: Template-based generation
 * - 10.3: Time equivalency comparisons
 * - 10.4: Randomized selection
 *
 * @module server/funfacts/types
 */

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Fun fact output schema (matches FunFactSlideProps)
 */
export const FunFactSchema = z.object({
	fact: z.string().min(1),
	comparison: z.string().optional(),
	icon: z.string().optional()
});

/**
 * Template category for filtering and organization
 */
export const FactCategorySchema = z.enum([
	'time-equivalency',
	'content-comparison',
	'behavioral-insight',
	'binge-related',
	'temporal-pattern'
]);

/**
 * Predefined template structure
 */
export const FactTemplateSchema = z.object({
	/** Unique identifier for the template */
	id: z.string(),
	/** Category for filtering */
	category: FactCategorySchema,
	/** Template string with placeholders like {hours}, {topMovie} */
	factTemplate: z.string(),
	/** Optional comparison template */
	comparisonTemplate: z.string().optional(),
	/** Emoji icon for the fact */
	icon: z.string().optional(),
	/** Required stats fields for this template to be applicable */
	requiredStats: z.array(z.string()),
	/** Minimum value thresholds for applicability */
	minThresholds: z.record(z.string(), z.number()).optional()
});

/**
 * AI generation request schema
 */
export const AIGenerationRequestSchema = z.object({
	stats: z.any(), // UserStats or ServerStats
	existingFacts: z.array(z.string()).optional(),
	count: z.number().int().min(1).max(5).default(3)
});

/**
 * Service configuration schema
 */
export const FunFactsConfigSchema = z.object({
	aiEnabled: z.boolean().default(false),
	openaiApiKey: z.string().optional(),
	openaiBaseUrl: z.string().url().optional(),
	maxAIRetries: z.number().int().min(0).max(3).default(2),
	aiTimeoutMs: z.number().int().min(1000).max(30000).default(10000)
});

/**
 * Generation options schema
 */
export const GenerateFunFactsOptionsSchema = z.object({
	count: z.number().int().min(1).max(10).optional(),
	categories: z.array(FactCategorySchema).optional(),
	excludeIds: z.array(z.string()).optional(),
	preferAI: z.boolean().optional()
});

// =============================================================================
// TypeScript Types
// =============================================================================

export type FunFact = z.infer<typeof FunFactSchema>;
export type FactCategory = z.infer<typeof FactCategorySchema>;
export type FactTemplate = z.infer<typeof FactTemplateSchema>;
export type AIGenerationRequest = z.infer<typeof AIGenerationRequestSchema>;
export type FunFactsConfig = z.infer<typeof FunFactsConfigSchema>;
export type GenerateFunFactsOptions = z.infer<typeof GenerateFunFactsOptionsSchema>;

/**
 * Generation context for template interpolation
 * Derived values from UserStats or ServerStats
 */
export interface FactGenerationContext {
	/** Total watch time in hours */
	hours: number;
	/** Total watch time in days (decimal) */
	days: number;
	/** Total number of plays */
	plays: number;
	/** Title of top movie (null if none) */
	topMovie: string | null;
	/** Play count of top movie */
	topMovieCount: number;
	/** Title of top show (null if none) */
	topShow: string | null;
	/** Episode count of top show */
	topShowCount: number;
	/** Percentile rank (0-100), 50 for server stats */
	percentile: number;
	/** Longest binge duration in hours (null if none) */
	bingeHours: number | null;
	/** Number of plays in longest binge (null if none) */
	bingePlays: number | null;
	/** Peak viewing hour (0-23) */
	peakHour: number;
	/** Peak viewing month (0-11) */
	peakMonth: number;
	/** Title of first watch in year (null if none) */
	firstWatchTitle: string | null;
	/** Title of last watch in year (null if none) */
	lastWatchTitle: string | null;
	/** Number of unique movies watched */
	uniqueMovies: number;
	/** Number of unique shows watched */
	uniqueShows: number;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Base error class for fun facts service
 */
export class FunFactsError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly statusCode: number = 500
	) {
		super(message);
		this.name = 'FunFactsError';
	}
}

/**
 * Error thrown when AI generation fails
 */
export class AIGenerationError extends FunFactsError {
	constructor(message = 'AI generation failed', cause?: unknown) {
		super(message, 'AI_GENERATION_FAILED', 500);
		this.name = 'AIGenerationError';
		this.cause = cause;
	}
}

/**
 * Error thrown when there are insufficient stats for fun fact generation
 */
export class InsufficientStatsError extends FunFactsError {
	constructor(message = 'Insufficient statistics for fun fact generation') {
		super(message, 'INSUFFICIENT_STATS', 400);
		this.name = 'InsufficientStatsError';
	}
}
