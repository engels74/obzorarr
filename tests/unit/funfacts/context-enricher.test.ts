import { describe, expect, it } from 'bun:test';
import {
	enrichContext,
	ensureEnrichedContext,
	isContextEnriched
} from '$lib/server/funfacts/ai/context-enricher';
import type { FactGenerationContext } from '$lib/server/funfacts/types';

function createBaseContext(overrides: Partial<FactGenerationContext> = {}): FactGenerationContext {
	return {
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
		firstWatchTitle: 'First Movie',
		lastWatchTitle: 'Last Movie',
		uniqueMovies: 10,
		uniqueShows: 5,
		scope: 'user',
		...overrides
	};
}

describe('Context Enricher', () => {
	describe('enrichContext', () => {
		it('adds entertainment trivia calculations to context', () => {
			const baseContext = createBaseContext({ hours: 140 });
			const enriched = enrichContext(baseContext);

			expect(enriched.gotCount).toBeDefined();
			expect(enriched.gotCount).toBe(2);
			expect(enriched.friendsCount).toBeDefined();
			expect(enriched.theOfficeCount).toBeDefined();
			expect(enriched.strangerThingsCount).toBeDefined();
			expect(enriched.starWarsCount).toBeDefined();
			expect(enriched.breakingBadCount).toBeDefined();
			expect(enriched.theWireCount).toBeDefined();
			expect(enriched.sopranosCount).toBeDefined();
		});

		it('preserves original context properties', () => {
			const baseContext = createBaseContext();
			const enriched = enrichContext(baseContext);

			expect(enriched.hours).toBe(baseContext.hours);
			expect(enriched.topMovie).toBe(baseContext.topMovie);
			expect(enriched.scope).toBe(baseContext.scope);
		});

		it('rounds values to 1 decimal place', () => {
			const baseContext = createBaseContext({ hours: 100 });
			const enriched = enrichContext(baseContext);

			// 100 / 70 (GoT hours) = 1.428... should be 1.4
			expect(enriched.gotCount).toBe(1.4);
		});
	});

	describe('isContextEnriched', () => {
		it('returns false for base context without gotCount', () => {
			const baseContext = createBaseContext();
			expect(isContextEnriched(baseContext)).toBe(false);
		});

		it('returns true for enriched context with gotCount', () => {
			const baseContext = createBaseContext();
			const enriched = enrichContext(baseContext);
			expect(isContextEnriched(enriched)).toBe(true);
		});

		it('returns true when gotCount is explicitly set to 0', () => {
			const context = { ...createBaseContext(), gotCount: 0 };
			expect(isContextEnriched(context)).toBe(true);
		});
	});

	describe('ensureEnrichedContext', () => {
		it('enriches context if not already enriched', () => {
			const baseContext = createBaseContext();
			const result = ensureEnrichedContext(baseContext);

			expect(result.gotCount).toBeDefined();
			expect(isContextEnriched(result)).toBe(true);
		});

		it('returns same context if already enriched (idempotent)', () => {
			const baseContext = createBaseContext();
			const enriched = enrichContext(baseContext);
			const result = ensureEnrichedContext(enriched);

			expect(result).toBe(enriched);
		});

		it('does not modify original context', () => {
			const baseContext = createBaseContext();
			ensureEnrichedContext(baseContext);

			expect(baseContext.gotCount).toBeUndefined();
		});
	});
});
