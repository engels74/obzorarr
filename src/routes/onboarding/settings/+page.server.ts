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
	getApiConfigWithSources,
	getAppSetting,
	getFunFactFrequency,
	getPublicLandingLookupEnabled,
	getUITheme,
	getWrappedLogoMode,
	getWrappedTheme,
	hasOpenAIEnvConfig,
	setAnonymizationMode,
	setAppSetting,
	setFunFactFrequency,
	setPublicLandingLookupEnabled,
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
import {
	OnboardingClaimRequiredError,
	OnboardingSteps,
	requireActiveOnboardingClaim,
	setOnboardingStep
} from '$lib/server/onboarding';
import {
	CredentialedUrlError,
	normalizeOpenAIBaseUrl
} from '$lib/server/security/credentialed-url';
import {
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode,
	setGlobalShareDefaults,
	setServerWrappedShareMode
} from '$lib/server/sharing/service';
import {
	getAllSlideConfigs,
	initializeDefaultSlideConfig,
	updateSlideConfig
} from '$lib/server/slides/config.service';
import {
	anonymizationOptions,
	serverWrappedShareModeOptions,
	shareModeOptions,
	wrappedLogoOptions
} from '$lib/sharing/options';
import { ShareMode, type ShareModeType } from '$lib/sharing/types';
import type { Actions, PageServerLoad } from './$types';

const SettingsSchema = z.object({
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
	// Server-wide wrapped recap share mode — only public | private-oauth (parity
	// with the settings Privacy page; private-link is not supported server-wide).
	serverWrappedShareMode: z.enum([ShareMode.PUBLIC, ShareMode.PRIVATE_OAUTH]),
	// New dedicated landing-page public-lookup toggle. Defaults to off (login-only)
	// on a fresh install — the form is seeded from getPublicLandingLookupEnabled(),
	// which returns false when no DB row exists, so it's never public before the admin opts in.
	publicLandingLookup: z.enum(['true', 'false']).transform((v) => v === 'true'),

	enabledSlides: z.string().optional(),

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
	openaiBaseUrl: z.string().max(512).optional(),
	openaiModel: z.string().max(100).optional(),
	aiPersona: AIPersonaSchema.optional()
});

export const load: PageServerLoad = async ({ parent }) => {
	const parentData = await parent();

	await initializeDefaultSlideConfig();

	const [
		uiTheme,
		wrappedTheme,
		anonymizationMode,
		wrappedLogoMode,
		defaultShareMode,
		allowUserControl,
		serverWrappedShareMode,
		publicLandingLookupEnabled,
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
		getServerWrappedShareMode(),
		getPublicLandingLookupEnabled(),
		getAllSlideConfigs(),
		getFunFactFrequency(),
		getAppSetting(AppSettingsKey.OPENAI_BASE_URL),
		getAppSetting(AppSettingsKey.OPENAI_MODEL),
		getAppSetting(AppSettingsKey.FUN_FACTS_AI_PERSONA)
	]);

	// Treat OpenAI as configured when either ENV or the DB supplies a key so the
	// AI-key-missing warning does not nag after a previously saved credential.
	// ENV still takes precedence, but a DB key alone is enough to drive AI.
	const apiConfig = await getApiConfigWithSources();
	const hasOpenAI = hasOpenAIEnvConfig() || Boolean(apiConfig.openai.apiKey.value.trim());

	const themeOptions = Object.entries(ThemePresets).map(([key, value]) => ({
		value,
		label: key
			.replace(/_/g, ' ')
			.toLowerCase()
			.replace(/\b\w/g, (c) => c.toUpperCase())
	}));

	const slideOptions = slideConfigs
		.filter((config) => DEFAULT_SLIDE_ORDER.includes(config.slideType as SlideType))
		.map((config) => ({
			type: config.slideType,
			label: formatSlideLabel(config.slideType),
			enabled: config.enabled
		}));

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
			wrappedLogoMode,
			defaultShareMode,
			allowUserControl,
			serverWrappedShareMode: serverWrappedShareMode === 'public' ? 'public' : 'private-oauth',
			publicLandingLookup: publicLandingLookupEnabled
		},
		slideOptions,
		themeOptions,
		// Shared copy so onboarding (privacy) and the settings pages never drift.
		anonymizationOptions,
		shareModeOptions,
		serverWrappedShareModeOptions,
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

async function requireOnboardingSettingsClaim(
	cookies: Parameters<NonNullable<Actions['saveSettings']>>[0]['cookies'],
	url: URL
) {
	try {
		await requireActiveOnboardingClaim(cookies, { requestUrl: url });
	} catch (err) {
		if (err instanceof OnboardingClaimRequiredError) {
			return fail(403, { error: err.message });
		}
		throw err;
	}
	return null;
}

export const actions: Actions = {
	saveSettings: async ({ request, locals, cookies, url }) => {
		const guardResult = await requireOnboardingSettingsClaim(cookies, url);
		if (guardResult) return guardResult;

		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		try {
			const formData = await request.formData();

			// Hidden inputs stay mounted so each carousel step can submit in one click,
			// but disabled toggles emit empty strings. Coerce those to undefined so
			// optional() and enum() schemas match.
			const optionalString = (key: string): string | undefined => {
				const raw = formData.get(key)?.toString().trim();
				return raw ? raw : undefined;
			};
			const rawData = {
				uiTheme: formData.get('uiTheme'),
				wrappedTheme: formData.get('wrappedTheme'),
				anonymizationMode: formData.get('anonymizationMode'),
				logoMode: formData.get('logoMode'),
				defaultShareMode: formData.get('defaultShareMode'),
				allowUserControl: formData.get('allowUserControl'),
				serverWrappedShareMode: formData.get('serverWrappedShareMode'),
				publicLandingLookup: formData.get('publicLandingLookup'),
				enabledSlides: formData.get('enabledSlides'),
				enableFunFacts: formData.get('enableFunFacts'),
				funFactFrequency: optionalString('funFactFrequency'),
				openaiApiKey: optionalString('openaiApiKey'),
				openaiBaseUrl: optionalString('openaiBaseUrl'),
				openaiModel: optionalString('openaiModel'),
				aiPersona: optionalString('aiPersona')
			};

			const parseResult = SettingsSchema.safeParse(rawData);
			if (!parseResult.success) {
				const errorMessage = parseResult.error.issues[0]?.message ?? 'Invalid settings';
				return fail(400, { error: errorMessage });
			}

			const data = parseResult.data;
			const openaiApiKey = data.openaiApiKey?.trim();
			let openaiBaseUrl = data.openaiBaseUrl?.trim().replace(/\/+$/, '');
			const openaiModel = data.openaiModel?.trim();

			if (data.enableFunFacts && openaiBaseUrl) {
				try {
					openaiBaseUrl = normalizeOpenAIBaseUrl(openaiBaseUrl);
				} catch (err) {
					return fail(400, {
						error:
							err instanceof CredentialedUrlError && err.message !== 'Invalid URL format'
								? err.message
								: 'Invalid OpenAI base URL'
					});
				}
			}

			// Built-in fun-fact templates work without an OpenAI key, so don't block
			// onboarding here; surface a non-fatal notice on the completion step.
			// Suppress the notice when an effective API key already exists via env
			// (env overrides DB), since AI is operative regardless of what was posted.
			const apiConfig = await getApiConfigWithSources();
			const hasEffectiveApiKey = Boolean(apiConfig.openai.apiKey.value.trim());
			const aiKeyMissingNotice = data.enableFunFacts && !openaiApiKey && !hasEffectiveApiKey;

			await Promise.all([
				setUITheme(data.uiTheme as ThemePresetType),
				setWrappedTheme(data.wrappedTheme as ThemePresetType),

				setAnonymizationMode(data.anonymizationMode as AnonymizationModeType),
				setWrappedLogoMode(data.logoMode as WrappedLogoModeType),
				setGlobalShareDefaults({
					defaultShareMode: data.defaultShareMode as ShareModeType,
					allowUserControl: data.allowUserControl
				}),
				// Server-wide share mode via the plain non-OCC setter: onboarding is a
				// linear single-admin wizard with no OCC version in flight, and the keys
				// may not exist yet on a fresh install (the atomic setter would 409).
				setServerWrappedShareMode(data.serverWrappedShareMode),
				setPublicLandingLookupEnabled(data.publicLandingLookup),

				data.enableFunFacts && data.funFactFrequency
					? setFunFactFrequency(data.funFactFrequency as FunFactFrequencyType)
					: Promise.resolve(),
				data.enableFunFacts && openaiApiKey
					? setAppSetting(AppSettingsKey.OPENAI_API_KEY, openaiApiKey)
					: Promise.resolve(),
				data.enableFunFacts && openaiBaseUrl
					? setAppSetting(AppSettingsKey.OPENAI_BASE_URL, openaiBaseUrl)
					: Promise.resolve(),
				data.enableFunFacts && openaiApiKey && openaiModel
					? setAppSetting(AppSettingsKey.OPENAI_MODEL, openaiModel)
					: Promise.resolve(),
				data.enableFunFacts && data.aiPersona
					? setAppSetting(AppSettingsKey.FUN_FACTS_AI_PERSONA, data.aiPersona)
					: Promise.resolve()
			]);

			if (data.enabledSlides !== undefined) {
				const enabledSlides = data.enabledSlides
					? data.enabledSlides.split(',').filter(Boolean)
					: [];

				for (const slideType of DEFAULT_SLIDE_ORDER) {
					const isEnabled = enabledSlides.includes(slideType);
					await updateSlideConfig(slideType, { enabled: isEnabled });
				}
			}

			logger.info(`Onboarding: Settings configured by ${locals.user.username}`, 'Onboarding');

			await setOnboardingStep(OnboardingSteps.COMPLETE);
			redirect(
				303,
				aiKeyMissingNotice ? '/onboarding/complete?notice=ai-key-missing' : '/onboarding/complete'
			);
		} catch (err) {
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

	skipSettings: async ({ locals, cookies, url }) => {
		const guardResult = await requireOnboardingSettingsClaim(cookies, url);
		if (guardResult) return guardResult;

		if (!locals.user?.isAdmin) {
			return fail(403, { error: 'Admin access required' });
		}

		logger.info(
			`Onboarding: Settings skipped (using defaults) by ${locals.user.username}`,
			'Onboarding'
		);

		await setOnboardingStep(OnboardingSteps.COMPLETE);
		redirect(303, '/onboarding/complete');
	},

	/**
	 * Do not fall back to stored OpenAI values here: onboarding submits fresh
	 * input before the settings are persisted.
	 */
	testAIConnection: async ({ request, locals, cookies, url }) => {
		const guardResult = await requireOnboardingSettingsClaim(cookies, url);
		if (guardResult) return guardResult;

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
