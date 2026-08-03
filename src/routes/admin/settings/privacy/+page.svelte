<script lang="ts">
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
import EyeOffIcon from '@lucide/svelte/icons/eye-off';
import GlobeIcon from '@lucide/svelte/icons/globe';
import ImageIcon from '@lucide/svelte/icons/image';
import InfoIcon from '@lucide/svelte/icons/info';
import LinkIcon from '@lucide/svelte/icons/link';
import LockIcon from '@lucide/svelte/icons/lock';
import ScaleIcon from '@lucide/svelte/icons/scale';
import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
import ShieldUserIcon from '@lucide/svelte/icons/shield-user';
import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
import UserCogIcon from '@lucide/svelte/icons/user-cog';
import UsersIcon from '@lucide/svelte/icons/users';
import UsersRoundIcon from '@lucide/svelte/icons/users-round';
import VenetianMaskIcon from '@lucide/svelte/icons/venetian-mask';
import type { ActionResult } from '@sveltejs/kit';
import type { Component } from 'svelte';
import { tick } from 'svelte';
import { superForm } from 'sveltekit-superforms';
import { enhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import {
	SettingsActionBar,
	SettingsOptionCard,
	SettingsToggleRow
} from '$lib/components/settings/index.js';
import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card/index.js';
import * as Collapsible from '$lib/components/ui/collapsible/index.js';
import * as Form from '$lib/components/ui/form/index.js';
import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
import * as Tooltip from '$lib/components/ui/tooltip/index.js';
import {
	CUSTOM_PRIVACY_PRESET,
	PRIVACY_PRESETS,
	PRIVACY_PREVIEW_ROW_TOOLTIPS,
	PRIVACY_PREVIEW_VALUE_TOOLTIPS,
	type PrivacyPreset,
	type PrivacyPresetId,
	type PrivacyPresetPrivacyKey,
	type PrivacyPresetValues,
	type PrivacyPreviewRowKey,
	publicLandingLookupCopy,
	shareDefaultCopy
} from '$lib/sharing/options';
import {
	customPresetSeedValues,
	derivePreview,
	matchPresetPrivacy,
	PREVIEW_NAME_DISPLAY_LABELS,
	PREVIEW_PER_USER_DEFAULT_LABELS,
	PREVIEW_RECAP_VISIBILITY_LABELS,
	type PrivacyPreviewModel,
	resolvePresetSelection
} from '$lib/sharing/preset-logic';
import { handleFormToast } from '$lib/utils/form-toast';
import { surfaceOccConflict } from '$lib/utils/occ-form';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

// superForm `onUpdate` guard for the three settings forms. Runs the shared OCC
// stale-write guard first (cancels on fail(409,{conflict:true}) — ISSUE-006),
// then also cancels on a *server-side* failure whose form is still schema-valid:
// the actions return `fail(500, { form, error })` from their catch blocks AFTER
// validation, so `onUpdated`'s `form.valid` stays true and would otherwise fire a
// false "Saved" toast + advance the saved baseline even though nothing persisted.
// fail(400) validation failures have `form.valid === false` and are left alone so
// they still reach `onUpdated`'s else branch to render field errors. (Locally
// scoped — the shared occ-form helper is intentionally not generalised here.)
function guardSettingsUpdate(event: { result: ActionResult; cancel: () => void }): void {
	surfaceOccConflict(event);
	const { result } = event;
	if (result.type === 'failure' && result.status >= 500) {
		const message =
			(result.data as { error?: string } | undefined)?.error ?? 'Failed to save. Please try again.';
		handleFormToast({ error: message });
		event.cancel();
	}
}

// Per-section "last saved" baselines. Each advances ONLY after its own section
// saves successfully (in that form's onUpdated). The unsaved-sections banner and
// the "Current (saved)" preview read these — never the original load snapshot —
// so a save in one OCC group correctly clears just that section's pending state.
// These are deliberate $state snapshots, NOT $derived from `data`: $derived would
// re-track every load and zero out unsavedSectionCount after navigation, defeating
// the per-section unsaved tracking. The state_referenced_locally suppressors are
// intentional — we want the one-time mount snapshot. (A re-load from a concurrent
// external write can leave "Current (saved)" one version behind until the next
// save/navigation; that's cosmetic and OCC catches any real overwrite conflict.)
// svelte-ignore state_referenced_locally
let savedServerWrapped = $state({
	anonymizationMode: data.serverWrappedForm.data.anonymizationMode,
	serverWrappedShareMode: data.serverWrappedForm.data.serverWrappedShareMode
});
// svelte-ignore state_referenced_locally
let savedUserDefaults = $state({
	defaultShareMode: data.userDefaultsForm.data.defaultShareMode,
	allowUserControl: data.userDefaultsForm.data.allowUserControl
});
// svelte-ignore state_referenced_locally
let savedPublicLandingLookup = $state({
	publicLandingLookup: data.publicLandingLookupForm.data.publicLandingLookup
});

// svelte-ignore state_referenced_locally
const serverWrappedForm = superForm(data.serverWrappedForm, {
	resetForm: false,
	invalidateAll: false,
	onUpdate: guardSettingsUpdate,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			savedServerWrapped = {
				anonymizationMode: updated.data.anonymizationMode,
				serverWrappedShareMode: updated.data.serverWrappedShareMode
			};
			handleFormToast({ success: true, message: updated.message ?? 'Saved' });
		} else {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
		}
	}
});
const {
	form: serverWrappedData,
	enhance: serverWrappedEnhance,
	submitting: serverWrappedSubmitting
} = serverWrappedForm;

// svelte-ignore state_referenced_locally
const userDefaultsForm = superForm(data.userDefaultsForm, {
	resetForm: false,
	invalidateAll: false,
	onUpdate: guardSettingsUpdate,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			savedUserDefaults = {
				defaultShareMode: updated.data.defaultShareMode,
				allowUserControl: updated.data.allowUserControl
			};
			handleFormToast({ success: true, message: updated.message ?? 'Saved' });
		} else {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
		}
	}
});
const {
	form: userDefaultsData,
	enhance: userDefaultsEnhance,
	submitting: userDefaultsSubmitting
} = userDefaultsForm;

// svelte-ignore state_referenced_locally
const publicLandingLookupForm = superForm(data.publicLandingLookupForm, {
	resetForm: false,
	invalidateAll: false,
	onUpdate: guardSettingsUpdate,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			savedPublicLandingLookup = {
				publicLandingLookup: updated.data.publicLandingLookup
			};
			handleFormToast({ success: true, message: updated.message ?? 'Saved' });
		} else {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
		}
	}
});
const {
	form: publicLandingLookupData,
	enhance: publicLandingLookupEnhance,
	submitting: publicLandingLookupSubmitting
} = publicLandingLookupForm;

let bulkApplyDialogOpen = $state(false);
let isBulkApplying = $state(false);

// Advanced controls stay collapsed until the administrator opens them or stages
// a preset. Public lookup no longer creates a contradictory default state.
let advancedOpen = $state(false);

// ISSUE-007: expanding "Advanced options" can push each section's Save button
// below the fold. On expand only, scroll the freshly-revealed section to the top
// of the viewport (after the DOM settles) so its content + actions stay reachable.
// Collapsing leaves the scroll position alone.
let advancedSectionRef = $state<HTMLDivElement | null>(null);
async function handleAdvancedToggle(open: boolean): Promise<void> {
	if (!open) return;
	await tick();
	advancedSectionRef?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// The active preset is matched over the FIVE admin-owned fields only — logoMode
// is excluded (it lives on the Appearance route), so a perfect five-field match
// never reads "Custom" because of a differing persisted logoMode.
let selectedPreset = $derived(
	matchPresetPrivacy({
		anonymizationMode: $serverWrappedData.anonymizationMode,
		defaultShareMode: $userDefaultsData.defaultShareMode,
		serverWrappedShareMode: $serverWrappedData.serverWrappedShareMode,
		publicLandingLookup: $publicLandingLookupData.publicLandingLookup,
		allowUserControl: $userDefaultsData.allowUserControl
	})
);

// Dual preview, both WITHOUT logoMode (so neither renders a logo line — admin
// does not manage logoMode here). "After you save" reflects the staged store
// values; "Current (saved)" reflects each section's last-saved baseline.
let stagedPreview: PrivacyPreviewModel = $derived(
	derivePreview({
		anonymizationMode: $serverWrappedData.anonymizationMode,
		defaultShareMode: $userDefaultsData.defaultShareMode,
		serverWrappedShareMode: $serverWrappedData.serverWrappedShareMode,
		publicLandingLookup: $publicLandingLookupData.publicLandingLookup,
		allowUserControl: $userDefaultsData.allowUserControl
	})
);
let savedPreview: PrivacyPreviewModel = $derived(
	derivePreview({
		anonymizationMode: savedServerWrapped.anonymizationMode,
		defaultShareMode: savedUserDefaults.defaultShareMode,
		serverWrappedShareMode: savedServerWrapped.serverWrappedShareMode,
		publicLandingLookup: savedPublicLandingLookup.publicLandingLookup,
		allowUserControl: savedUserDefaults.allowUserControl
	})
);

// Per-section divergence: staged store value vs. that section's own last-saved
// baseline. The banner counts how many sections still need their Save button.
let serverWrappedUnsaved = $derived(
	$serverWrappedData.anonymizationMode !== savedServerWrapped.anonymizationMode ||
		$serverWrappedData.serverWrappedShareMode !== savedServerWrapped.serverWrappedShareMode
);
let userDefaultsUnsaved = $derived(
	$userDefaultsData.defaultShareMode !== savedUserDefaults.defaultShareMode ||
		$userDefaultsData.allowUserControl !== savedUserDefaults.allowUserControl
);
let publicLandingUnsaved = $derived(
	$publicLandingLookupData.publicLandingLookup !== savedPublicLandingLookup.publicLandingLookup
);
let unsavedSectionCount = $derived(
	(serverWrappedUnsaved ? 1 : 0) + (userDefaultsUnsaved ? 1 : 0) + (publicLandingUnsaved ? 1 : 0)
);

// Mirrors onboarding's `privacyTouched` gate (ISSUE-001): the Custom card only
// lights up once the admin has actually interacted. Clicking a preset card sets
// the flag directly; editing any advanced control diverges that section from its
// saved baseline, which `unsavedSectionCount` already tracks. Without the gate a
// persisted-but-off-preset configuration would light Custom on load, before the
// admin had touched anything.
let presetCardClicked = $state(false);
let privacyTouched = $derived(presetCardClicked || unsavedSectionCount > 0);

// Sticky "the admin explicitly clicked the Custom card" flag. While set, Custom
// stays highlighted even when the staged values happen to match a shipped preset
// (exactly what happens right after Custom seeds Balanced on a first pick).
// Cleared by clicking any of the five real cards.
let customPresetChosen = $state(false);

// The card that renders as selected: the derived five-field match, the sticky
// Custom flag, or no card at all before the admin has interacted.
let selectedPresetCard = $derived(
	resolvePresetSelection(selectedPreset, privacyTouched, customPresetChosen)
);

// Applying a preset is pure client-side state mutation across the three stores.
// It writes the FIVE admin-owned fields and NEVER touches logoMode. Persistence
// still flows through each section's existing Save button + OCC group.
function assignPresetValues(values: Pick<PrivacyPresetValues, PrivacyPresetPrivacyKey>) {
	$serverWrappedData.anonymizationMode = values.anonymizationMode;
	$serverWrappedData.serverWrappedShareMode = values.serverWrappedShareMode;
	$userDefaultsData.defaultShareMode = values.defaultShareMode;
	$userDefaultsData.allowUserControl = values.allowUserControl;
	$publicLandingLookupData.publicLandingLookup = values.publicLandingLookup;
}

function applyPrivacyPreset(preset: PrivacyPreset) {
	presetCardClicked = true;
	customPresetChosen = false;
	assignPresetValues(preset.values);
	// ISSUE-006: applying a preset stages unsaved changes whose per-section Save
	// buttons live inside the (possibly collapsed) Advanced accordion. Auto-expand
	// so the "{n} unsaved sections" alert never points at hidden Save buttons.
	// Only ever opens — never force-collapses — and both the card click and the
	// keyboard arrow handler route through here. (No state-in-$effect: this is an
	// explicit user action, respecting the file's no-effect-writes rule.)
	advancedOpen = true;
}

// Picking Custom seeds Balanced ONLY as the first interaction of the session;
// afterwards it moves the highlight and stages nothing (customPresetSeedValues
// owns that rule). Advanced is expanded either way — Custom's whole point is the
// controls below it.
function selectCustomPreset() {
	const seed = customPresetSeedValues(privacyTouched);
	if (seed) assignPresetValues(seed);
	presetCardClicked = true;
	customPresetChosen = true;
	advancedOpen = true;
}

// Use the same APG roving-tabindex radio pattern as onboarding: the selected
// card is the single Tab stop, with the first card reachable when no card is
// selected. The Custom card occupies the final index (PRIVACY_PRESETS.length).
let presetButtons = $state<(HTMLButtonElement | null)[]>([]);

const CUSTOM_PRESET_INDEX = PRIVACY_PRESETS.length;

function selectPresetAtIndex(index: number): boolean {
	if (index === CUSTOM_PRESET_INDEX) {
		selectCustomPreset();
		return true;
	}
	const preset = PRIVACY_PRESETS[index];
	if (!preset) return false;
	applyPrivacyPreset(preset);
	return true;
}

let presetTabIndex = $derived.by(() => {
	if (selectedPresetCard === 'custom') return CUSTOM_PRESET_INDEX;
	const i = PRIVACY_PRESETS.findIndex((p) => p.id === selectedPresetCard);
	return i === -1 ? 0 : i;
});

function handlePresetKeydown(event: KeyboardEvent, index: number) {
	const last = CUSTOM_PRESET_INDEX;
	let target: number;
	switch (event.key) {
		case 'ArrowRight':
		case 'ArrowDown':
			target = index === last ? 0 : index + 1;
			break;
		case 'ArrowLeft':
		case 'ArrowUp':
			target = index === 0 ? last : index - 1;
			break;
		case 'Home':
			target = 0;
			break;
		case 'End':
			target = last;
			break;
		default:
			return;
	}
	event.preventDefault();
	if (!selectPresetAtIndex(target)) return;
	presetButtons[target]?.focus();
}

const presetIcons: Record<PrivacyPresetId, Component> = {
	'maximum-privacy': ShieldCheckIcon,
	'internal-community': UsersRoundIcon,
	balanced: ScaleIcon,
	'public-showcase': GlobeIcon,
	'anonymous-public': VenetianMaskIcon
};
</script>

<svelte:head>
	<title>Privacy — Settings — Obzorarr</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	{#snippet tipDt(key: PrivacyPreviewRowKey, label: string)}
		{@const tip = PRIVACY_PREVIEW_ROW_TOOLTIPS[key]}
		<dt class="text-muted-foreground">
			<Tooltip.Root>
				<Tooltip.Trigger
					class="inline-flex items-center gap-1 rounded text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					{label}
					<InfoIcon class="size-3 shrink-0 opacity-70" aria-hidden="true" />
				</Tooltip.Trigger>
				<Tooltip.Content
					side="top"
					sideOffset={6}
					collisionPadding={16}
					portalProps={{ to: 'body' }}
				>
					<div class="flex flex-col gap-1.5 text-left">
						<p><span class="font-semibold">Admin:</span> {tip.admin}</p>
						<p><span class="font-semibold">Visitor:</span> {tip.visitor}</p>
						<p><span class="font-semibold">Member:</span> {tip.member}</p>
					</div>
				</Tooltip.Content>
			</Tooltip.Root>
		</dt>
	{/snippet}

	{#snippet previewDd(tip: string, label: string)}
		<dd class="text-right font-medium">
			<Tooltip.Root>
				<Tooltip.Trigger
					class="inline-flex items-center gap-1 rounded text-right font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					{label}
					<InfoIcon class="size-3 shrink-0 opacity-70" aria-hidden="true" />
				</Tooltip.Trigger>
				<Tooltip.Content
					side="top"
					sideOffset={6}
					collisionPadding={16}
					portalProps={{ to: 'body' }}
				>
					<p class="text-left">{tip}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		</dd>
	{/snippet}

	{#snippet previewRows(model: PrivacyPreviewModel)}
		<dl class="space-y-1.5 text-sm">
			<div class="flex justify-between gap-3">
				{@render tipDt('namesInStats', 'Names in stats')}
				{@render previewDd(
					PRIVACY_PREVIEW_VALUE_TOOLTIPS.namesInStats[model.nameDisplay],
					PREVIEW_NAME_DISPLAY_LABELS[model.nameDisplay]
				)}
			</div>
			<div class="flex justify-between gap-3">
				{@render tipDt('newUserDefault', 'New-user default')}
				{@render previewDd(
					PRIVACY_PREVIEW_VALUE_TOOLTIPS.newUserDefault[model.perUserDefaultForNewUsers],
					PREVIEW_PER_USER_DEFAULT_LABELS[model.perUserDefaultForNewUsers]
				)}
			</div>
			<div class="flex justify-between gap-3">
				{@render tipDt('serverWideRecap', 'Server-wide recap')}
				{@render previewDd(
					PRIVACY_PREVIEW_VALUE_TOOLTIPS.serverWideRecap[model.serverRecapVisibility],
					PREVIEW_RECAP_VISIBILITY_LABELS[model.serverRecapVisibility]
				)}
			</div>
			<div class="flex justify-between gap-3">
				{@render tipDt('landingLookupForm', 'Landing lookup form')}
				{@render previewDd(
					PRIVACY_PREVIEW_VALUE_TOOLTIPS.landingLookupForm[model.landingLookupForm],
					model.landingLookupForm === 'visible' ? 'Shown' : 'Hidden'
				)}
			</div>
		</dl>
	{/snippet}

	<Card>
		<CardHeader>
			<CardTitle>Privacy presets</CardTitle>
			<CardDescription>
				Pick a recommended starting point, then save each affected section below. These presets
				stage five privacy fields here; the full onboarding presets also set the Wrapped logo to
				Always Show.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div
				class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
				role="radiogroup"
				aria-label="Privacy preset"
			>
				{#each PRIVACY_PRESETS as preset, i (preset.id)}
					{@const PresetIcon = presetIcons[preset.id]}
					<button
						bind:this={presetButtons[i]}
						type="button"
						role="radio"
						aria-checked={selectedPresetCard === preset.id}
						tabindex={i === presetTabIndex ? 0 : -1}
						onclick={() => applyPrivacyPreset(preset)}
						onkeydown={(event) => handlePresetKeydown(event, i)}
						class={selectedPresetCard === preset.id
						? 'flex flex-col items-start gap-2 rounded-lg border border-primary bg-primary/5 p-4 text-left ring-1 ring-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
						: 'flex flex-col items-start gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'}
						>
						<span class="flex items-center gap-2 text-sm font-medium">
							<PresetIcon class="size-4 text-primary" />
							{preset.label}
						</span>
						<span class="text-xs text-muted-foreground">{preset.description}</span>
						<span class="text-xs font-medium text-primary/80">{preset.exposureSummary}</span>
					</button>
				{/each}
				<!-- Sixth card: client-only "Custom". Rendered outside the {#each} so
				     PRIVACY_PRESETS stays exactly the five shipped value-maps. It holds the
				     final roving-tabindex slot (CUSTOM_PRESET_INDEX) and carries no
				     exposureSummary — the Preview card below already states what the staged
				     fields expose. -->
				<button
					bind:this={presetButtons[CUSTOM_PRESET_INDEX]}
					type="button"
					role="radio"
					aria-checked={selectedPresetCard === 'custom'}
					tabindex={CUSTOM_PRESET_INDEX === presetTabIndex ? 0 : -1}
					onclick={selectCustomPreset}
					onkeydown={(event) => handlePresetKeydown(event, CUSTOM_PRESET_INDEX)}
					class={selectedPresetCard === 'custom'
					? 'flex flex-col items-start gap-2 rounded-lg border border-primary bg-primary/5 p-4 text-left ring-1 ring-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
					: 'flex flex-col items-start gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'}
					>
					<span class="flex items-center gap-2 text-sm font-medium">
						<SlidersHorizontalIcon class="size-4 text-primary" />
						{CUSTOM_PRIVACY_PRESET.label}
					</span>
					<span class="text-xs text-muted-foreground">{CUSTOM_PRIVACY_PRESET.description}</span>
				</button>
			</div>
			{#if selectedPreset === 'custom'}
				<p class="text-sm italic text-muted-foreground">
					Custom configuration — your settings don’t match a preset.
				</p>
			{/if}
			<div class="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
				<ImageIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<div class="space-y-1">
					<p class="font-medium">Wrapped logo</p>
					<p class="text-muted-foreground">
						Every shipped preset uses Always Show. This admin page does not change Appearance
						settings, so confirm the current value under
						<a
							href="/admin/settings/appearance"
							class="inline-flex items-center gap-1 underline"
						>Appearance<ExternalLinkIcon class="size-3" /></a>.
					</p>
				</div>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Preview</CardTitle>
			<CardDescription>
				What your saved and staged settings expose. Logo is managed on Appearance and is not shown here.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if unsavedSectionCount > 0}
				<Alert>
					<TriangleAlertIcon />
					<AlertDescription>
						{unsavedSectionCount} unsaved section{unsavedSectionCount === 1 ? '' : 's'} — staged changes
						aren't live until you save each section below.
					</AlertDescription>
				</Alert>
			{/if}
			<Tooltip.Provider delayDuration={150}>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2 rounded-lg border border-border p-4">
						<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current (saved)</p>
						{@render previewRows(savedPreview)}
					</div>
					<div
						class={unsavedSectionCount > 0
							? 'space-y-2 rounded-lg border border-primary bg-primary/5 p-4'
							: 'space-y-2 rounded-lg border border-border p-4'}
					>
						<p class="text-xs font-semibold uppercase tracking-wide text-primary/80">After you save</p>
						{@render previewRows(stagedPreview)}
					</div>
				</div>
			</Tooltip.Provider>
		</CardContent>
	</Card>

	<div bind:this={advancedSectionRef}>
	<Collapsible.Root bind:open={advancedOpen} onOpenChange={handleAdvancedToggle} class="space-y-6">
		<Collapsible.Trigger
			class="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
		>
			<span class="flex items-center gap-2">
				Advanced options
			</span>
			<ChevronDownIcon class={advancedOpen ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'} />
		</Collapsible.Trigger>
		<Collapsible.Content class="space-y-6 pt-6">
	<Card>
		<CardHeader>
			<CardTitle>Server-wide wrapped sharing</CardTitle>
			<CardDescription>
				Controls anonymization and the share mode for the aggregate server-wide /wrapped recap
				only. It does NOT change who can view individual users' personal Wrapped pages — that
				is governed by the per-user default share mode below.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updateServerWrappedSettings"
				use:serverWrappedEnhance
				class="space-y-4"
			>
				<Form.Field form={serverWrappedForm} name="anonymizationMode">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Anonymization mode</Form.Label>
							<RadioGroup bind:value={$serverWrappedData.anonymizationMode} {...props}>
								{#each data.anonymizationOptions as opt (opt.value)}
									<SettingsOptionCard title={opt.label} description={opt.description}>
										{#snippet control()}
											<RadioGroupItem value={opt.value} />
										{/snippet}
										{#snippet icon()}
											{#if opt.value === 'anonymous'}
												<EyeOffIcon />
											{:else if opt.value === 'hybrid'}
												<ShieldUserIcon />
											{:else}
												<UsersIcon />
											{/if}
										{/snippet}
									</SettingsOptionCard>
								{/each}
							</RadioGroup>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field form={serverWrappedForm} name="serverWrappedShareMode">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Server-wide share mode</Form.Label>
							<RadioGroup bind:value={$serverWrappedData.serverWrappedShareMode} {...props}>
								{#each data.serverWrappedShareModeOptions as opt (opt.value)}
									<SettingsOptionCard title={opt.label} description={opt.description}>
										{#snippet control()}
											<RadioGroupItem value={opt.value} />
										{/snippet}
										{#snippet icon()}
											{#if opt.value === 'public'}
												<GlobeIcon />
											{:else}
												<LockIcon />
											{/if}
										{/snippet}
									</SettingsOptionCard>
								{/each}
							</RadioGroup>
						{/snippet}
					</Form.Control>
					<Form.Description>
						Private-link is not supported for the server-wide wrapped surface.
					</Form.Description>
					<Form.FieldErrors />
				</Form.Field>

				<input
					type="hidden"
					name="settingsVersion"
					bind:value={$serverWrappedData.settingsVersion}
				/>

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={$serverWrappedSubmitting}>
						{$serverWrappedSubmitting ? 'Saving…' : 'Save server-wide settings'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Public landing lookup</CardTitle>
			<CardDescription>{publicLandingLookupCopy.helper}</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updatePublicLandingLookup"
				use:publicLandingLookupEnhance
				class="space-y-4"
			>
				<input
					type="hidden"
					name="publicLandingLookup"
					value={$publicLandingLookupData.publicLandingLookup ? 'true' : 'false'}
				/>
				<SettingsToggleRow
					id="public-landing-lookup-toggle"
					title={publicLandingLookupCopy.label}
					description={$publicLandingLookupData.publicLandingLookup
						? publicLandingLookupCopy.enabledDescription
						: publicLandingLookupCopy.disabledDescription}
					onLabel="Public lookup on"
					offLabel="Sign-in required"
					bind:checked={$publicLandingLookupData.publicLandingLookup}
				>
					{#snippet icon()}
						<GlobeIcon />
					{/snippet}
				</SettingsToggleRow>

				<Alert>
					<GlobeIcon />
					<AlertDescription>
						{publicLandingLookupCopy.protectedBoundary}
						{publicLandingLookupCopy.privateOutcome}
					</AlertDescription>
				</Alert>

				<input
					type="hidden"
					name="settingsVersion"
					bind:value={$publicLandingLookupData.settingsVersion}
				/>

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={$publicLandingLookupSubmitting}>
						{$publicLandingLookupSubmitting ? 'Saving…' : 'Save public lookup'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>User sharing defaults</CardTitle>
			<CardDescription>
				Default share mode for newly-created users, and whether users can change their own
				share settings. This default is also the privacy floor for every user's personal
				Wrapped page — raise or lower it here (not via the server-wide recap control above) to
				change who can view personal Wrapped pages.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updateUserDefaults"
				use:userDefaultsEnhance
				class="space-y-4"
			>
				<Form.Field form={userDefaultsForm} name="defaultShareMode">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Default share mode</Form.Label>
							<RadioGroup bind:value={$userDefaultsData.defaultShareMode} {...props}>
								{#each data.shareModeOptions as opt (opt.value)}
									<SettingsOptionCard title={opt.label} description={opt.description}>
										{#snippet control()}
											<RadioGroupItem value={opt.value} />
										{/snippet}
										{#snippet icon()}
											{#if opt.value === 'public'}
												<GlobeIcon />
											{:else if opt.value === 'private-link'}
												<LinkIcon />
											{:else}
												<ShieldUserIcon />
											{/if}
										{/snippet}
									</SettingsOptionCard>
								{/each}
							</RadioGroup>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field form={userDefaultsForm} name="allowUserControl">
					<Form.Control>
						{#snippet children({ props })}
							<input
								type="hidden"
								name="allowUserControl"
								value={$userDefaultsData.allowUserControl ? 'true' : 'false'}
							/>
							<SettingsToggleRow
								id="allow-user-control-toggle"
								title="Allow users to change their share settings"
								description="When off, only administrators can change a user's share mode."
								onLabel="Users can edit"
								offLabel="Admin only"
								ariaDescribedby={props['aria-describedby']}
								ariaInvalid={props['aria-invalid']}
								bind:checked={$userDefaultsData.allowUserControl}
							>
								{#snippet icon()}
									<UserCogIcon />
								{/snippet}
							</SettingsToggleRow>
						{/snippet}
					</Form.Control>
					<Form.Description>
						{shareDefaultCopy.summary} {shareDefaultCopy.explicitRows} Use the explicit bulk action
						below for default-managed existing rows, or manage an individual user on the
						<a href="/admin/users" class="underline">Users</a> page.
					</Form.Description>
					<Form.FieldErrors />
				</Form.Field>

				<input
					type="hidden"
					name="settingsVersion"
					bind:value={$userDefaultsData.settingsVersion}
				/>

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={$userDefaultsSubmitting}>
						{$userDefaultsSubmitting ? 'Saving…' : 'Save user defaults'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>
		</Collapsible.Content>
	</Collapsible.Root>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Apply defaults to existing users</CardTitle>
			<CardDescription>{shareDefaultCopy.bulkApply}</CardDescription>
		</CardHeader>
		<CardContent>
			<SettingsActionBar>
				<Button
					variant="outline"
					class="tap-target"
					onclick={() => (bulkApplyDialogOpen = true)}
					disabled={isBulkApplying}
				>
					<UsersIcon />
					Apply defaults to managed users
				</Button>
			</SettingsActionBar>
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={bulkApplyDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Apply defaults to default-managed users?</AlertDialog.Title>
			<AlertDialog.Description>
				{shareDefaultCopy.bulkApply} The result reports how many rows were updated and skipped.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isBulkApplying}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/bulkApplyShareDefaults"
				use:enhance={({ cancel }) => {
					if (isBulkApplying) {
						cancel();
						return;
					}
					isBulkApplying = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') {
								await invalidateAll();
							}
						} finally {
							isBulkApplying = false;
							bulkApplyDialogOpen = false;
						}
					};
				}}
				style="display: contents;"
			>
				<AlertDialog.Action type="submit" class="tap-target" disabled={isBulkApplying}>
					{isBulkApplying ? 'Applying…' : 'Apply managed defaults'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
