<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		active?: boolean;
		class?: string;
		variant?: 'default' | 'highlight' | 'dark' | 'glass';
		children: Snippet;
	}

	let { active = true, class: klass = '', variant = 'default', children }: Props = $props();
</script>

<section
	class="slide {klass}"
	class:active
	class:variant-highlight={variant === 'highlight'}
	class:variant-dark={variant === 'dark'}
	class:variant-glass={variant === 'glass'}
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
		padding: 2rem 1.5rem;
		text-align: center;
		background: transparent;
		color: hsl(var(--foreground));
		position: relative;
		overflow: visible;
	}

	/* Note: Noise and vignette effects are now applied at the StoryMode/ScrollMode level
	   to ensure seamless full-viewport coverage without visible "card" boundaries */

	.slide:not(.active) {
		visibility: hidden;
		position: absolute;
	}

	/* Variant styles - all use transparent background, effects from parent */
	/* Variants can add additional content-level styling if needed */

	/* Highlight variant - adds subtle glow overlay (content-level effect) */
	.variant-highlight::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 60% 40% at 50% 0%,
			var(--slide-glow-color, hsl(var(--primary) / 0.15)) 0%,
			transparent 70%
		);
		pointer-events: none;
		z-index: 0;
	}

	/* Dark variant - no additional styling needed, uses parent background */

	/* Glass variant - no background change, relies on glass containers */

	/* Glass variant applies glass effect to direct content children */
	.variant-glass > :global(.content),
	.variant-glass > :global(.slide-content),
	.variant-glass > :global(.glass-container) {
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.4));
		backdrop-filter: blur(var(--slide-glass-blur, 20px));
		-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
		border: 1px solid var(--slide-glass-border, hsl(var(--primary-hue) 30% 40% / 0.3));
		border-radius: calc(var(--radius) * 2);
		padding: 2rem;
		box-shadow:
			var(--shadow-elevation-medium, 0 4px 8px hsl(0 0% 0% / 0.4), 0 8px 16px hsl(0 0% 0% / 0.2)),
			inset 0 1px 0 hsl(0 0% 100% / 0.08);
		position: relative;
		z-index: 3;
	}

	/* Glass top highlight line */
	.variant-glass > :global(.content)::before,
	.variant-glass > :global(.slide-content)::before,
	.variant-glass > :global(.glass-container)::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(90deg, transparent, hsl(var(--primary) / 0.4), transparent);
		border-radius: inherit;
	}

	/* Mobile: compact padding */
	@media (max-width: 767px) {
		.slide {
			padding: 1.25rem 1rem;
		}

		.variant-glass > :global(.content),
		.variant-glass > :global(.slide-content),
		.variant-glass > :global(.glass-container) {
			padding: 1.25rem;
			border-radius: var(--radius);
		}
	}

	/* Tablet: medium padding */
	@media (min-width: 768px) {
		.slide {
			padding: 2rem 1.5rem;
		}
	}

	/* Desktop: generous padding */
	@media (min-width: 1024px) {
		.slide {
			padding: 2.5rem 2rem;
		}

		.variant-glass > :global(.content),
		.variant-glass > :global(.slide-content),
		.variant-glass > :global(.glass-container) {
			padding: 2.5rem;
		}
	}

	/* Ensure content is above background layers */
	.slide > :global(*) {
		position: relative;
		z-index: 3;
	}
</style>
