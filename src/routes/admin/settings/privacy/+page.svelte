<script lang="ts">
import EyeOffIcon from '@lucide/svelte/icons/eye-off';
import GlobeIcon from '@lucide/svelte/icons/globe';
import LinkIcon from '@lucide/svelte/icons/link';
import LockIcon from '@lucide/svelte/icons/lock';
import ShieldUserIcon from '@lucide/svelte/icons/shield-user';
import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
import UserCogIcon from '@lucide/svelte/icons/user-cog';
import UsersIcon from '@lucide/svelte/icons/users';
import type { ActionResult } from '@sveltejs/kit';
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
import * as Form from '$lib/components/ui/form/index.js';
import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
import { publicLandingLookupCopy } from '$lib/sharing/options';
import { handleFormToast } from '$lib/utils/form-toast';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

// An OCC stale-write returns fail(409, { form, conflict, error }) AFTER validation,
// so the returned `form` is still valid — `onUpdated` would otherwise fire a false
// "Saved" success toast while the write was actually discarded (ISSUE-006). Detect
// the conflict in `onUpdate`, surface the server's reload message, and cancel() so
// the success path never runs and the stale settingsVersion stays put for reload.
function surfaceOccConflict(event: { result: ActionResult; cancel: () => void }): void {
	const { result } = event;
	if (result.type === 'failure' && (result.data as { conflict?: boolean } | undefined)?.conflict) {
		const message =
			(result.data as { error?: string } | undefined)?.error ??
			'Settings changed in another tab. Please reload.';
		handleFormToast({ error: message });
		event.cancel();
	}
}

// svelte-ignore state_referenced_locally
const serverWrappedForm = superForm(data.serverWrappedForm, {
	resetForm: false,
	onUpdate: surfaceOccConflict,
	onUpdated({ form: updated }) {
		if (updated.valid) {
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
</script>

<svelte:head>
	<title>Privacy — Settings</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
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
