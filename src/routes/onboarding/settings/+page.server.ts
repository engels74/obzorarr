/**
 * Onboarding Step 3: Settings Configuration
 *
 * Allows admin to configure appearance, privacy, slides, and AI features.
 * Uses simplified settings focused on initial setup.
 */

import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { setOnboardingStep, OnboardingSteps } from '$lib/server/onboarding';
import {
	getUITheme,
	setUITheme,
	getWrappedTheme,
	setWrappedTheme,
	getAnonymizationMode,
	setAnonymizationMode,
	getFunFactFrequency,
	setFunFactFrequency,
	hasOpenAIEnvConfig,
	ThemePresets,
	AnonymizationMode,
	FunFactFrequency,
	type ThemePresetType,
	type AnonymizationModeType,
	type FunFactFrequencyType
} from '$lib/server/admin/settings.service';
import {
	getGlobalDefaultShareMode,
	getGlobalAllowUserControl,
	setGlobalShareDefaults
} from '$lib/server/sharing/service';
import { ShareMode, type ShareModeType } from '$lib/sharing/types';
import {
	getAllSlideConfigs,
	updateSlideConfig,
	initializeDefaultSlideConfig
} from '$lib/server/slides/config.service';
import { DEFAULT_SLIDE_ORDER, type SlideType } from '$lib/components/slides/types';
import { logger } from '$lib/server/logging';

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
	defaultShareMode: z.enum([ShareMode.PUBLIC, ShareMode.PRIVATE_OAUTH, ShareMode.PRIVATE_LINK]),
	allowUserControl: z.coerce.boolean(),

	// Slides (comma-separated list of enabled slide types)
	enabledSlides: z.string().optional(),

	// AI Features
	enableFunFacts: z.coerce.boolean(),
	funFactFrequency: z
		.enum([
			FunFactFrequency.FEW,
			FunFactFrequency.NORMAL,
			FunFactFrequency.MANY,
			FunFactFrequency.CUSTOM
		])
		.optional()
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
		defaultShareMode,
		allowUserControl,
		slideConfigs,
		funFactConfig
	] = await Promise.all([
		getUITheme(),
		getWrappedTheme(),
		getAnonymizationMode(),
		getGlobalDefaultShareMode(),
		getGlobalAllowUserControl(),
		getAllSlideConfigs(),
		getFunFactFrequency()
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

	return {
		...parentData,
		settings: {
			uiTheme,
			wrappedTheme,
			anonymizationMode,
			defaultShareMode,
			allowUserControl
		},
		slideOptions,
		themeOptions,
		anonymizationOptions,
		shareModeOptions,
		hasOpenAI,
		funFactConfig,
		funFactOptions
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
				defaultShareMode: formData.get('defaultShareMode'),
				allowUserControl: formData.get('allowUserControl'),
				enabledSlides: formData.get('enabledSlides'),
				enableFunFacts: formData.get('enableFunFacts'),
				funFactFrequency: formData.get('funFactFrequency')
			};

			// Validate
			const parseResult = SettingsSchema.safeParse(rawData);
			if (!parseResult.success) {
				const errorMessage = parseResult.error.issues[0]?.message ?? 'Invalid settings';
				return fail(400, { error: errorMessage });
			}

			const data = parseResult.data;

			// Save all settings in parallel
			await Promise.all([
				// Appearance
				setUITheme(data.uiTheme as ThemePresetType),
				setWrappedTheme(data.wrappedTheme as ThemePresetType),

				// Privacy
				setAnonymizationMode(data.anonymizationMode as AnonymizationModeType),
				setGlobalShareDefaults({
					defaultShareMode: data.defaultShareMode as ShareModeType,
					allowUserControl: data.allowUserControl
				}),

				// AI Features (only if enabled)
				data.enableFunFacts && data.funFactFrequency
					? setFunFactFrequency(data.funFactFrequency as FunFactFrequencyType)
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
	}
};
