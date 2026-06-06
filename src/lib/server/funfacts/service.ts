import {
	AppSettingsKey,
	getApiConfigWithSources,
	getAppSetting
} from '$lib/server/admin/settings.service';
import {
	CredentialedUrlError,
	normalizeOpenAIBaseUrl
} from '$lib/server/security/credentialed-url';
import type { ServerStats, Stats, UserStats } from '$lib/server/stats/types';
import { isUserStats } from '$lib/server/stats/types';
import { buildEnhancedPrompt, enrichContext } from './ai';
import { EQUIVALENCY_FACTORS, formatHour, MONTH_NAMES } from './constants';
import { getAllTemplates, selectWeightedTemplates } from './registry';
import type {
	AIPersona,
	FactCategory,
	FactGenerationContext,
	FactTemplate,
	FunFact,
	FunFactsConfig,
	GenerateFunFactsOptions
} from './types';
import { AIGenerationError } from './types';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';

function resolveOpenAIBaseUrl(rawBaseUrl: string): {
	baseUrl: string;
	isValid: boolean;
	error?: CredentialedUrlError;
} {
	if (!rawBaseUrl) {
		return { baseUrl: DEFAULT_OPENAI_BASE_URL, isValid: true };
	}

	try {
		return { baseUrl: normalizeOpenAIBaseUrl(rawBaseUrl), isValid: true };
	} catch (error) {
		if (error instanceof CredentialedUrlError) {
			return { baseUrl: DEFAULT_OPENAI_BASE_URL, isValid: false, error };
		}
		throw error;
	}
}

export async function getFunFactsConfig(): Promise<FunFactsConfig> {
	const [apiConfig, persona] = await Promise.all([
		getApiConfigWithSources(),
		getAppSetting(AppSettingsKey.FUN_FACTS_AI_PERSONA)
	]);

	const apiKey = apiConfig.openai.apiKey.value.trim();
	const rawBaseUrl = apiConfig.openai.baseUrl.value.trim();
	const {
		baseUrl,
		isValid: isBaseUrlValid,
		error: baseUrlError
	} = resolveOpenAIBaseUrl(rawBaseUrl);
	const model = apiConfig.openai.model.value.trim();
	const aiEnabled = Boolean(apiKey && isBaseUrlValid);

	if (apiKey && baseUrlError) {
		console.warn('Invalid OpenAI base URL configured; AI fun facts are disabled:', baseUrlError);
	}

	return {
		aiEnabled,
		openaiApiKey: aiEnabled ? apiKey : undefined,
		openaiBaseUrl: baseUrl,
		openaiModel: model || DEFAULT_OPENAI_MODEL,
		maxAIRetries: 2,
		aiTimeoutMs: 10000,
		aiPersona: (persona as AIPersona) ?? 'witty'
	};
}

export async function isAIAvailable(): Promise<boolean> {
	const config = await getFunFactsConfig();
	return config.aiEnabled && Boolean(config.openaiApiKey);
}

export function buildGenerationContext(stats: UserStats | ServerStats): FactGenerationContext {
	// Floor partial hours so comparison facts never exaggerate a user's watch time.
	const hours = Math.floor(stats.totalWatchTimeMinutes / 60);
	const days = Math.round((hours / 24) * 10) / 10;

	const peakHour = stats.watchTimeByHour.minutes.indexOf(
		Math.max(...stats.watchTimeByHour.minutes)
	);

	const peakMonth = stats.watchTimeByMonth.minutes.indexOf(
		Math.max(...stats.watchTimeByMonth.minutes)
	);

	const uniqueMovies = stats.topMovies.length;
	const uniqueShows = stats.topShows.length;
	const scope = isUserStats(stats) ? 'user' : 'server';

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
		uniqueShows,
		scope
	};

	return enrichContext(baseContext);
}

export function isTemplateApplicable(
	template: FactTemplate,
	context: FactGenerationContext
): boolean {
	for (const stat of template.requiredStats) {
		const value = context[stat as keyof FactGenerationContext];
		if (value === null || value === undefined) {
			return false;
		}
		if (typeof value === 'string' && value.length === 0) {
			return false;
		}
		if (typeof value === 'number' && value <= 0 && stat !== 'peakHour' && stat !== 'peakMonth') {
			return false;
		}
	}

	if (template.minThresholds) {
		for (const [key, minValue] of Object.entries(template.minThresholds) as [string, number][]) {
			const actualValue = context[key as keyof FactGenerationContext];
			if (typeof actualValue === 'number' && actualValue < minValue) {
				return false;
			}
		}
	}

	// Template thresholds express minimums only; early-bird needs the opposite bound.
	if (template.id === 'early-bird' && context.peakHour > 9) {
		return false;
	}

	if (template.id === 'night-owl' && context.peakHour < 21) {
		return false;
	}

	// Percentile comparisons are user-specific; a server aggregate has no peer rank.
	if (context.scope === 'server' && template.requiredStats.includes('percentile')) {
		return false;
	}

	return true;
}

const PRONOUNS = {
	user: { subject: 'You', possessive: 'Your', object: 'you' },
	server: { subject: 'We', possessive: 'Our', object: 'us' }
} as const;

function getPronounReplacements(scope: 'user' | 'server'): Record<string, string> {
	const p = PRONOUNS[scope];
	return {
		Subject: p.subject,
		subject: p.subject.toLowerCase(),
		Possessive: p.possessive,
		possessive: p.possessive.toLowerCase(),
		object: p.object
	};
}

function _pluralize(count: number, singular: string, plural: string): string {
	return count === 1 ? singular : plural;
}

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

	const flightCount = Math.round((context.hours / FLIGHT_NYC_TOKYO_HOURS) * 10) / 10;
	const lotrCount = Math.round((context.hours / LOTR_EXTENDED_TOTAL_HOURS) * 10) / 10;
	const bookCount = Math.round(context.hours / AVERAGE_BOOK_HOURS);
	const walkMiles = Math.round(context.hours * WALKING_SPEED_MPH);
	const sleepCycles = Math.round(context.hours / SLEEP_CYCLE_HOURS);
	const mcuCount = Math.round((context.hours / MCU_MARATHON_HOURS) * 10) / 10;
	const hpCount = Math.round((context.hours / HARRY_POTTER_TOTAL_HOURS) * 10) / 10;
	const daysBetweenMovies = Math.max(1, Math.round(365 / Math.max(1, context.uniqueMovies)));
	const playsPerDay = Math.round((context.plays / 365) * 10) / 10;

	const coffeeBreaks = Math.round(context.hours / COFFEE_BREAK_HOURS);
	const commuteTrips = Math.round(context.hours / COMMUTE_HOURS);
	const podcastEpisodes = Math.round(context.hours / PODCAST_EPISODE_HOURS);
	const topPercentile = 100 - Math.round(context.percentile);
	const year = new Date().getFullYear();

	const pronounReplacements = getPronounReplacements(context.scope);

	const replacements: Record<string, string | number> = {
		...pronounReplacements,
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

		flightCount,
		lotrCount,
		bookCount,
		walkMiles,
		sleepCycles,
		mcuCount,
		hpCount,
		daysBetweenMovies,
		playsPerDay,

		coffeeBreaks,
		commuteTrips,
		podcastEpisodes,
		topPercentile,
		year,

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

function parseAIResponse(data: unknown): FunFact[] {
	try {
		const response = data as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = response.choices?.[0]?.message?.content;

		if (!content) {
			throw new AIGenerationError('Empty AI response');
		}

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
	const baseUrl = normalizeOpenAIBaseUrl(config.openaiBaseUrl ?? DEFAULT_OPENAI_BASE_URL);
	const model = config.openaiModel ?? DEFAULT_OPENAI_MODEL;

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

				// 4xx usually means bad config or payload; only 429 is expected to heal with retry.
				if (response.status >= 400 && response.status < 500 && response.status !== 429) {
					throw statusError;
				}

				lastError = statusError;
				continue;
			}

			const data: unknown = await response.json();
			return parseAIResponse(data);
		} catch (error) {
			clearTimeout(timeoutId);

			// Parser/config failures will repeat with the same response; retry only status/timeout paths.
			if (error instanceof AIGenerationError) {
				if ((error as AIGenerationError).message.includes('OpenAI API error: 4')) {
					throw error;
				}
				lastError = error;
				continue;
			}

			if ((error as Error).name === 'AbortError') {
				lastError = new AIGenerationError('AI generation timed out');
				continue;
			}

			lastError = new AIGenerationError(`AI generation failed: ${(error as Error).message}`, error);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	throw lastError ?? new AIGenerationError('AI generation failed after retries');
}

export function generateFromTemplates(
	context: FactGenerationContext,
	options: Omit<GenerateFunFactsOptions, 'preferAI'> & { useWeightedSelection?: boolean } = {}
): FunFact[] {
	const { count = 3, categories, excludeIds = [], useWeightedSelection = true } = options;

	let templates = getAllTemplates();

	if (categories) {
		templates = templates.filter((t) => categories.includes(t.category as FactCategory));
	}

	const applicableTemplates = templates.filter((t) => isTemplateApplicable(t, context));

	if (applicableTemplates.length === 0) {
		// A sparse Wrapped should omit fun facts rather than fail the whole recap.
		return [];
	}

	const selected = useWeightedSelection
		? selectWeightedTemplates(applicableTemplates, count, excludeIds)
		: selectRandomTemplates(applicableTemplates, count, excludeIds);

	return selected.map((template) => generateFromTemplate(template, context));
}

export async function generateFunFacts(
	stats: UserStats | ServerStats,
	options: GenerateFunFactsOptions = {}
): Promise<FunFact[]> {
	const { count = 3, categories, excludeIds = [], preferAI = true } = options;

	const config = await getFunFactsConfig();
	const context = buildGenerationContext(stats);

	if (preferAI && config.aiEnabled && config.openaiApiKey) {
		try {
			const aiFacts = await generateWithAI(stats, config, count);
			if (aiFacts.length >= count) {
				return aiFacts.slice(0, count);
			}
			const remaining = count - aiFacts.length;
			const templateFacts = generateFromTemplates(context, {
				count: remaining,
				categories,
				excludeIds
			});
			return [...aiFacts, ...templateFacts].slice(0, count);
		} catch (error) {
			console.warn('AI fun fact generation failed, falling back to templates:', error);
		}
	}

	return generateFromTemplates(context, { count, categories, excludeIds });
}
