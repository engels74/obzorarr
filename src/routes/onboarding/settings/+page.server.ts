/**
 * Onboarding Step 3: Settings Configuration
 *
 * Allows admin to configure appearance, privacy, slides, and AI features.
 * Uses simplified settings focused on initial setup.
 */

import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { DEFAULT_SLIDE_ORDER, type SlideType } from '$lib/components/slides/types';
import {
	AnonymizationMode,
	type AnonymizationModeType,
	AppSettingsKey,
	FunFactFrequency,
	type FunFactFrequencyType,
	getAnonymizationMode,
	getAppSetting,
	getFunFactFrequency,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	hasOpenAIEnvConfig,
	setAnonymizationMode,
	setAppSetting,
	setFunFactFrequency,
	setUITheme,
	setWrappedLogoMode,
	setWrappedTheme,
	ThemePresets,
	type ThemePresetType,
	WrappedLogoMode,
	type WrappedLogoModeType
} from '$lib/server/admin/settings.service';
import { testOpenAIConnection } from '$lib/server/funfacts/test-connection';
import { AIPersonaSchema } from '$lib/server/funfacts/types';
import { logger } from '$lib/server/logging';
import { OnboardingSteps, setOnboardingStep } from '$lib/server/onboarding';
import {
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	setGlobalShareDefaults
} from '$lib/server/sharing/service';
import {
	getAllSlideConfigs,
	initializeDefaultSlideConfig,
	updateSlideConfig
} from '$lib/server/slides/config.service';
import { ShareMode, type ShareModeType } from '$lib/sharing/types';
import type { Actions, PageServerLoad } from './$types';

/**
 * Validation schema for settings form
 */
const SettingsSchema = z.object({
	// Appearance
	uiTheme: z.enum([
		ThemePresets.MODERN_MINIMAL,
		ThemePresets.SUPABASE,
		ThemePresets.DOOM_64,
		ThemePresets.AMBER_MINIMAL,
		ThemePresets.SOVIET_RED
	]),
	wrappedTheme: z.enum([
		ThemePresets.MODERN_MINIMAL,
		ThemePresets.SUPABASE,
		ThemePresets.DOOM_64,
		ThemePresets.AMBER_MINIMAL,
		ThemePresets.SOVIET_RED
	]),

	// Privacy
	anonymizationMode: z.enum([
		AnonymizationMode.REAL,
		AnonymizationMode.ANONYMOUS,
		AnonymizationMode.HYBRID
	]),
	logoMode: z.enum([
		WrappedLogoMode.ALWAYS_SHOW,
		WrappedLogoMode.ALWAYS_HIDE,
		WrappedLogoMode.USER_CHOICE
	]),
	defaultShareMode: z.enum([ShareMode.PUBLIC, ShareMode.PRIVATE_OAUTH, ShareMode.PRIVATE_LINK]),
	allowUserControl: z.enum(['true', 'false']).transform((v) => v === 'true'),

	// Slides (comma-separated list of enabled slide types)
	enabledSlides: z.string().optional(),

	// AI Features
	enableFunFacts: z.enum(['true', 'false']).transform((v) => v === 'true'),
	funFactFrequency: z
		.enum([
			FunFactFrequency.FEW,
			FunFactFrequency.NORMAL,
			FunFactFrequency.MANY,
			FunFactFrequency.CUSTOM
		])
		.optional(),
	openaiApiKey: z.string().max(512).optional(),
	openaiBaseUrl: z.string().max(512).url().optional().or(z.literal('')),
	openaiModel: z.string().max(100).optional(),
	aiPersona: AIPersonaSchema.optional()
});

/**
 * Load function - provides current settings
 */
export const load: PageServerLoad = async ({ parent }) => {
	const parentData = await parent();

	// Initialize slide config if not already done
	await initializeDefaultSlideConfig();

	// Load all settings in parallel
	const [
		uiTheme,
		wrappedTheme,
		anonymizationMode,
		wrappedLogoMode,
		defaultShareMode,
		allowUserControl,
		slideConfigs,
		funFactConfig,
		openaiBaseUrl,
		openaiModel,
		openaiPersona
	] = await Promise.all([
		getUITheme(),
		getWrappedTheme(),
		getAnonymizationMode(),
		getWrappedLogoMode(),
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl(),
		getAllSlideConfigs(),
		getFunFactFrequency(),
		getAppSetting(AppSettingsKey.OPENAI_BASE_URL),
		getAppSetting(AppSettingsKey.OPENAI_MODEL),
		getAppSetting(AppSettingsKey.FUN_FACTS_AI_PERSONA)
	]);

	// Check if OpenAI is configured (for AI features section)
	const hasOpenAI = hasOpenAIEnvConfig();

	// Build theme options
	const themeOptions = Object.entries(ThemePresets).map(([key, value]) => ({
		value,
		label: key
			.replace(/_/g, ' ')
			.toLowerCase()
			.replace(/\b\w/g, (c) => c.toUpperCase())
	}));

	// Build anonymization options
	const anonymizationOptions = [
		{
			value: AnonymizationMode.REAL,
			label: 'Real Names',
			description: 'Show actual usernames in server-wide stats'
		},
		{
			value: AnonymizationMode.ANONYMOUS,
			label: 'Anonymous',
			description: 'Hide all usernames (e.g., "User #1", "User #2")'
		},
		{
			value: AnonymizationMode.HYBRID,
			label: 'Hybrid',
			description: 'Users see their own name, others are anonymized'
		}
	];

	// Build share mode options
	const shareModeOptions = [
		{
			value: ShareMode.PUBLIC,
			label: 'Public',
			description: 'Anyone with the link can view'
		},
		{
			value: ShareMode.PRIVATE_OAUTH,
			label: 'Server Members Only',
			description: 'Only authenticated Plex server members'
		},
		{
			value: ShareMode.PRIVATE_LINK,
			label: 'Private Link',
			description: 'Requires unique share token'
		}
	];

	// Build slide options (only built-in slides)
	const slideOptions = slideConfigs
		.filter((config) => DEFAULT_SLIDE_ORDER.includes(config.slideType as SlideType))
		.map((config) => ({
			type: config.slideType,
			label: formatSlideLabel(config.slideType),
			enabled: config.enabled
		}));

	// Fun fact frequency options
	const funFactOptions = [
		{ value: FunFactFrequency.FEW, label: 'Few', description: '1-2 facts' },
		{ value: FunFactFrequency.NORMAL, label: 'Normal', description: '3-5 facts' },
		{ value: FunFactFrequency.MANY, label: 'Many', description: '6-10 facts' }
	];

	const wrappedLogoOptions = [
		{
			value: WrappedLogoMode.ALWAYS_SHOW,
			label: 'Always Show',
			description: 'Logo always visible on wrapped pages'
		},
		{
			value: WrappedLogoMode.ALWAYS_HIDE,
			label: 'Always Hide',
			description: 'Logo hidden on all wrapped pages'
		},
		{
			value: WrappedLogoMode.USER_CHOICE,
			label: 'User Choice',
			description: 'Users can toggle logo visibility'
		}
	];

	return {
		...parentData,
		settings: {
			uiTheme,
			wrappedTheme,
			anonymizationMode,
			wrappedLogoMode,
			defaultShareMode,
			allowUserControl
		},
		slideOptions,
		themeOptions,
		anonymizationOptions,
		shareModeOptions,
		wrappedLogoOptions,
		hasOpenAI,
		funFactConfig,
		funFactOptions,
		openaiConfig: {
			baseUrl: openaiBaseUrl,
			model: openaiModel,
			persona: openaiPersona
		}
	};
};

/**
 * Format slide type to human-readable label
 */
function formatSlideLabel(slideType: string): string {
	const labels: Record<string, string> = {
		'total-time': 'Total Watch Time',
		'top-movies': 'Top Movies',
		'top-shows': 'Top TV Shows',
		genres: 'Favorite Genres',
		distribution: 'Viewing Distribution',
		'weekday-patterns': 'Weekday Patterns',
		'content-type': 'Content Type',
		decade: 'Content Era',
		'series-completion': 'Series Progress',
		rewatch: 'Rewatched Content',
		marathon: 'Marathon Day',
		streak: 'Watching Streak',
		'year-comparison': 'Year Comparison',
		percentile: 'Server Ranking',
		binge: 'Binge Sessions',
		'first-last': 'First & Last Watch'
	};
	return labels[slideType] || slideType;
}

/**
 * Form actions
 */
export const actions: Actions = {
	/**
	 * Save all settings and continue to completion
	 */
	saveSettings: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		try {
			const formData = await request.formData();

			// Parse form data
			const rawData = {
				uiTheme: formData.get('uiTheme'),
				wrappedTheme: formData.get('wrappedTheme'),
				anonymizationMode: formData.get('anonymizationMode'),
				logoMode: formData.get('logoMode'),
				defaultShareMode: formData.get('defaultShareMode'),
				allowUserControl: formData.get('allowUserControl'),
				enabledSlides: formData.get('enabledSlides'),
				enableFunFacts: formData.get('enableFunFacts'),
				funFactFrequency: formData.get('funFactFrequency'),
				openaiApiKey: formData.get('openaiApiKey') ?? undefined,
				openaiBaseUrl: formData.get('openaiBaseUrl')?.toString().trim() ?? undefined,
				openaiModel: formData.get('openaiModel')?.toString().trim() ?? undefined,
				aiPersona: formData.get('aiPersona') ?? undefined
			};

			// Validate
			const parseResult = SettingsSchema.safeParse(rawData);
			if (!parseResult.success) {
				const errorMessage = parseResult.error.issues[0]?.message ?? 'Invalid settings';
				return fail(400, { error: errorMessage });
			}

			const data = parseResult.data;
			const openaiApiKey = data.openaiApiKey?.trim();
			const openaiBaseUrl = data.openaiBaseUrl?.trim().replace(/\/+$/, '');
			const openaiModel = data.openaiModel?.trim();

			// Save all settings in parallel
			await Promise.all([
				// Appearance
				setUITheme(data.uiTheme as ThemePresetType),
				setWrappedTheme(data.wrappedTheme as ThemePresetType),

				// Privacy
				setAnonymizationMode(data.anonymizationMode as AnonymizationModeType),
				setWrappedLogoMode(data.logoMode as WrappedLogoModeType),
				setGlobalShareDefaults({
					defaultShareMode: data.defaultShareMode as ShareModeType,
					allowUserControl: data.allowUserControl
				}),

				// AI Features (only if enabled)
				data.enableFunFacts && data.funFactFrequency
					? setFunFactFrequency(data.funFactFrequency as FunFactFrequencyType)
					: Promise.resolve(),
				data.enableFunFacts && openaiApiKey
					? setAppSetting(AppSettingsKey.OPENAI_API_KEY, openaiApiKey)
					: Promise.resolve(),
				data.enableFunFacts && openaiBaseUrl
					? setAppSetting(AppSettingsKey.OPENAI_BASE_URL, openaiBaseUrl)
					: Promise.resolve(),
				data.enableFunFacts && openaiModel
					? setAppSetting(AppSettingsKey.OPENAI_MODEL, openaiModel)
					: Promise.resolve(),
				data.enableFunFacts && data.aiPersona
					? setAppSetting(AppSettingsKey.FUN_FACTS_AI_PERSONA, data.aiPersona)
					: Promise.resolve()
			]);

			// Update slide configurations
			if (data.enabledSlides !== undefined) {
				const enabledSlides = data.enabledSlides
					? data.enabledSlides.split(',').filter(Boolean)
					: [];

				// Update each slide's enabled state
				for (const slideType of DEFAULT_SLIDE_ORDER) {
					const isEnabled = enabledSlides.includes(slideType);
					await updateSlideConfig(slideType, { enabled: isEnabled });
				}
			}

			logger.info(`Onboarding: Settings configured by ${locals.user.username}`, 'Onboarding');

			// Advance to completion step
			await setOnboardingStep(OnboardingSteps.COMPLETE);
			redirect(303, '/onboarding/complete');
		} catch (err) {
			// Handle redirect (expected)
			if (
				err instanceof Response ||
				(err &&
					typeof err === 'object' &&
					'status' in err &&
					(err as { status: number }).status >= 300 &&
					(err as { status: number }).status < 400)
			) {
				throw err;
			}

			logger.error(
				`Failed to save settings: ${err instanceof Error ? err.message : String(err)}`,
				'Onboarding'
			);

			return fail(500, {
				error: 'Failed to save settings. Please try again.'
			});
		}
	},

	/**
	 * Skip settings (use defaults) and continue
	 */
	skipSettings: async ({ locals }) => {
		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		logger.info(
			`Onboarding: Settings skipped (using defaults) by ${locals.user.username}`,
			'Onboarding'
		);

		// Advance to completion step
		await setOnboardingStep(OnboardingSteps.COMPLETE);
		redirect(303, '/onboarding/complete');
	},

	/**
	 * Test OpenAI connection using values submitted from the form.
	 * Does not fall back to stored values — onboarding submits fresh input.
	 */
	testAIConnection: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const apiKey = (formData.get('openaiApiKey') ?? '').toString();
		const baseUrlRaw = (formData.get('openaiBaseUrl') ?? '').toString();
		const modelRaw = (formData.get('openaiModel') ?? '').toString();

		const baseUrl = baseUrlRaw.trim() || undefined;
		const model = modelRaw.trim() || undefined;

		const result = await testOpenAIConnection(apiKey, baseUrl, model);

		if (!result.success) {
			return fail(400, { error: result.error });
		}

		return { success: true, message: result.message };
	}
};
