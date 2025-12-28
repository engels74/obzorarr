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

export {
	FunFactSchema,
	FactCategorySchema,
	FactTemplateSchema,
	GenerateFunFactsOptionsSchema,
	FunFactsConfigSchema,
	AIPersonaSchema,
	SeasonalConfigSchema
} from './types';

export { FunFactsError, AIGenerationError, InsufficientStatsError } from './types';

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

export {
	ALL_TEMPLATES,
	TEMPLATES_BY_CATEGORY,
	TIME_EQUIVALENCY_TEMPLATES,
	CONTENT_COMPARISON_TEMPLATES,
	BEHAVIORAL_TEMPLATES,
	BINGE_TEMPLATES,
	TEMPORAL_TEMPLATES,
	ACHIEVEMENT_TEMPLATES,
	SOCIAL_COMPARISON_TEMPLATES,
	ENTERTAINMENT_TRIVIA_TEMPLATES,
	initializeTemplates,
	resetTemplates
} from './templates';

export { EQUIVALENCY_FACTORS, ENTERTAINMENT_FACTORS, MONTH_NAMES, formatHour } from './constants';

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
