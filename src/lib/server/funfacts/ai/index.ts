/**
 * AI Module
 *
 * Exports for AI-based fun fact generation.
 *
 * @module server/funfacts/ai
 */

export {
	AI_PERSONAS,
	getRandomPersona,
	resolvePersona,
	buildSystemPrompt,
	buildUserPrompt,
	buildEnhancedPrompt
} from './prompts';

export { enrichContext, isContextEnriched, ensureEnrichedContext } from './context-enricher';
