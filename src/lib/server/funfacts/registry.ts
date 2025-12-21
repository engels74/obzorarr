import type { FactTemplate, FactCategory } from './types';
import { FactTemplateSchema } from './types';

/**
 * Template Registry
 *
 * Centralized registry for fun fact templates with:
 * - Auto-discovery through registration
 * - Weighted random selection
 * - Category-based filtering
 * - Seasonal boosting support
 *
 * @module server/funfacts/registry
 */

// =============================================================================
// Types
// =============================================================================

export interface RegisterOptions {
	/** Weight for random selection (1.0 = normal, 2.0 = twice as likely) */
	weight?: number;
	/** Override existing template with same ID */
	allowOverride?: boolean;
}

interface TemplateEntry {
	template: FactTemplate;
	weight: number;
}

interface TemplateRegistry {
	templates: Map<string, TemplateEntry>;
	byCategory: Map<FactCategory, TemplateEntry[]>;
	initialized: boolean;
}

// =============================================================================
// Registry State
// =============================================================================

const registry: TemplateRegistry = {
	templates: new Map(),
	byCategory: new Map(),
	initialized: false
};

// =============================================================================
// Registration Functions
// =============================================================================

/**
 * Register a single template with the registry
 * @param template - The template to register
 * @param options - Registration options (weight, allowOverride)
 * @throws Error if template with same ID exists and allowOverride is false
 */
export function registerTemplate(template: FactTemplate, options: RegisterOptions = {}): void {
	// Validate template structure with Zod
	const parsed = FactTemplateSchema.parse(template);
	const { weight = 1.0, allowOverride = false } = options;

	if (registry.templates.has(parsed.id) && !allowOverride) {
		throw new Error(`Template with ID "${parsed.id}" already registered`);
	}

	const entry: TemplateEntry = { template: parsed, weight };

	// Update main registry
	registry.templates.set(parsed.id, entry);

	// Update category index
	const category = parsed.category as FactCategory;
	const categoryEntries = registry.byCategory.get(category) ?? [];

	// Remove existing entry with same ID if overriding
	const existingIndex = categoryEntries.findIndex((e) => e.template.id === parsed.id);
	if (existingIndex >= 0) {
		categoryEntries.splice(existingIndex, 1);
	}

	categoryEntries.push(entry);
	registry.byCategory.set(category, categoryEntries);
}

/**
 * Register multiple templates at once
 * @param templates - Array of templates to register
 * @param options - Registration options applied to all templates
 */
export function registerTemplates(templates: FactTemplate[], options?: RegisterOptions): void {
	for (const template of templates) {
		registerTemplate(template, options);
	}
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get all registered templates
 */
export function getAllTemplates(): FactTemplate[] {
	return Array.from(registry.templates.values()).map((e) => e.template);
}

/**
 * Get templates by category
 * @param category - The category to filter by
 */
export function getTemplatesByCategory(category: FactCategory): FactTemplate[] {
	const entries = registry.byCategory.get(category) ?? [];
	return entries.map((e) => e.template);
}

/**
 * Get a template by its ID
 * @param id - The template ID
 */
export function getTemplateById(id: string): FactTemplate | undefined {
	return registry.templates.get(id)?.template;
}

/**
 * Get the weight for a template
 * @param id - The template ID
 */
export function getTemplateWeight(id: string): number {
	return registry.templates.get(id)?.weight ?? 1.0;
}

/**
 * Get all registered categories
 */
export function getRegisteredCategories(): FactCategory[] {
	return Array.from(registry.byCategory.keys());
}

/**
 * Get template count by category
 */
export function getTemplateCounts(): Record<FactCategory, number> {
	const counts: Partial<Record<FactCategory, number>> = {};
	for (const [category, entries] of registry.byCategory) {
		counts[category] = entries.length;
	}
	return counts as Record<FactCategory, number>;
}

// =============================================================================
// Weighted Selection
// =============================================================================

/**
 * Calculate seasonal boost for a template
 * Templates can define seasonal relevance for specific months
 */
function getSeasonalBoost(template: FactTemplate): number {
	// Check for seasonal property (will be added to extended template type)
	const seasonal = (template as FactTemplate & { seasonal?: { months: number[]; boost: number } })
		.seasonal;
	if (!seasonal) return 1.0;

	const currentMonth = new Date().getMonth();
	return seasonal.months.includes(currentMonth) ? seasonal.boost : 1.0;
}

/**
 * Calculate priority multiplier for a template
 * Priority ranges from 0-100, with 50 being normal (1.0x)
 */
function getPriorityMultiplier(template: FactTemplate): number {
	const priority = (template as FactTemplate & { priority?: number }).priority;
	if (priority === undefined) return 1.0;
	return priority / 50; // 0 = 0x, 50 = 1x, 100 = 2x
}

/**
 * Select random templates with weighted probability
 * Uses Fisher-Yates-based weighted selection
 *
 * @param templates - Templates to select from
 * @param count - Number of templates to select
 * @param excludeIds - Template IDs to exclude from selection
 */
export function selectWeightedTemplates(
	templates: FactTemplate[],
	count: number,
	excludeIds: string[] = []
): FactTemplate[] {
	// Filter out excluded templates
	const available = templates.filter((t) => !excludeIds.includes(t.id));

	if (available.length === 0) return [];
	if (available.length <= count) return available;

	// Build weighted pool
	const weightedPool: { template: FactTemplate; effectiveWeight: number }[] = available.map(
		(template) => {
			const baseWeight = getTemplateWeight(template.id);
			const priorityMultiplier = getPriorityMultiplier(template);
			const seasonalBoost = getSeasonalBoost(template);

			return {
				template,
				effectiveWeight: baseWeight * priorityMultiplier * seasonalBoost
			};
		}
	);

	// Weighted random selection without replacement
	const selected: FactTemplate[] = [];
	const remaining = [...weightedPool];

	for (let i = 0; i < count && remaining.length > 0; i++) {
		const totalWeight = remaining.reduce((sum, item) => sum + item.effectiveWeight, 0);
		let random = Math.random() * totalWeight;

		for (let j = 0; j < remaining.length; j++) {
			const item = remaining[j];
			if (!item) continue;
			random -= item.effectiveWeight;
			if (random <= 0) {
				selected.push(item.template);
				remaining.splice(j, 1);
				break;
			}
		}
	}

	return selected;
}

// =============================================================================
// Registry Management
// =============================================================================

/**
 * Clear the registry (useful for testing)
 */
export function clearRegistry(): void {
	registry.templates.clear();
	registry.byCategory.clear();
	registry.initialized = false;
}

/**
 * Check if registry has been initialized
 */
export function isRegistryInitialized(): boolean {
	return registry.initialized;
}

/**
 * Mark registry as initialized
 */
export function markRegistryInitialized(): void {
	registry.initialized = true;
}
