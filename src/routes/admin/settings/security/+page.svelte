<script lang="ts">
import { enhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import { Switch } from '$lib/components/ui/switch/index.js';
import { handleFormToast } from '$lib/utils/form-toast';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

const security = $derived(data.security);

// svelte-ignore state_referenced_locally
let csrfOriginInput = $state(security.originValue);

let isSavingCsrf = $state(false);
let isTestingCsrf = $state(false);
let isClearingCsrfSkip = $state(false);
let isResetingWarning = $state(false);
let isTogglingTrustProxy = $state(false);
let isConfirmingTrustProxy = $state(false);
let isConfirmingCsrfMismatch = $state(false);

let csrfMismatchDialogOpen = $state(false);
let pendingCsrfOrigin = $state<string | null>(null);
let pendingMismatchMessage = $state('');

let trustProxyConfirmDialogOpen = $state(false);
</script>

<svelte:head>
	<title>Security — Settings</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle>CSRF protection</CardTitle>
			<CardDescription>
				Origin check applied to all state-changing requests. Mismatches between this value
				and the browser's Origin header are rejected with 403. Source:
				<strong>{security.originSource}</strong>{#if security.originLocked} (locked by env){/if}.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if !security.originLocked}
				<form
					method="POST"
					action="?/updateCsrfOrigin"
					use:enhance={() => {
						isSavingCsrf = true;
						return async ({ result, update }) => {
							try {
								if (
									result.type === 'failure' &&
									result.data &&
									(result.data as Record<string, unknown>).requireConfirmation
								) {
									const d = result.data as Record<string, unknown>;
									pendingCsrfOrigin = String(d.attemptedOrigin ?? '');
									pendingMismatchMessage = String(d.csrfMismatchMessage ?? '');
									csrfMismatchDialogOpen = true;
								} else if (result.type === 'success' || result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
								await update({ reset: false });
								if (result.type === 'success') await invalidateAll();
							} finally {
								isSavingCsrf = false;
							}
						};
					}}
					class="space-y-4"
				>
					<div class="space-y-2">
						<Label for="csrfOrigin">CSRF origin</Label>
						<Input
							id="csrfOrigin"
							name="csrfOrigin"
							type="url"
							placeholder="https://obzorarr.example.com"
							bind:value={csrfOriginInput}
						/>
						<p class="text-xs text-muted-foreground">
							Leave blank to clear (only allowed when ORIGIN env is set or the skip flag is on).
						</p>
					</div>

					<input type="hidden" name="settingsVersion" value={data.csrfOriginVersion} />

					<div class="flex flex-wrap gap-2 justify-end">
						<Button type="submit" class="tap-target" disabled={isSavingCsrf}>
							{isSavingCsrf ? 'Saving…' : 'Save CSRF origin'}
						</Button>
					</div>
				</form>
			{:else}
				<p class="text-sm text-muted-foreground">
					CSRF origin is set via environment variable and cannot be changed here.
				</p>
			{/if}

			<form
				method="POST"
				action="?/testCsrfProtection"
				use:enhance={() => {
					isTestingCsrf = true;
					return async ({ result }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
						} finally {
							isTestingCsrf = false;
						}
					};
				}}
			>
				<Button type="submit" variant="outline" class="tap-target" disabled={isTestingCsrf}>
					{isTestingCsrf ? 'Testing…' : 'Test CSRF protection'}
				</Button>
			</form>

			{#if !security.csrfEnabled && !security.originLocked}
				<form
					method="POST"
					action="?/toggleCsrfSkip"
					use:enhance={({ formData }) => {
						isClearingCsrfSkip = true;
						formData.set('enabled', security.csrfOriginSkipped ? 'false' : 'true');
						return async ({ result, update }) => {
							try {
								if (result.type === 'success' || result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
								await update({ reset: false });
								if (result.type === 'success') await invalidateAll();
							} finally {
								isClearingCsrfSkip = false;
							}
						};
					}}
				>
					<Button type="submit" variant="outline" class="tap-target" disabled={isClearingCsrfSkip}>
						{security.csrfOriginSkipped ? 'Disable CSRF skip flag' : 'Enable CSRF skip flag'}
					</Button>
				</form>
			{/if}

			{#if security.warningDismissed}
				<form
					method="POST"
					action="?/resetCsrfWarning"
					use:enhance={() => {
						isResetingWarning = true;
						return async ({ result, update }) => {
							try {
								if (result.type === 'success' || result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
								await update({ reset: false });
								if (result.type === 'success') await invalidateAll();
							} finally {
								isResetingWarning = false;
							}
						};
					}}
				>
					<Button type="submit" variant="outline" class="tap-target" disabled={isResetingWarning}>
						{isResetingWarning ? 'Resetting…' : 'Re-enable CSRF warning banner'}
					</Button>
				</form>
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Reverse-proxy header trust</CardTitle>
			<CardDescription>
				When enabled, obzorarr trusts `x-forwarded-*` headers from the upstream proxy. Source:
				<strong>{security.trustProxySource}</strong>{#if security.trustProxyLocked} (locked by env){/if}.
				⚠️ Only enable if your proxy strips inbound `x-forwarded-*` headers before forwarding.
			</CardDescription>
		</CardHeader>
		<CardContent>
			{#if security.trustProxyLocked}
				<p class="text-sm text-muted-foreground">
					Reverse-proxy header trust is managed via environment variable and cannot be changed here.
				</p>
			{:else if security.trustProxyValue}
				<form
					method="POST"
					action="?/updateTrustProxy"
					use:enhance={() => {
						isTogglingTrustProxy = true;
						return async ({ result, update }) => {
							try {
								if (result.type === 'success' || result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
								await update({ reset: false });
								if (result.type === 'success') await invalidateAll();
							} finally {
								isTogglingTrustProxy = false;
							}
						};
					}}
				>
					<input type="hidden" name="enabled" value="false" />
					<input type="hidden" name="settingsVersion" value={data.trustProxyVersion} />
					<div class="flex justify-end">
						<Button type="submit" variant="destructive" class="tap-target" disabled={isTogglingTrustProxy}>
							{isTogglingTrustProxy ? 'Disabling…' : 'Disable header trust'}
						</Button>
					</div>
				</form>
			{:else}
				<div class="flex justify-end">
					<Button
						variant="default"
						onclick={() => (trustProxyConfirmDialogOpen = true)}
						disabled={isConfirmingTrustProxy}
					>
						Enable header trust
					</Button>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={csrfMismatchDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Save mismatched CSRF origin?</AlertDialog.Title>
			<AlertDialog.Description>
				{pendingMismatchMessage}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isConfirmingCsrfMismatch}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/updateCsrfOrigin"
				use:enhance={() => {
					isConfirmingCsrfMismatch = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') await invalidateAll();
						} finally {
							isConfirmingCsrfMismatch = false;
							csrfMismatchDialogOpen = false;
							pendingCsrfOrigin = null;
						}
					};
				}}
				style="display: contents;"
			>
				<input type="hidden" name="csrfOrigin" value={pendingCsrfOrigin ?? ''} />
				<input type="hidden" name="confirmMismatch" value="true" />
				<input type="hidden" name="settingsVersion" value={data.csrfOriginVersion} />
				<AlertDialog.Action type="submit" class="tap-target" disabled={isConfirmingCsrfMismatch}>
					{isConfirmingCsrfMismatch ? 'Saving…' : 'Save anyway'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={trustProxyConfirmDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Enable reverse-proxy header trust?</AlertDialog.Title>
			<AlertDialog.Description>
				Obzorarr will trust the upstream proxy's `x-forwarded-*` headers for client IP, host,
				and protocol. If those headers can reach obzorarr unsanitised, attackers can spoof the
				host or protocol used for security decisions and generated URLs.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isConfirmingTrustProxy}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/updateTrustProxy"
				use:enhance={() => {
					isConfirmingTrustProxy = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') await invalidateAll();
						} finally {
							isConfirmingTrustProxy = false;
							trustProxyConfirmDialogOpen = false;
						}
					};
				}}
				style="display: contents;"
			>
				<input type="hidden" name="enabled" value="true" />
				<input type="hidden" name="confirmRisk" value="true" />
				<input type="hidden" name="settingsVersion" value={data.trustProxyVersion} />
				<AlertDialog.Action type="submit" class="tap-target" disabled={isConfirmingTrustProxy}>
					{isConfirmingTrustProxy ? 'Enabling…' : 'Enable header trust'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
