<script lang="ts">
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
import EyeOffIcon from '@lucide/svelte/icons/eye-off';
import GlobeIcon from '@lucide/svelte/icons/globe';
import ImageIcon from '@lucide/svelte/icons/image';
import LinkIcon from '@lucide/svelte/icons/link';
import LockIcon from '@lucide/svelte/icons/lock';
import ScaleIcon from '@lucide/svelte/icons/scale';
import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
import ShieldUserIcon from '@lucide/svelte/icons/shield-user';
import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
import UserCogIcon from '@lucide/svelte/icons/user-cog';
import UsersIcon from '@lucide/svelte/icons/users';
import UsersRoundIcon from '@lucide/svelte/icons/users-round';
import VenetianMaskIcon from '@lucide/svelte/icons/venetian-mask';
import type { Component } from 'svelte';
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
import {
	PRIVACY_PRESETS,
	type PrivacyPreset,
	type PrivacyPresetId,
	publicLandingLookupCopy
} from '$lib/sharing/options';
import {
	derivePreview,
	matchPresetPrivacy,
	PREVIEW_NAME_DISPLAY_LABELS,
	PREVIEW_PER_USER_DEFAULT_LABELS,
	PREVIEW_RECAP_VISIBILITY_LABELS,
	type PrivacyPreviewModel
} from '$lib/sharing/preset-logic';
import { handleFormToast } from '$lib/utils/form-toast';
import { surfaceOccConflict } from '$lib/utils/occ-form';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

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
	onUpdate: surfaceOccConflict,
	onUpdated({ form: updated }) {
		if (updated.valid) {
			// Advance this section's saved baseline to what was just persisted.
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
	onUpdate: surfaceOccConflict,
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
	onUpdate: surfaceOccConflict,
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

// Live contradiction warning: the toggle is the SOLE landing-page gate (D1), so a
// non-public per-user default means visitors see the form but every lookup 404s.
// Surface that to the admin instead of silently hiding the form. Reads across two
// Superform stores so it updates as the admin edits either control.
let showContradictionWarning = $derived(
	$publicLandingLookupData.publicLandingLookup && $userDefaultsData.defaultShareMode !== 'public'
);

// ---------------------------------------------------------------------------
// Privacy presets (client-only control surface)
// ---------------------------------------------------------------------------
// Auto-open Advanced options at mount ONLY when the saved config is already
// contradictory (public landing lookup on, but the per-user default isn't
// public), so the contradiction Alert inside Collapsible.Content isn't hidden
// on page load. This is a one-time init snapshot of showContradictionWarning,
// not a $effect — the project rule forbids state updates in effects, and an
// effect would intrusively re-open the section while the admin is editing.
// After mount the admin can freely collapse/expand. The suppressor matches the
// other one-time $state-from-reactive declarations above.
// svelte-ignore state_referenced_locally
let advancedOpen = $state(showContradictionWarning);

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

// Applying a preset is pure client-side state mutation across the three stores.
// It writes the FIVE admin-owned fields and NEVER touches logoMode. Persistence
// still flows through each section's existing Save button + OCC group.
function applyPrivacyPreset(preset: PrivacyPreset) {
	$serverWrappedData.anonymizationMode = preset.values.anonymizationMode;
	$serverWrappedData.serverWrappedShareMode = preset.values.serverWrappedShareMode;
	$userDefaultsData.defaultShareMode = preset.values.defaultShareMode;
	$userDefaultsData.allowUserControl = preset.values.allowUserControl;
	$publicLandingLookupData.publicLandingLookup = preset.values.publicLandingLookup;
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
	<title>Privacy — Settings</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	{#snippet previewRows(model: PrivacyPreviewModel)}
		<dl class="space-y-1.5 text-sm">
			<div class="flex justify-between gap-3">
				<dt class="text-muted-foreground">Names in stats</dt>
				<dd class="text-right font-medium">{PREVIEW_NAME_DISPLAY_LABELS[model.nameDisplay]}</dd>
			</div>
			<div class="flex justify-between gap-3">
				<dt class="text-muted-foreground">New-user default</dt>
				<dd class="text-right font-medium">{PREVIEW_PER_USER_DEFAULT_LABELS[model.perUserDefaultForNewUsers]}</dd>
			</div>
			<div class="flex justify-between gap-3">
				<dt class="text-muted-foreground">Server-wide recap</dt>
				<dd class="text-right font-medium">{PREVIEW_RECAP_VISIBILITY_LABELS[model.serverRecapVisibility]}</dd>
			</div>
			<div class="flex justify-between gap-3">
				<dt class="text-muted-foreground">Landing lookup form</dt>
				<dd class="text-right font-medium">{model.landingLookupForm === 'visible' ? 'Shown' : 'Hidden'}</dd>
			</div>
		</dl>
		<!-- The only preview warning is the landing-lookup contradiction, which the
		     inline Alert in the "Public landing lookup" card already surfaces (with
		     icon, where the admin edits). Rendering it here too duplicated the same
		     sentence across both preview panels + the Alert, so the warnings line is
		     intentionally not shown in the preview. -->
	{/snippet}

	<Card>
		<CardHeader>
			<CardTitle>Privacy presets</CardTitle>
			<CardDescription>
				Pick a preset to set anonymization, sharing and landing-lookup in one step — then save each
				section below. Logo behavior is configured separately on Appearance.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div
				class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
				role="radiogroup"
				aria-label="Privacy preset"
			>
				{#each PRIVACY_PRESETS as preset (preset.id)}
					{@const PresetIcon = presetIcons[preset.id]}
					<button
						type="button"
						role="radio"
						aria-checked={selectedPreset === preset.id}
						onclick={() => applyPrivacyPreset(preset)}
						class={selectedPreset === preset.id
							? 'flex flex-col items-start gap-2 rounded-lg border border-primary bg-primary/5 p-4 text-left ring-1 ring-primary transition-colors'
							: 'flex flex-col items-start gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50'}
					>
						<span class="flex items-center gap-2 text-sm font-medium">
							<PresetIcon class="size-4 text-primary" />
							{preset.label}
						</span>
						<span class="text-xs text-muted-foreground">{preset.description}</span>
						<span class="text-xs font-medium text-primary/80">{preset.exposureSummary}</span>
					</button>
				{/each}
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
						Logo behavior is configured on
						<a
							href="/admin/settings/appearance"
							class="inline-flex items-center gap-1 underline"
						>Appearance<ExternalLinkIcon class="size-3" /></a>. Presets don’t change it.
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
		</CardContent>
	</Card>

	<Collapsible.Root bind:open={advancedOpen} class="space-y-6">
		<Collapsible.Trigger
			class="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
		>
			<span class="flex items-center gap-2">
				Advanced options
				{#if showContradictionWarning}
					<!-- At-a-glance flag for the collapsed case: if the admin closes Advanced
					     while the saved config is still contradictory, this keeps the broken
					     public-lookup state visible without duplicating the Alert's full text. -->
					<TriangleAlertIcon class="size-4 text-destructive" />
				{/if}
			</span>
			<ChevronDownIcon class={advancedOpen ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'} />
		</Collapsible.Trigger>
		<Collapsible.Content class="space-y-6 pt-6">
	<Card>
		<CardHeader>
			<CardTitle>Server-wide wrapped sharing</CardTitle>
			<CardDescription>
				Controls anonymization and the share mode used by the server-wide /wrapped pages.
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

				{#if showContradictionWarning}
					<Alert>
						<TriangleAlertIcon />
						<AlertDescription>{publicLandingLookupCopy.contradictionWarning}</AlertDescription>
					</Alert>
				{/if}

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
				share settings.
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
						Applies to newly-created users. It does not change existing users — use
						“Apply current defaults to all users” below, or each user’s “Can Control”
						toggle on the <a href="/admin/users" class="underline">Users</a> page, to update
						them.
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

	<Card>
		<CardHeader>
			<CardTitle>Apply defaults to existing users</CardTitle>
			<CardDescription>
				Reset every existing user's share mode + "can control" flag to match the current
				defaults above. Per-user customizations will be lost.
			</CardDescription>
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
					Apply current defaults to all users
				</Button>
			</SettingsActionBar>
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={bulkApplyDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Apply current defaults to all users?</AlertDialog.Title>
			<AlertDialog.Description>
				This resets every existing user's share mode and "can control" setting back to the
				current server defaults. Per-user customizations will be lost. Future users continue to
				receive the current defaults.
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
					{isBulkApplying ? 'Applying…' : 'Apply to all users'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
