<script lang="ts">
import { superForm } from 'sveltekit-superforms';
import { enhance } from '$app/forms';
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
import { Label } from '$lib/components/ui/label/index.js';
import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
import { Switch } from '$lib/components/ui/switch/index.js';
import { handleFormToast } from '$lib/utils/form-toast';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

// svelte-ignore state_referenced_locally
const serverWrappedForm = superForm(data.serverWrappedForm, {
	resetForm: false,
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

let bulkApplyDialogOpen = $state(false);
let isBulkApplying = $state(false);
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
									<Label
										class="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
									>
										<RadioGroupItem value={opt.value} />
										<span>{opt.label}</span>
									</Label>
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
								<Label
									class="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
								>
									<RadioGroupItem value="public" />
									<span>Public</span>
								</Label>
								<Label
									class="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
								>
									<RadioGroupItem value="private-oauth" />
									<span>Private (OAuth)</span>
								</Label>
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

				<div class="flex justify-end">
					<Button type="submit" class="tap-target" disabled={$serverWrappedSubmitting}>
						{$serverWrappedSubmitting ? 'Saving…' : 'Save server-wide settings'}
					</Button>
				</div>
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
								<Label
									class="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
								>
									<RadioGroupItem value="public" />
									<span>Public</span>
								</Label>
								<Label
									class="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
								>
									<RadioGroupItem value="private-oauth" />
									<span>Private (OAuth)</span>
								</Label>
								<Label
									class="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
								>
									<RadioGroupItem value="private-link" />
									<span>Private (link)</span>
								</Label>
							</RadioGroup>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field form={userDefaultsForm} name="allowUserControl">
					<div class="flex items-center justify-between rounded-lg border p-3">
						<div class="space-y-0.5">
							<Form.Label>Allow users to change their share settings</Form.Label>
							<Form.Description>
								When off, only administrators can change a user's share mode.
							</Form.Description>
						</div>
						<Form.Control>
							{#snippet children({ props })}
								<Switch
									{...props}
									bind:checked={$userDefaultsData.allowUserControl}
								/>
							{/snippet}
						</Form.Control>
					</div>
					<Form.FieldErrors />
				</Form.Field>

				<input
					type="hidden"
					name="settingsVersion"
					bind:value={$userDefaultsData.settingsVersion}
				/>

				<div class="flex justify-end">
					<Button type="submit" class="tap-target" disabled={$userDefaultsSubmitting}>
						{$userDefaultsSubmitting ? 'Saving…' : 'Save user defaults'}
					</Button>
				</div>
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
			<div class="flex justify-end">
				<Button
					variant="outline"
					onclick={() => (bulkApplyDialogOpen = true)}
					disabled={isBulkApplying}
				>
					Apply current defaults to all users
				</Button>
			</div>
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
				use:enhance={() => {
					isBulkApplying = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
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
