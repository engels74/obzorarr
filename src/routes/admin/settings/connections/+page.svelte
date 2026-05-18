<script lang="ts">
import type { PageData } from './$types';

interface Props {
	data: PageData;
}

let { data }: Props = $props();
</script>

<svelte:head>
	<title>Connections — Settings</title>
</svelte:head>

<section class="placeholder">
	<h1>Connections</h1>
	<p>
		Plex + OpenAI configuration. The full UI lives at
		<a href="/admin/settings?tab=connections">/admin/settings?tab=connections</a> until the PR-2 UI
		migration (US-020) lands.
	</p>
	<details>
		<summary>Scoped load shape (debug)</summary>
		<pre>{JSON.stringify({ apiConfigVersion: data.apiConfigVersion, plexAllowInsecureLocalHttp: data.settings.plexAllowInsecureLocalHttp }, null, 2)}</pre>
	</details>
</section>

<style>
	.placeholder {
		padding: 2rem;
		max-width: 60ch;
	}
	.placeholder h1 {
		font-size: 1.5rem;
		margin: 0 0 0.5rem;
	}
	.placeholder p {
		color: oklch(var(--muted-foreground));
	}
	.placeholder a {
		color: oklch(var(--primary));
	}
	.placeholder details {
		margin-top: 1rem;
		font-size: 0.8125rem;
	}
	.placeholder pre {
		background: oklch(var(--muted) / 0.4);
		padding: 0.75rem;
		border-radius: 0.375rem;
		overflow-x: auto;
	}
</style>
