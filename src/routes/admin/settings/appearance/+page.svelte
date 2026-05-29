<script lang="ts">
import { enhance } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import { SettingsActionBar, SettingsOptionCard } from '$lib/components/settings/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card/index.js';
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

const themeSwatches: Record<string, string[]> = {
	'modern-minimal': ['oklch(0.6261 0.1859 259.6)', 'oklch(0.2267 0 0)', 'oklch(0.9389 0 0)'],
	supabase: ['oklch(0.7906 0.171 160.45)', 'oklch(0.2207 0.0083 173.44)', 'oklch(0.9466 0 0)'],
	'doom-64': [
		'oklch(0.6885 0.1738 51.21)',
		'oklch(0.2399 0.011 61.56)',
		'oklch(0.6599 0.1644 147.39)'
	],
	'amber-minimal': [
		'oklch(0.8309 0.1622 87.87)',
		'oklch(0.2327 0.0082 91.67)',
		'oklch(0.9389 0 0)'
	],
	'soviet-red': [
		'oklch(0.5356 0.2041 27.72)',
		'oklch(0.2083 0.0125 18.2)',
		'oklch(0.8085 0.1523 88.89)'
	]
};

const themeDescriptions: Record<string, string> = {
	'modern-minimal': 'Cool, neutral admin surfaces with a crisp blue accent.',
	supabase: 'Deep charcoal and soft green for a calmer dashboard feel.',
	'doom-64': 'Retro amber contrast with sharper, game-inspired edges.',
	'amber-minimal': 'Warm amber highlights on a restrained dark base.',
	'soviet-red': 'High-contrast red accents with a bold cinematic tone.'
};

function getThemeSwatches(theme: string): string[] {
	return (
		themeSwatches[theme] ?? [
			'oklch(var(--primary))',
			'oklch(var(--card))',
			'oklch(var(--foreground))'
		]
	);
}

function getThemeDescription(theme: string): string {
	return themeDescriptions[theme] ?? 'Theme-aware colors for Obzorarr surfaces.';
}
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
				use:enhance={({ cancel }) => {
					if (isSavingUITheme) {
						cancel();
						return;
					}
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
						<SettingsOptionCard
							title={theme.label}
							description={getThemeDescription(theme.value)}
							swatches={getThemeSwatches(theme.value)}
						>
							{#snippet control()}
								<RadioGroupItem value={theme.value} />
							{/snippet}
						</SettingsOptionCard>
					{/each}
				</RadioGroup>

				<input type="hidden" name="settingsVersion" value={data.uiThemeVersion} />

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={isSavingUITheme}>
						{isSavingUITheme ? 'Saving…' : 'Save UI theme'}
					</Button>
				</SettingsActionBar>
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
				use:enhance={({ cancel }) => {
					if (isSavingWrappedTheme) {
						cancel();
						return;
					}
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
						<SettingsOptionCard
							title={theme.label}
							description={getThemeDescription(theme.value)}
							swatches={getThemeSwatches(theme.value)}
						>
							{#snippet control()}
								<RadioGroupItem value={theme.value} />
							{/snippet}
						</SettingsOptionCard>
					{/each}
				</RadioGroup>

				<input type="hidden" name="settingsVersion" value={data.wrappedThemeVersion} />

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={isSavingWrappedTheme}>
						{isSavingWrappedTheme ? 'Saving…' : 'Save wrapped theme'}
					</Button>
				</SettingsActionBar>
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
				use:enhance={({ cancel }) => {
					if (isSavingWrappedLogoMode) {
						cancel();
						return;
					}
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
						<SettingsOptionCard title={option.label} meta="Logo">
							{#snippet control()}
								<RadioGroupItem value={option.value} />
							{/snippet}
						</SettingsOptionCard>
					{/each}
				</RadioGroup>

				<input type="hidden" name="settingsVersion" value={data.wrappedLogoModeVersion} />

				<SettingsActionBar>
					<Button type="submit" class="tap-target" disabled={isSavingWrappedLogoMode}>
						{isSavingWrappedLogoMode ? 'Saving…' : 'Save logo mode'}
					</Button>
				</SettingsActionBar>
			</form>
		</CardContent>
	</Card>
</div>
