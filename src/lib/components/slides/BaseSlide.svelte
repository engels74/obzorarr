<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * BaseSlide Component
	 *
	 * Shared wrapper component for all slides providing:
	 * - Layered premium background system (gradient + noise + vignette)
	 * - Glassmorphism variant for luxurious effects
	 * - Reduced motion support
	 * - Active state management
	 *
	 * Implements premium visual aesthetics for wrapped pages
	 */

	interface Props {
		/** Whether the slide is currently active/visible */
		active?: boolean;
		/** Additional CSS classes */
		class?: string;
		/** Variant for different visual treatments */
		variant?: 'default' | 'highlight' | 'dark' | 'glass';
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
		padding: 2rem;
		text-align: center;
		background: var(
			--slide-bg-gradient,
			linear-gradient(135deg, hsl(var(--primary-hue) 30% 12%) 0%, hsl(var(--primary-hue) 20% 8%) 100%)
		);
		color: hsl(var(--foreground));
		position: relative;
		overflow: hidden;
	}

	/* Noise texture layer */
	.slide::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
		opacity: var(--slide-noise-opacity, 0.03);
		pointer-events: none;
		mix-blend-mode: overlay;
		z-index: 1;
	}

	/* Vignette overlay */
	.slide::after {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 80% 80% at 50% 50%,
			transparent 0%,
			hsl(0 0% 0% / var(--slide-vignette-opacity, 0.4)) 100%
		);
		pointer-events: none;
		z-index: 2;
	}

	.slide:not(.active) {
		visibility: hidden;
		position: absolute;
	}

	/* Default variant - uses slide-bg-gradient */
	/* Already set in base .slide styles */

	/* Highlight variant - adds subtle glow from top */
	.variant-highlight::before {
		background: radial-gradient(ellipse 60% 40% at 50% 0%, var(--slide-glow-color, hsl(var(--primary) / 0.2)) 0%, transparent 70%),
			url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
		opacity: 1;
	}

	/* Dark variant - deeper, more dramatic */
	.variant-dark {
		background: linear-gradient(
			180deg,
			hsl(var(--primary-hue) 15% 3%) 0%,
			hsl(var(--primary-hue) 10% 2%) 100%
		);
	}

	.variant-dark::after {
		background: radial-gradient(
			ellipse 70% 70% at 50% 50%,
			transparent 0%,
			hsl(0 0% 0% / 0.6) 100%
		);
	}

	/* Glass variant - glassmorphism effect */
	.variant-glass {
		background: var(--slide-bg-gradient);
	}

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
		box-shadow: var(
			--shadow-elevation-medium,
			0 4px 8px hsl(0 0% 0% / 0.4),
			0 8px 16px hsl(0 0% 0% / 0.2)
		);
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
			padding: 1rem;
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
			padding: 2rem;
		}
	}

	/* Desktop: generous padding */
	@media (min-width: 1024px) {
		.slide {
			padding: 3rem;
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
