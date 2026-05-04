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
			locals: adminLocals,
			url: new URL('http://localhost/onboarding/complete')
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

	it('passes through ai-key-missing notice when present in url', async () => {
		const result = (await load({
			parent: async () => ({}),
			locals: adminLocals,
			url: new URL('http://localhost/onboarding/complete?notice=ai-key-missing')
		} as Parameters<typeof load>[0])) as { notice: string | null };

		expect(result.notice).toBe('ai-key-missing');
	});

	it('rejects unknown notice values (returns null)', async () => {
		const result = (await load({
			parent: async () => ({}),
			locals: adminLocals,
			url: new URL('http://localhost/onboarding/complete?notice=evil')
		} as Parameters<typeof load>[0])) as { notice: string | null };

		expect(result.notice).toBeNull();
	});

	it('shows fun facts as disabled when only the OpenAI base URL is configured', async () => {
		await setFunFactFrequency(FunFactFrequency.MANY);
		await setAppSetting(AppSettingsKey.OPENAI_BASE_URL, 'https://api.example.com/v1');

		const result = (await load({
			parent: async () => ({}),
			locals: adminLocals,
			url: new URL('http://localhost/onboarding/complete')
		} as Parameters<typeof load>[0])) as {
			configSummary: Record<string, string>;
		};

		expect(result.configSummary.funFacts).toBe('Disabled');
	});
});
