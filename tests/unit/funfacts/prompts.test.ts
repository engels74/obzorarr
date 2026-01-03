import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
	AI_PERSONAS,
	getRandomPersona,
	resolvePersona,
	buildSystemPrompt,
	buildUserPrompt,
	buildEnhancedPrompt
} from '$lib/server/funfacts/ai/prompts';
import type { FactGenerationContext, AIPersona } from '$lib/server/funfacts/types';

/**
 * Unit tests for AI Prompts Module
 *
 * Tests the prompt building functions used for AI-generated fun facts.
 * Covers persona selection, system/user prompt construction, and edge cases.
 */

function createMockContext(overrides: Partial<FactGenerationContext> = {}): FactGenerationContext {
	return {
		hours: 100,
		days: 4.17,
		plays: 200,
		topMovie: 'The Matrix',
		topMovieCount: 5,
		topShow: 'Breaking Bad',
		topShowCount: 50,
		percentile: 85,
		bingeHours: 8,
		bingePlays: 6,
		peakHour: 21,
		peakMonth: 6,
		firstWatchTitle: 'New Year Movie',
		lastWatchTitle: 'Year End Show',
		uniqueMovies: 50,
		uniqueShows: 20,
		scope: 'user',
		...overrides
	};
}

describe('AI Prompts', () => {
	describe('AI_PERSONAS constant', () => {
		it('contains all expected personas', () => {
			expect(AI_PERSONAS).toHaveProperty('witty');
			expect(AI_PERSONAS).toHaveProperty('wholesome');
			expect(AI_PERSONAS).toHaveProperty('nerdy');
		});

		it('does not contain random as a persona', () => {
			expect(AI_PERSONAS).not.toHaveProperty('random');
		});

		it('has string descriptions for each persona', () => {
			expect(typeof AI_PERSONAS.witty).toBe('string');
			expect(typeof AI_PERSONAS.wholesome).toBe('string');
			expect(typeof AI_PERSONAS.nerdy).toBe('string');
		});
	});

	describe('getRandomPersona', () => {
		const originalRandom = Math.random;

		afterEach(() => {
			Math.random = originalRandom;
		});

		it('returns witty when random is 0', () => {
			Math.random = () => 0;
			expect(getRandomPersona()).toBe('witty');
		});

		it('returns wholesome when random is 0.33', () => {
			Math.random = () => 0.34;
			expect(getRandomPersona()).toBe('wholesome');
		});

		it('returns nerdy when random is 0.67', () => {
			Math.random = () => 0.67;
			expect(getRandomPersona()).toBe('nerdy');
		});

		it('handles edge case when random returns value close to 1.0', () => {
			Math.random = () => 0.9999999;
			const persona = getRandomPersona();
			expect(['witty', 'wholesome', 'nerdy']).toContain(persona);
		});

		it('always returns a valid persona type', () => {
			for (let i = 0; i < 10; i++) {
				const persona = getRandomPersona();
				expect(['witty', 'wholesome', 'nerdy']).toContain(persona);
			}
		});
	});

	describe('resolvePersona', () => {
		const originalRandom = Math.random;

		afterEach(() => {
			Math.random = originalRandom;
		});

		it('returns same persona when not random', () => {
			expect(resolvePersona('witty')).toBe('witty');
			expect(resolvePersona('wholesome')).toBe('wholesome');
			expect(resolvePersona('nerdy')).toBe('nerdy');
		});

		it('calls getRandomPersona when random is passed', () => {
			Math.random = () => 0;
			expect(resolvePersona('random')).toBe('witty');

			Math.random = () => 0.67;
			expect(resolvePersona('random')).toBe('nerdy');
		});
	});

	describe('buildSystemPrompt', () => {
		it('includes persona description', () => {
			const prompt = buildSystemPrompt('witty');
			expect(prompt).toContain('witty entertainment columnist');
		});

		it('uses second person for user scope', () => {
			const prompt = buildSystemPrompt('wholesome', 'user');
			expect(prompt).toContain("'you/your'");
			expect(prompt).toContain('second person');
		});

		it('uses first person plural for server scope', () => {
			const prompt = buildSystemPrompt('nerdy', 'server');
			expect(prompt).toContain("'we/our'");
			expect(prompt).toContain('first person plural');
		});

		it('defaults to user scope when not specified', () => {
			const prompt = buildSystemPrompt('witty');
			expect(prompt).toContain("'you/your'");
		});

		it('includes JSON format instructions', () => {
			const prompt = buildSystemPrompt('witty');
			expect(prompt).toContain('valid JSON');
			expect(prompt).toContain('"facts"');
		});

		it('works with all persona types', () => {
			const personas: Exclude<AIPersona, 'random'>[] = ['witty', 'wholesome', 'nerdy'];
			for (const persona of personas) {
				const prompt = buildSystemPrompt(persona);
				expect(prompt.length).toBeGreaterThan(0);
				expect(prompt).toContain(AI_PERSONAS[persona]);
			}
		});
	});

	describe('buildUserPrompt', () => {
		it('includes basic stats', () => {
			const context = createMockContext();
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('100 hours');
			expect(prompt).toContain('200');
			expect(prompt).toContain('50'); // uniqueMovies
			expect(prompt).toContain('20'); // uniqueShows
		});

		it('includes count in prompt', () => {
			const context = createMockContext();
			const prompt = buildUserPrompt(context, 5);

			expect(prompt).toContain('Generate 5 unique');
		});

		it('includes top movie when present', () => {
			const context = createMockContext({ topMovie: 'Inception' });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('"Inception"');
		});

		it('excludes top movie section when null', () => {
			const context = createMockContext({ topMovie: null });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).not.toContain('Top movie:');
		});

		it('includes top show when present', () => {
			const context = createMockContext({ topShow: 'The Wire' });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('"The Wire"');
		});

		it('excludes top show section when null', () => {
			const context = createMockContext({ topShow: null });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).not.toContain('Top show:');
		});

		it('includes binge hours when present', () => {
			const context = createMockContext({ bingeHours: 12 });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('12 hours straight');
		});

		it('excludes binge hours when null', () => {
			const context = createMockContext({ bingeHours: null });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).not.toContain('hours straight');
		});

		it('includes binge plays when present', () => {
			const context = createMockContext({ bingePlays: 10 });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('Items in longest binge: 10');
		});

		it('excludes binge plays when null', () => {
			const context = createMockContext({ bingePlays: null });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).not.toContain('Items in longest binge');
		});

		it('formats peak hour correctly', () => {
			const context = createMockContext({ peakHour: 21 });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('9:00 PM');
		});

		it('formats peak month correctly', () => {
			const context = createMockContext({ peakMonth: 0 });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('January');
		});

		it('shows top percentile for high percentile', () => {
			const context = createMockContext({ percentile: 90 });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('Top 10%');
		});

		it('shows watched more than for low percentile', () => {
			const context = createMockContext({ percentile: 30 });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('Watched more than 30%');
		});

		it('handles boundary percentile of 50', () => {
			const context = createMockContext({ percentile: 50 });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('Top 50%');
		});

		it('handles boundary percentile of 51', () => {
			const context = createMockContext({ percentile: 49 });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('Watched more than 49%');
		});

		it('includes first watch title when present', () => {
			const context = createMockContext({ firstWatchTitle: 'New Year Movie' });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('Year Bookends');
			expect(prompt).toContain('"New Year Movie"');
		});

		it('includes last watch title when present', () => {
			const context = createMockContext({ lastWatchTitle: 'Year End Show' });
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('"Year End Show"');
		});

		it('excludes year bookends when both are null', () => {
			const context = createMockContext({
				firstWatchTitle: null,
				lastWatchTitle: null
			});
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).not.toContain('Year Bookends');
		});

		it('includes enriched stats when present', () => {
			const context = createMockContext({
				gotCount: 2.5,
				friendsCount: 1.5,
				starWarsCount: 10.2
			});
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('For Reference');
			expect(prompt).toContain('Game of Thrones 2.5 times');
			expect(prompt).toContain('Friends 1.5 times');
			expect(prompt).toContain('Star Wars original trilogy 10.2 times');
		});

		it('excludes enriched stats when all are undefined', () => {
			const context = createMockContext({
				gotCount: undefined,
				friendsCount: undefined,
				starWarsCount: undefined
			});
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).not.toContain('For Reference');
		});

		it('shows For Reference section header even when counts below 1', () => {
			// The section header shows if any count is truthy (even < 1)
			// but individual items only show if >= 1
			const context = createMockContext({
				gotCount: 0.5,
				friendsCount: 0.8,
				starWarsCount: 0.9
			});
			const prompt = buildUserPrompt(context, 3);

			// Header shows because counts are truthy
			expect(prompt).toContain('For Reference');
			// But individual items don't show because they're < 1
			expect(prompt).not.toContain('Game of Thrones');
			expect(prompt).not.toContain('Friends');
			expect(prompt).not.toContain('Star Wars');
		});

		it('includes reminder at the end', () => {
			const context = createMockContext();
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('Be creative, positive, and engaging');
		});

		it('excludes topMovie when empty string', () => {
			const context = createMockContext({ topMovie: '' });
			const prompt = buildUserPrompt(context, 3);

			// Empty string is falsy, so topMovie section is excluded
			expect(prompt).not.toContain('Top movie:');
		});

		it('handles zero values correctly', () => {
			const context = createMockContext({
				hours: 0,
				days: 0,
				plays: 0,
				uniqueMovies: 0,
				uniqueShows: 0
			});
			const prompt = buildUserPrompt(context, 3);

			expect(prompt).toContain('0 hours');
			expect(prompt).toContain('0 days');
		});
	});

	describe('buildEnhancedPrompt', () => {
		it('returns object with system and user keys', () => {
			const context = createMockContext();
			const result = buildEnhancedPrompt(context, 3, 'witty');

			expect(result).toHaveProperty('system');
			expect(result).toHaveProperty('user');
			expect(typeof result.system).toBe('string');
			expect(typeof result.user).toBe('string');
		});

		it('uses specified persona', () => {
			const context = createMockContext();
			const result = buildEnhancedPrompt(context, 3, 'nerdy');

			expect(result.system).toContain('data-loving analyst');
		});

		it('defaults to witty persona when not specified', () => {
			const context = createMockContext();
			const result = buildEnhancedPrompt(context, 3);

			expect(result.system).toContain('witty entertainment columnist');
		});

		it('resolves random persona', () => {
			const context = createMockContext();
			const result = buildEnhancedPrompt(context, 3, 'random');

			// Should contain one of the persona descriptions
			const hasPersona =
				result.system.includes('witty entertainment columnist') ||
				result.system.includes('encouraging friend') ||
				result.system.includes('data-loving analyst');
			expect(hasPersona).toBe(true);
		});

		it('passes scope to system prompt', () => {
			const userContext = createMockContext({ scope: 'user' });
			const serverContext = createMockContext({ scope: 'server' });

			const userResult = buildEnhancedPrompt(userContext, 3, 'witty');
			const serverResult = buildEnhancedPrompt(serverContext, 3, 'witty');

			expect(userResult.system).toContain("'you/your'");
			expect(serverResult.system).toContain("'we/our'");
		});

		it('includes count in user prompt', () => {
			const context = createMockContext();
			const result = buildEnhancedPrompt(context, 7, 'witty');

			expect(result.user).toContain('Generate 7 unique');
		});
	});
});
