import { getAppSetting, AppSettingsKey } from '$lib/server/admin/settings.service';
import type { UserStats, ServerStats, Stats } from '$lib/server/stats/types';
import { isUserStats } from '$lib/server/stats/types';
import { ALL_TEMPLATES } from './templates';
import { EQUIVALENCY_FACTORS, MONTH_NAMES, ENTERTAINMENT_FACTORS, formatHour } from './constants';
import { selectWeightedTemplates, getAllTemplates } from './registry';
import { enrichContext, buildEnhancedPrompt } from './ai';
import type {
	FunFact,
	FactTemplate,
	FactGenerationContext,
	GenerateFunFactsOptions,
	FunFactsConfig,
	FactCategory,
	AIPersona
} from './types';
import { AIGenerationError, InsufficientStatsError } from './types';

/**
 * Fun Facts Service
 *
 * Generates contextual fun facts for wrapped pages using either:
 * - AI generation via OpenAI-compatible API (when configured)
 * - Predefined templates with interpolation (fallback)
 *
 * Implements Requirements:
 * - 10.1: AI generation when enabled
 * - 10.2: Template fallback when AI unavailable
 * - 10.3: Time equivalency comparisons
 * - 10.4: Randomized selection
 *
 * @module server/funfacts/service
 */

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get fun facts service configuration from app settings
 */
export async function getFunFactsConfig(): Promise<FunFactsConfig> {
	const [apiKey, baseUrl, model, persona] = await Promise.all([
		getAppSetting(AppSettingsKey.OPENAI_API_KEY),
		getAppSetting(AppSettingsKey.OPENAI_BASE_URL),
		getAppSetting(AppSettingsKey.OPENAI_MODEL),
		getAppSetting(AppSettingsKey.FUN_FACTS_AI_PERSONA)
	]);

	return {
		aiEnabled: Boolean(apiKey),
		openaiApiKey: apiKey ?? undefined,
		openaiBaseUrl: baseUrl ?? 'https://api.openai.com/v1',
		openaiModel: model ?? 'gpt-4o-mini',
		maxAIRetries: 2,
		aiTimeoutMs: 10000,
		aiPersona: (persona as AIPersona) ?? 'witty'
	};
}

/**
 * Check if AI generation is available
 */
export async function isAIAvailable(): Promise<boolean> {
	const config = await getFunFactsConfig();
	return config.aiEnabled && Boolean(config.openaiApiKey);
}

// =============================================================================
// Context Building
// =============================================================================

/**
 * Build generation context from stats
 * Extracts and computes values needed for template interpolation
 * Also enriches context with entertainment trivia calculations
 */
export function buildGenerationContext(stats: UserStats | ServerStats): FactGenerationContext {
	// Use Math.floor to avoid rounding < 30 mins to 0 hours
	const hours = Math.floor(stats.totalWatchTimeMinutes / 60);
	const days = Math.round((hours / 24) * 10) / 10;

	// Find peak hour (0-23)
	const peakHour = stats.watchTimeByHour.minutes.indexOf(
		Math.max(...stats.watchTimeByHour.minutes)
	);

	// Find peak month (0-11)
	const peakMonth = stats.watchTimeByMonth.minutes.indexOf(
		Math.max(...stats.watchTimeByMonth.minutes)
	);

	// Count unique movies and shows
	const uniqueMovies = stats.topMovies.length;
	const uniqueShows = stats.topShows.length;

	const baseContext: FactGenerationContext = {
		hours,
		days,
		plays: stats.totalPlays,
		topMovie: stats.topMovies[0]?.title ?? null,
		topMovieCount: stats.topMovies[0]?.count ?? 0,
		topShow: stats.topShows[0]?.title ?? null,
		topShowCount: stats.topShows[0]?.count ?? 0,
		percentile: isUserStats(stats) ? stats.percentileRank : 50,
		bingeHours: stats.longestBinge
			? Math.round((stats.longestBinge.totalMinutes / 60) * 10) / 10
			: null,
		bingePlays: stats.longestBinge?.plays ?? null,
		peakHour,
		peakMonth,
		firstWatchTitle: stats.firstWatch?.title ?? null,
		lastWatchTitle: stats.lastWatch?.title ?? null,
		uniqueMovies,
		uniqueShows
	};

	// Enrich with entertainment trivia calculations
	return enrichContext(baseContext);
}

// =============================================================================
// Template Logic
// =============================================================================

/**
 * Check if a template is applicable given the context
 */
export function isTemplateApplicable(
	template: FactTemplate,
	context: FactGenerationContext
): boolean {
	// Check required stats presence
	for (const stat of template.requiredStats) {
		const value = context[stat as keyof FactGenerationContext];
		if (value === null || value === undefined) {
			return false;
		}
		// For strings, check they're not empty
		if (typeof value === 'string' && value.length === 0) {
			return false;
		}
		// For numbers, check they're positive (except peakHour which can be 0)
		if (typeof value === 'number' && value <= 0 && stat !== 'peakHour' && stat !== 'peakMonth') {
			return false;
		}
	}

	// Check minimum thresholds
	if (template.minThresholds) {
		for (const [key, minValue] of Object.entries(template.minThresholds) as [string, number][]) {
			const actualValue = context[key as keyof FactGenerationContext];
			if (typeof actualValue === 'number' && actualValue < minValue) {
				return false;
			}
		}
	}

	// Special case: early bird requires peakHour <= 9
	if (template.id === 'early-bird' && context.peakHour > 9) {
		return false;
	}

	// Special case: night owl requires peakHour >= 21
	if (template.id === 'night-owl' && context.peakHour < 21) {
		return false;
	}

	return true;
}

/**
 * Interpolate template with context values
 */
export function interpolateTemplate(template: string, context: FactGenerationContext): string {
	const {
		FLIGHT_NYC_TOKYO_HOURS,
		LOTR_EXTENDED_TOTAL_HOURS,
		AVERAGE_BOOK_HOURS,
		WALKING_SPEED_MPH,
		SLEEP_CYCLE_HOURS,
		MCU_MARATHON_HOURS,
		HARRY_POTTER_TOTAL_HOURS,
		COFFEE_BREAK_HOURS,
		COMMUTE_HOURS,
		PODCAST_EPISODE_HOURS
	} = EQUIVALENCY_FACTORS;

	// Calculate derived values
	const flightCount = Math.round((context.hours / FLIGHT_NYC_TOKYO_HOURS) * 10) / 10;
	const lotrCount = Math.round((context.hours / LOTR_EXTENDED_TOTAL_HOURS) * 10) / 10;
	const bookCount = Math.round(context.hours / AVERAGE_BOOK_HOURS);
	const walkMiles = Math.round(context.hours * WALKING_SPEED_MPH);
	const sleepCycles = Math.round(context.hours / SLEEP_CYCLE_HOURS);
	const mcuCount = Math.round((context.hours / MCU_MARATHON_HOURS) * 10) / 10;
	const hpCount = Math.round((context.hours / HARRY_POTTER_TOTAL_HOURS) * 10) / 10;
	const daysBetweenMovies = Math.max(1, Math.round(365 / Math.max(1, context.uniqueMovies)));
	const playsPerDay = Math.round((context.plays / 365) * 10) / 10;

	// New calculated values for low-threshold templates
	const coffeeBreaks = Math.round(context.hours / COFFEE_BREAK_HOURS);
	const commuteTrips = Math.round(context.hours / COMMUTE_HOURS);
	const podcastEpisodes = Math.round(context.hours / PODCAST_EPISODE_HOURS);
	const topPercentile = 100 - Math.round(context.percentile);
	const year = new Date().getFullYear(); // Current year for the year-participant template

	const replacements: Record<string, string | number> = {
		hours: context.hours,
		days: context.days,
		plays: context.plays,
		topMovie: context.topMovie ?? 'Unknown',
		topMovieCount: context.topMovieCount,
		topShow: context.topShow ?? 'Unknown',
		topShowCount: context.topShowCount,
		percentile: Math.round(context.percentile),
		bingeHours: context.bingeHours ?? 0,
		bingePlays: context.bingePlays ?? 0,
		peakHour: context.peakHour,
		peakHourFormatted: formatHour(context.peakHour),
		peakMonth: context.peakMonth,
		peakMonthName: MONTH_NAMES[context.peakMonth] ?? 'Unknown',
		firstWatchTitle: context.firstWatchTitle ?? 'Unknown',
		lastWatchTitle: context.lastWatchTitle ?? 'Unknown',
		uniqueMovies: context.uniqueMovies,
		uniqueShows: context.uniqueShows,

		// Calculated equivalencies
		flightCount,
		lotrCount,
		bookCount,
		walkMiles,
		sleepCycles,
		mcuCount,
		hpCount,
		daysBetweenMovies,
		playsPerDay,

		// New low-threshold equivalencies
		coffeeBreaks,
		commuteTrips,
		podcastEpisodes,
		topPercentile,
		year,

		// Entertainment trivia (from enriched context)
		gotCount: context.gotCount ?? 0,
		friendsCount: context.friendsCount ?? 0,
		theOfficeCount: context.theOfficeCount ?? 0,
		strangerThingsCount: context.strangerThingsCount ?? 0,
		starWarsCount: context.starWarsCount ?? 0,
		breakingBadCount: context.breakingBadCount ?? 0,
		theWireCount: context.theWireCount ?? 0,
		sopranosCount: context.sopranosCount ?? 0
	};

	return template.replace(/\{(\w+)\}/g, (_, key) => {
		const value = replacements[key];
		return value !== undefined ? String(value) : `{${key}}`;
	});
}

/**
 * Generate a fun fact from a template
 */
export function generateFromTemplate(
	template: FactTemplate,
	context: FactGenerationContext
): FunFact {
	return {
		fact: interpolateTemplate(template.factTemplate, context),
		comparison: template.comparisonTemplate
			? interpolateTemplate(template.comparisonTemplate, context)
			: undefined,
		icon: template.icon
	};
}

/**
 * Select random templates without duplicates
 * Implements Requirement 10.4: Randomized selection
 */
export function selectRandomTemplates(
	templates: FactTemplate[],
	count: number,
	excludeIds: string[] = []
): FactTemplate[] {
	const available = templates.filter((t) => !excludeIds.includes(t.id));
	const selected: FactTemplate[] = [];
	const remaining = [...available];

	const targetCount = Math.min(count, remaining.length);

	for (let i = 0; i < targetCount; i++) {
		const randomIndex = Math.floor(Math.random() * remaining.length);
		const template = remaining[randomIndex];
		if (template) {
			selected.push(template);
			remaining.splice(randomIndex, 1);
		}
	}

	return selected;
}

// =============================================================================
// AI Generation
// =============================================================================

/**
 * Parse AI response into FunFact array
 */
function parseAIResponse(data: unknown): FunFact[] {
	try {
		const response = data as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = response.choices?.[0]?.message?.content;

		if (!content) {
			throw new AIGenerationError('Empty AI response');
		}

		// Parse JSON from response
		const parsed = JSON.parse(content) as {
			facts?: Array<{ fact: string; comparison?: string; icon?: string }>;
		};

		if (!parsed.facts || !Array.isArray(parsed.facts)) {
			throw new AIGenerationError('Invalid AI response structure');
		}

		return parsed.facts.map((f) => ({
			fact: f.fact,
			comparison: f.comparison,
			icon: f.icon
		}));
	} catch (error) {
		if (error instanceof AIGenerationError) {
			throw error;
		}
		throw new AIGenerationError('Failed to parse AI response', error);
	}
}

/**
 * Generate fun facts using AI (OpenAI-compatible API)
 * Implements Requirement 10.1: AI generation when enabled
 *
 * Includes retry logic for transient failures (network errors, timeouts, 5xx errors).
 * Non-retryable errors (4xx) are thrown immediately.
 */
export async function generateWithAI(
	stats: Stats,
	config: FunFactsConfig,
	count: number = 3
): Promise<FunFact[]> {
	if (!config.openaiApiKey) {
		throw new AIGenerationError('OpenAI API key not configured');
	}

	const context = buildGenerationContext(stats);
	const persona = config.aiPersona ?? 'witty';
	const { system: systemPrompt, user: userPrompt } = buildEnhancedPrompt(context, count, persona);
	const maxRetries = config.maxAIRetries ?? 2;
	const baseUrl = config.openaiBaseUrl ?? 'https://api.openai.com/v1';
	const model = config.openaiModel ?? 'gpt-4o-mini';

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), config.aiTimeoutMs);

		try {
			const response = await fetch(`${baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${config.openaiApiKey}`
				},
				body: JSON.stringify({
					model,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt }
					],
					temperature: 0.8,
					max_tokens: 500
				}),
				signal: controller.signal
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => 'Unknown error');
				const statusError = new AIGenerationError(
					`OpenAI API error: ${response.status} - ${errorText}`
				);

				// Don't retry client errors (4xx) except rate limiting (429)
				if (response.status >= 400 && response.status < 500 && response.status !== 429) {
					throw statusError;
				}

				// Retryable error - store and continue
				lastError = statusError;
				continue;
			}

			const data: unknown = await response.json();
			return parseAIResponse(data);
		} catch (error) {
			// Clear timeout before handling error
			clearTimeout(timeoutId);

			// Don't retry AIGenerationErrors from parsing or non-retryable conditions
			if (error instanceof AIGenerationError) {
				// Check if it's a client error (non-retryable)
				if ((error as AIGenerationError).message.includes('OpenAI API error: 4')) {
					throw error;
				}
				lastError = error;
				continue;
			}

			// Handle timeout
			if ((error as Error).name === 'AbortError') {
				lastError = new AIGenerationError('AI generation timed out');
				continue;
			}

			// Network error - retryable
			lastError = new AIGenerationError(`AI generation failed: ${(error as Error).message}`, error);
			continue;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	// All retries exhausted
	throw lastError ?? new AIGenerationError('AI generation failed after retries');
}

// =============================================================================
// Main Entry Points
// =============================================================================

/**
 * Generate fun facts from templates only
 * Implements Requirement 10.2: Template-based generation
 * Uses weighted selection from registry for variety
 */
export function generateFromTemplates(
	context: FactGenerationContext,
	options: Omit<GenerateFunFactsOptions, 'preferAI'> & { useWeightedSelection?: boolean } = {}
): FunFact[] {
	const { count = 3, categories, excludeIds = [], useWeightedSelection = true } = options;

	// Get templates from registry (includes new categories)
	let templates = getAllTemplates();

	// Filter by category if specified
	if (categories) {
		templates = templates.filter((t) => categories.includes(t.category as FactCategory));
	}

	// Filter by applicability
	const applicableTemplates = templates.filter((t) => isTemplateApplicable(t, context));

	if (applicableTemplates.length === 0) {
		// Graceful degradation - return empty array instead of throwing
		// The page will simply not display fun facts
		return [];
	}

	// Select templates (weighted or random)
	const selected = useWeightedSelection
		? selectWeightedTemplates(applicableTemplates, count, excludeIds)
		: selectRandomTemplates(applicableTemplates, count, excludeIds);

	// Generate facts from templates
	return selected.map((template) => generateFromTemplate(template, context));
}

/**
 * Main function: Generate fun facts for stats
 *
 * Implements all Requirements:
 * - 10.1: AI generation when enabled
 * - 10.2: Template fallback when AI unavailable
 * - 10.3: Time equivalency comparisons (via templates)
 * - 10.4: Randomized selection
 */
export async function generateFunFacts(
	stats: UserStats | ServerStats,
	options: GenerateFunFactsOptions = {}
): Promise<FunFact[]> {
	const { count = 3, categories, excludeIds = [], preferAI = true } = options;

	const config = await getFunFactsConfig();
	const context = buildGenerationContext(stats);

	// Try AI generation first if preferred and available
	if (preferAI && config.aiEnabled && config.openaiApiKey) {
		try {
			const aiFacts = await generateWithAI(stats, config, count);
			if (aiFacts.length >= count) {
				return aiFacts.slice(0, count);
			}
			// If AI returned fewer than requested, supplement with templates
			const remaining = count - aiFacts.length;
			const templateFacts = generateFromTemplates(context, {
				count: remaining,
				categories,
				excludeIds
			});
			return [...aiFacts, ...templateFacts].slice(0, count);
		} catch (error) {
			console.warn('AI fun fact generation failed, falling back to templates:', error);
			// Fall through to template generation
		}
	}

	// Fall back to template-based generation
	return generateFromTemplates(context, { count, categories, excludeIds });
}
