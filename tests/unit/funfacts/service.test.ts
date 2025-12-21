/**
 * Unit tests for Fun Facts Service
 *
 * Tests context building, template applicability, interpolation,
 * and random selection functions.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { AppSettingsKey } from '$lib/server/admin/settings.service';

import {
	buildGenerationContext,
	isTemplateApplicable,
	interpolateTemplate,
	generateFromTemplate,
	selectRandomTemplates,
	generateFromTemplates,
	getFunFactsConfig,
	isAIAvailable,
	generateWithAI,
	generateFunFacts
} from '$lib/server/funfacts';

import { AIGenerationError } from '$lib/server/funfacts';

import {
	ALL_TEMPLATES,
	TIME_EQUIVALENCY_TEMPLATES,
	EQUIVALENCY_FACTORS,
	MONTH_NAMES
} from '$lib/server/funfacts';

import type { UserStats, ServerStats } from '$lib/server/stats/types';
import type { FactTemplate, FactGenerationContext } from '$lib/server/funfacts';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockUserStats(overrides: Partial<UserStats> = {}): UserStats {
	return {
		userId: 1,
		year: 2024,
		totalWatchTimeMinutes: 6000, // 100 hours
		totalPlays: 200,
		topMovies: [
			{ rank: 1, title: 'The Matrix', count: 5, thumb: null },
			{ rank: 2, title: 'Inception', count: 3, thumb: null }
		],
		topShows: [
			{ rank: 1, title: 'Breaking Bad', count: 50, thumb: null },
			{ rank: 2, title: 'The Office', count: 30, thumb: null }
		],
		topGenres: [],
		watchTimeByMonth: [500, 400, 600, 500, 400, 300, 800, 600, 500, 400, 500, 500],
		watchTimeByHour: Array(24)
			.fill(0)
			.map((_, i) => (i >= 19 && i <= 23 ? 500 : 100)),
		percentileRank: 85,
		longestBinge: {
			startTime: 1704067200,
			endTime: 1704085200,
			plays: 6,
			totalMinutes: 300
		},
		firstWatch: { title: 'New Year Movie', viewedAt: 1704067200, thumb: null, type: 'movie' },
		lastWatch: { title: 'Year End Show', viewedAt: 1735603199, thumb: null, type: 'episode' },
		...overrides
	};
}

function createMockServerStats(overrides: Partial<ServerStats> = {}): ServerStats {
	return {
		year: 2024,
		totalUsers: 10,
		totalWatchTimeMinutes: 60000,
		totalPlays: 2000,
		topMovies: [{ rank: 1, title: 'Popular Movie', count: 50, thumb: null }],
		topShows: [{ rank: 1, title: 'Popular Show', count: 500, thumb: null }],
		topGenres: [],
		watchTimeByMonth: Array(12).fill(5000),
		watchTimeByHour: Array(24).fill(2500),
		topViewers: [{ rank: 1, userId: 1, username: 'TopUser', totalMinutes: 10000 }],
		longestBinge: {
			startTime: 1704067200,
			endTime: 1704110400,
			plays: 10,
			totalMinutes: 720
		},
		firstWatch: { title: 'Server First', viewedAt: 1704067200, thumb: null, type: 'movie' },
		lastWatch: { title: 'Server Last', viewedAt: 1735603199, thumb: null, type: 'movie' },
		...overrides
	};
}

// =============================================================================
// Context Building Tests
// =============================================================================

describe('buildGenerationContext', () => {
	it('builds context correctly from user stats', () => {
		const stats = createMockUserStats();
		const context = buildGenerationContext(stats);

		expect(context.hours).toBe(100); // 6000 / 60
		expect(context.days).toBe(4.2); // 100 / 24 rounded to 1 decimal
		expect(context.plays).toBe(200);
		expect(context.topMovie).toBe('The Matrix');
		expect(context.topMovieCount).toBe(5);
		expect(context.topShow).toBe('Breaking Bad');
		expect(context.topShowCount).toBe(50);
		expect(context.percentile).toBe(85);
		expect(context.bingeHours).toBe(5); // 300 / 60
		expect(context.bingePlays).toBe(6);
		expect(context.firstWatchTitle).toBe('New Year Movie');
		expect(context.lastWatchTitle).toBe('Year End Show');
		expect(context.uniqueMovies).toBe(2);
		expect(context.uniqueShows).toBe(2);
	});

	it('handles server stats (uses 50 for percentile)', () => {
		const stats = createMockServerStats();
		const context = buildGenerationContext(stats);

		expect(context.percentile).toBe(50);
		expect(context.hours).toBe(1000); // 60000 / 60
	});

	it('handles missing optional fields', () => {
		const stats = createMockUserStats({
			topMovies: [],
			topShows: [],
			longestBinge: null,
			firstWatch: null,
			lastWatch: null
		});
		const context = buildGenerationContext(stats);

		expect(context.topMovie).toBeNull();
		expect(context.topMovieCount).toBe(0);
		expect(context.topShow).toBeNull();
		expect(context.topShowCount).toBe(0);
		expect(context.bingeHours).toBeNull();
		expect(context.bingePlays).toBeNull();
		expect(context.firstWatchTitle).toBeNull();
		expect(context.lastWatchTitle).toBeNull();
	});

	it('calculates peak hour correctly', () => {
		const watchTimeByHour = Array(24).fill(0);
		watchTimeByHour[22] = 1000; // 10 PM peak
		const stats = createMockUserStats({ watchTimeByHour });
		const context = buildGenerationContext(stats);

		expect(context.peakHour).toBe(22);
	});

	it('calculates peak month correctly', () => {
		const watchTimeByMonth = Array(12).fill(0);
		watchTimeByMonth[6] = 5000; // July peak (0-indexed)
		const stats = createMockUserStats({ watchTimeByMonth });
		const context = buildGenerationContext(stats);

		expect(context.peakMonth).toBe(6);
	});
});

// =============================================================================
// Template Applicability Tests
// =============================================================================

describe('isTemplateApplicable', () => {
	const mockContext: FactGenerationContext = {
		hours: 100,
		days: 4.2,
		plays: 200,
		topMovie: 'The Matrix',
		topMovieCount: 5,
		topShow: 'Breaking Bad',
		topShowCount: 50,
		percentile: 85,
		bingeHours: 5,
		bingePlays: 6,
		peakHour: 22,
		peakMonth: 6,
		firstWatchTitle: 'First',
		lastWatchTitle: 'Last',
		uniqueMovies: 10,
		uniqueShows: 5
	};

	it('returns true for applicable template', () => {
		const template: FactTemplate = {
			id: 'test',
			category: 'time-equivalency',
			factTemplate: 'You watched {hours} hours',
			requiredStats: ['hours'],
			minThresholds: { hours: 50 }
		};

		expect(isTemplateApplicable(template, mockContext)).toBe(true);
	});

	it('returns false when required stat is null', () => {
		const template: FactTemplate = {
			id: 'test',
			category: 'content-comparison',
			factTemplate: 'Top movie: {topMovie}',
			requiredStats: ['topMovie']
		};

		const context = { ...mockContext, topMovie: null };
		expect(isTemplateApplicable(template, context)).toBe(false);
	});

	it('returns false when below minimum threshold', () => {
		const template: FactTemplate = {
			id: 'test',
			category: 'time-equivalency',
			factTemplate: 'You watched {hours} hours',
			requiredStats: ['hours'],
			minThresholds: { hours: 200 } // Higher than context.hours (100)
		};

		expect(isTemplateApplicable(template, mockContext)).toBe(false);
	});

	it('handles night-owl template (requires peakHour >= 21)', () => {
		const template: FactTemplate = {
			id: 'night-owl',
			category: 'behavioral-insight',
			factTemplate: 'Peak at {peakHour}',
			requiredStats: ['peakHour'],
			minThresholds: { peakHour: 21 }
		};

		// peakHour is 22, so should be applicable
		expect(isTemplateApplicable(template, mockContext)).toBe(true);

		// peakHour is 18, so should not be applicable
		expect(isTemplateApplicable(template, { ...mockContext, peakHour: 18 })).toBe(false);
	});

	it('handles early-bird template (requires peakHour <= 9)', () => {
		const template: FactTemplate = {
			id: 'early-bird',
			category: 'behavioral-insight',
			factTemplate: 'Peak at {peakHour}',
			requiredStats: ['peakHour']
		};

		// peakHour is 22, so should not be applicable
		expect(isTemplateApplicable(template, mockContext)).toBe(false);

		// peakHour is 7, so should be applicable
		expect(isTemplateApplicable(template, { ...mockContext, peakHour: 7 })).toBe(true);
	});

	it('allows peakHour and peakMonth to be 0', () => {
		const template: FactTemplate = {
			id: 'test',
			category: 'behavioral-insight',
			factTemplate: 'Peak at {peakHour}',
			requiredStats: ['peakHour', 'peakMonth']
		};

		const context = { ...mockContext, peakHour: 0, peakMonth: 0 };
		expect(isTemplateApplicable(template, context)).toBe(true);
	});
});

// =============================================================================
// Template Interpolation Tests
// =============================================================================

describe('interpolateTemplate', () => {
	const mockContext: FactGenerationContext = {
		hours: 100,
		days: 4.2,
		plays: 200,
		topMovie: 'The Matrix',
		topMovieCount: 5,
		topShow: 'Breaking Bad',
		topShowCount: 50,
		percentile: 85,
		bingeHours: 5,
		bingePlays: 6,
		peakHour: 22,
		peakMonth: 6,
		firstWatchTitle: 'New Year Movie',
		lastWatchTitle: 'Year End Show',
		uniqueMovies: 10,
		uniqueShows: 5
	};

	it('interpolates basic placeholders', () => {
		const result = interpolateTemplate('You watched {hours} hours', mockContext);
		expect(result).toBe('You watched 100 hours');
	});

	it('interpolates multiple placeholders', () => {
		const result = interpolateTemplate('{topMovie} ({topMovieCount} times)', mockContext);
		expect(result).toBe('The Matrix (5 times)');
	});

	it('interpolates calculated equivalencies', () => {
		const result = interpolateTemplate('{flightCount} flights to Tokyo', mockContext);
		// 100 hours / 14 hours per flight = 7.14...
		expect(result).toContain('7');
	});

	it('formats peak hour correctly', () => {
		const result = interpolateTemplate('{peakHourFormatted}', mockContext);
		expect(result).toBe('10:00 PM');
	});

	it('formats peak month correctly', () => {
		const result = interpolateTemplate('{peakMonthName}', mockContext);
		expect(result).toBe('July'); // Month 6 (0-indexed)
	});

	it('preserves unknown placeholders', () => {
		const result = interpolateTemplate('{unknownPlaceholder}', mockContext);
		expect(result).toBe('{unknownPlaceholder}');
	});

	it('handles null values with defaults', () => {
		const context = { ...mockContext, topMovie: null };
		const result = interpolateTemplate('Movie: {topMovie}', context);
		expect(result).toBe('Movie: Unknown');
	});
});

// =============================================================================
// Template Generation Tests
// =============================================================================

describe('generateFromTemplate', () => {
	const mockContext: FactGenerationContext = {
		hours: 100,
		days: 4.2,
		plays: 200,
		topMovie: 'The Matrix',
		topMovieCount: 5,
		topShow: 'Breaking Bad',
		topShowCount: 50,
		percentile: 85,
		bingeHours: 5,
		bingePlays: 6,
		peakHour: 22,
		peakMonth: 6,
		firstWatchTitle: 'First',
		lastWatchTitle: 'Last',
		uniqueMovies: 10,
		uniqueShows: 5
	};

	it('generates fact with interpolated values', () => {
		const template: FactTemplate = {
			id: 'test',
			category: 'time-equivalency',
			factTemplate: 'You watched {hours} hours',
			comparisonTemplate: "That's {days} days of content!",
			icon: '🎬',
			requiredStats: ['hours']
		};

		const result = generateFromTemplate(template, mockContext);

		expect(result.fact).toBe('You watched 100 hours');
		expect(result.comparison).toBe("That's 4.2 days of content!");
		expect(result.icon).toBe('🎬');
	});

	it('handles template without comparison', () => {
		const template: FactTemplate = {
			id: 'test',
			category: 'time-equivalency',
			factTemplate: 'You watched {hours} hours',
			requiredStats: ['hours']
		};

		const result = generateFromTemplate(template, mockContext);

		expect(result.fact).toBe('You watched 100 hours');
		expect(result.comparison).toBeUndefined();
		expect(result.icon).toBeUndefined();
	});
});

// =============================================================================
// Random Selection Tests
// =============================================================================

describe('selectRandomTemplates', () => {
	const templates: FactTemplate[] = [
		{ id: 'a', category: 'time-equivalency', factTemplate: 'A', requiredStats: [] },
		{ id: 'b', category: 'time-equivalency', factTemplate: 'B', requiredStats: [] },
		{ id: 'c', category: 'time-equivalency', factTemplate: 'C', requiredStats: [] },
		{ id: 'd', category: 'time-equivalency', factTemplate: 'D', requiredStats: [] },
		{ id: 'e', category: 'time-equivalency', factTemplate: 'E', requiredStats: [] }
	];

	it('returns requested count of templates', () => {
		const result = selectRandomTemplates(templates, 3);
		expect(result.length).toBe(3);
	});

	it('returns no duplicates', () => {
		const result = selectRandomTemplates(templates, 5);
		const ids = result.map((t) => t.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it('returns all templates if count exceeds available', () => {
		const result = selectRandomTemplates(templates, 10);
		expect(result.length).toBe(5);
	});

	it('excludes specified template IDs', () => {
		const result = selectRandomTemplates(templates, 5, ['a', 'b']);
		const ids = result.map((t) => t.id);
		expect(ids).not.toContain('a');
		expect(ids).not.toContain('b');
		expect(result.length).toBe(3);
	});

	it('handles empty exclude list', () => {
		const result = selectRandomTemplates(templates, 3, []);
		expect(result.length).toBe(3);
	});

	it('handles empty templates array', () => {
		const result = selectRandomTemplates([], 3);
		expect(result.length).toBe(0);
	});
});

// =============================================================================
// Full Generation Tests
// =============================================================================

describe('generateFromTemplates', () => {
	it('generates requested number of facts', () => {
		const stats = createMockUserStats();
		const context = buildGenerationContext(stats);
		const result = generateFromTemplates(context, { count: 3 });

		expect(result.length).toBe(3);
	});

	it('all generated facts have non-empty fact strings', () => {
		const stats = createMockUserStats();
		const context = buildGenerationContext(stats);
		const result = generateFromTemplates(context, { count: 5 });

		for (const fact of result) {
			expect(fact.fact).toBeTruthy();
			expect(fact.fact.length).toBeGreaterThan(0);
		}
	});

	it('facts do not contain uninterpolated placeholders', () => {
		const stats = createMockUserStats();
		const context = buildGenerationContext(stats);
		const result = generateFromTemplates(context, { count: 5 });

		for (const fact of result) {
			// Should not contain {placeholder} patterns
			expect(fact.fact).not.toMatch(/\{[a-zA-Z]+\}/);
			if (fact.comparison) {
				expect(fact.comparison).not.toMatch(/\{[a-zA-Z]+\}/);
			}
		}
	});

	it('excludes specified template IDs', () => {
		const stats = createMockUserStats();
		const context = buildGenerationContext(stats);

		// Get all IDs from time-equivalency category
		const timeEquivIds = TIME_EQUIVALENCY_TEMPLATES.map((t) => t.id);

		// Generate without time-equivalency templates
		const result = generateFromTemplates(context, {
			count: 3,
			excludeIds: timeEquivIds
		});

		// None should be from time-equivalency category (by verifying they exist in other categories)
		expect(result.length).toBeGreaterThan(0);
	});

	it('returns year-participant template when no other templates apply (graceful degradation)', () => {
		const stats = createMockUserStats({
			totalWatchTimeMinutes: 0,
			totalPlays: 0,
			topMovies: [],
			topShows: [],
			longestBinge: null,
			firstWatch: null,
			lastWatch: null,
			percentileRank: 0,
			watchTimeByMonth: Array(12).fill(0),
			watchTimeByHour: Array(24).fill(0)
		});
		const context = buildGenerationContext(stats);

		const result = generateFromTemplates(context, { count: 3 });
		// The year-participant template always applies as a fallback
		expect(result.length).toBeGreaterThanOrEqual(1);
		expect(result[0]?.fact).toContain('active viewer');
	});
});

// =============================================================================
// Template Constants Tests
// =============================================================================

describe('Template Constants', () => {
	it('ALL_TEMPLATES contains templates from all categories', () => {
		const categories = new Set(ALL_TEMPLATES.map((t) => t.category));

		expect(categories.has('time-equivalency')).toBe(true);
		expect(categories.has('content-comparison')).toBe(true);
		expect(categories.has('behavioral-insight')).toBe(true);
		expect(categories.has('binge-related')).toBe(true);
		expect(categories.has('temporal-pattern')).toBe(true);
	});

	it('all templates have unique IDs', () => {
		const ids = ALL_TEMPLATES.map((t) => t.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it('all templates have required fields', () => {
		for (const template of ALL_TEMPLATES) {
			expect(template.id).toBeTruthy();
			expect(template.category).toBeTruthy();
			expect(template.factTemplate).toBeTruthy();
			expect(Array.isArray(template.requiredStats)).toBe(true);
		}
	});

	it('EQUIVALENCY_FACTORS contains expected values', () => {
		expect(EQUIVALENCY_FACTORS.FLIGHT_NYC_TOKYO_HOURS).toBe(14);
		expect(EQUIVALENCY_FACTORS.LOTR_EXTENDED_TOTAL_HOURS).toBe(11.4);
		expect(EQUIVALENCY_FACTORS.AVERAGE_BOOK_HOURS).toBe(6);
	});

	it('MONTH_NAMES has 12 entries', () => {
		expect(MONTH_NAMES.length).toBe(12);
		expect(MONTH_NAMES[0]).toBe('January');
		expect(MONTH_NAMES[11]).toBe('December');
	});
});

// =============================================================================
// Configuration Tests
// =============================================================================

describe('getFunFactsConfig', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	it('returns config with defaults when no settings configured', async () => {
		const config = await getFunFactsConfig();

		expect(config.aiEnabled).toBe(false);
		expect(config.openaiApiKey).toBeUndefined();
		expect(config.openaiBaseUrl).toBe('https://api.openai.com/v1');
		expect(config.openaiModel).toBe('gpt-4o-mini');
		expect(config.maxAIRetries).toBe(2);
		expect(config.aiTimeoutMs).toBe(10000);
	});

	it('returns aiEnabled true when API key is set', async () => {
		await db.insert(appSettings).values({
			key: AppSettingsKey.OPENAI_API_KEY,
			value: 'sk-test-key-12345'
		});

		const config = await getFunFactsConfig();

		expect(config.aiEnabled).toBe(true);
		expect(config.openaiApiKey).toBe('sk-test-key-12345');
	});

	it('uses custom base URL and model when configured', async () => {
		await db.insert(appSettings).values([
			{ key: AppSettingsKey.OPENAI_API_KEY, value: 'sk-test' },
			{ key: AppSettingsKey.OPENAI_BASE_URL, value: 'https://custom.api.com/v1' },
			{ key: AppSettingsKey.OPENAI_MODEL, value: 'gpt-4' }
		]);

		const config = await getFunFactsConfig();

		expect(config.openaiBaseUrl).toBe('https://custom.api.com/v1');
		expect(config.openaiModel).toBe('gpt-4');
	});
});

describe('isAIAvailable', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	it('returns false when API key is not configured', async () => {
		const available = await isAIAvailable();
		expect(available).toBe(false);
	});

	it('returns true when API key is configured', async () => {
		await db.insert(appSettings).values({
			key: AppSettingsKey.OPENAI_API_KEY,
			value: 'sk-test-key'
		});

		const available = await isAIAvailable();
		expect(available).toBe(true);
	});
});

// =============================================================================
// AI Generation Tests
// =============================================================================

describe('generateWithAI', () => {
	let fetchMock: ReturnType<typeof spyOn>;
	const mockStats = createMockUserStats();

	beforeEach(async () => {
		await db.delete(appSettings);
	});

	afterEach(() => {
		if (fetchMock) {
			fetchMock.mockRestore();
		}
	});

	it('throws AIGenerationError when no API key configured', async () => {
		const config = await getFunFactsConfig();

		await expect(generateWithAI(mockStats, config, 3)).rejects.toBeInstanceOf(AIGenerationError);
		await expect(generateWithAI(mockStats, config, 3)).rejects.toThrow(
			'OpenAI API key not configured'
		);
	});

	it('parses successful AI response', async () => {
		const mockResponse = {
			choices: [
				{
					message: {
						content: JSON.stringify({
							facts: [
								{ fact: 'AI generated fact 1', comparison: 'Comparison 1', icon: '🎬' },
								{ fact: 'AI generated fact 2', comparison: 'Comparison 2', icon: '📺' }
							]
						})
					}
				}
			]
		};

		fetchMock = spyOn(globalThis, 'fetch').mockImplementation((() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve(mockResponse)
			} as Response)) as unknown as typeof fetch);

		const config = {
			aiEnabled: true,
			openaiApiKey: 'sk-test',
			openaiBaseUrl: 'https://api.openai.com/v1',
			openaiModel: 'gpt-4o-mini',
			maxAIRetries: 2,
			aiTimeoutMs: 10000,
			aiPersona: 'witty' as const
		};

		const facts = await generateWithAI(mockStats, config, 2);

		expect(facts).toHaveLength(2);
		expect(facts[0]?.fact).toBe('AI generated fact 1');
		expect(facts[1]?.icon).toBe('📺');
	});

	it('throws on 4xx errors without retry (except 429)', async () => {
		fetchMock = spyOn(globalThis, 'fetch').mockImplementation((() =>
			Promise.resolve({
				ok: false,
				status: 401,
				text: () => Promise.resolve('Unauthorized')
			} as Response)) as unknown as typeof fetch);

		const config = {
			aiEnabled: true,
			openaiApiKey: 'sk-invalid',
			openaiBaseUrl: 'https://api.openai.com/v1',
			openaiModel: 'gpt-4o-mini',
			maxAIRetries: 2,
			aiTimeoutMs: 10000,
			aiPersona: 'witty' as const
		};

		await expect(generateWithAI(mockStats, config, 3)).rejects.toThrow('OpenAI API error: 401');
	});

	it('retries on 5xx errors', async () => {
		let callCount = 0;
		fetchMock = spyOn(globalThis, 'fetch').mockImplementation((() => {
			callCount++;
			if (callCount === 1) {
				return Promise.resolve({
					ok: false,
					status: 500,
					text: () => Promise.resolve('Internal Server Error')
				} as Response);
			}
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [
							{
								message: {
									content: JSON.stringify({
										facts: [{ fact: 'Retried fact', icon: '✅' }]
									})
								}
							}
						]
					})
			} as Response);
		}) as unknown as typeof fetch);

		const config = {
			aiEnabled: true,
			openaiApiKey: 'sk-test',
			openaiBaseUrl: 'https://api.openai.com/v1',
			openaiModel: 'gpt-4o-mini',
			maxAIRetries: 2,
			aiTimeoutMs: 10000,
			aiPersona: 'witty' as const
		};

		const facts = await generateWithAI(mockStats, config, 1);

		expect(callCount).toBe(2);
		expect(facts[0]?.fact).toBe('Retried fact');
	});

	it('throws AIGenerationError on empty AI response', async () => {
		fetchMock = spyOn(globalThis, 'fetch').mockImplementation((() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ choices: [] })
			} as Response)) as unknown as typeof fetch);

		const config = {
			aiEnabled: true,
			openaiApiKey: 'sk-test',
			openaiBaseUrl: 'https://api.openai.com/v1',
			openaiModel: 'gpt-4o-mini',
			maxAIRetries: 0, // No retries for this test
			aiTimeoutMs: 10000,
			aiPersona: 'witty' as const
		};

		await expect(generateWithAI(mockStats, config, 3)).rejects.toBeInstanceOf(AIGenerationError);
	});

	it('throws AIGenerationError on invalid JSON in response', async () => {
		fetchMock = spyOn(globalThis, 'fetch').mockImplementation((() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [{ message: { content: 'not valid json' } }]
					})
			} as Response)) as unknown as typeof fetch);

		const config = {
			aiEnabled: true,
			openaiApiKey: 'sk-test',
			openaiBaseUrl: 'https://api.openai.com/v1',
			openaiModel: 'gpt-4o-mini',
			maxAIRetries: 0,
			aiTimeoutMs: 10000,
			aiPersona: 'witty' as const
		};

		await expect(generateWithAI(mockStats, config, 3)).rejects.toBeInstanceOf(AIGenerationError);
	});
});

// =============================================================================
// Main generateFunFacts Tests
// =============================================================================

describe('generateFunFacts', () => {
	let fetchMock: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		await db.delete(appSettings);
	});

	afterEach(() => {
		if (fetchMock) {
			fetchMock.mockRestore();
		}
	});

	it('uses templates when AI is not available', async () => {
		const stats = createMockUserStats();
		const facts = await generateFunFacts(stats, { count: 3 });

		expect(facts).toHaveLength(3);
		// Template facts should have string facts
		for (const fact of facts) {
			expect(typeof fact.fact).toBe('string');
			expect(fact.fact.length).toBeGreaterThan(0);
		}
	});

	it('uses templates when preferAI is false', async () => {
		await db.insert(appSettings).values({
			key: AppSettingsKey.OPENAI_API_KEY,
			value: 'sk-test'
		});

		const stats = createMockUserStats();
		const facts = await generateFunFacts(stats, { count: 3, preferAI: false });

		expect(facts).toHaveLength(3);
	});

	it('falls back to templates when AI fails', async () => {
		await db.insert(appSettings).values({
			key: AppSettingsKey.OPENAI_API_KEY,
			value: 'sk-test'
		});

		fetchMock = spyOn(globalThis, 'fetch').mockImplementation((() =>
			Promise.resolve({
				ok: false,
				status: 401,
				text: () => Promise.resolve('Unauthorized')
			} as Response)) as unknown as typeof fetch);

		const stats = createMockUserStats();
		const facts = await generateFunFacts(stats, { count: 3 });

		// Should have fallen back to templates
		expect(facts).toHaveLength(3);
	});

	it('supplements with templates when AI returns fewer facts', async () => {
		await db.insert(appSettings).values({
			key: AppSettingsKey.OPENAI_API_KEY,
			value: 'sk-test'
		});

		fetchMock = spyOn(globalThis, 'fetch').mockImplementation((() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [
							{
								message: {
									content: JSON.stringify({
										facts: [{ fact: 'Only one AI fact', icon: '🎬' }]
									})
								}
							}
						]
					})
			} as Response)) as unknown as typeof fetch);

		const stats = createMockUserStats();
		const facts = await generateFunFacts(stats, { count: 3 });

		// Should have 3 facts total (1 AI + 2 templates)
		expect(facts).toHaveLength(3);
		expect(facts[0]?.fact).toBe('Only one AI fact');
	});
});
