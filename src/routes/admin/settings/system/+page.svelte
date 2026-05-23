<script lang="ts">
import { superForm } from 'sveltekit-superforms';
import { Button } from '$lib/components/ui/button/index.js';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '$lib/components/ui/card/index.js';
import * as Form from '$lib/components/ui/form/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Switch } from '$lib/components/ui/switch/index.js';
import { handleFormToast } from '$lib/utils/form-toast';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

// Initial-value capture is the idiomatic Superforms pattern — the SuperForm
// instance owns the reactive state from here.
// svelte-ignore state_referenced_locally
const form = superForm(data.form, {
	resetForm: false,
	onUpdated({ form: updated }) {
		// Surface success / failure toasts via the existing parity helper. The
		// helper accepts the legacy FormResponse shape; we map the superforms
		// `valid` flag onto it. On validation failure, pull the first
		// field-level error so the toast says "Retention days must be at
		// least 1" instead of a generic "Validation failed" — which previously
		// looked like a false success when the user typed an out-of-range value.
		if (updated.valid) {
			handleFormToast({ success: true, message: updated.message ?? 'Settings saved' });
			return;
		}
		const errorBag = (updated.errors ?? {}) as Record<string, unknown>;
		const firstError = Object.values(errorBag)
			.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
			.find((entry): entry is string => typeof entry === 'string' && entry.length > 0);
		handleFormToast({ error: firstError ?? updated.message ?? 'Validation failed' });
	}
});

const { form: formData, enhance, submitting } = form;

// Block submit when the visible inputs are out of the server-validated range.
// The HTML5 min/max attributes only clamp some browsers' UI, so a user can
// still paste -1 / 999999 and trigger a silent no-op save without this check.
const isLoggingFormInvalid = $derived(
	$formData.retentionDays < 1 ||
		$formData.retentionDays > 365 ||
		$formData.maxCount < 1000 ||
		$formData.maxCount > 1_000_000
);

function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const parts: string[] = [];
	if (days) parts.push(`${days}d`);
	if (hours) parts.push(`${hours}h`);
	if (minutes || (!days && !hours)) parts.push(`${minutes}m`);
	return parts.join(' ');
}
</script>

<svelte:head>
	<title>System — Settings</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle>Logging</CardTitle>
			<CardDescription>
				Configure log retention, maximum entry count, and the DEBUG-level logging toggle.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<form method="POST" action="?/updateLogSettings" use:enhance class="space-y-4">
				<Form.Field {form} name="retentionDays">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Retention period (days)</Form.Label>
							<Input
								type="number"
								min="1"
								max="365"
								{...props}
								bind:value={$formData.retentionDays}
							/>
						{/snippet}
					</Form.Control>
					<Form.Description>Auto-delete logs older than this. Range 1–365.</Form.Description>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="maxCount">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Maximum log count</Form.Label>
							<Input
								type="number"
								min="1000"
								max="1000000"
								step="1"
								{...props}
								bind:value={$formData.maxCount}
							/>
						{/snippet}
					</Form.Control>
					<Form.Description>Older entries dropped once this ceiling is reached.</Form.Description>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="debugEnabled">
					<Form.Control>
						{#snippet children({ props })}
							<div class="flex items-center justify-between rounded-lg border p-3">
								<div class="space-y-0.5">
									<Form.Label>DEBUG-level logging</Form.Label>
									<Form.Description>Records detailed debug output. May increase log volume.</Form.Description>
								</div>
								<Switch {...props} bind:checked={$formData.debugEnabled} />
							</div>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<input type="hidden" name="settingsVersion" bind:value={$formData.settingsVersion} />

				<div class="flex justify-end">
					<Button
						type="submit"
						class="tap-target"
						disabled={$submitting || isLoggingFormInvalid}
					>
						{$submitting ? 'Saving…' : 'Save logging settings'}
					</Button>
				</div>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>System info</CardTitle>
			<CardDescription>Runtime + platform details for support and diagnostics.</CardDescription>
		</CardHeader>
		<CardContent>
			<dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
				<div>
					<dt class="text-muted-foreground">App version</dt>
					<dd class="font-mono">{data.appVersion.display}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Uptime</dt>
					<dd>{formatUptime(data.systemInfo.uptimeSeconds)}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Platform</dt>
					<dd class="font-mono">{data.systemInfo.osPlatform} / {data.systemInfo.osArch}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Bun</dt>
					<dd class="font-mono">{data.systemInfo.bunVersion ?? '—'}</dd>
				</div>
			</dl>
		</CardContent>
	</Card>
</div>
