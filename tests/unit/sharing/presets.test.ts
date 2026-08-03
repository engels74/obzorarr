import { describe, expect, it } from 'bun:test';
import {
	CUSTOM_PRIVACY_PRESET,
	DEFAULT_PRIVACY_PRESET_ID,
	PRIVACY_PRESETS,
	type PrivacyPresetPrivacyKey,
	type PrivacyPresetValues
} from '$lib/sharing/options';
import {
	customPresetSeedValues,
	derivePreview,
	matchPresetFull,
	matchPresetPrivacy,
	resolvePersistedPresetSelection,
	resolvePresetSelection,
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

describe('negative guard: a preset is never a persisted field', () => {
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

	it('submits a preset id only as a discriminator, and stores no row for it', async () => {
		// The admin "apply preset" action DOES receive an id (`presetId`) so one
		// request can write all three sections atomically. It resolves that id to a
		// PRIVACY_PRESETS entry server-side and writes only ordinary privacy values:
		// no app_settings key exists for a preset, and the active preset is still
		// recomputed from field values on load.
		const server = await read('src/routes/admin/settings/privacy/+page.server.ts');
		expect(server).toContain('presetId: z.enum(PRIVACY_PRESET_IDS).optional()');
		expect(server).toContain(
			'PRIVACY_PRESETS.find((candidate) => candidate.id === form.data.presetId)'
		);

		// No app_settings key stores a preset, so nothing can persist one.
		const settingsService = await read('src/lib/server/admin/settings.service.ts');
		const keyTable = settingsService.slice(
			settingsService.indexOf('export const AppSettingsKey = {'),
			settingsService.indexOf(
				'} as const;',
				settingsService.indexOf('export const AppSettingsKey = {')
			)
		);
		expect(keyTable.toLowerCase()).not.toContain('preset');

		// The atomic writer takes the resolved VALUES, never an id.
		const writer = settingsService.slice(
			settingsService.indexOf('export async function setPrivacyPresetAtomic(')
		);
		const signature = writer.slice(0, writer.indexOf('}): Promise'));
		expect(signature).not.toContain('presetId');
		expect(signature).toContain('anonymizationMode');
		expect(signature).toContain('publicLandingLookup');
	});
});

describe('Custom preset card — structure', () => {
	it('keeps PRIVACY_PRESETS at exactly the five shipped presets', () => {
		expect(PRIVACY_PRESETS).toHaveLength(5);
		expect(PRIVACY_PRESETS.map((p) => p.id)).toEqual([
			'maximum-privacy',
			'internal-community',
			'balanced',
			'public-showcase',
			'anonymous-public'
		]);
	});

	it('models Custom as a separate descriptor, never a PRIVACY_PRESETS member', () => {
		// A pseudo-entry inside the array would force every matcher to skip it.
		expect(PRIVACY_PRESETS.some((p) => (p.id as string) === 'custom')).toBe(false);
		expect(CUSTOM_PRIVACY_PRESET.id).toBe('custom');
		expect(CUSTOM_PRIVACY_PRESET.label).toBe('Custom');
		expect(CUSTOM_PRIVACY_PRESET.description).toBeTruthy();
	});

	it('gives the Custom card no exposureSummary (its exposure is the live fields)', () => {
		expect(CUSTOM_PRIVACY_PRESET).not.toHaveProperty('exposureSummary');
		expect(CUSTOM_PRIVACY_PRESET).not.toHaveProperty('values');
	});
});

describe('resolvePersistedPresetSelection — admin, derived purely from the live values', () => {
	it('selects Custom for an off-preset combination with no interaction at all', () => {
		// THE REGRESSION. The admin route's values come from persisted app_settings,
		// so an off-preset combination is a configuration an administrator saved —
		// not an untouched fresh-install seed. Routing this through onboarding's
		// interaction-gated resolver made every page load of such a configuration
		// select NO card (see the contrast assertion below).
		expect(resolvePersistedPresetSelection('custom', false)).toBe('custom');
		expect(resolvePresetSelection('custom', false, false)).toBeNull();
	});

	it('selects the matching shipped preset for an exact match', () => {
		for (const preset of PRIVACY_PRESETS) {
			expect(resolvePersistedPresetSelection(preset.id, false)).toBe(preset.id);
		}
	});

	it('keeps Custom highlighted while the sticky flag is set, even on an exact match', () => {
		// Admin's Custom click stages nothing, so the derived match is still whatever
		// is saved; the sticky flag is the only thing holding the highlight.
		expect(resolvePersistedPresetSelection('balanced', true)).toBe('custom');
		expect(resolvePersistedPresetSelection('custom', true)).toBe('custom');
	});

	it('returns to the derived match once the sticky flag is cleared', () => {
		expect(resolvePersistedPresetSelection('balanced', false)).toBe('balanced');
	});

	it('never returns null — a card is always selected on this route', () => {
		for (const match of [...PRIVACY_PRESETS.map((p) => p.id), 'custom' as const]) {
			for (const sticky of [false, true]) {
				expect(resolvePersistedPresetSelection(match, sticky)).not.toBeNull();
			}
		}
	});
});

describe('resolvePresetSelection — onboarding, the same resolution plus the untouched guard', () => {
	it('selects NO card in the untouched fresh-install custom state (ISSUE-001)', () => {
		expect(resolvePresetSelection('custom', false, false)).toBeNull();
	});

	it('selects Custom once the admin has diverged from a shipped preset', () => {
		expect(resolvePresetSelection('custom', true, false)).toBe('custom');
	});

	it('selects the matching shipped preset whether or not the admin interacted', () => {
		for (const preset of PRIVACY_PRESETS) {
			expect(resolvePresetSelection(preset.id, false, false)).toBe(preset.id);
			expect(resolvePresetSelection(preset.id, true, false)).toBe(preset.id);
		}
	});

	it('keeps Custom highlighted while the sticky flag is set, even on an exact match', () => {
		// The first-pick case: Custom seeds Balanced, so the derived match is
		// 'balanced' — without the sticky flag the highlight would snap straight back.
		expect(resolvePresetSelection('balanced', true, true)).toBe('custom');
	});

	it('returns to the derived match once the sticky flag is cleared', () => {
		expect(resolvePresetSelection('balanced', true, false)).toBe('balanced');
	});

	it('never lights Custom before interaction, even with a stale sticky flag', () => {
		expect(resolvePresetSelection('custom', false, true)).toBeNull();
		expect(resolvePresetSelection('balanced', false, true)).toBeNull();
	});
});

describe('customPresetSeedValues — what clicking Custom mutates', () => {
	it('seeds the Balanced value set on the first interaction of the session', () => {
		const seed = customPresetSeedValues(false);
		expect(seed).toEqual(byId(DEFAULT_PRIVACY_PRESET_ID).values);
		expect(DEFAULT_PRIVACY_PRESET_ID).toBe('balanced');
	});

	it('mutates nothing once the admin has already interacted', () => {
		// Covers both "already on a shipped preset" and "already diverged": the click
		// only moves the highlight, so the Advanced settings stay exactly as they are.
		expect(customPresetSeedValues(true)).toBeNull();
	});

	it('seeds a value set that matches Balanced under both matchers', () => {
		const seed = customPresetSeedValues(false) as PrivacyPresetValues;
		const { logoMode: _logoMode, ...fiveFields } = seed;
		expect(matchPresetFull(seed)).toBe('balanced');
		expect(matchPresetPrivacy(fiveFields)).toBe('balanced');
	});
});

describe('Custom preset card — template wiring (no DOM harness in this suite)', () => {
	const read = async (path: string) => await Bun.file(path).text();
	const ONBOARDING = 'src/routes/onboarding/settings/+page.svelte';
	const ADMIN = 'src/routes/admin/settings/privacy/+page.svelte';

	/** Markup of the Custom card only: the last <button> opening before its label. */
	function customCardMarkup(src: string): string {
		const labelIdx = src.indexOf('CUSTOM_PRIVACY_PRESET.label');
		const openIdx = src.lastIndexOf('<button', labelIdx);
		return src.slice(openIdx, src.indexOf('</button>', labelIdx));
	}

	it.each([ONBOARDING, ADMIN])('%s renders a sixth Custom card last', async (path) => {
		const src = await read(path);
		// Rendered AFTER the {#each} over the five shipped presets, inside the grid.
		const eachEnd = src.indexOf('{/each}');
		const customIdx = src.indexOf('CUSTOM_PRIVACY_PRESET.label');
		expect(eachEnd).toBeGreaterThan(-1);
		expect(customIdx).toBeGreaterThan(eachEnd);
		expect(src).toContain('onclick={selectCustomPreset}');
	});

	it.each([ONBOARDING, ADMIN])(
		'%s gives the Custom card the same radio/roving-tabindex treatment',
		async (path) => {
			const src = await read(path);
			const cardMarkup = customCardMarkup(src);
			expect(cardMarkup).toContain('bind:this={presetButtons[CUSTOM_PRESET_INDEX]}');
			expect(cardMarkup).toContain('role="radio"');
			expect(cardMarkup).toContain("aria-checked={selectedPresetCard === 'custom'}");
			expect(cardMarkup).toContain('tabindex={CUSTOM_PRESET_INDEX === presetTabIndex ? 0 : -1}');
			expect(cardMarkup).toContain('onkeydown=');
		}
	);

	it.each([ONBOARDING, ADMIN])(
		'%s arrow-key math spans all six cards and can never land on a dead index',
		async (path) => {
			const src = await read(path);
			// `last` must be the Custom index, not PRIVACY_PRESETS.length - 1, or
			// ArrowLeft from the first card would wrap onto a card that no longer
			// holds the final slot.
			expect(src).toContain('const CUSTOM_PRESET_INDEX = PRIVACY_PRESETS.length;');
			expect(src).toContain('const last = CUSTOM_PRESET_INDEX;');
			expect(src).not.toContain('const last = PRIVACY_PRESETS.length - 1;');
			// Every arrow target routes through the bounds-checked dispatcher.
			expect(src).toContain('if (!selectPresetAtIndex(target)) return;');
		}
	);

	it.each([ONBOARDING, ADMIN])(
		'%s clears the sticky Custom flag when a shipped preset is applied',
		async (path) => {
			const src = await read(path);
			const fn = src.slice(src.indexOf('function applyPrivacyPreset('));
			const body = fn.slice(0, fn.indexOf('\n}'));
			expect(body).toContain('customPresetChosen = false;');
			expect(body).toContain('assignPresetValues(preset.values);');
		}
	);

	it('onboarding delegates the Custom click seeding rule to customPresetSeedValues', async () => {
		const src = await read(ONBOARDING);
		const fn = src.slice(src.indexOf('function selectCustomPreset('));
		const body = fn.slice(0, fn.indexOf('\n}'));
		// The only mutation path is the seed helper — no unconditional field writes.
		expect(body).toContain('const seed = customPresetSeedValues(privacyTouched);');
		expect(body).toContain('if (seed) assignPresetValues(seed);');
		expect(body).toContain('customPresetChosen = true;');
	});

	it('admin never seeds from the Custom card — the click stages nothing', async () => {
		// Regression: `customPresetSeedValues` seeds Balanced whenever its
		// "has interacted" flag is false, and on the admin route that flag reads
		// false on every fresh load — including loads of an already off-preset
		// persisted config. Wiring the helper up there overwrote the
		// administrator's saved privacy settings on a plain Custom click. Admin's
		// Custom card must only move the highlight.
		const src = await read(ADMIN);
		// The helper is not imported at all — scoped to the import block so the
		// explanatory prose above the handler may still name it.
		const importBlock = src.slice(0, src.indexOf("} from '$lib/sharing/preset-logic'"));
		expect(importBlock).not.toContain('customPresetSeedValues');
		const fn = src.slice(src.indexOf('function selectCustomPreset('));
		const body = fn.slice(0, fn.indexOf('\n}'));
		expect(body).not.toContain('customPresetSeedValues');
		expect(body).not.toContain('assignPresetValues');
		// ...and no inlined equivalent: the three superForm stores are the only
		// staging surface (see assignPresetValues), so the click must not touch them.
		expect(body).not.toContain('$serverWrappedData');
		expect(body).not.toContain('$userDefaultsData');
		expect(body).not.toContain('$publicLandingLookupData');
		expect(body).toContain('customPresetChosen = true;');
	});

	it('admin carries NO interaction gate — the highlight is a function of the values', async () => {
		const src = await read(ADMIN);
		// THE REGRESSION. Admin used to mirror onboarding's ISSUE-001 gate with a
		// session-scoped flag (`presetCardClicked`, then a latching
		// `privacyInteracted`). Both are wrong in kind, not just in decay
		// behaviour: the flag necessarily reads false on every fresh page load, so
		// a SAVED off-preset configuration rendered six cards with
		// `aria-checked="false"` and dropped the roving tab stop back to the first
		// card. On this route the persisted values are the whole truth.
		expect(src).not.toContain('presetCardClicked');
		expect(src).not.toContain('privacyInteracted');
		expect(src).not.toContain('privacyTouched');
		expect(src).toContain('resolvePersistedPresetSelection(selectedPreset, customPresetChosen)');
		// The onboarding-gated resolver must not come back in through the import.
		const importBlock = src.slice(0, src.indexOf("} from '$lib/sharing/preset-logic'"));
		expect(importBlock).not.toContain('resolvePresetSelection');
		expect(importBlock).toContain('resolvePersistedPresetSelection');

		// Nothing else was folded into the removal: the accordion toggle keeps its
		// scroll-into-view behaviour, and the three saves keep their toasts.
		const toggleBody = (() => {
			const fn = src.slice(src.indexOf('async function handleAdvancedToggle('));
			return fn.slice(0, fn.indexOf('\n}'));
		})();
		expect(toggleBody).toContain('if (!open) return;');
		expect(toggleBody).toContain('await tick();');
		expect(toggleBody).toContain("advancedSectionRef?.scrollIntoView({ behavior: 'smooth'");
		const savedToasts = [
			...src.matchAll(
				/\n\t{3}handleFormToast\(\{ success: true, message: updated\.message \?\? 'Saved' \}\);/g
			)
		];
		expect(savedToasts).toHaveLength(3);
	});

	it('onboarding keeps its untouched-initial-state gate', async () => {
		const src = await read(ONBOARDING);
		expect(src).toContain('let privacyTouched = $state(false);');
		expect(src).toContain(
			'resolvePresetSelection(selectedPreset, privacyTouched, customPresetChosen)'
		);
	});

	it('onboarding latches privacyTouched on every route to a privacy value', async () => {
		// Live detection in onboarding depends on the gate flipping the moment ANY
		// Advanced control moves — otherwise an off-preset edit would resolve to
		// 'custom' and still light no card.
		const src = await read(ONBOARDING);
		const bodyOf = (opener: string) => {
			const fn = src.slice(src.indexOf(opener));
			return fn.slice(0, fn.indexOf('\n}'));
		};
		expect(bodyOf('function applyPrivacyPreset(')).toContain('privacyTouched = true;');
		expect(bodyOf('function selectCustomPreset(')).toContain('privacyTouched = true;');
		// The five radio groups have no per-input handler; a single delegated
		// `change` listener on the Advanced panel covers all of them.
		expect(src).toContain(
			'<div class="advanced-content" onchange={() => (privacyTouched = true)}>'
		);
		// The two switches are <button type="button">, which emit no `change`, so
		// each latches for itself.
		const toggleHandlers = [...src.matchAll(/onclick=\{\(\) => \{\n\t+privacyTouched = true;\n/g)];
		expect(toggleHandlers).toHaveLength(2);
	});

	it('admin still matches only the five admin-owned fields (logoMode excluded)', async () => {
		const src = await read(ADMIN);
		expect(src).toContain('matchPresetPrivacy({');
		expect(src).not.toContain('matchPresetFull(');
		// assignPresetValues must never write logoMode on the admin route — it lives
		// on the Appearance route and its own OCC group.
		const fn = src.slice(src.indexOf('function assignPresetValues('));
		expect(fn.slice(0, fn.indexOf('\n}'))).not.toContain('logoMode');
	});

	it('onboarding still matches all six fields including logoMode', async () => {
		const src = await read(ONBOARDING);
		expect(src).toContain('matchPresetFull({');
		const fn = src.slice(src.indexOf('function assignPresetValues('));
		expect(fn.slice(0, fn.indexOf('\n}'))).toContain('wrappedLogoMode = values.logoMode;');
	});

	it.each([ONBOARDING, ADMIN])('%s never submits the Custom card as a field', async (path) => {
		const src = await read(path);
		expect(/name=["']custom["']/.test(src)).toBe(false);
		expect(/formData\.set\(\s*["']custom["']/.test(src)).toBe(false);
	});
});

/**
 * DOM-free models of the two privacy-preset selectors. Each mirrors exactly what
 * its page composes from the shared helpers — nothing else — so the flows below
 * exercise the real selection pipeline rather than a paraphrase of it:
 *
 *   admin      selectedPresetCard = resolvePersistedPresetSelection(
 *                                     matchPresetPrivacy(<5 staged fields>),
 *                                     customPresetChosen)
 *   onboarding selectedPresetCard = resolvePresetSelection(
 *                                     matchPresetFull(<6 live fields>),
 *                                     privacyTouched, customPresetChosen)
 */
type AdminFields = Pick<PrivacyPresetValues, PrivacyPresetPrivacyKey>;

const fiveOf = ({ logoMode: _logoMode, ...five }: PrivacyPresetValues): AdminFields => five;

/** The admin privacy page: three superForm stores + three saved baselines. */
function adminPage(persisted: AdminFields) {
	let staged: AdminFields = { ...persisted };
	let saved: AdminFields = { ...persisted };
	let customPresetChosen = false;
	return {
		card: () => resolvePersistedPresetSelection(matchPresetPrivacy(staged), customPresetChosen),
		/** Edit an Advanced control (stages only — the section Save button persists). */
		edit(patch: Partial<AdminFields>) {
			staged = { ...staged, ...patch };
		},
		/** Press one section's Save button: that section's baseline advances. */
		save() {
			saved = { ...staged };
		},
		/** Click one of the five shipped cards. */
		clickPreset(id: string) {
			customPresetChosen = false;
			staged = { ...staged, ...fiveOf(byId(id).values) };
		},
		/** Click the sixth Custom card: highlight only, stages nothing. */
		clickCustom() {
			customPresetChosen = true;
		},
		/** Reload the route: every session flag resets, values come from the DB. */
		reload: () => adminPage(saved)
	};
}

/** The onboarding privacy step: six local runes, no persistence until submit. */
function onboardingStep(seed: PrivacyPresetValues) {
	let values: PrivacyPresetValues = { ...seed };
	let privacyTouched = false;
	let customPresetChosen = false;
	return {
		card: () => resolvePresetSelection(matchPresetFull(values), privacyTouched, customPresetChosen),
		edit(patch: Partial<PrivacyPresetValues>) {
			privacyTouched = true;
			values = { ...values, ...patch };
		},
		clickPreset(id: string) {
			privacyTouched = true;
			customPresetChosen = false;
			values = { ...byId(id).values };
		}
	};
}

describe('admin privacy page — live Custom detection across the real state transitions', () => {
	const BALANCED = fiveOf(byId('balanced').values);
	/** Balanced with the recap flipped public: matches no shipped preset. */
	const OFF_PRESET: AdminFields = { ...BALANCED, serverWrappedShareMode: 'public' };

	it('1. built-in preset values select the matching built-in card', () => {
		for (const preset of PRIVACY_PRESETS) {
			expect(adminPage(fiveOf(preset.values)).card()).toBe(preset.id);
		}
	});

	it('2. an off-preset edit selects Custom immediately, before any save', () => {
		const page = adminPage(BALANCED);
		expect(page.card()).toBe('balanced');
		page.edit({ serverWrappedShareMode: 'public' });
		expect(page.card()).toBe('custom');
	});

	it('3. saving that section keeps Custom, and a fresh load still resolves Custom', () => {
		const page = adminPage(BALANCED);
		page.edit({ serverWrappedShareMode: 'public' });
		page.save();
		expect(page.card()).toBe('custom');
		// The transition that used to lose the highlight: no session flag survives a
		// reload, so the selection has to come from the persisted values alone.
		expect(page.reload().card()).toBe('custom');
		expect(page.reload().reload().card()).toBe('custom');
	});

	it('4. editing into an exact match for another preset selects THAT preset', () => {
		const page = adminPage(BALANCED);
		page.edit({ serverWrappedShareMode: 'public' });
		expect(page.card()).toBe('custom');
		// Balanced -> Public Showcase differs in three of the five fields.
		page.edit(fiveOf(byId('public-showcase').values));
		expect(page.card()).toBe('public-showcase');
		page.save();
		expect(page.reload().card()).toBe('public-showcase');
	});

	it('reverting an off-preset edit restores the shipped preset highlight', () => {
		const page = adminPage(BALANCED);
		page.edit({ serverWrappedShareMode: 'public' });
		expect(page.card()).toBe('custom');
		page.edit({ serverWrappedShareMode: 'private-oauth' });
		expect(page.card()).toBe('balanced');
	});

	it('an explicit Custom click sticks without overwriting the saved configuration', () => {
		const page = adminPage(BALANCED);
		page.clickCustom();
		expect(page.card()).toBe('custom');
		// The click staged nothing, so the underlying values are untouched: clicking a
		// shipped card clears the sticky flag and the derived match is still Balanced.
		page.clickPreset('balanced');
		expect(page.card()).toBe('balanced');
		expect(page.reload().card()).toBe('balanced');
	});

	it('a saved off-preset configuration is Custom on FIRST paint, with no interaction', () => {
		expect(adminPage(OFF_PRESET).card()).toBe('custom');
	});

	it('logoMode is not part of the admin match — Appearance cannot force Custom', () => {
		// The admin model has no logoMode field at all; the five-field match is what
		// the page feeds the resolver.
		expect(Object.keys(adminPage(BALANCED))).not.toContain('logoMode');
		expect(matchPresetPrivacy(BALANCED)).toBe('balanced');
	});
});

describe('onboarding privacy step — live detection with the untouched-seed guard intact', () => {
	// The genuine fresh-install seed: matches no shipped preset (see the
	// seed-divergence pin in tests/unit/onboarding/settings.test.ts).
	const FRESH_SEED: PrivacyPresetValues = {
		anonymizationMode: 'hybrid',
		defaultShareMode: 'public',
		serverWrappedShareMode: 'private-oauth',
		publicLandingLookup: false,
		allowUserControl: false,
		logoMode: 'always_show'
	};

	it('5a. shows NO card for the untouched fresh seed even though it matches no preset', () => {
		expect(matchPresetFull(FRESH_SEED)).toBe('custom');
		expect(onboardingStep(FRESH_SEED).card()).toBeNull();
	});

	it('5b. a preset click selects that card, and an off-preset edit selects Custom', () => {
		const step = onboardingStep(FRESH_SEED);
		step.clickPreset('balanced');
		expect(step.card()).toBe('balanced');
		step.edit({ logoMode: 'always_hide' });
		expect(step.card()).toBe('custom');
	});

	it('5c. editing into an exact match for a different preset selects that preset', () => {
		const step = onboardingStep(FRESH_SEED);
		step.clickPreset('balanced');
		step.edit(byId('anonymous-public').values);
		expect(step.card()).toBe('anonymous-public');
	});

	it('5d. the very first Advanced edit is enough to reveal Custom', () => {
		// No preset click first: the seed already resolves to 'custom', and touching
		// any control is what makes that honest rather than accusatory.
		const step = onboardingStep(FRESH_SEED);
		expect(step.card()).toBeNull();
		step.edit({ anonymizationMode: 'anonymous' });
		expect(step.card()).toBe('custom');
	});
});
