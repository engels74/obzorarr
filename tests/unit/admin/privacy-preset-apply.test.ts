import { beforeEach, describe, expect, it } from 'bun:test';
import {
	getAnonymizationMode,
	getPublicLandingLookupEnabled
} from '$lib/server/admin/settings.service';
import {
	getGlobalAllowUserControl,
	getGlobalDefaultShareMode,
	getServerWrappedShareMode
} from '$lib/server/sharing/service';
import { PRIVACY_PRESETS } from '$lib/sharing/options';
import { matchPresetPrivacy } from '$lib/sharing/preset-logic';
import { actions } from '../../../src/routes/admin/settings/privacy/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type ApplyPresetAction = NonNullable<typeof actions.applyPrivacyPreset>;
type UpdatePublicLandingLookupAction = NonNullable<typeof actions.updatePublicLandingLookup>;
type UpdateUserDefaultsAction = NonNullable<typeof actions.updateUserDefaults>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

const EPOCH = new Date(0).toISOString();
const OCC_MESSAGE = 'Settings changed in another tab. Please reload.';

function makeRequest(action: string, fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.set(k, v);
	return new Request(`http://localhost/admin/settings/privacy?/${action}`, {
		method: 'POST',
		body: formData
	});
}

function presetById(id: string) {
	const preset = PRIVACY_PRESETS.find((candidate) => candidate.id === id);
	if (!preset) throw new Error(`Unknown preset ${id}`);
	return preset;
}

/** Every version field at the given value — the "nothing has been written yet" shape. */
function versionsAt(version: string) {
	return {
		serverWrappedVersion: version,
		userDefaultsVersion: version,
		publicLandingLookupVersion: version
	};
}

async function runApply(fields: Record<string, string>) {
	const handler = actions.applyPrivacyPreset as ApplyPresetAction;
	return handler({
		request: makeRequest('applyPrivacyPreset', fields),
		locals: adminLocals
	} as Parameters<ApplyPresetAction>[0]);
}

async function runPublicLookup(fields: Record<string, string>) {
	const handler = actions.updatePublicLandingLookup as UpdatePublicLandingLookupAction;
	return handler({
		request: makeRequest('updatePublicLandingLookup', fields),
		locals: adminLocals
	} as Parameters<UpdatePublicLandingLookupAction>[0]);
}

async function runUserDefaults(fields: Record<string, string>) {
	const handler = actions.updateUserDefaults as UpdateUserDefaultsAction;
	return handler({
		request: makeRequest('updateUserDefaults', fields),
		locals: adminLocals
	} as Parameters<UpdateUserDefaultsAction>[0]);
}

/** The five admin-owned fields as currently persisted. */
async function readPersistedPrivacy() {
	const [
		anonymizationMode,
		defaultShareMode,
		serverWrappedShareMode,
		publicLandingLookup,
		allowUserControl
	] = await Promise.all([
		getAnonymizationMode(),
		getGlobalDefaultShareMode(),
		getServerWrappedShareMode(),
		getPublicLandingLookupEnabled(),
		getGlobalAllowUserControl()
	]);
	return {
		anonymizationMode,
		defaultShareMode,
		serverWrappedShareMode,
		publicLandingLookup,
		allowUserControl
	};
}

describe('privacy nested route — applyPrivacyPreset persists every section', () => {
	beforeEach(resetSharedTestDb);

	it.each(PRIVACY_PRESETS.map((preset) => preset.id))(
		'writes all five admin-owned fields for %s in one request',
		async (id) => {
			const preset = presetById(id);
			const result = await runApply({ presetId: id, ...versionsAt(EPOCH) });
			expect(result).toMatchObject({
				success: true,
				message: `Applied the ${preset.label} preset`
			});

			const persisted = await readPersistedPrivacy();
			expect(persisted).toEqual({
				anonymizationMode: preset.values.anonymizationMode,
				defaultShareMode: preset.values.defaultShareMode,
				serverWrappedShareMode: preset.values.serverWrappedShareMode,
				publicLandingLookup: preset.values.publicLandingLookup,
				allowUserControl: preset.values.allowUserControl
			});
			// ...and the persisted configuration reads back as that exact preset, so the
			// card highlight after a reload is not "Custom".
			expect(matchPresetPrivacy(persisted)).toBe(id);
		}
	);

	it('advances all three settingsVersions so each section can still save afterwards', async () => {
		const applied = (await runApply({ presetId: 'balanced', ...versionsAt(EPOCH) })) as {
			form: {
				data: {
					serverWrappedVersion: string;
					userDefaultsVersion: string;
					publicLandingLookupVersion: string;
				};
			};
			success?: boolean;
		};
		expect(applied).toMatchObject({ success: true });
		const { serverWrappedVersion, userDefaultsVersion, publicLandingLookupVersion } =
			applied.form.data;
		for (const version of [serverWrappedVersion, userDefaultsVersion, publicLandingLookupVersion]) {
			expect(version).not.toBe(EPOCH);
		}

		// A section save reusing the version the apply handed back must NOT false-409.
		const followUp = await runUserDefaults({
			defaultShareMode: 'private-link',
			allowUserControl: 'false',
			settingsVersion: userDefaultsVersion
		});
		expect(followUp).toMatchObject({ success: true });
		expect(await getGlobalDefaultShareMode()).toBe('private-link');
	});

	it('round-trips Balanced → Custom → Balanced without touching a section Save button', async () => {
		// The reported bug: going back to Balanced looked applied but only re-staged
		// client-side values, leaving the section that actually changed (public
		// landing lookup) unsaved until the admin found its own Save button.
		const balanced = presetById('balanced');
		const first = (await runApply({ presetId: 'balanced', ...versionsAt(EPOCH) })) as {
			form: { data: { publicLandingLookupVersion: string } };
		};
		expect(await getPublicLandingLookupEnabled()).toBe(balanced.values.publicLandingLookup);

		// Diverge into Custom by flipping exactly one field through its own section.
		const diverged = (await runPublicLookup({
			publicLandingLookup: 'true',
			settingsVersion: first.form.data.publicLandingLookupVersion
		})) as { form: { data: { settingsVersion: string } } };
		expect(await getPublicLandingLookupEnabled()).toBe(true);
		expect(matchPresetPrivacy(await readPersistedPrivacy())).toBe('custom');

		// Back to Balanced: one apply must persist the flipped field again.
		const second = await runApply({
			presetId: 'balanced',
			serverWrappedVersion: diverged.form.data.settingsVersion,
			userDefaultsVersion: diverged.form.data.settingsVersion,
			publicLandingLookupVersion: diverged.form.data.settingsVersion
		});
		expect(second).toMatchObject({ success: true });
		expect(await getPublicLandingLookupEnabled()).toBe(false);
		expect(matchPresetPrivacy(await readPersistedPrivacy())).toBe('balanced');
	});
});

describe('privacy nested route — applyPrivacyPreset OCC', () => {
	beforeEach(resetSharedTestDb);

	/** Apply Public Showcase, then return the version every group now holds. */
	async function seedPublicShowcase(): Promise<string> {
		const result = (await runApply({ presetId: 'public-showcase', ...versionsAt(EPOCH) })) as {
			form: { data: { serverWrappedVersion: string } };
			success?: boolean;
		};
		expect(result).toMatchObject({ success: true });
		return result.form.data.serverWrappedVersion;
	}

	it.each([
		['serverWrappedVersion', 'Server-wide wrapped sharing'],
		['userDefaultsVersion', 'User sharing defaults'],
		['publicLandingLookupVersion', 'Public landing lookup']
	])('409s on a stale %s and names the section that moved', async (field, label) => {
		const fresh = await seedPublicShowcase();
		const before = await readPersistedPrivacy();

		const result = (await runApply({
			presetId: 'maximum-privacy',
			...versionsAt(fresh),
			[field]: EPOCH
		})) as { status: number; data: { conflict?: boolean; error?: string } };

		expect(result).toMatchObject({ status: 409, data: { conflict: true } });
		// Sentinel preserved so `surfaceOccConflict` still keys on it and offers Reload.
		expect(result.data.error).toContain(OCC_MESSAGE);
		expect(result.data.error).toContain(label);
		// Partial-conflict policy: the whole apply is refused, so NOTHING moved.
		expect(await readPersistedPrivacy()).toEqual(before);
	});

	it('names every stale section when more than one moved', async () => {
		const fresh = await seedPublicShowcase();
		const result = (await runApply({
			presetId: 'balanced',
			serverWrappedVersion: EPOCH,
			userDefaultsVersion: EPOCH,
			publicLandingLookupVersion: fresh
		})) as { status: number; data: { error?: string } };
		expect(result.status).toBe(409);
		expect(result.data.error).toContain('Server-wide wrapped sharing');
		expect(result.data.error).toContain('User sharing defaults');
		expect(result.data.error).not.toContain('Public landing lookup');
		expect(result.data.error).toContain('Nothing was applied');
	});

	it.each(['serverWrappedVersion', 'userDefaultsVersion', 'publicLandingLookupVersion'])(
		'rejects a blank %s as a 409 conflict',
		async (field) => {
			const result = await runApply({
				presetId: 'balanced',
				...versionsAt(EPOCH),
				[field]: ''
			});
			expect(result).toMatchObject({
				status: 409,
				data: { conflict: true, error: OCC_MESSAGE }
			});
			// Nothing was written, so the five fields still read as factory defaults.
			expect(await getPublicLandingLookupEnabled()).toBe(false);
		}
	);

	it('does not false-409 two consecutive applies in the same page load', async () => {
		const first = (await runApply({ presetId: 'balanced', ...versionsAt(EPOCH) })) as {
			form: {
				data: {
					serverWrappedVersion: string;
					userDefaultsVersion: string;
					publicLandingLookupVersion: string;
				};
			};
		};
		await new Promise<void>((resolve) => setTimeout(resolve, 10));
		const second = await runApply({
			presetId: 'anonymous-public',
			serverWrappedVersion: first.form.data.serverWrappedVersion,
			userDefaultsVersion: first.form.data.userDefaultsVersion,
			publicLandingLookupVersion: first.form.data.publicLandingLookupVersion
		});
		expect(second).toMatchObject({ success: true });
		expect(matchPresetPrivacy(await readPersistedPrivacy())).toBe('anonymous-public');
	});
});

describe('privacy nested route — applyPrivacyPreset rejects non-presets', () => {
	beforeEach(resetSharedTestDb);

	it('rejects the client-only Custom card as a 400 and writes nothing', async () => {
		// Custom has no value-map by definition. It must never reach a write path —
		// seeding Balanced from it would silently overwrite an off-preset config
		// (ISSUE-001), which is exactly why the client keeps it a pure highlight.
		const result = await runApply({ presetId: 'custom', ...versionsAt(EPOCH) });
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
		expect(await getAnonymizationMode()).toBe('hybrid');
		expect(await getPublicLandingLookupEnabled()).toBe(false);
	});

	it('rejects an unknown presetId as a 400', async () => {
		const result = await runApply({ presetId: 'ultra-private', ...versionsAt(EPOCH) });
		expect(result).toMatchObject({ status: 400, data: { error: 'Invalid input' } });
	});

	it('rejects a missing presetId as a 400 that names the actual problem', async () => {
		const result = await runApply({ ...versionsAt(EPOCH) });
		// Distinct from the generic schema-failure copy: this 400 is the one the client
		// surfaces verbatim, so it has to say what happened.
		expect(result).toMatchObject({ status: 400, data: { error: 'No preset selected' } });
	});

	it('splits the two 400 shapes on form.valid, which is what the client keys on', async () => {
		// `presetId` is `.optional()`, so an ABSENT field passes the schema and is only
		// refused afterwards by the `!preset` guard: the returned form is still valid,
		// so superForm's `onUpdated` would take its SUCCESS branch. The client's
		// `guardSettingsUpdate` therefore cancels on `form.valid`, not on the status.
		const missing = (await runApply({ ...versionsAt(EPOCH) })) as {
			data: { form: { valid: boolean } };
		};
		expect(missing.data.form.valid).toBe(true);

		// A value the enum rejects fails validation instead, and MUST stay valid ===
		// false so it reaches `onUpdated`'s field-error branch rather than a toast.
		const unknown = (await runApply({
			presetId: 'ultra-private',
			...versionsAt(EPOCH)
		})) as { data: { form: { valid: boolean } } };
		expect(unknown.data.form.valid).toBe(false);
	});
});

describe('privacy preset apply — client wiring (no DOM harness in this suite)', () => {
	const PAGE = 'src/routes/admin/settings/privacy/+page.svelte';
	const read = async () => Bun.file(PAGE).text();
	const bodyOf = (src: string, opener: string) => {
		const fn = src.slice(src.indexOf(opener));
		return fn.slice(0, fn.indexOf('\n}'));
	};

	it('submits the apply action from the presets card, carrying all three versions', async () => {
		const src = await read();
		expect(src).toContain('action="?/applyPrivacyPreset"');
		for (const field of [
			'presetId',
			'serverWrappedVersion',
			'userDefaultsVersion',
			'publicLandingLookupVersion'
		]) {
			expect(src).toContain(`name="${field}"`);
		}
		// Versions are rendered from the sections' own live stores, so a submit can
		// never carry a version the admin's page has already advanced past.
		expect(src).toContain(
			'name="serverWrappedVersion"\n\t\t\t\t\tvalue={$serverWrappedData.settingsVersion}'
		);
		expect(src).toContain('name="userDefaultsVersion" value={$userDefaultsData.settingsVersion}');
		expect(src).toContain(
			'name="publicLandingLookupVersion"\n\t\t\t\t\tvalue={$publicLandingLookupData.settingsVersion}'
		);
	});

	it('routes the preset form through the shared OCC guard', async () => {
		const src = await read();
		// Without surfaceOccConflict a stale 409 renders a success toast (ISSUE-006).
		const form = src.slice(src.indexOf('const presetForm = superForm('));
		expect(form.slice(0, form.indexOf('\n});'))).toContain('onUpdate: guardSettingsUpdate');
		expect(src).toContain('surfaceOccConflict(event);');
	});

	it('cancels every post-validation failure instead of testing the status code', async () => {
		const src = await read();
		// `applyPrivacyPreset` returns fail(400, { form, error }) from its `!preset`
		// guard on a payload that PASSED the schema (`presetId` is `.optional()`), so
		// the returned form is still `valid` and `onUpdated` took its success branch —
		// surfacing the client's own "Unknown preset" instead of the action's message.
		// A `status >= 500` test cannot see that.
		const guard = bodyOf(src, 'function guardSettingsUpdate(');
		expect(guard).toContain('if (!isPostValidationFailure(result.data)) return;');
		// No status arithmetic left anywhere in the guard, spelled or destructured.
		expect(guard).not.toContain('result.status');
		expect(guard).not.toContain('status');
		// The OCC 409 is already surfaced and cancelled by surfaceOccConflict; falling
		// through would toast twice, since a post-write 409 is post-validation too.
		const surfaceAt = guard.indexOf('surfaceOccConflict(event);');
		const occReturnAt = guard.indexOf('if (isOccConflict(result.data)) return;');
		expect(surfaceAt).toBeGreaterThan(-1);
		expect(occReturnAt).toBeGreaterThan(surfaceAt);
	});

	it('persists on a card click and only stages on the arrow keys', async () => {
		const src = await read();
		// The card click is the persist path.
		expect(src).toContain('onclick={() => applyPrivacyPreset(preset)}');
		const apply = bodyOf(src, 'async function applyPrivacyPreset(');
		expect(apply).toContain("if (commit === 'stage-only') return;");
		expect(apply).toContain('presetFormEl?.requestSubmit();');
		// Arrow keys must NOT fire one three-section write per keypress.
		const dispatch = bodyOf(src, 'function selectPresetAtIndex(');
		expect(dispatch).toContain("applyPrivacyPreset(preset, 'stage-only');");
		expect(dispatch).not.toContain('applyPrivacyPreset(preset);');
	});

	it('skips the submit when the clicked card is already the saved configuration', async () => {
		const src = await read();
		// A redundant apply is not free: `setPrivacyPresetAtomic` stamps a
		// strictly-advancing `updatedAt` on all three OCC groups, so a no-op card
		// click would 409 every other admin tab without changing a single value.
		const apply = bodyOf(src, 'async function applyPrivacyPreset(');
		expect(apply).toContain('if (presetMatchesSaved(preset)) return;');
		// The skip must be decided BEFORE the submit and AFTER staging, so clicking
		// the saved card still reverts unsaved Advanced edits back to that preset.
		const stageAt = apply.indexOf('assignPresetValues(preset.values);');
		const skipAt = apply.indexOf('if (presetMatchesSaved(preset)) return;');
		const submitAt = apply.indexOf('presetFormEl?.requestSubmit();');
		expect(stageAt).toBeGreaterThan(-1);
		expect(skipAt).toBeGreaterThan(stageAt);
		expect(submitAt).toBeGreaterThan(skipAt);
		// One implementation of "is this preset already persisted", shared with the
		// Apply button, or the click path and the button could disagree.
		expect(src).toContain(
			'let applicablePresetIsSaved = $derived(\n\tapplicablePreset !== null && presetMatchesSaved(applicablePreset)\n);'
		);
	});

	it('refuses every radiogroup mutation while an apply is in flight', async () => {
		const src = await read();
		// The guard has to precede the staging call: the in-flight apply rewrites the
		// stores from its own response, so staging underneath it flickers the
		// highlight and the "After you save" preview and is then silently undone.
		const apply = bodyOf(src, 'async function applyPrivacyPreset(');
		const guardAt = apply.indexOf('if ($presetSubmitting) return;');
		const stageAt = apply.indexOf('assignPresetValues(preset.values);');
		expect(guardAt).toBeGreaterThan(-1);
		expect(stageAt).toBeGreaterThan(guardAt);
		expect(apply.indexOf('privacyInteracted = true;')).toBeGreaterThan(guardAt);
		expect(apply.indexOf('customPresetChosen = false;')).toBeGreaterThan(guardAt);
		// Pinned as the FIRST statement rather than merely ahead of today's three
		// mutations, so a fourth one added above the guard cannot re-open the defect.
		const firstStatement = apply
			.split('\n')
			.slice(1)
			.map((line) => line.trim())
			.find((line) => line.length > 0 && !line.startsWith('//'));
		expect(firstStatement).toBe('if ($presetSubmitting) return;');
		// Custom mutates only the highlight, but `onUpdated` clears
		// `customPresetChosen`, so it would be undone just the same.
		const custom = bodyOf(src, 'function selectCustomPreset(');
		const customGuardAt = custom.indexOf('if ($presetSubmitting) return;');
		expect(customGuardAt).toBeGreaterThan(-1);
		expect(custom.indexOf('customPresetChosen = true;')).toBeGreaterThan(customGuardAt);
		// Reporting the refusal keeps the roving tab stop on the still-selected card
		// instead of moving focus to a card that never became aria-checked.
		const dispatch = bodyOf(src, 'function selectPresetAtIndex(');
		expect(dispatch).toContain('if ($presetSubmitting) return false;');
		// The refusal is total, so the group has to say it is busy. Not the native
		// `disabled` attribute: that drops the card out of the tab order and breaks
		// the single roving tab stop.
		const group = src.slice(src.indexOf('role="radiogroup"'));
		expect(group.slice(0, group.indexOf('>'))).toContain('aria-busy={$presetSubmitting}');
		expect(src).not.toContain('disabled={$presetSubmitting}');
	});

	it('offers an explicit Apply button that is enabled only when it would change something', async () => {
		const src = await read();
		const applyForm = src.slice(src.indexOf('action="?/applyPrivacyPreset"'));
		const button = applyForm.slice(applyForm.indexOf('<Button'), applyForm.indexOf('</Button>'));
		expect(button).toContain('type="submit"');
		expect(button).toContain('class="tap-target"');
		expect(button).toContain('disabled={!canApplyPreset}');
		// The status line is the button's accessible description, so a disabled button
		// still explains itself instead of being a dead end.
		expect(button).toContain('aria-describedby="preset-apply-status"');
		expect(src).toContain('Apply {applicablePreset.label}');
		expect(src).toContain(
			'let canApplyPreset = $derived(\n\tapplicablePreset !== null && !applicablePresetIsSaved && !$presetSubmitting\n);'
		);
		// "Already saved" is measured against the per-section saved baselines, not the
		// staged stores, or the button would disable itself the moment a card staged.
		const savedBlock = bodyOf(src, 'function presetMatchesSaved(');
		expect(savedBlock).toContain('savedServerWrapped.anonymizationMode');
		expect(savedBlock).toContain('savedUserDefaults.defaultShareMode');
		expect(savedBlock).toContain('savedPublicLandingLookup.publicLandingLookup');
		expect(savedBlock).not.toContain('$serverWrappedData');
	});

	it('never submits the Custom card and never stages from it', async () => {
		const src = await read();
		// presetIdToSubmit is empty for Custom, so the enum can never see it.
		expect(src).toContain("let presetIdToSubmit = $derived(applicablePreset?.id ?? '');");
		const custom = bodyOf(src, 'function selectCustomPreset(');
		expect(custom).not.toContain('assignPresetValues');
		expect(custom).not.toContain('requestSubmit');
		expect(custom).toContain('advancedOpen = true;');
	});

	it('advances all three saved baselines and versions on a successful apply', async () => {
		const src = await read();
		const form = src.slice(src.indexOf('const presetForm = superForm('));
		const block = form.slice(0, form.indexOf('\n});'));
		// Without these the Advanced sections below would still read as "staged" and
		// the unsaved-sections banner would linger after a successful write.
		expect(block).toContain('savedServerWrapped = {');
		expect(block).toContain('savedUserDefaults = {');
		expect(block).toContain('savedPublicLandingLookup = {');
		expect(block).toContain(
			'$serverWrappedData.settingsVersion = updated.data.serverWrappedVersion;'
		);
		expect(block).toContain(
			'$userDefaultsData.settingsVersion = updated.data.userDefaultsVersion;'
		);
		expect(block).toContain(
			'$publicLandingLookupData.settingsVersion = updated.data.publicLandingLookupVersion;'
		);
	});

	it('drops the stale ISSUE-006 force-expand workaround', async () => {
		const src = await read();
		// The accordion was force-opened so the "{n} unsaved sections" alert never
		// pointed at hidden Save buttons. Applying now persists, so there is nothing
		// to point at — and the comment claiming otherwise would be a lie.
		const apply = bodyOf(src, 'async function applyPrivacyPreset(');
		expect(apply).not.toContain('advancedOpen = true;');
		expect(src).not.toContain('ISSUE-006: applying a preset stages unsaved changes');
	});
});
