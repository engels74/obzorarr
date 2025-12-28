import { z } from 'zod';

export const FunFactSchema = z.object({
	fact: z.string().min(1),
	comparison: z.string().optional(),
	icon: z.string().optional()
});

export const FactCategorySchema = z.enum([
	'time-equivalency',
	'content-comparison',
	'behavioral-insight',
	'binge-related',
	'temporal-pattern',
	'achievement',
	'social-comparison',
	'entertainment-trivia'
]);

export const SeasonalConfigSchema = z.object({
	months: z.array(z.number().min(0).max(11)),
	boost: z.number().min(1).max(3).optional()
});

export const FactTemplateSchema = z.object({
	id: z.string(),
	category: FactCategorySchema,
	factTemplate: z.string(),
	comparisonTemplate: z.string().optional(),
	icon: z.string().optional(),
	requiredStats: z.array(z.string()),
	minThresholds: z.record(z.string(), z.number()).optional(),
	tags: z.array(z.string()).optional(),
	priority: z.number().min(0).max(100).optional(),
	seasonal: SeasonalConfigSchema.optional()
});

export const AIGenerationRequestSchema = z.object({
	stats: z.any(), // UserStats or ServerStats
	existingFacts: z.array(z.string()).optional(),
	count: z.number().int().min(1).max(5).default(3)
});

export const AIPersonaSchema = z.enum(['witty', 'wholesome', 'nerdy', 'random']);

export const FunFactsConfigSchema = z.object({
	aiEnabled: z.boolean().default(false),
	openaiApiKey: z.string().optional(),
	openaiBaseUrl: z.string().url().optional(),
	openaiModel: z.string().optional(),
	maxAIRetries: z.number().int().min(0).max(3).default(2),
	aiTimeoutMs: z.number().int().min(1000).max(30000).default(10000),
	aiPersona: AIPersonaSchema.default('witty')
});

export const GenerateFunFactsOptionsSchema = z.object({
	count: z.number().int().min(1).max(10).optional(),
	categories: z.array(FactCategorySchema).optional(),
	excludeIds: z.array(z.string()).optional(),
	preferAI: z.boolean().optional()
});

export type FunFact = z.infer<typeof FunFactSchema>;
export type FactCategory = z.infer<typeof FactCategorySchema>;
export type FactTemplate = z.infer<typeof FactTemplateSchema>;
export type AIGenerationRequest = z.infer<typeof AIGenerationRequestSchema>;
export type FunFactsConfig = z.infer<typeof FunFactsConfigSchema>;
export type GenerateFunFactsOptions = z.infer<typeof GenerateFunFactsOptionsSchema>;
export type AIPersona = z.infer<typeof AIPersonaSchema>;
export type SeasonalConfig = z.infer<typeof SeasonalConfigSchema>;

export interface FactGenerationContext {
	hours: number;
	days: number;
	plays: number;
	topMovie: string | null;
	topMovieCount: number;
	topShow: string | null;
	topShowCount: number;
	percentile: number;
	bingeHours: number | null;
	bingePlays: number | null;
	peakHour: number;
	peakMonth: number;
	firstWatchTitle: string | null;
	lastWatchTitle: string | null;
	uniqueMovies: number;
	uniqueShows: number;
	scope: 'user' | 'server';
	gotCount?: number;
	friendsCount?: number;
	theOfficeCount?: number;
	strangerThingsCount?: number;
	starWarsCount?: number;
	breakingBadCount?: number;
	theWireCount?: number;
	sopranosCount?: number;
}

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

export class AIGenerationError extends FunFactsError {
	constructor(message = 'AI generation failed', cause?: unknown) {
		super(message, 'AI_GENERATION_FAILED', 500);
		this.name = 'AIGenerationError';
		this.cause = cause;
	}
}

export class InsufficientStatsError extends FunFactsError {
	constructor(message = 'Insufficient statistics for fun fact generation') {
		super(message, 'INSUFFICIENT_STATS', 400);
		this.name = 'InsufficientStatsError';
	}
}
