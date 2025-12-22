<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Wrapped Layout
	 *
	 * Provides the wrapped theme data to nested routes.
	 * The actual theme application is handled by the root layout,
	 * which reads the merged wrappedTheme data from this layout's server load.
	 */

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

{@render children()}
