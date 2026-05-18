<!--
	The monolith /admin/settings page was deleted in US-022. The route
	exists only to host the legacy ?tab= redirect (which already lives in
	+page.server.ts) and to keep the action endpoints reachable for any
	external POSTs that haven't migrated to the per-tab nested-route URLs.

	Server-side load always redirects to /admin/settings/connections;
	this template renders only if a client somehow hydrates without the
	redirect firing. The client-side fallback uses goto() to land on
	the same destination so bookmarks resolve cleanly.
-->
<script lang="ts">
import { onMount } from 'svelte';
import { goto } from '$app/navigation';

onMount(() => {
	void goto('/admin/settings/connections', { replaceState: true });
});
</script>

<p>Redirecting…</p>
