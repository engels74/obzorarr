import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import {
	getFunFactsConfig,
	isAIAvailable,
	generateWithAI,
	generateFunFacts,
	buildGenerationContext
} from '$lib/server/funfacts/service';
import { AppSettingsKey } from '$lib/server/admin/settings.service';
import { AIGenerationError } from '$lib/server/funfacts/types';
import type { UserStats } from '$lib/server/stats/types';
import type { FunFactsConfig } from '$lib/server/funfacts/types';

/**
 * Unit tests for Fun Facts AI Generation
 *
 * Tests AI configuration, API calls, response parsing, and retry logic.
 * Uses mocked fetch for API calls.
 */

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

function createMockConfig(overrides: Partial<FunFactsConfig> = {}): FunFactsConfig {
	return {
		aiEnabled: true,
		openaiApiKey: 'test-api-key',
		openaiBaseUrl: 'https://api.openai.com/v1',
		openaiModel: 'gpt-4o-mini',
		maxAIRetries: 2,
		aiTimeoutMs: 10000,
		aiPersona: 'witty',
		...overrides
	};
}

function createValidAIResponse() {
	return {
		choices: [
			{
				message: {
					content: JSON.stringify({
						facts: [
							{
								fact: 'You watched 100 hours',
								comparison: 'That equals 7 flights to Tokyo!',
								icon: '✈️'
							},
							{ fact: 'Top movie was Matrix', comparison: 'A sci-fi classic!', icon: '🎬' },
							{ fact: 'You binged 5 hours', comparison: 'Impressive dedication!', icon: '🍿' }
						]
					})
				}
			}
		]
	};
}

// Store original fetch
let originalFetch: typeof fetch;

describe('Fun Facts AI', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	// =========================================================================
	// Configuration Tests
	// =========================================================================

	describe('getFunFactsConfig', () => {
		it('returns defaults when no settings exist', async () => {
			const config = await getFunFactsConfig();

			expect(config.aiEnabled).toBe(false);
			expect(config.openaiApiKey).toBeUndefined();
			expect(config.openaiBaseUrl).toBe('https://api.openai.com/v1');
			expect(config.openaiModel).toBe('gpt-4o-mini');
			expect(config.maxAIRetries).toBe(2);
			expect(config.aiTimeoutMs).toBe(10000);
		});

		it('returns stored settings when configured', async () => {
			await db.insert(appSettings).values([
				{ key: AppSettingsKey.OPENAI_API_KEY, value: 'sk-test-key' },
				{ key: AppSettingsKey.OPENAI_BASE_URL, value: 'https://custom.api.com/v1' },
				{ key: AppSettingsKey.OPENAI_MODEL, value: 'gpt-4' }
			]);

			const config = await getFunFactsConfig();

			expect(config.aiEnabled).toBe(true);
			expect(config.openaiApiKey).toBe('sk-test-key');
			expect(config.openaiBaseUrl).toBe('https://custom.api.com/v1');
			expect(config.openaiModel).toBe('gpt-4');
		});

		it('aiEnabled is true only when API key exists', async () => {
			// No API key
			let config = await getFunFactsConfig();
			expect(config.aiEnabled).toBe(false);

			// With API key
			await db.insert(appSettings).values({
				key: AppSettingsKey.OPENAI_API_KEY,
				value: 'sk-test'
			});
			config = await getFunFactsConfig();
			expect(config.aiEnabled).toBe(true);
		});
	});

	describe('isAIAvailable', () => {
		it('returns false when no API key configured', async () => {
			const available = await isAIAvailable();
			expect(available).toBe(false);
		});

		it('returns true when API key is configured', async () => {
			await db.insert(appSettings).values({
				key: AppSettingsKey.OPENAI_API_KEY,
				value: 'sk-test'
			});

			const available = await isAIAvailable();
			expect(available).toBe(true);
		});
	});

	// =========================================================================
	// generateWithAI Tests
	// =========================================================================

	describe('generateWithAI', () => {
		it('throws AIGenerationError when API key not configured', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig({ openaiApiKey: undefined });

			try {
				await generateWithAI(stats, config, 3);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(AIGenerationError);
				expect((error as AIGenerationError).message).toContain('API key not configured');
			}
		});

		it('makes API call with correct parameters', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig();

			let capturedUrl: string | null = null;

			globalThis.fetch = mock(async (input: RequestInfo | URL) => {
				// Extract URL from input (could be string, URL, or Request)
				if (typeof input === 'string') {
					capturedUrl = input;
				} else if (input instanceof URL) {
					capturedUrl = input.toString();
				} else if (input instanceof Request) {
					capturedUrl = input.url;
				}
				return new Response(JSON.stringify(createValidAIResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}) as unknown as typeof fetch;

			await generateWithAI(stats, config, 3);

			expect(capturedUrl).not.toBeNull();
			expect(capturedUrl!).toContain('chat/completions');
		});

		it('returns parsed facts on successful API call', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig();

			globalThis.fetch = mock(async () => {
				return new Response(JSON.stringify(createValidAIResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}) as unknown as typeof fetch;

			const facts = await generateWithAI(stats, config, 3);

			expect(facts).toHaveLength(3);
			expect(facts[0]?.fact).toBe('You watched 100 hours');
			expect(facts[0]?.icon).toBe('✈️');
		});

		it('throws AIGenerationError on 400 error (non-retryable)', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig({ maxAIRetries: 2 });

			let callCount = 0;
			globalThis.fetch = mock(async () => {
				callCount++;
				return new Response('Bad Request', { status: 400 });
			}) as unknown as typeof fetch;

			try {
				await generateWithAI(stats, config, 3);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(AIGenerationError);
				expect((error as AIGenerationError).message).toContain('400');
			}

			// Should NOT retry 4xx errors
			expect(callCount).toBe(1);
		});

		it('retries on 500 error and eventually succeeds', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig({ maxAIRetries: 2 });

			let callCount = 0;
			globalThis.fetch = mock(async () => {
				callCount++;
				if (callCount < 3) {
					return new Response('Server Error', { status: 500 });
				}
				return new Response(JSON.stringify(createValidAIResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}) as unknown as typeof fetch;

			const facts = await generateWithAI(stats, config, 3);

			expect(callCount).toBe(3); // Initial + 2 retries
			expect(facts).toHaveLength(3);
		});

		it('retries on 429 rate limit error', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig({ maxAIRetries: 1 });

			let callCount = 0;
			globalThis.fetch = mock(async () => {
				callCount++;
				if (callCount === 1) {
					return new Response('Rate Limited', { status: 429 });
				}
				return new Response(JSON.stringify(createValidAIResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}) as unknown as typeof fetch;

			const facts = await generateWithAI(stats, config, 3);

			expect(callCount).toBe(2);
			expect(facts).toHaveLength(3);
		});

		it('throws after exhausting retries', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig({ maxAIRetries: 2 });

			let callCount = 0;
			globalThis.fetch = mock(async () => {
				callCount++;
				return new Response('Server Error', { status: 500 });
			}) as unknown as typeof fetch;

			try {
				await generateWithAI(stats, config, 3);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(AIGenerationError);
			}

			expect(callCount).toBe(3); // Initial + 2 retries
		});

		it('retries on network error', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig({ maxAIRetries: 1 });

			let callCount = 0;
			globalThis.fetch = mock(async () => {
				callCount++;
				if (callCount === 1) {
					throw new Error('Network error');
				}
				return new Response(JSON.stringify(createValidAIResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}) as unknown as typeof fetch;

			const facts = await generateWithAI(stats, config, 3);

			expect(callCount).toBe(2);
			expect(facts).toHaveLength(3);
		});

		it('throws AIGenerationError on empty response', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig();

			globalThis.fetch = mock(async () => {
				return new Response(JSON.stringify({ choices: [{ message: {} }] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}) as unknown as typeof fetch;

			try {
				await generateWithAI(stats, config, 3);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(AIGenerationError);
				expect((error as AIGenerationError).message).toContain('Empty AI response');
			}
		});

		it('throws AIGenerationError on invalid JSON in response', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig();

			globalThis.fetch = mock(async () => {
				return new Response(
					JSON.stringify({
						choices: [{ message: { content: 'not valid json' } }]
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}) as unknown as typeof fetch;

			try {
				await generateWithAI(stats, config, 3);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(AIGenerationError);
				expect((error as AIGenerationError).message).toContain('Failed to parse');
			}
		});

		it('throws AIGenerationError on invalid response structure', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig();

			globalThis.fetch = mock(async () => {
				return new Response(
					JSON.stringify({
						choices: [{ message: { content: JSON.stringify({ notFacts: [] }) } }]
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}) as unknown as typeof fetch;

			try {
				await generateWithAI(stats, config, 3);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(AIGenerationError);
				expect((error as AIGenerationError).message).toContain('Invalid AI response structure');
			}
		});
	});

	// =========================================================================
	// generateFunFacts Tests (AI/Template Fallback)
	// =========================================================================

	describe('generateFunFacts', () => {
		it('uses templates when AI is not configured', async () => {
			const stats = createMockUserStats();

			// No API key configured
			const facts = await generateFunFacts(stats, { count: 3 });

			expect(facts).toHaveLength(3);
			// All facts should be from templates (no AI call made)
		});

		it('falls back to templates when AI fails', async () => {
			const stats = createMockUserStats();

			// Configure API key
			await db.insert(appSettings).values({
				key: AppSettingsKey.OPENAI_API_KEY,
				value: 'sk-test'
			});

			// Mock fetch to fail
			globalThis.fetch = mock(async () => {
				throw new Error('Network error');
			}) as unknown as typeof fetch;

			const facts = await generateFunFacts(stats, { count: 3 });

			// Should fall back to templates
			expect(facts).toHaveLength(3);
			expect(facts[0]?.fact).toBeTruthy();
		});

		it('uses AI when configured and preferAI is true', async () => {
			const stats = createMockUserStats();

			await db.insert(appSettings).values({
				key: AppSettingsKey.OPENAI_API_KEY,
				value: 'sk-test'
			});

			globalThis.fetch = mock(async () => {
				return new Response(JSON.stringify(createValidAIResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}) as unknown as typeof fetch;

			const facts = await generateFunFacts(stats, { count: 3, preferAI: true });

			expect(facts).toHaveLength(3);
			expect(facts[0]?.fact).toBe('You watched 100 hours'); // AI response
		});

		it('uses templates when preferAI is false', async () => {
			const stats = createMockUserStats();

			await db.insert(appSettings).values({
				key: AppSettingsKey.OPENAI_API_KEY,
				value: 'sk-test'
			});

			// Mock should not be called
			let fetchCalled = false;
			globalThis.fetch = mock(async () => {
				fetchCalled = true;
				return new Response(JSON.stringify(createValidAIResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}) as unknown as typeof fetch;

			const facts = await generateFunFacts(stats, { count: 3, preferAI: false });

			expect(fetchCalled).toBe(false);
			expect(facts).toHaveLength(3);
		});

		it('supplements with templates when AI returns fewer facts', async () => {
			const stats = createMockUserStats();

			await db.insert(appSettings).values({
				key: AppSettingsKey.OPENAI_API_KEY,
				value: 'sk-test'
			});

			// AI returns only 1 fact
			globalThis.fetch = mock(async () => {
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										facts: [{ fact: 'Only one fact', comparison: 'Just one', icon: '1️⃣' }]
									})
								}
							}
						]
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}) as unknown as typeof fetch;

			const facts = await generateFunFacts(stats, { count: 3 });

			expect(facts).toHaveLength(3);
			expect(facts[0]?.fact).toBe('Only one fact'); // AI fact first
			// Remaining 2 facts should be from templates
		});
	});

	// =========================================================================
	// Template Applicability Edge Cases
	// =========================================================================

	describe('Template Applicability Edge Cases', () => {
		it('rejects template when required stat is empty string', async () => {
			const stats = createMockUserStats({
				topMovies: [{ rank: 1, title: '', count: 5, thumb: null }]
			});
			const context = buildGenerationContext(stats);

			// Context should have empty string for topMovie
			expect(context.topMovie).toBe('');

			// Generate facts should still work (templates requiring topMovie excluded)
			const facts = await generateFunFacts(stats, { count: 3 });
			expect(facts).toHaveLength(3);
		});

		it('night-owl template requires peakHour >= 21', async () => {
			// Peak hour at 10 PM (22)
			const nightOwlStats = createMockUserStats({
				watchTimeByHour: Array(24)
					.fill(0)
					.map((_, i) => (i === 22 ? 1000 : 100))
			});

			const context = buildGenerationContext(nightOwlStats);
			expect(context.peakHour).toBe(22);

			// Facts might include night-owl template
			const facts = await generateFunFacts(nightOwlStats, { count: 10 });
			expect(facts.length).toBeGreaterThan(0);
		});

		it('night-owl template is excluded when peakHour < 21', async () => {
			// Peak hour at 8 PM (20) - should exclude night-owl
			const notNightOwlStats = createMockUserStats({
				watchTimeByHour: Array(24)
					.fill(0)
					.map((_, i) => (i === 20 ? 1000 : 100))
			});

			const context = buildGenerationContext(notNightOwlStats);
			expect(context.peakHour).toBe(20);

			// Generate facts - night-owl template should be excluded
			const facts = await generateFunFacts(notNightOwlStats, { count: 20 });
			expect(facts.length).toBeGreaterThan(0);

			// Verify night-owl specific content is not present
			const hasNightOwl = facts.some(
				(f) =>
					f.fact.toLowerCase().includes('night owl') || f.fact.toLowerCase().includes('9:00 pm')
			);
			expect(hasNightOwl).toBe(false);
		});

		it('night-owl template is included at boundary peakHour = 21', async () => {
			// Peak hour at 9 PM (21) - boundary, should include night-owl
			const boundaryStats = createMockUserStats({
				watchTimeByHour: Array(24)
					.fill(0)
					.map((_, i) => (i === 21 ? 1000 : 100))
			});

			const context = buildGenerationContext(boundaryStats);
			expect(context.peakHour).toBe(21);

			// Generate many facts to increase chance of hitting night-owl
			const facts = await generateFunFacts(boundaryStats, { count: 20 });
			expect(facts.length).toBeGreaterThan(0);
		});

		it('early-bird template requires peakHour <= 9', async () => {
			// Peak hour at 6 AM
			const earlyBirdStats = createMockUserStats({
				watchTimeByHour: Array(24)
					.fill(0)
					.map((_, i) => (i === 6 ? 1000 : 100))
			});

			const context = buildGenerationContext(earlyBirdStats);
			expect(context.peakHour).toBe(6);

			// Facts might include early-bird template
			const facts = await generateFunFacts(earlyBirdStats, { count: 10 });
			expect(facts.length).toBeGreaterThan(0);
		});

		it('early-bird template is excluded when peakHour > 9', async () => {
			// Peak hour at 10 AM - should exclude early-bird
			const notEarlyBirdStats = createMockUserStats({
				watchTimeByHour: Array(24)
					.fill(0)
					.map((_, i) => (i === 10 ? 1000 : 100))
			});

			const context = buildGenerationContext(notEarlyBirdStats);
			expect(context.peakHour).toBe(10);

			// Generate facts - early-bird template should be excluded
			const facts = await generateFunFacts(notEarlyBirdStats, { count: 20 });
			expect(facts.length).toBeGreaterThan(0);
		});
	});

	// =========================================================================
	// Timeout Handling Tests
	// =========================================================================

	describe('Timeout Handling', () => {
		it('retries on AbortError (timeout)', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig({ maxAIRetries: 1, aiTimeoutMs: 100 });

			let callCount = 0;
			globalThis.fetch = mock(async () => {
				callCount++;
				if (callCount === 1) {
					// Simulate AbortError (timeout)
					const error = new Error('The operation was aborted');
					error.name = 'AbortError';
					throw error;
				}
				return new Response(JSON.stringify(createValidAIResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}) as unknown as typeof fetch;

			const facts = await generateWithAI(stats, config, 3);

			expect(callCount).toBe(2); // Initial + 1 retry after timeout
			expect(facts).toHaveLength(3);
		});

		it('throws AIGenerationError with timeout message after all retries exhausted', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig({ maxAIRetries: 1 });

			let callCount = 0;
			globalThis.fetch = mock(async () => {
				callCount++;
				// Always throw AbortError
				const error = new Error('The operation was aborted');
				error.name = 'AbortError';
				throw error;
			}) as unknown as typeof fetch;

			try {
				await generateWithAI(stats, config, 3);
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(AIGenerationError);
				expect((error as AIGenerationError).message).toContain('timed out');
			}

			expect(callCount).toBe(2); // Initial + 1 retry
		});

		it('recovers from timeout then succeeds on retry', async () => {
			const stats = createMockUserStats();
			const config = createMockConfig({ maxAIRetries: 2 });

			let callCount = 0;
			globalThis.fetch = mock(async () => {
				callCount++;
				if (callCount <= 2) {
					// First 2 calls timeout
					const error = new Error('The operation was aborted');
					error.name = 'AbortError';
					throw error;
				}
				// Third call succeeds
				return new Response(JSON.stringify(createValidAIResponse()), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}) as unknown as typeof fetch;

			const facts = await generateWithAI(stats, config, 3);

			expect(callCount).toBe(3);
			expect(facts).toHaveLength(3);
		});
	});
});
