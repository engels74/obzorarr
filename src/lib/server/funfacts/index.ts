export {
	AI_PERSONAS,
	buildEnhancedPrompt,
	buildSystemPrompt,
	buildUserPrompt,
	enrichContext,
	ensureEnrichedContext,
	getRandomPersona,
	isContextEnriched,
	resolvePersona
} from './ai';
export { ENTERTAINMENT_FACTORS, EQUIVALENCY_FACTORS, formatHour, MONTH_NAMES } from './constants';
export {
	clearRegistry,
	getAllTemplates,
	getTemplateById,
	getTemplatesByCategory,
	getTemplateWeight,
	isRegistryInitialized,
	registerTemplate,
	registerTemplates,
	selectWeightedTemplates
} from './registry';

export {
	buildGenerationContext,
	generateFromTemplate,
	generateFromTemplates,
	generateFunFacts,
	generateWithAI,
	getFunFactsConfig,
	interpolateTemplate,
	isAIAvailable,
	isTemplateApplicable,
	selectRandomTemplates
} from './service';
export {
	ACHIEVEMENT_TEMPLATES,
	ALL_TEMPLATES,
	BEHAVIORAL_TEMPLATES,
	BINGE_TEMPLATES,
	CONTENT_COMPARISON_TEMPLATES,
	ENTERTAINMENT_TRIVIA_TEMPLATES,
	initializeTemplates,
	resetTemplates,
	SOCIAL_COMPARISON_TEMPLATES,
	TEMPLATES_BY_CATEGORY,
	TEMPORAL_TEMPLATES,
	TIME_EQUIVALENCY_TEMPLATES
} from './templates';
export type {
	AIPersona,
	FactCategory,
	FactGenerationContext,
	FactTemplate,
	FunFact,
	FunFactsConfig,
	GenerateFunFactsOptions,
	SeasonalConfig
} from './types';
export {
	AIGenerationError,
	AIPersonaSchema,
	FactCategorySchema,
	FactTemplateSchema,
	FunFactSchema,
	FunFactsConfigSchema,
	FunFactsError,
	GenerateFunFactsOptionsSchema,
	InsufficientStatsError,
	SeasonalConfigSchema
} from './types';
