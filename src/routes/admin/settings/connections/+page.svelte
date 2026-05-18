<script lang="ts">
import { enhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
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

const settings = $derived(data.settings);

// svelte-ignore state_referenced_locally
let plexServerUrl = $state(settings.plexServerUrl.value);
let plexTokenInput = $state('');
// svelte-ignore state_referenced_locally
let plexAllowInsecureLocalHttp = $state(settings.plexAllowInsecureLocalHttp);

let openaiApiKeyInput = $state('');
// svelte-ignore state_referenced_locally
let openaiBaseUrl = $state(settings.openaiBaseUrl.value);
// svelte-ignore state_referenced_locally
let openaiModel = $state(settings.openaiModel.value);

let isSavingPlex = $state(false);
let isTestingPlex = $state(false);
let isSavingOpenai = $state(false);
let isTestingOpenai = $state(false);
let isClearingOpenaiKey = $state(false);
let isClearingOpenaiModel = $state(false);

const plexServerUrlLocked = $derived(settings.plexServerUrl.isLocked);
const plexTokenLocked = $derived(settings.plexToken.isLocked);
const openaiApiKeyLocked = $derived(settings.openaiApiKey.isLocked);
const openaiBaseUrlLocked = $derived(settings.openaiBaseUrl.isLocked);
const openaiModelLocked = $derived(settings.openaiModel.isLocked);

const plexAnyLocked = $derived(plexServerUrlLocked || plexTokenLocked);
const openaiAnyLocked = $derived(openaiApiKeyLocked || openaiBaseUrlLocked || openaiModelLocked);
</script>

<svelte:head>
	<title>Connections — Settings</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle>Plex server</CardTitle>
			<CardDescription>
				URL + auth token for the Plex Media Server obzorarr syncs from. Locked fields are set
				via environment variables.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<form
				method="POST"
				action="?/updateApiConfig"
				use:enhance={() => {
					isSavingPlex = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') {
								plexTokenInput = '';
								await invalidateAll();
							}
						} finally {
							isSavingPlex = false;
						}
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label for="plexServerUrl">Plex server URL</Label>
					<Input
						id="plexServerUrl"
						name="plexServerUrl"
						type="url"
						placeholder="http://plex.local:32400"
						bind:value={plexServerUrl}
						disabled={plexServerUrlLocked}
					/>
					{#if plexServerUrlLocked}
						<p class="text-xs text-muted-foreground">Locked by environment variable.</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="plexToken">
						Plex token
						{#if settings.plexToken.hasValue}
							<span class="text-xs text-muted-foreground">(stored — leave blank to keep)</span>
						{/if}
					</Label>
					<Input
						id="plexToken"
						name="plexToken"
						type="password"
						autocomplete="off"
						placeholder={settings.plexToken.hasValue ? '••••••••' : 'X-Plex-Token value'}
						bind:value={plexTokenInput}
						disabled={plexTokenLocked}
					/>
					{#if plexTokenLocked}
						<p class="text-xs text-muted-foreground">Locked by environment variable.</p>
					{/if}
				</div>

				<div class="flex items-center justify-between rounded-lg border p-3">
					<div class="space-y-0.5">
						<Label>Allow insecure local HTTP</Label>
						<p class="text-xs text-muted-foreground">
							Permit non-HTTPS connections to RFC1918 / loopback Plex servers. Required for
							typical LAN setups.
						</p>
					</div>
					<Switch bind:checked={plexAllowInsecureLocalHttp} />
				</div>
				<input
					type="hidden"
					name="plexAllowInsecureLocalHttp"
					value={plexAllowInsecureLocalHttp ? 'true' : 'false'}
				/>

				<input type="hidden" name="apiConfigVersion" value={data.apiConfigVersion} />

				<div class="flex flex-wrap gap-2 justify-end">
					<Button type="submit" class="tap-target" disabled={isSavingPlex || plexAnyLocked}>
						{isSavingPlex ? 'Saving…' : 'Save Plex settings'}
					</Button>
				</div>
			</form>

			<form
				method="POST"
				action="?/testPlexConnection"
				use:enhance={({ formData }) => {
					isTestingPlex = true;
					// Forward the live form state so the test exercises pending edits.
					formData.set('plexServerUrl', plexServerUrl);
					if (plexTokenInput) formData.set('plexToken', plexTokenInput);
					formData.set(
						'plexAllowInsecureLocalHttp',
						plexAllowInsecureLocalHttp ? 'true' : 'false'
					);
					return async ({ result }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
						} finally {
							isTestingPlex = false;
						}
					};
				}}
			>
				<Button type="submit" variant="outline" class="tap-target" disabled={isTestingPlex}>
					{isTestingPlex ? 'Testing…' : 'Test Plex connection'}
				</Button>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>OpenAI / fun facts</CardTitle>
			<CardDescription>
				API credentials for the optional OpenAI-driven fun-fact generator. Falls back to the
				template generator when unset.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<form
				method="POST"
				action="?/updateApiConfig"
				use:enhance={() => {
					isSavingOpenai = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') {
								openaiApiKeyInput = '';
								await invalidateAll();
							}
						} finally {
							isSavingOpenai = false;
						}
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label for="openaiApiKey">
						OpenAI API key
						{#if settings.openaiApiKey.hasValue}
							<span class="text-xs text-muted-foreground">(stored — leave blank to keep)</span>
						{/if}
					</Label>
					<Input
						id="openaiApiKey"
						name="openaiApiKey"
						type="password"
						autocomplete="off"
						placeholder={settings.openaiApiKey.hasValue ? '••••••••' : 'sk-...'}
						bind:value={openaiApiKeyInput}
						disabled={openaiApiKeyLocked}
					/>
				</div>

				<div class="space-y-2">
					<Label for="openaiBaseUrl">Base URL (optional)</Label>
					<Input
						id="openaiBaseUrl"
						name="openaiBaseUrl"
						type="url"
						placeholder="https://api.openai.com/v1"
						bind:value={openaiBaseUrl}
						disabled={openaiBaseUrlLocked}
					/>
				</div>

				<div class="space-y-2">
					<Label for="openaiModel">Model</Label>
					<Input
						id="openaiModel"
						name="openaiModel"
						type="text"
						placeholder="gpt-4o-mini"
						bind:value={openaiModel}
						disabled={openaiModelLocked}
					/>
				</div>

				<input type="hidden" name="apiConfigVersion" value={data.apiConfigVersion} />

				<div class="flex flex-wrap gap-2 justify-end">
					<Button type="submit" class="tap-target" disabled={isSavingOpenai || openaiAnyLocked}>
						{isSavingOpenai ? 'Saving…' : 'Save OpenAI settings'}
					</Button>
				</div>
			</form>

			<div class="flex flex-wrap gap-2">
				<form
					method="POST"
					action="?/testAIConnection"
					use:enhance={({ formData }) => {
						isTestingOpenai = true;
						if (openaiApiKeyInput) formData.set('openaiApiKey', openaiApiKeyInput);
						formData.set('openaiBaseUrl', openaiBaseUrl);
						formData.set('openaiModel', openaiModel);
						return async ({ result }) => {
							try {
								if (result.type === 'success' || result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
							} finally {
								isTestingOpenai = false;
							}
						};
					}}
				>
					<Button type="submit" variant="outline" class="tap-target" disabled={isTestingOpenai}>
						{isTestingOpenai ? 'Testing…' : 'Test OpenAI connection'}
					</Button>
				</form>

				{#if settings.openaiApiKey.hasValue && !openaiApiKeyLocked}
					<form
						method="POST"
						action="?/clearOpenaiKey"
						use:enhance={() => {
							isClearingOpenaiKey = true;
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
									isClearingOpenaiKey = false;
								}
							};
						}}
					>
						<Button type="submit" variant="destructive" class="tap-target" disabled={isClearingOpenaiKey}>
							{isClearingOpenaiKey ? 'Clearing…' : 'Clear API key'}
						</Button>
					</form>
				{/if}

				{#if settings.openaiModel.value && !openaiModelLocked}
					<form
						method="POST"
						action="?/clearOpenaiModel"
						use:enhance={() => {
							isClearingOpenaiModel = true;
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
									isClearingOpenaiModel = false;
								}
							};
						}}
					>
						<Button type="submit" variant="destructive" class="tap-target" disabled={isClearingOpenaiModel}>
							{isClearingOpenaiModel ? 'Clearing…' : 'Clear model'}
						</Button>
					</form>
				{/if}
			</div>
		</CardContent>
	</Card>
</div>
