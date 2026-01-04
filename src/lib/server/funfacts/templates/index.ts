import {
	clearRegistry,
	getAllTemplates,
	getTemplatesByCategory,
	isRegistryInitialized,
	markRegistryInitialized,
	registerTemplates
} from '../registry';
import type { FactCategory, FactTemplate } from '../types';
import { ACHIEVEMENT_TEMPLATES } from './achievement';
import { BEHAVIORAL_TEMPLATES } from './behavioral-insight';
import { BINGE_TEMPLATES } from './binge-related';
import { CONTENT_COMPARISON_TEMPLATES } from './content-comparison';
import { ENTERTAINMENT_TRIVIA_TEMPLATES } from './entertainment-trivia';
import { SOCIAL_COMPARISON_TEMPLATES } from './social-comparison';
import { TEMPORAL_TEMPLATES } from './temporal-pattern';
import { TIME_EQUIVALENCY_TEMPLATES } from './time-equivalency';

export function initializeTemplates(): void {
	if (isRegistryInitialized()) return;

	registerTemplates(TIME_EQUIVALENCY_TEMPLATES);
	registerTemplates(CONTENT_COMPARISON_TEMPLATES);
	registerTemplates(BEHAVIORAL_TEMPLATES);
	registerTemplates(BINGE_TEMPLATES);
	registerTemplates(TEMPORAL_TEMPLATES);
	registerTemplates(ACHIEVEMENT_TEMPLATES);
	registerTemplates(SOCIAL_COMPARISON_TEMPLATES);
	registerTemplates(ENTERTAINMENT_TRIVIA_TEMPLATES);

	markRegistryInitialized();
}

export function resetTemplates(): void {
	clearRegistry();
	initializeTemplates();
}

initializeTemplates();

export { ACHIEVEMENT_TEMPLATES } from './achievement';
export { BEHAVIORAL_TEMPLATES } from './behavioral-insight';
export { BINGE_TEMPLATES } from './binge-related';
export { CONTENT_COMPARISON_TEMPLATES } from './content-comparison';
export { ENTERTAINMENT_TRIVIA_TEMPLATES } from './entertainment-trivia';
export { SOCIAL_COMPARISON_TEMPLATES } from './social-comparison';
export { TEMPORAL_TEMPLATES } from './temporal-pattern';
export { TIME_EQUIVALENCY_TEMPLATES } from './time-equivalency';

export function getALL_TEMPLATES(): FactTemplate[] {
	initializeTemplates();
	return getAllTemplates();
}

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

export function getTemplatesForCategory(category: FactCategory): FactTemplate[] {
	initializeTemplates();
	return getTemplatesByCategory(category);
}
