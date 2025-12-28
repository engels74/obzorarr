import type { FactGenerationContext, AIPersona } from '../types';
import { MONTH_NAMES, formatHour } from '../constants';

export const AI_PERSONAS: Record<Exclude<AIPersona, 'random'>, string> = {
	witty: 'a witty entertainment columnist who loves clever pop culture references and wordplay',
	wholesome: 'an encouraging friend who celebrates viewing achievements with warmth and positivity',
	nerdy:
		'a data-loving analyst who finds fascinating patterns and loves precise statistics and comparisons'
};

export function getRandomPersona(): Exclude<AIPersona, 'random'> {
	const personas: Exclude<AIPersona, 'random'>[] = ['witty', 'wholesome', 'nerdy'];
	const index = Math.floor(Math.random() * personas.length);
	return personas[index] ?? 'witty';
}

export function resolvePersona(persona: AIPersona): Exclude<AIPersona, 'random'> {
	return persona === 'random' ? getRandomPersona() : persona;
}

export function buildSystemPrompt(
	persona: Exclude<AIPersona, 'random'>,
	scope: 'user' | 'server' = 'user'
): string {
	const personaDescription = AI_PERSONAS[persona];

	const audienceText =
		scope === 'user'
			? "an individual's personal viewing habits (use 'you/your' pronouns - second person)"
			: "a server community's collective viewing habits (use 'we/our' pronouns - first person plural)";

	return `You are ${personaDescription}.

Your task is to generate fun, engaging facts about ${audienceText} for their year-in-review.

Guidelines:
1. Make each fact unique and memorable
2. Use creative comparisons (pop culture, everyday activities, achievements)
3. Include an appropriate emoji icon for each fact
4. Keep the tone positive and celebratory
5. Vary your style - mix witty observations with impressive stats
6. Each fact should have a main statement and an optional comparison/follow-up
7. IMPORTANT: Use the correct pronouns based on scope:
   - For personal wrapped: Use "you", "your", "you've" (second person)
   - For server wrapped: Use "we", "our", "we've" (first person plural)

IMPORTANT: Respond ONLY with valid JSON in exactly this format:
{
  "facts": [
    { "fact": "Main statement about viewing", "comparison": "Creative follow-up or comparison", "icon": "emoji" }
  ]
}`;
}

export function buildUserPrompt(context: FactGenerationContext, count: number): string {
	const parts: string[] = [];

	parts.push(`Generate ${count} unique, creative fun facts based on these viewing statistics:\n`);

	// Basic stats
	parts.push('## Viewing Summary');
	parts.push(`- Total watch time: ${context.hours} hours (${context.days} days)`);
	parts.push(`- Total plays: ${context.plays}`);
	parts.push(`- Unique movies watched: ${context.uniqueMovies}`);
	parts.push(`- Unique shows watched: ${context.uniqueShows}`);
	parts.push('');

	// Top content
	parts.push('## Favorites');
	if (context.topMovie) {
		parts.push(`- Top movie: "${context.topMovie}" (watched ${context.topMovieCount} times)`);
	}
	if (context.topShow) {
		parts.push(`- Top show: "${context.topShow}" (${context.topShowCount} episodes)`);
	}
	parts.push('');

	// Viewing patterns
	parts.push('## Viewing Patterns');
	parts.push(`- Peak viewing time: ${formatHour(context.peakHour)}`);
	parts.push(`- Peak viewing month: ${MONTH_NAMES[context.peakMonth]}`);
	if (context.bingeHours) {
		parts.push(`- Longest binge session: ${context.bingeHours} hours straight`);
	}
	if (context.bingePlays) {
		parts.push(`- Items in longest binge: ${context.bingePlays}`);
	}
	parts.push('');

	// Rankings
	parts.push('## Rankings');
	const topPercent = Math.round(100 - context.percentile);
	if (topPercent <= 50) {
		parts.push(`- Percentile rank: Top ${topPercent}% of viewers`);
	} else {
		parts.push(`- Percentile rank: Watched more than ${Math.round(context.percentile)}% of users`);
	}
	parts.push('');

	// Temporal bookends
	if (context.firstWatchTitle || context.lastWatchTitle) {
		parts.push('## Year Bookends');
		if (context.firstWatchTitle) {
			parts.push(`- First watch of the year: "${context.firstWatchTitle}"`);
		}
		if (context.lastWatchTitle) {
			parts.push(`- Last watch of the year: "${context.lastWatchTitle}"`);
		}
		parts.push('');
	}

	// Entertainment comparisons (if enriched)
	if (context.gotCount || context.friendsCount || context.starWarsCount) {
		parts.push('## For Reference (use creatively):');
		if (context.gotCount && context.gotCount >= 1) {
			parts.push(`- Could watch all of Game of Thrones ${context.gotCount.toFixed(1)} times`);
		}
		if (context.friendsCount && context.friendsCount >= 1) {
			parts.push(`- Could watch all of Friends ${context.friendsCount.toFixed(1)} times`);
		}
		if (context.starWarsCount && context.starWarsCount >= 1) {
			parts.push(
				`- Could watch the Star Wars original trilogy ${context.starWarsCount.toFixed(1)} times`
			);
		}
		parts.push('');
	}

	parts.push('Remember: Be creative, positive, and engaging!');

	return parts.join('\n');
}

export function buildEnhancedPrompt(
	context: FactGenerationContext,
	count: number,
	persona: AIPersona = 'witty'
): { system: string; user: string } {
	const resolvedPersona = resolvePersona(persona);

	return {
		system: buildSystemPrompt(resolvedPersona, context.scope),
		user: buildUserPrompt(context, count)
	};
}
