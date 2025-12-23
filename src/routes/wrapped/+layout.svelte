<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import SyncIndicator from '$lib/components/SyncIndicator.svelte';

	/**
	 * Wrapped Layout
	 *
	 * Provides the wrapped theme data and sync status to nested routes.
	 * The actual theme application is handled by the root layout,
	 * which reads the merged wrappedTheme data from this layout's server load.
	 */

	interface Props {
		children: Snippet;
		data: LayoutData;
	}

	let { children, data }: Props = $props();
</script>

{@render children()}

{#if data.syncStatus}
	<SyncIndicator inProgress={data.syncStatus.inProgress} progress={data.syncStatus.progress} />
{/if}
