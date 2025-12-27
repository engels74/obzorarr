/**
 * Fun Facts Service Module
 *
 * Generates contextual fun facts for wrapped pages using either:
 * - AI generation via OpenAI-compatible API (when configured)
 * - Predefined templates with interpolation (fallback)
 *
 * @example
 * ```typescript
 * import { generateFunFacts, isAIAvailable } from '$lib/server/funfacts';
 *
 * // Check if AI is available
 * const aiEnabled = await isAIAvailable();
 *
 * // Generate fun facts for user stats
 * const facts = await generateFunFacts(userStats, { count: 3 });
 *
 * // Generate with specific options
 * const facts = await generateFunFacts(stats, {
 *   count: 5,
 *   categories: ['time-equivalency', 'behavioral-insight'],
 *   preferAI: false
 * });
 * ```
 *
 * @module server/funfacts
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
	FunFact,
	FactCategory,
	FactTemplate,
	FactGenerationContext,
	GenerateFunFactsOptions,
	FunFactsConfig,
	AIPersona,
	SeasonalConfig
} from './types';

// =============================================================================
// Schema Exports
// =============================================================================

export {
	FunFactSchema,
	FactCategorySchema,
	FactTemplateSchema,
	GenerateFunFactsOptionsSchema,
	FunFactsConfigSchema,
	AIPersonaSchema,
	SeasonalConfigSchema
} from './types';

// =============================================================================
// Error Class Exports
// =============================================================================

export { FunFactsError, AIGenerationError, InsufficientStatsError } from './types';

// =============================================================================
// Service Function Exports
// =============================================================================

export {
	// Main entry points
	generateFunFacts,
	generateFromTemplates,

	// Configuration
	getFunFactsConfig,
	isAIAvailable,

	// Context building (for testing/advanced usage)
	buildGenerationContext,

	// Template utilities (for testing/customization)
	isTemplateApplicable,
	interpolateTemplate,
	generateFromTemplate,
	selectRandomTemplates,

	// AI generation (for direct AI usage)
	generateWithAI
} from './service';

// =============================================================================
// Registry Exports (new modular system)
// =============================================================================

export {
	registerTemplate,
	registerTemplates,
	getAllTemplates,
	getTemplatesByCategory,
	getTemplateById,
	getTemplateWeight,
	selectWeightedTemplates,
	clearRegistry,
	isRegistryInitialized
} from './registry';

// =============================================================================
// Template Exports (for testing/customization)
// =============================================================================

export {
	// All templates combined
	ALL_TEMPLATES,
	TEMPLATES_BY_CATEGORY,

	// Original categories
	TIME_EQUIVALENCY_TEMPLATES,
	CONTENT_COMPARISON_TEMPLATES,
	BEHAVIORAL_TEMPLATES,
	BINGE_TEMPLATES,
	TEMPORAL_TEMPLATES,

	// New categories
	ACHIEVEMENT_TEMPLATES,
	SOCIAL_COMPARISON_TEMPLATES,
	ENTERTAINMENT_TRIVIA_TEMPLATES,

	// Initialization
	initializeTemplates,
	resetTemplates
} from './templates';

// =============================================================================
// Constants Exports
// =============================================================================

export { EQUIVALENCY_FACTORS, ENTERTAINMENT_FACTORS, MONTH_NAMES, formatHour } from './constants';

// =============================================================================
// AI Module Exports
// =============================================================================

export {
	AI_PERSONAS,
	getRandomPersona,
	resolvePersona,
	buildEnhancedPrompt,
	buildSystemPrompt,
	buildUserPrompt,
	enrichContext,
	isContextEnriched,
	ensureEnrichedContext
} from './ai';
