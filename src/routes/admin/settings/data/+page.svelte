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
import { Label } from '$lib/components/ui/label/index.js';
import * as Select from '$lib/components/ui/select/index.js';
import { handleFormToast } from '$lib/utils/form-toast';
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();

// 'all' sentinel means "no year filter". Empty string would collide with
// Select.Item disabled state, so we map it explicitly when submitting.
let cacheYear = $state<string>('all');
let historyYear = $state<string>('all');

let cacheCountResult = $state<string | null>(null);
let historyCountResult = $state<string | null>(null);

let isCheckingCacheCount = $state(false);
let isClearingCache = $state(false);
let isCheckingHistoryCount = $state(false);
let isClearingHistory = $state(false);

let clearCacheDialogOpen = $state(false);
let clearHistoryDialogOpen = $state(false);

function formatRecordCount(n: number): string {
	return new Intl.NumberFormat(undefined).format(n);
}

const yearOptions = $derived([
	{ value: 'all', label: 'All years' },
	...data.availableYears.map((y) => ({ value: String(y), label: String(y) }))
]);

const cacheYearLabel = $derived(
	yearOptions.find((o) => o.value === cacheYear)?.label ?? 'All years'
);
const historyYearLabel = $derived(
	yearOptions.find((o) => o.value === historyYear)?.label ?? 'All years'
);
</script>

<svelte:head>
	<title>Data — Settings</title>
</svelte:head>

<div class="space-y-6 p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle>Stats cache</CardTitle>
			<CardDescription>
				Counts and clears cached per-year wrapped statistics. Clearing the cache forces a
				rebuild on next wrapped page view.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="space-y-2">
				<Label for="cache-year">Year</Label>
				<Select.Root type="single" name="year" bind:value={cacheYear}>
					<Select.Trigger id="cache-year" class="w-48">{cacheYearLabel}</Select.Trigger>
					<Select.Content>
						{#each yearOptions as opt (opt.value)}
							<Select.Item value={opt.value}>{opt.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			{#if cacheCountResult}
				<div role="status" aria-live="polite" class="rounded-md bg-muted p-3 text-sm">
					{cacheCountResult}
				</div>
			{/if}

			<div class="flex flex-wrap gap-2 justify-end">
				<form
					method="POST"
					action="?/getCacheCount"
					use:enhance={({ formData }) => {
						isCheckingCacheCount = true;
						if (cacheYear !== 'all') formData.set('year', cacheYear);
						return async ({ result }) => {
							try {
								if (result.type === 'success') {
									const d = result.data as { count?: number; year?: number } | undefined;
									const count = d?.count ?? 0;
									cacheCountResult = `${formatRecordCount(count)} cache entries${
										d?.year ? ` for ${d.year}` : ' across all years'
									}`;
								} else if (result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
							} finally {
								isCheckingCacheCount = false;
							}
						};
					}}
				>
					<Button type="submit" variant="outline" disabled={isCheckingCacheCount}>
						{isCheckingCacheCount ? 'Counting…' : 'Count cache entries'}
					</Button>
				</form>

				<Button
					variant="destructive"
					onclick={() => (clearCacheDialogOpen = true)}
					disabled={isClearingCache}
				>
					Clear cache
				</Button>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Play history</CardTitle>
			<CardDescription>
				Total stored play records: <strong>{formatRecordCount(data.playHistoryTotalCount)}</strong>.
				Counting or clearing is scoped by the selected year (or all years).
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="space-y-2">
				<Label for="history-year">Year</Label>
				<Select.Root type="single" name="year" bind:value={historyYear}>
					<Select.Trigger id="history-year" class="w-48">{historyYearLabel}</Select.Trigger>
					<Select.Content>
						{#each yearOptions as opt (opt.value)}
							<Select.Item value={opt.value}>{opt.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			{#if historyCountResult}
				<div role="status" aria-live="polite" class="rounded-md bg-muted p-3 text-sm">
					{historyCountResult}
				</div>
			{/if}

			<div class="flex flex-wrap gap-2 justify-end">
				<form
					method="POST"
					action="?/getPlayHistoryCount"
					use:enhance={({ formData }) => {
						isCheckingHistoryCount = true;
						if (historyYear !== 'all') formData.set('year', historyYear);
						return async ({ result }) => {
							try {
								if (result.type === 'success') {
									const d = result.data as { count?: number; year?: number } | undefined;
									const count = d?.count ?? 0;
									historyCountResult = `${formatRecordCount(count)} play records${
										d?.year ? ` for ${d.year}` : ' across all years'
									}`;
								} else if (result.type === 'failure') {
									handleFormToast(
										result.data as { success?: boolean; message?: string; error?: string }
									);
								}
							} finally {
								isCheckingHistoryCount = false;
							}
						};
					}}
				>
					<Button type="submit" variant="outline" disabled={isCheckingHistoryCount}>
						{isCheckingHistoryCount ? 'Counting…' : 'Count play records'}
					</Button>
				</form>

				<Button
					variant="destructive"
					onclick={() => (clearHistoryDialogOpen = true)}
					disabled={isClearingHistory}
				>
					Clear play history
				</Button>
			</div>
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={clearCacheDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Clear stats cache?</AlertDialog.Title>
			<AlertDialog.Description>
				Removes cached wrapped statistics for {cacheYearLabel.toLowerCase()}. Wrapped pages
				will rebuild their stats from the play history on next view.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isClearingCache}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearCache"
				use:enhance={({ formData }) => {
					isClearingCache = true;
					if (cacheYear !== 'all') formData.set('year', cacheYear);
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') {
								cacheCountResult = null;
								await invalidateAll();
							}
						} finally {
							isClearingCache = false;
							clearCacheDialogOpen = false;
						}
					};
				}}
				style="display: contents;"
			>
				<AlertDialog.Action type="submit" disabled={isClearingCache}>
					{isClearingCache ? 'Clearing…' : 'Clear cache'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={clearHistoryDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Clear play history?</AlertDialog.Title>
			<AlertDialog.Description>
				Permanently deletes play history records for {historyYearLabel.toLowerCase()}. This
				cannot be undone. Wrapped pages backed by deleted records will be empty until a
				resync repopulates them.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isClearingHistory}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearPlayHistory"
				use:enhance={({ formData }) => {
					isClearingHistory = true;
					if (historyYear !== 'all') formData.set('year', historyYear);
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as { success?: boolean; message?: string; error?: string }
								);
							}
							await update({ reset: false });
							if (result.type === 'success') {
								historyCountResult = null;
								await invalidateAll();
							}
						} finally {
							isClearingHistory = false;
							clearHistoryDialogOpen = false;
						}
					};
				}}
				style="display: contents;"
			>
				<AlertDialog.Action type="submit" disabled={isClearingHistory}>
					{isClearingHistory ? 'Clearing…' : 'Clear play history'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
