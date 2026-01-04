/**
 * AI Module
 *
 * Exports for AI-based fun fact generation.
 *
 * @module server/funfacts/ai
 */

export { enrichContext, ensureEnrichedContext, isContextEnriched } from './context-enricher';
export {
	AI_PERSONAS,
	buildEnhancedPrompt,
	buildSystemPrompt,
	buildUserPrompt,
	getRandomPersona,
	resolvePersona
} from './prompts';
