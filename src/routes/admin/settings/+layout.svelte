<script lang="ts">
import type { Snippet } from 'svelte';
import { page } from '$app/state';

interface Props {
	children: Snippet;
}

let { children }: Props = $props();

const tabs = [
	{ name: 'Connections', href: '/admin/settings/connections' },
	{ name: 'Security', href: '/admin/settings/security' },
	{ name: 'Data', href: '/admin/settings/data' },
	{ name: 'System', href: '/admin/settings/system' },
	{ name: 'Appearance', href: '/admin/settings/appearance' },
	{ name: 'Privacy', href: '/admin/settings/privacy' }
];

// The monolithic /admin/settings page renders its own tab bar. Suppress the
// new shell tab list there to avoid double navigation until US-022 deletes
// the monolith.
const isMonolith = $derived(page.url.pathname === '/admin/settings');
</script>

{#if !isMonolith}
	<nav class="settings-tabs" aria-label="Settings sections">
		<ul>
			{#each tabs as tab (tab.href)}
				{@const active = page.url.pathname.startsWith(tab.href)}
				<li>
					<a
						href={tab.href}
						class:active
						aria-current={active ? 'page' : undefined}
					>
						{tab.name}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}

{@render children()}

<style>
	.settings-tabs {
		border-bottom: 1px solid oklch(var(--border));
		padding: 0 2rem;
	}
	.settings-tabs ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.settings-tabs a {
		display: inline-flex;
		align-items: center;
		padding: 0.75rem 1rem;
		color: oklch(var(--muted-foreground));
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: color 0.15s ease, border-color 0.15s ease;
	}
	.settings-tabs a:hover {
		color: oklch(var(--foreground));
	}
	.settings-tabs a.active {
		color: oklch(var(--primary));
		border-bottom-color: oklch(var(--primary));
	}
</style>
