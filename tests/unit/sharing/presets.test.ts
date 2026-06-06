import { describe, expect, it } from 'bun:test';
import { PRIVACY_PRESETS, type PrivacyPresetValues } from '$lib/sharing/options';
import {
	derivePreview,
	matchPresetFull,
	matchPresetPrivacy,
	shouldShowCustomPresetNote
} from '$lib/sharing/preset-logic';

const byId = (id: string) => {
	const preset = PRIVACY_PRESETS.find((p) => p.id === id);
	if (!preset) throw new Error(`preset ${id} not found`);
	return preset;
};

describe('matchPresetFull (onboarding, 6 fields)', () => {
	it('returns the matching id for each preset’s exact six values', () => {
		for (const preset of PRIVACY_PRESETS) {
			expect(matchPresetFull(preset.values)).toBe(preset.id);
		}
	});

	it('is stable under key reordering', () => {
		const balanced = byId('balanced').values;
		// Rebuild the object with keys in a different insertion order.
		const reordered: PrivacyPresetValues = {
			logoMode: balanced.logoMode,
			allowUserControl: balanced.allowUserControl,
			publicLandingLookup: balanced.publicLandingLookup,
			serverWrappedShareMode: balanced.serverWrappedShareMode,
			defaultShareMode: balanced.defaultShareMode,
			anonymizationMode: balanced.anonymizationMode
		};
		expect(matchPresetFull(reordered)).toBe('balanced');
	});

	it('returns "custom" for an off-map combination', () => {
		const balanced = byId('balanced').values;
		const offMap: PrivacyPresetValues = { ...balanced, logoMode: 'always_show' };
		expect(matchPresetFull(offMap)).toBe('custom');
	});
});

describe('matchPresetPrivacy (admin, 5 fields, logoMode excluded)', () => {
	it('returns the matching id for the five admin-owned fields', () => {
		for (const preset of PRIVACY_PRESETS) {
			const { logoMode: _logoMode, ...fiveFields } = preset.values;
			expect(matchPresetPrivacy(fiveFields)).toBe(preset.id);
		}
	});

	it('matches regardless of logoMode: Balanced 5 fields + logoMode always_hide => "balanced"', () => {
		const balanced = byId('balanced').values;
		const { logoMode: _logoMode, ...fiveFields } = balanced;
		// logoMode is NOT part of the admin match, so passing only the five fields
		// (whatever the persisted logoMode is) still resolves to balanced.
		expect(balanced.logoMode).not.toBe('always_hide'); // sanity: balanced is user_choice
		expect(matchPresetPrivacy(fiveFields)).toBe('balanced');
	});

	it('returns "custom" when a five-field combination matches no preset', () => {
		const balanced = byId('balanced').values;
		const { logoMode: _logoMode, ...fiveFields } = balanced;
		expect(matchPresetPrivacy({ ...fiveFields, publicLandingLookup: true })).toBe('custom');
	});
});

describe('derivePreview', () => {
	it('populates logoVisibility when logoMode is provided (onboarding)', () => {
		const preview = derivePreview(byId('public-showcase').values);
		expect(preview.logoVisibility).toBe('always-show');
	});

	it('leaves logoVisibility undefined when logoMode is omitted (admin)', () => {
		const { logoMode: _logoMode, ...fiveFields } = byId('public-showcase').values;
		const preview = derivePreview(fiveFields);
		expect(preview.logoVisibility).toBeUndefined();
	});

	it('separates form/recap visibility from per-user reachability for a public showcase', () => {
		const preview = derivePreview(byId('public-showcase').values);
		expect(preview.landingLookupForm).toBe('visible');
		expect(preview.serverRecapVisibility).toBe('public');
		expect(preview.perUserDefaultForNewUsers).toBe('public');
		// No field on the model claims an existing/private user is reachable.
		expect(preview.warnings).toHaveLength(0);
	});

	it('admin default public + a sampled private user makes no reachable claim', () => {
		// Admin default is public, but the model only ever reports the NEW-user
		// default — it never asserts that a specific existing private user is reachable.
		const preview = derivePreview({
			anonymizationMode: 'real',
			defaultShareMode: 'public',
			serverWrappedShareMode: 'public',
			publicLandingLookup: true,
			allowUserControl: true
		});
		expect(preview.perUserDefaultForNewUsers).toBe('public');
		// The model has no 'reachable'/per-user field at all — exposure is scoped to
		// the new-user default and admin-controlled form/recap visibility only.
		expect(Object.keys(preview)).not.toContain('perUserReachable');
	});

	it('maps hybrid anonymization to hybrid-self-sees-own', () => {
		const preview = derivePreview(byId('balanced').values);
		expect(preview.nameDisplay).toBe('hybrid-self-sees-own');
	});

	it('maps anonymous and real name displays', () => {
		expect(derivePreview(byId('maximum-privacy').values).nameDisplay).toBe('anonymous');
		expect(derivePreview(byId('internal-community').values).nameDisplay).toBe('real');
	});

	it('emits the contradiction warning for a custom combo (public lookup on + non-public default)', () => {
		const preview = derivePreview({
			anonymizationMode: 'hybrid',
			defaultShareMode: 'private-oauth',
			serverWrappedShareMode: 'private-oauth',
			publicLandingLookup: true,
			allowUserControl: true
		});
		expect(preview.warnings.length).toBeGreaterThan(0);
		expect(preview.warnings.some((w) => /public lookup is on/i.test(w))).toBe(true);
	});

	it('no shipped preset trips the contradiction warning', () => {
		for (const preset of PRIVACY_PRESETS) {
			expect(derivePreview(preset.values).warnings).toHaveLength(0);
		}
	});
});

describe('shouldShowCustomPresetNote (ISSUE-001: gate the "Custom configuration" note on interaction)', () => {
	it('does NOT show the note for a fresh-install custom state before any interaction', () => {
		// The defect: seeded values resolve to 'custom' on first load. With no
		// interaction the misleading "your choices don't match a preset" note must
		// stay hidden.
		expect(shouldShowCustomPresetNote('custom', false)).toBe(false);
	});

	it('shows the note once the user has interacted and the values still match no preset', () => {
		expect(shouldShowCustomPresetNote('custom', true)).toBe(true);
	});

	it('never shows the note when a named preset is selected, regardless of interaction', () => {
		for (const preset of PRIVACY_PRESETS) {
			expect(shouldShowCustomPresetNote(preset.id, false)).toBe(false);
			expect(shouldShowCustomPresetNote(preset.id, true)).toBe(false);
		}
	});
});

describe('negative guard: preset is never a persisted or submitted field', () => {
	const read = async (path: string) => await Bun.file(path).text();

	it('onboarding +page.svelte never submits a "preset" form field', async () => {
		const src = await read('src/routes/onboarding/settings/+page.svelte');
		expect(/name=["']preset["']/.test(src)).toBe(false);
		expect(/formData\.set\(\s*["']preset["']/.test(src)).toBe(false);
	});

	it('onboarding SettingsSchema has no "preset" key and the action never reads one', async () => {
		const src = await read('src/routes/onboarding/settings/+page.server.ts');
		expect(/^\s*preset\s*:/m.test(src)).toBe(false);
		expect(/formData\.get\(\s*["']preset["']/.test(src)).toBe(false);
	});

	it('admin privacy +page.svelte never submits a "preset" form field', async () => {
		const src = await read('src/routes/admin/settings/privacy/+page.svelte');
		expect(/name=["']preset["']/.test(src)).toBe(false);
		expect(/formData\.set\(\s*["']preset["']/.test(src)).toBe(false);
	});

	it('admin privacy schemas have no "preset" key and actions never read one', async () => {
		const src = await read('src/routes/admin/settings/privacy/+page.server.ts');
		expect(/^\s*preset\s*:/m.test(src)).toBe(false);
		expect(/formData\.get\(\s*["']preset["']/.test(src)).toBe(false);
	});
});
