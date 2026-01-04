import type { FactCategory, FactTemplate } from './types';
import { FactTemplateSchema } from './types';

export interface RegisterOptions {
	weight?: number;
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

const registry: TemplateRegistry = {
	templates: new Map(),
	byCategory: new Map(),
	initialized: false
};

export function registerTemplate(template: FactTemplate, options: RegisterOptions = {}): void {
	const parsed = FactTemplateSchema.parse(template);
	const { weight = 1.0, allowOverride = false } = options;

	if (registry.templates.has(parsed.id) && !allowOverride) {
		throw new Error(`Template with ID "${parsed.id}" already registered`);
	}

	const entry: TemplateEntry = { template: parsed, weight };

	registry.templates.set(parsed.id, entry);

	const category = parsed.category as FactCategory;
	const categoryEntries = registry.byCategory.get(category) ?? [];

	const existingIndex = categoryEntries.findIndex((e) => e.template.id === parsed.id);
	if (existingIndex >= 0) {
		categoryEntries.splice(existingIndex, 1);
	}

	categoryEntries.push(entry);
	registry.byCategory.set(category, categoryEntries);
}

export function registerTemplates(templates: FactTemplate[], options?: RegisterOptions): void {
	for (const template of templates) {
		registerTemplate(template, options);
	}
}

export function getAllTemplates(): FactTemplate[] {
	return Array.from(registry.templates.values()).map((e) => e.template);
}

export function getTemplatesByCategory(category: FactCategory): FactTemplate[] {
	const entries = registry.byCategory.get(category) ?? [];
	return entries.map((e) => e.template);
}

export function getTemplateById(id: string): FactTemplate | undefined {
	return registry.templates.get(id)?.template;
}

export function getTemplateWeight(id: string): number {
	return registry.templates.get(id)?.weight ?? 1.0;
}

export function getRegisteredCategories(): FactCategory[] {
	return Array.from(registry.byCategory.keys());
}

export function getTemplateCounts(): Record<FactCategory, number> {
	const counts: Partial<Record<FactCategory, number>> = {};
	for (const [category, entries] of registry.byCategory) {
		counts[category] = entries.length;
	}
	return counts as Record<FactCategory, number>;
}

function getSeasonalBoost(template: FactTemplate): number {
	const seasonal = (template as FactTemplate & { seasonal?: { months: number[]; boost: number } })
		.seasonal;
	if (!seasonal) return 1.0;

	const currentMonth = new Date().getMonth();
	return seasonal.months.includes(currentMonth) ? seasonal.boost : 1.0;
}

function getPriorityMultiplier(template: FactTemplate): number {
	const priority = (template as FactTemplate & { priority?: number }).priority;
	if (priority === undefined) return 1.0;
	return priority / 50;
}

export function selectWeightedTemplates(
	templates: FactTemplate[],
	count: number,
	excludeIds: string[] = []
): FactTemplate[] {
	const available = templates.filter((t) => !excludeIds.includes(t.id));

	if (available.length === 0) return [];
	if (available.length <= count) return available;

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

export function clearRegistry(): void {
	registry.templates.clear();
	registry.byCategory.clear();
	registry.initialized = false;
}

export function isRegistryInitialized(): boolean {
	return registry.initialized;
}

export function markRegistryInitialized(): void {
	registry.initialized = true;
}
