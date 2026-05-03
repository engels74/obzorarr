import { beforeEach, describe, expect, it } from 'bun:test';
import {
	AnonymizationMode,
	AppSettingsKey,
	FunFactFrequency,
	setAnonymizationMode,
	setAppSetting,
	setCachedServerName,
	setFunFactFrequency,
	setUITheme,
	setWrappedLogoMode,
	setWrappedTheme,
	ThemePresets,
	WrappedLogoMode
} from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, playHistory, syncStatus } from '$lib/server/db/schema';
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { load } from '../../../src/routes/onboarding/complete/+page.server';

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

describe('onboarding completion summary', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(playHistory);
		await db.delete(syncStatus);
	});

	it('reflects the persisted onboarding configuration', async () => {
		await setCachedServerName('QA Plex');
		await setUITheme(ThemePresets.SUPABASE);
		await setWrappedTheme(ThemePresets.DOOM_64);
		await setAnonymizationMode(AnonymizationMode.HYBRID);
		await setWrappedLogoMode(WrappedLogoMode.USER_CHOICE);
		await setGlobalShareDefaults({ defaultShareMode: 'private-link', allowUserControl: true });
		await setFunFactFrequency(FunFactFrequency.CUSTOM, 7);
		await setAppSetting(AppSettingsKey.OPENAI_API_KEY, 'test-openai-key');

		const result = (await load({
			parent: async () => ({}),
			locals: adminLocals
		} as Parameters<typeof load>[0])) as {
			configSummary: Record<string, string>;
		};

		expect(result.configSummary).toEqual({
			serverName: 'QA Plex',
			uiTheme: 'Supabase',
			wrappedTheme: 'Doom 64',
			anonymizationMode: 'Hybrid',
			logoMode: 'User Choice',
			shareMode: 'Private Link',
			allowUserControl: 'Allowed',
			funFacts: 'Custom (7)'
		});
	});
});
