<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { BingeSlideProps } from './types';
	import type { SlideMessagingContext } from './messaging-context';
	import { createPersonalContext } from './messaging-context';
	import { SPRING_PRESETS, DELAY_PRESETS } from '$lib/utils/animation-presets';

	/**
	 * BingeSlide Component
	 *
	 * Displays information about the user's longest binge watching session
	 * with premium hero-style glassmorphism container and gradient text effects.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	interface Props extends BingeSlideProps {
		messagingContext?: SlideMessagingContext;
	}

	let {
		longestBinge,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children,
		messagingContext = createPersonalContext()
	}: Props = $props();

	// Check if we have binge data
	const hasBinge = $derived(longestBinge !== null);

	// Format duration
	const duration = $derived.by(() => {
		if (!longestBinge) return '';
		const hours = Math.floor(longestBinge.totalMinutes / 60);
		const minutes = Math.round(longestBinge.totalMinutes % 60);
		if (hours === 0) return `${minutes} minutes`;
		if (minutes === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
		return `${hours}h ${minutes}m`;
	});

	// Format date
	const bingeDate = $derived.by(() => {
		if (!longestBinge) return '';
		const date = new Date(longestBinge.startTime * 1000);
		return date.toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric'
		});
	});

	// Element references
	let container: HTMLElement | undefined = $state();
	let statEl: HTMLElement | undefined = $state();
	let detailsEl: HTMLElement | undefined = $state();

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !active) return;

		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate) {
			container.style.opacity = '1';
			container.style.transform = 'none';
			if (statEl) {
				statEl.style.opacity = '1';
				statEl.style.transform = 'none';
			}
			if (detailsEl) {
				detailsEl.style.opacity = '1';
				detailsEl.style.transform = 'none';
			}
			onAnimationComplete?.();
			return;
		}

		// Animate container
		const containerAnim = animate(
			container,
			{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
			{ type: 'spring', ...SPRING_PRESETS.snappy }
		);

		const animations = [containerAnim];

		if (statEl) {
			const statAnim = animate(
				statEl,
				{
					transform: ['scale(0.7)', 'scale(1.02)', 'scale(1)'],
					opacity: [0, 1, 1]
				},
				{ type: 'spring', ...SPRING_PRESETS.bouncy, delay: DELAY_PRESETS.short }
			);
			animations.push(statAnim);
		}

		if (detailsEl) {
			const detailsAnim = animate(
				detailsEl,
				{ opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] },
				{ type: 'spring', ...SPRING_PRESETS.gentle, delay: DELAY_PRESETS.medium }
			);
			animations.push(detailsAnim);

			detailsAnim.finished.then(() => {
				onAnimationComplete?.();
			});
		} else {
			containerAnim.finished.then(() => {
				onAnimationComplete?.();
			});
		}

		return () => {
			animations.forEach((a) => a.stop());
		};
	});
</script>

<BaseSlide {active} class="binge-slide {klass}" variant="dark">
	<div bind:this={container} class="content">
		<h2 class="title">Longest Binge Session</h2>

		{#if hasBinge && longestBinge}
			<div bind:this={statEl} class="stat-container">
				<span class="duration">{duration}</span>
				<span class="plays"
					>{longestBinge.plays} {longestBinge.plays === 1 ? 'episode' : 'episodes'}</span
				>
			</div>

			<div bind:this={detailsEl} class="details">
				<p class="date">On {bingeDate}</p>
				<p class="time-range">
					{new Date(longestBinge.startTime * 1000).toLocaleTimeString('en-US', {
						hour: 'numeric',
						minute: '2-digit'
					})}
					-
					{new Date(longestBinge.endTime * 1000).toLocaleTimeString('en-US', {
						hour: 'numeric',
						minute: '2-digit'
					})}
				</p>
			</div>
		{:else}
			<div class="no-binge">
				<p class="no-binge-message">No binge sessions detected</p>
				<p class="no-binge-hint">A binge is 2+ consecutive plays within 30 minutes</p>
			</div>
		{/if}

		{#if children}
			<div class="extra">
				{@render children()}
			</div>
		{/if}
	</div>
</BaseSlide>

<style>
	.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
		z-index: 1;
	}

	.title {
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.stat-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2.5rem 4rem;
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.4));
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-radius: calc(var(--radius) * 2);
		border: 2px solid hsl(var(--primary) / 0.4);
		box-shadow:
			var(--shadow-elevation-high, 0 8px 24px hsl(0 0% 0% / 0.4)),
			0 0 40px hsl(var(--primary) / 0.15),
			inset 0 1px 0 hsl(0 0% 100% / 0.1);
		position: relative;
	}

	/* Top highlight line */
	.stat-container::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(90deg, transparent, hsl(var(--primary) / 0.6), transparent);
		border-radius: inherit;
	}

	.duration {
		font-size: clamp(2.5rem, 8vw, 4rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		/* Gradient text effect */
		background: linear-gradient(
			180deg,
			hsl(var(--primary)) 0%,
			hsl(calc(var(--primary-hue) + 20) 70% 65%) 100%
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		filter: drop-shadow(0 0 20px hsl(var(--primary) / 0.4));
	}

	.plays {
		font-size: 1.25rem;
		color: hsl(var(--foreground));
		margin-top: 0.75rem;
		padding: 0.25rem 0.75rem;
		background: hsl(var(--primary) / 0.1);
		border-radius: var(--radius);
	}

	.details {
		text-align: center;
		padding: 0.75rem 1.5rem;
		background: hsl(var(--primary) / 0.05);
		border-radius: var(--radius);
	}

	.date {
		font-size: 1.125rem;
		color: hsl(var(--foreground));
		font-weight: 500;
	}

	.time-range {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.375rem;
	}

	.no-binge {
		text-align: center;
		padding: 2rem;
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.3));
		border-radius: calc(var(--radius) * 1.5);
		border: 1px solid var(--slide-glass-border, hsl(var(--primary-hue) 30% 40% / 0.2));
	}

	.no-binge-message {
		font-size: 1.25rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}

	.no-binge-hint {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		opacity: 0.7;
		margin-top: 0.5rem;
	}

	.extra {
		margin-top: 1.5rem;
	}

	/* Mobile: compact container */
	@media (max-width: 767px) {
		.content {
			gap: 1.5rem;
		}

		.title {
			font-size: 1.25rem;
		}

		.stat-container {
			padding: 1.75rem 2.5rem;
		}

		.plays {
			font-size: 1.0625rem;
		}

		.details {
			padding: 0.5rem 1rem;
		}

		.date {
			font-size: 1rem;
		}
	}

	/* Tablet: medium container */
	@media (min-width: 768px) and (max-width: 1023px) {
		.title {
			font-size: 1.75rem;
		}

		.stat-container {
			padding: 2.5rem 4rem;
		}

		.duration {
			font-size: clamp(2.75rem, 9vw, 4.5rem);
		}

		.plays {
			font-size: 1.375rem;
		}

		.date {
			font-size: 1.25rem;
		}

		.time-range {
			font-size: 1rem;
		}
	}

	/* Desktop: large container */
	@media (min-width: 1024px) {
		.title {
			font-size: 2rem;
		}

		.stat-container {
			padding: 3.5rem 6rem;
			border-radius: calc(var(--radius) * 2.5);
			border-width: 2px;
		}

		.duration {
			font-size: clamp(3rem, 10vw, 5rem);
			filter: drop-shadow(0 0 30px hsl(var(--primary) / 0.5));
		}

		.plays {
			font-size: 1.5rem;
			margin-top: 1rem;
		}

		.date {
			font-size: 1.375rem;
		}

		.time-range {
			font-size: 1.125rem;
			margin-top: 0.5rem;
		}
	}
</style>
