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
		// `valid` flag onto it.
		if (updated.valid) {
			handleFormToast({ success: true, message: updated.message ?? 'Settings saved' });
		} else {
			handleFormToast({ error: updated.message ?? 'Validation failed' });
		}
	}
});

const { form: formData, enhance, submitting } = form;

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
					<div class="flex items-center justify-between rounded-lg border p-3">
						<div class="space-y-0.5">
							<Form.Label>DEBUG-level logging</Form.Label>
							<Form.Description>Records detailed debug output. May increase log volume.</Form.Description>
						</div>
						<Form.Control>
							{#snippet children({ props })}
								<Switch {...props} bind:checked={$formData.debugEnabled} />
							{/snippet}
						</Form.Control>
					</div>
					<Form.FieldErrors />
				</Form.Field>

				<input type="hidden" name="settingsVersion" bind:value={$formData.settingsVersion} />

				<div class="flex justify-end">
					<Button type="submit" disabled={$submitting}>
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
