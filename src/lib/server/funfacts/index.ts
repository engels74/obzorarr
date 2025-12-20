/**
 * Fun Facts Service Module
 *
 * Generates contextual fun facts for wrapped pages using either:
 * - AI generation via OpenAI-compatible API (when configured)
 * - Predefined templates with interpolation (fallback)
 *
 * Implements Requirements:
 * - 10.1: AI generation when enabled
 * - 10.2: Template fallback when AI unavailable
 * - 10.3: Time equivalency comparisons
 * - 10.4: Randomized selection
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
	FunFactsConfig
} from './types';

// =============================================================================
// Schema Exports
// =============================================================================

export {
	FunFactSchema,
	FactCategorySchema,
	FactTemplateSchema,
	GenerateFunFactsOptionsSchema,
	FunFactsConfigSchema
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
// Template Exports (for testing/customization)
// =============================================================================

export {
	ALL_TEMPLATES,
	TIME_EQUIVALENCY_TEMPLATES,
	CONTENT_COMPARISON_TEMPLATES,
	BEHAVIORAL_TEMPLATES,
	BINGE_TEMPLATES,
	TEMPORAL_TEMPLATES,
	TEMPLATES_BY_CATEGORY,
	EQUIVALENCY_FACTORS,
	MONTH_NAMES
} from './templates';
