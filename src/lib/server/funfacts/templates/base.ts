import type { FactTemplate, FactCategory } from '../types';

/**
 * Template Base Utilities
 *
 * Helper functions for defining templates with type safety and defaults.
 *
 * @module server/funfacts/templates/base
 */

/**
 * Extended template definition with optional metadata
 */
export interface ExtendedTemplateDefinition extends Omit<FactTemplate, 'category'> {
	/** Optional tags for filtering/grouping */
	tags?: string[];
	/** Priority for selection (0-100, default 50) */
	priority?: number;
	/** Seasonal relevance configuration */
	seasonal?: {
		/** Months when this template is boosted (0-11) */
		months: number[];
		/** Boost multiplier (default 1.5) */
		boost?: number;
	};
}

/**
 * Helper to create a template with type safety and defaults
 * @param category - The template category
 * @param definition - The template definition
 * @returns A complete FactTemplate with defaults applied
 */
export function defineTemplate(
	category: FactCategory,
	definition: ExtendedTemplateDefinition
): FactTemplate & ExtendedTemplateDefinition {
	return {
		...definition,
		category,
		requiredStats: definition.requiredStats ?? [],
		minThresholds: definition.minThresholds ?? {}
	};
}

/**
 * Helper to create multiple templates in a category
 * @param category - The template category
 * @param definitions - Array of template definitions
 * @returns Array of FactTemplates with defaults applied
 */
export function defineTemplateCategory(
	category: FactCategory,
	definitions: ExtendedTemplateDefinition[]
): FactTemplate[] {
	return definitions.map((def) => defineTemplate(category, def));
}
