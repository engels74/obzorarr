<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '$lib/utils.js';

interface Props {
	title: string;
	description?: string;
	control: Snippet;
	icon?: Snippet;
	swatches?: string[];
	meta?: string;
	class?: string;
}

let { title, description, control, icon, swatches = [], meta, class: className }: Props = $props();
</script>

<label class={cn('settings-option-card', className)}>
	<span class="option-control">{@render control()}</span>

	{#if icon}
		<span class="option-icon" aria-hidden="true">{@render icon()}</span>
	{/if}

	<span class="option-copy">
		<span class="option-title">{title}</span>
		{#if description}
			<span class="option-description">{description}</span>
		{/if}
	</span>

	{#if swatches.length > 0 || meta}
		<span class="option-meta" aria-hidden={swatches.length > 0 ? 'true' : undefined}>
			{#if swatches.length > 0}
				<span class="theme-swatches">
					{#each swatches as swatch, index (`${swatch}-${index}`)}
						<span class="theme-swatch" style={`background: ${swatch};`}></span>
					{/each}
				</span>
			{/if}
			{#if meta}
				<span class="meta-text">{meta}</span>
			{/if}
		</span>
	{/if}
</label>

<style>
	.settings-option-card {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		min-height: 3.6rem;
		padding: 0.85rem 0.95rem;
		border: 1px solid oklch(var(--border));
		border-radius: calc(var(--radius) + 0.35rem);
		background: oklch(var(--card) / 0.45);
		cursor: pointer;
		transition:
			border-color 0.18s ease,
			background 0.18s ease,
			box-shadow 0.18s ease,
			transform 0.18s ease;
	}

	.settings-option-card:hover {
		border-color: oklch(var(--primary) / 0.38);
		background: oklch(var(--muted) / 0.42);
	}

	:global(.settings-option-card:has([data-state='checked'])),
	:global(.settings-option-card:has([data-checked])) {
		border-color: oklch(var(--primary) / 0.62);
		background: linear-gradient(
			135deg,
			oklch(var(--primary) / 0.12),
			oklch(var(--muted) / 0.3)
		);
		box-shadow: inset 0 0 0 1px oklch(var(--primary) / 0.1);
	}

	.option-control,
	.option-icon,
	.option-meta,
	.theme-swatches {
		display: inline-flex;
		align-items: center;
	}

	.option-icon {
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		border: 1px solid oklch(var(--border));
		background: oklch(var(--background) / 0.5);
		color: oklch(var(--primary));
	}

	:global(.option-icon svg) {
		width: 1rem;
		height: 1rem;
	}

	.option-copy {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.25rem;
	}

	.option-title {
		color: oklch(var(--foreground));
		font-size: 0.9rem;
		font-weight: 650;
		line-height: 1.25;
	}

	.option-description {
		color: oklch(var(--muted-foreground));
		font-size: 0.76rem;
		font-weight: 400;
		line-height: 1.4;
	}

	.option-meta {
		justify-content: flex-end;
		gap: 0.55rem;
	}

	.theme-swatches {
		isolation: isolate;
	}

	.theme-swatch {
		display: inline-block;
		width: 1.05rem;
		height: 1.05rem;
		border: 2px solid oklch(var(--background));
		border-radius: 999px;
		box-shadow: 0 0 0 1px oklch(var(--border));
	}

	.theme-swatch + .theme-swatch {
		margin-left: -0.28rem;
	}

	.meta-text {
		color: oklch(var(--muted-foreground));
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	@media (max-width: 560px) {
		.settings-option-card {
			grid-template-columns: auto minmax(0, 1fr) auto;
		}

		.option-icon {
			display: none;
		}
	}
</style>
