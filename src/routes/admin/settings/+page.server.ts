import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import {
	getAllAppSettings,
	setAppSetting,
	getCurrentTheme,
	setCurrentTheme,
	getAnonymizationMode,
	setAnonymizationMode,
	clearStatsCache,
	AppSettingsKey,
	ThemePresets,
	AnonymizationMode,
	type ThemePresetType,
	type AnonymizationModeType
} from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';

/**
 * Admin Settings Page Server
 *
 * Handles application settings management.
 *
 * Implements Requirements:
 * - 11.4: Theme configuration
 * - 11.5: API configuration (Plex, OpenAI)
 * - 11.6: Year and archive settings
 */

// =============================================================================
// Validation Schemas
// =============================================================================

const ThemeSchema = z.enum(['soviet-red', 'midnight-blue', 'forest-green', 'royal-purple']);
const AnonymizationSchema = z.enum(['real', 'anonymous', 'hybrid']);

const ApiConfigSchema = z.object({
	plexServerUrl: z.string().url('Invalid URL format').optional().or(z.literal('')),
	plexToken: z.string().optional(),
	openaiApiKey: z.string().optional(),
	openaiBaseUrl: z.string().url('Invalid URL format').optional().or(z.literal(''))
});

// =============================================================================
// Load Function
// =============================================================================

export const load: PageServerLoad = async () => {
	const [settings, currentTheme, anonymizationMode, availableYears] = await Promise.all([
		getAllAppSettings(),
		getCurrentTheme(),
		getAnonymizationMode(),
		getAvailableYears()
	]);

	const currentYear = new Date().getFullYear();

	return {
		settings: {
			plexServerUrl: settings[AppSettingsKey.PLEX_SERVER_URL] ?? '',
			plexToken: settings[AppSettingsKey.PLEX_TOKEN] ?? '',
			openaiApiKey: settings[AppSettingsKey.OPENAI_API_KEY] ?? '',
			openaiBaseUrl: settings[AppSettingsKey.OPENAI_BASE_URL] ?? ''
		},
		currentTheme,
		anonymizationMode,
		themeOptions: Object.entries(ThemePresets).map(([key, value]) => ({
			value,
			label: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
		})),
		anonymizationOptions: Object.entries(AnonymizationMode).map(([key, value]) => ({
			value,
			label: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
		})),
		availableYears: availableYears.length > 0 ? availableYears : [currentYear],
		currentYear
	};
};

// =============================================================================
// Actions
// =============================================================================

export const actions: Actions = {
	/**
	 * Update API configuration (Plex, OpenAI)
	 */
	updateApiConfig: async ({ request }) => {
		const formData = await request.formData();

		const data = {
			plexServerUrl: formData.get('plexServerUrl')?.toString() ?? '',
			plexToken: formData.get('plexToken')?.toString() ?? '',
			openaiApiKey: formData.get('openaiApiKey')?.toString() ?? '',
			openaiBaseUrl: formData.get('openaiBaseUrl')?.toString() ?? ''
		};

		const parsed = ApiConfigSchema.safeParse(data);
		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input',
				fieldErrors: parsed.error.flatten().fieldErrors
			});
		}

		try {
			// Save each setting (only if provided)
			if (parsed.data.plexServerUrl) {
				await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, parsed.data.plexServerUrl);
			}
			if (parsed.data.plexToken) {
				await setAppSetting(AppSettingsKey.PLEX_TOKEN, parsed.data.plexToken);
			}
			if (parsed.data.openaiApiKey) {
				await setAppSetting(AppSettingsKey.OPENAI_API_KEY, parsed.data.openaiApiKey);
			}
			if (parsed.data.openaiBaseUrl) {
				await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, parsed.data.openaiBaseUrl);
			}

			return { success: true, message: 'API configuration updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update settings';
			return fail(500, { error: message });
		}
	},

	/**
	 * Test Plex connection
	 */
	testPlexConnection: async ({ request }) => {
		const formData = await request.formData();
		const plexServerUrl = formData.get('plexServerUrl')?.toString();
		const plexToken = formData.get('plexToken')?.toString();

		if (!plexServerUrl || !plexToken) {
			return fail(400, { error: 'Plex server URL and token are required' });
		}

		try {
			// Try to fetch server identity
			const response = await fetch(`${plexServerUrl}/identity`, {
				headers: {
					Accept: 'application/json',
					'X-Plex-Token': plexToken
				}
			});

			if (!response.ok) {
				return fail(400, { error: `Connection failed: ${response.status} ${response.statusText}` });
			}

			const data = (await response.json()) as { MediaContainer?: { friendlyName?: string } };
			const serverName = data?.MediaContainer?.friendlyName ?? 'Unknown';

			return { success: true, message: `Connected to: ${serverName}` };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Connection failed';
			return fail(500, { error: message });
		}
	},

	/**
	 * Update theme
	 */
	updateTheme: async ({ request }) => {
		const formData = await request.formData();
		const theme = formData.get('theme');

		const parsed = ThemeSchema.safeParse(theme);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid theme selection' });
		}

		try {
			await setCurrentTheme(parsed.data as ThemePresetType);
			return { success: true, message: 'Theme updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update theme';
			return fail(500, { error: message });
		}
	},

	/**
	 * Update anonymization mode
	 */
	updateAnonymization: async ({ request }) => {
		const formData = await request.formData();
		const mode = formData.get('anonymizationMode');

		const parsed = AnonymizationSchema.safeParse(mode);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid anonymization mode' });
		}

		try {
			await setAnonymizationMode(parsed.data as AnonymizationModeType);
			return { success: true, message: 'Anonymization mode updated' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update mode';
			return fail(500, { error: message });
		}
	},

	/**
	 * Clear stats cache for a year
	 */
	clearCache: async ({ request }) => {
		const formData = await request.formData();
		const yearStr = formData.get('year')?.toString();

		let year: number | undefined;
		if (yearStr) {
			year = parseInt(yearStr, 10);
			if (isNaN(year)) {
				return fail(400, { error: 'Invalid year' });
			}
		}

		try {
			const deleted = await clearStatsCache(year);
			const message = year
				? `Cleared ${deleted} cache entries for ${year}`
				: `Cleared ${deleted} cache entries`;

			return { success: true, message };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear cache';
			return fail(500, { error: message });
		}
	}
};
