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
import { Label } from '$lib/components/ui/label/index.js';
import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
import { handleFormToast } from '$lib/utils/form-toast';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

// Initial-value capture is intentional — the radio bindings own UI state
// from first paint and the server load reseeds via invalidateAll on save.
/* svelte-ignore state_referenced_locally */
let selectedUITheme = $state(data.uiTheme);
/* svelte-ignore state_referenced_locally */
let selectedWrappedTheme = $state(data.wrappedTheme);
/* svelte-ignore state_referenced_locally */
let selectedWrappedLogoMode = $state(data.wrappedLogoMode);

let isSavingUITheme = $state(false);
let isSavingWrappedTheme = $state(false);
let isSavingWrappedLogoMode = $state(false);
</script>

<svelte:head>
	<title>Appearance — Settings</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle>UI theme</CardTitle>
			<CardDescription>
				Color theme for dashboard, admin pages, and all non-wrapped surfaces.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updateUITheme"
				use:enhance={() => {
					isSavingUITheme = true;
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
							isSavingUITheme = false;
						}
					};
				}}
				class="space-y-4"
			>
				<RadioGroup bind:value={selectedUITheme} name="theme" class="grid sm:grid-cols-2 gap-2">
					{#each data.themeOptions as theme (theme.value)}
						<Label
							class="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
						>
							<RadioGroupItem value={theme.value} />
							<span>{theme.label}</span>
						</Label>
					{/each}
				</RadioGroup>

				<input type="hidden" name="settingsVersion" value={data.uiThemeVersion} />

				<div class="flex justify-end">
					<Button type="submit" disabled={isSavingUITheme}>
						{isSavingUITheme ? 'Saving…' : 'Save UI theme'}
					</Button>
				</div>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Wrapped theme</CardTitle>
			<CardDescription>
				Color theme for the Year in Review slideshow at /wrapped/&lt;year&gt;.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updateWrappedTheme"
				use:enhance={() => {
					isSavingWrappedTheme = true;
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
							isSavingWrappedTheme = false;
						}
					};
				}}
				class="space-y-4"
			>
				<RadioGroup
					bind:value={selectedWrappedTheme}
					name="wrappedTheme"
					class="grid sm:grid-cols-2 gap-2"
				>
					{#each data.themeOptions as theme (theme.value)}
						<Label
							class="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
						>
							<RadioGroupItem value={theme.value} />
							<span>{theme.label}</span>
						</Label>
					{/each}
				</RadioGroup>

				<input type="hidden" name="settingsVersion" value={data.wrappedThemeVersion} />

				<div class="flex justify-end">
					<Button type="submit" disabled={isSavingWrappedTheme}>
						{isSavingWrappedTheme ? 'Saving…' : 'Save wrapped theme'}
					</Button>
				</div>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Wrapped page logo</CardTitle>
			<CardDescription>Control logo visibility on the Year in Review pages.</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				action="?/updateWrappedLogoMode"
				use:enhance={() => {
					isSavingWrappedLogoMode = true;
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
							isSavingWrappedLogoMode = false;
						}
					};
				}}
				class="space-y-4"
			>
				<RadioGroup
					bind:value={selectedWrappedLogoMode}
					name="logoMode"
					class="grid gap-2"
				>
					{#each data.wrappedLogoOptions as option (option.value)}
						<Label
							class="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
						>
							<RadioGroupItem value={option.value} />
							<span>{option.label}</span>
						</Label>
					{/each}
				</RadioGroup>

				<input type="hidden" name="settingsVersion" value={data.wrappedLogoModeVersion} />

				<div class="flex justify-end">
					<Button type="submit" disabled={isSavingWrappedLogoMode}>
						{isSavingWrappedLogoMode ? 'Saving…' : 'Save logo mode'}
					</Button>
				</div>
			</form>
		</CardContent>
	</Card>
</div>
