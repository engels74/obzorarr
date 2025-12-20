<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * BaseSlide Component
	 *
	 * Shared wrapper component for all slides providing:
	 * - Common styling with Soviet/communist aesthetic
	 * - Reduced motion support
	 * - Active state management
	 *
	 * Implements Requirement 5.6 (animations with Motion One)
	 */

	interface Props {
		/** Whether the slide is currently active/visible */
		active?: boolean;
		/** Additional CSS classes */
		class?: string;
		/** Variant for different visual treatments */
		variant?: 'default' | 'highlight' | 'dark';
		/** Children content */
		children: Snippet;
	}

	let { active = true, class: klass = '', variant = 'default', children }: Props = $props();
</script>

<section
	class="slide {klass}"
	class:active
	class:variant-highlight={variant === 'highlight'}
	class:variant-dark={variant === 'dark'}
	aria-hidden={!active}
>
	{@render children()}
</section>

<style>
	.slide {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
		text-align: center;
		background: var(--background);
		color: var(--foreground);
		position: relative;
		overflow: hidden;
	}

	.slide::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%);
		pointer-events: none;
	}

	.slide:not(.active) {
		visibility: hidden;
		position: absolute;
	}

	/* Highlight variant - Soviet red accent */
	.variant-highlight {
		background: linear-gradient(135deg, oklch(0.25 0.08 25) 0%, oklch(0.15 0.05 25) 100%);
	}

	/* Dark variant */
	.variant-dark {
		background: linear-gradient(135deg, oklch(0.12 0.01 25) 0%, oklch(0.08 0 25) 100%);
	}

	@media (max-width: 768px) {
		.slide {
			padding: 1rem;
		}
	}
</style>
