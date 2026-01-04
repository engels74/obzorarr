import { ENTERTAINMENT_FACTORS } from '../constants';
import type { FactGenerationContext } from '../types';

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

export function enrichContext(baseContext: FactGenerationContext): FactGenerationContext {
	const { hours } = baseContext;

	return {
		...baseContext,
		// Entertainment trivia calculations
		gotCount: round1(hours / ENTERTAINMENT_FACTORS.GAME_OF_THRONES_HOURS),
		friendsCount: round1(hours / ENTERTAINMENT_FACTORS.FRIENDS_HOURS),
		theOfficeCount: round1(hours / ENTERTAINMENT_FACTORS.THE_OFFICE_HOURS),
		strangerThingsCount: round1(hours / ENTERTAINMENT_FACTORS.STRANGER_THINGS_HOURS),
		starWarsCount: round1(hours / ENTERTAINMENT_FACTORS.STAR_WARS_ORIGINAL_TRILOGY_HOURS),
		breakingBadCount: round1(hours / ENTERTAINMENT_FACTORS.BREAKING_BAD_HOURS),
		theWireCount: round1(hours / ENTERTAINMENT_FACTORS.THE_WIRE_HOURS),
		sopranosCount: round1(hours / ENTERTAINMENT_FACTORS.THE_SOPRANOS_HOURS)
	};
}

export function isContextEnriched(context: FactGenerationContext): boolean {
	return context.gotCount !== undefined;
}

export function ensureEnrichedContext(context: FactGenerationContext): FactGenerationContext {
	if (isContextEnriched(context)) {
		return context;
	}
	return enrichContext(context);
}
