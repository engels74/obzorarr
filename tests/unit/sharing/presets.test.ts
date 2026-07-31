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
		const offMap: PrivacyPresetValues = { ...balanced, logoMode: 'always_hide' };
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

	it('matches regardless of the separately persisted admin logo mode', () => {
		const balanced = byId('balanced').values;
		const { logoMode: _logoMode, ...fiveFields } = balanced;
		// logoMode is NOT part of the admin match, so passing only the five fields
		// (whatever the persisted logoMode is) still resolves to balanced.
		expect(balanced.logoMode).not.toBe('always_hide');
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

	it('separates current-year lookup, recap visibility, and ordinary personal-link defaults', () => {
		const preview = derivePreview(byId('public-showcase').values);
		expect(preview.landingLookupForm).toBe('visible');
		expect(preview.serverRecapVisibility).toBe('public');
		expect(preview.perUserDefaultForNewUsers).toBe('public');
		expect(preview.logoVisibility).toBe('always-show');
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

	it('allows public lookup with a private ordinary-link baseline without a contradiction', () => {
		const preview = derivePreview({
			anonymizationMode: 'hybrid',
			defaultShareMode: 'private-oauth',
			serverWrappedShareMode: 'private-oauth',
			publicLandingLookup: true,
			allowUserControl: true
		});
		expect(preview.landingLookupForm).toBe('visible');
		expect(preview.perUserDefaultForNewUsers).toBe('members-only');
		expect(preview.warnings).toHaveLength(0);
	});

	it('sets every shipped preset logo mode to Always Show', () => {
		for (const preset of PRIVACY_PRESETS) {
			expect(preset.values.logoMode).toBe('always_show');
		}
	});

	it('keeps every shipped preset warning-free', () => {
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
