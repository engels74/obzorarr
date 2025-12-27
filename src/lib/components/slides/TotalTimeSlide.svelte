<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { TotalTimeSlideProps } from './types';
	import type { SlideMessagingContext } from './messaging-context';
	import { getSubject, createPersonalContext } from './messaging-context';
	import {
		animateNumber,
		formatNumber,
		SPRING_PRESETS,
		DELAY_PRESETS
	} from '$lib/utils/animation-presets';

	/**
	 * TotalTimeSlide Component
	 *
	 * Displays the user's total watch time with animated number counting reveal.
	 * Features premium gradient text and glow effects.
	 */

	interface Props extends TotalTimeSlideProps {
		messagingContext?: SlideMessagingContext;
	}

	let {
		totalWatchTimeMinutes,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children,
		messagingContext = createPersonalContext()
	}: Props = $props();

	// Get subject for messaging (e.g., "You", "We", or server name)
	const subject = $derived(getSubject(messagingContext));

	// Derived computed values
	const hours = $derived(Math.floor(totalWatchTimeMinutes / 60));
	const minutes = $derived(Math.round(totalWatchTimeMinutes % 60));
	const days = $derived(Number((totalWatchTimeMinutes / 60 / 24).toFixed(1)));
	const weeks = $derived(Number((totalWatchTimeMinutes / 60 / 24 / 7).toFixed(1)));

	// State for animated number display
	let displayedHours = $state(0);

	// Format for initial display and SSR - animation updates DOM directly
	// This avoids triggering Svelte reactivity ~60 times/second during count-up
	const formattedTime = $derived.by(() => {
		if (totalWatchTimeMinutes < 60) {
			return `${Math.round(totalWatchTimeMinutes)} minutes`;
		}
		if (hours < 24) {
			return `${hours} hours`;
		}
		// For hours >= 24, show final value; animation updates DOM directly
		return `${formatNumber(hours)} hours`;
	});

	const comparisonText = $derived.by(() => {
		if (days >= 7) {
			return `That's ${weeks} weeks of content!`;
		}
		if (days >= 1) {
			return `That's ${days} days of content!`;
		}
		return `That's ${hours} hours of entertainment!`;
	});

	// Element references for animation
	let container: HTMLElement | undefined = $state();
	let numberEl: HTMLElement | undefined = $state();
	let subtitleEl: HTMLElement | undefined = $state();

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !numberEl || !subtitleEl || !active) return;

		// Check reduced motion preference
		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate) {
			// Instant display for reduced motion
			container.style.opacity = '1';
			container.style.transform = 'none';
			numberEl.style.opacity = '1';
			numberEl.style.transform = 'none';
			subtitleEl.style.opacity = '1';
			displayedHours = hours;
			onAnimationComplete?.();
			return;
		}

		// Start number animation (odometer effect)
		// Update DOM directly to avoid triggering Svelte reactivity ~60 times/second
		const stopNumberAnim =
			hours >= 24
				? (() => {
						// Direct DOM update function - bypasses reactive state updates
						const updateDOM = (value: number) => {
							if (numberEl) {
								numberEl.textContent = `${formatNumber(value)} hours`;
							}
						};
						// Start from 0, animate to hours, over 1500ms
						return animateNumber(0, hours, 1500, updateDOM, () => {
							// Set final state for consistency after animation completes
							displayedHours = hours;
						});
					})()
				: (() => {
						displayedHours = hours;
						return () => {};
					})();

		// Animate container
		const containerAnim = animate(
			container,
			{ opacity: [0, 1], transform: ['translateY(30px)', 'translateY(0)'] },
			{ type: 'spring', ...SPRING_PRESETS.snappy }
		);

		// Animate number with scale (spring physics creates natural overshoot)
		const numberAnim = animate(
			numberEl,
			{
				transform: ['scale(0.6)', 'scale(1)'],
				opacity: [0, 1]
			},
			{
				type: 'spring',
				...SPRING_PRESETS.bouncy,
				delay: DELAY_PRESETS.short
			}
		);

		// Animate subtitle with fade-up
		const subtitleAnim = animate(
			subtitleEl,
			{ opacity: [0, 1], transform: ['translateY(15px)', 'translateY(0)'] },
			{
				type: 'spring',
				...SPRING_PRESETS.gentle,
				delay: DELAY_PRESETS.medium
			}
		);

		// Call completion callback
		subtitleAnim.finished.then(() => {
			onAnimationComplete?.();
		});

		// Cleanup function
		return () => {
			containerAnim.stop();
			numberAnim.stop();
			subtitleAnim.stop();
			stopNumberAnim();
		};
	});
</script>

<BaseSlide {active} class="total-time-slide {klass}" variant="highlight">
	<div bind:this={container} class="content">
		<h2 class="title">{subject} watched</h2>

		<p bind:this={numberEl} class="stat-number">
			{formattedTime}
		</p>

		<p bind:this={subtitleEl} class="subtitle">
			{comparisonText}
		</p>

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
		gap: 1.25rem;
		z-index: 1;
	}

	.title {
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.1em;
		opacity: 0.9;
	}

	.stat-number {
		font-size: clamp(3rem, 10vw, 6rem);
		font-weight: 800;
		margin: 0.5rem 0;
		letter-spacing: -0.02em;
		/* Gradient text effect */
		background: linear-gradient(
			180deg,
			hsl(var(--primary)) 0%,
			hsl(calc(var(--primary-hue) + 15) 70% 65%) 100%
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		/* Glow effect via filter */
		filter: drop-shadow(0 0 30px hsl(var(--primary) / 0.5))
			drop-shadow(0 0 60px hsl(var(--primary) / 0.3));
	}

	.subtitle {
		font-size: 1.25rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		opacity: 0.85;
	}

	.extra {
		margin-top: 2rem;
	}

	/* Mobile: compact typography */
	@media (max-width: 767px) {
		.content {
			gap: 1rem;
		}

		.title {
			font-size: 1.25rem;
		}

		.stat-number {
			font-size: clamp(2.5rem, 12vw, 4rem);
			filter: drop-shadow(0 0 20px hsl(var(--primary) / 0.4))
				drop-shadow(0 0 40px hsl(var(--primary) / 0.2));
		}

		.subtitle {
			font-size: 1rem;
		}
	}

	/* Tablet: medium typography */
	@media (min-width: 768px) and (max-width: 1023px) {
		.title {
			font-size: 1.75rem;
		}

		.stat-number {
			font-size: clamp(3.5rem, 10vw, 5.5rem);
		}

		.subtitle {
			font-size: 1.375rem;
		}
	}

	/* Desktop: large typography with enhanced glow */
	@media (min-width: 1024px) {
		.content {
			gap: 1.5rem;
		}

		.title {
			font-size: 2rem;
		}

		.stat-number {
			font-size: clamp(4rem, 12vw, 7rem);
			filter: drop-shadow(0 0 40px hsl(var(--primary) / 0.5))
				drop-shadow(0 0 80px hsl(var(--primary) / 0.35))
				drop-shadow(0 0 120px hsl(var(--primary) / 0.2));
		}

		.subtitle {
			font-size: 1.5rem;
		}
	}
</style>
