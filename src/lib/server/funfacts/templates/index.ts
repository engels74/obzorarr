import type { FactTemplate, FactCategory } from '../types';
import {
	registerTemplates,
	getAllTemplates,
	getTemplatesByCategory,
	isRegistryInitialized,
	markRegistryInitialized,
	clearRegistry
} from '../registry';

// Import all template categories
import { TIME_EQUIVALENCY_TEMPLATES } from './time-equivalency';
import { CONTENT_COMPARISON_TEMPLATES } from './content-comparison';
import { BEHAVIORAL_TEMPLATES } from './behavioral-insight';
import { BINGE_TEMPLATES } from './binge-related';
import { TEMPORAL_TEMPLATES } from './temporal-pattern';
// New categories
import { ACHIEVEMENT_TEMPLATES } from './achievement';
import { SOCIAL_COMPARISON_TEMPLATES } from './social-comparison';
import { ENTERTAINMENT_TRIVIA_TEMPLATES } from './entertainment-trivia';

/**
 * Templates Module
 *
 * Aggregates all template categories and registers them with the registry.
 * Provides backward-compatible exports and initialization.
 *
 * @module server/funfacts/templates
 */

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize all templates in the registry
 * Called automatically on first import, but can be called manually for testing
 */
export function initializeTemplates(): void {
	if (isRegistryInitialized()) return;

	// Register original categories
	registerTemplates(TIME_EQUIVALENCY_TEMPLATES);
	registerTemplates(CONTENT_COMPARISON_TEMPLATES);
	registerTemplates(BEHAVIORAL_TEMPLATES);
	registerTemplates(BINGE_TEMPLATES);
	registerTemplates(TEMPORAL_TEMPLATES);

	// Register new categories
	registerTemplates(ACHIEVEMENT_TEMPLATES);
	registerTemplates(SOCIAL_COMPARISON_TEMPLATES);
	registerTemplates(ENTERTAINMENT_TRIVIA_TEMPLATES);

	markRegistryInitialized();
}

/**
 * Reset templates (for testing)
 */
export function resetTemplates(): void {
	clearRegistry();
	initializeTemplates();
}

// Auto-initialize on module load
initializeTemplates();

// =============================================================================
// Backward Compatibility Exports
// =============================================================================

// Re-export individual template arrays for backward compatibility
export { TIME_EQUIVALENCY_TEMPLATES } from './time-equivalency';
export { CONTENT_COMPARISON_TEMPLATES } from './content-comparison';
export { BEHAVIORAL_TEMPLATES } from './behavioral-insight';
export { BINGE_TEMPLATES } from './binge-related';
export { TEMPORAL_TEMPLATES } from './temporal-pattern';

// New categories
export { ACHIEVEMENT_TEMPLATES } from './achievement';
export { SOCIAL_COMPARISON_TEMPLATES } from './social-comparison';
export { ENTERTAINMENT_TRIVIA_TEMPLATES } from './entertainment-trivia';

/**
 * All predefined fun fact templates (backward compatible)
 * Returns templates from registry
 */
export function getALL_TEMPLATES(): FactTemplate[] {
	initializeTemplates();
	return getAllTemplates();
}

// For backward compatibility, export as a getter that returns current templates
// This allows the array to be dynamic while maintaining the same API
export const ALL_TEMPLATES: FactTemplate[] = [
	...TIME_EQUIVALENCY_TEMPLATES,
	...CONTENT_COMPARISON_TEMPLATES,
	...BEHAVIORAL_TEMPLATES,
	...BINGE_TEMPLATES,
	...TEMPORAL_TEMPLATES,
	...ACHIEVEMENT_TEMPLATES,
	...SOCIAL_COMPARISON_TEMPLATES,
	...ENTERTAINMENT_TRIVIA_TEMPLATES
];

/**
 * Templates grouped by category for easy access
 */
export const TEMPLATES_BY_CATEGORY: Record<FactCategory, FactTemplate[]> = {
	'time-equivalency': TIME_EQUIVALENCY_TEMPLATES,
	'content-comparison': CONTENT_COMPARISON_TEMPLATES,
	'behavioral-insight': BEHAVIORAL_TEMPLATES,
	'binge-related': BINGE_TEMPLATES,
	'temporal-pattern': TEMPORAL_TEMPLATES,
	achievement: ACHIEVEMENT_TEMPLATES,
	'social-comparison': SOCIAL_COMPARISON_TEMPLATES,
	'entertainment-trivia': ENTERTAINMENT_TRIVIA_TEMPLATES
};

/**
 * Get templates by category using registry
 */
export function getTemplatesForCategory(category: FactCategory): FactTemplate[] {
	initializeTemplates();
	return getTemplatesByCategory(category);
}
