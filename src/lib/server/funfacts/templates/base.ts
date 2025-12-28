import type { FactTemplate, FactCategory } from '../types';

export interface ExtendedTemplateDefinition extends Omit<FactTemplate, 'category'> {
	tags?: string[];
	priority?: number;
	seasonal?: {
		months: number[];
		boost?: number;
	};
}

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

export function defineTemplateCategory(
	category: FactCategory,
	definitions: ExtendedTemplateDefinition[]
): FactTemplate[] {
	return definitions.map((def) => defineTemplate(category, def));
}
