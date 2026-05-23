<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '$lib/utils.js';

interface Props {
	children: Snippet;
	class?: string;
	align?: 'end' | 'between';
}

let { children, class: className, align = 'end' }: Props = $props();
</script>

<div class={cn('settings-action-bar', align === 'between' && 'between', className)}>
	{@render children()}
</div>

<style>
	.settings-action-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.625rem;
		padding-top: 0.25rem;
	}

	.settings-action-bar.between {
		justify-content: space-between;
	}

	:global(.settings-action-bar > form) {
		display: inline-flex;
		margin: 0;
	}

	:global(.settings-action-bar [data-slot='button']),
	:global(.settings-action-bar button) {
		min-height: var(--min-tap-size);
	}

	@media (max-width: 520px) {
		.settings-action-bar {
			align-items: stretch;
		}

		:global(.settings-action-bar > form),
		:global(.settings-action-bar [data-slot='button']),
		:global(.settings-action-bar button) {
			width: 100%;
		}
	}
</style>
