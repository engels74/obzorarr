<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { TotalTimeSlideProps } from './types';
	import type { SlideMessagingContext } from './messaging-context';
	import { getSubject, createPersonalContext } from './messaging-context';

	/**
	 * TotalTimeSlide Component
	 *
	 * Displays the user's total watch time with animated number reveal.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
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

	// Format for display
	const formattedTime = $derived.by(() => {
		if (totalWatchTimeMinutes < 60) {
			return `${Math.round(totalWatchTimeMinutes)} minutes`;
		}
		if (hours < 24) {
			return `${hours} hours`;
		}
		return `${hours.toLocaleString()} hours`;
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
			onAnimationComplete?.();
			return;
		}

		// Animate container
		const containerAnim = animate(
			container,
			{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
			{ type: 'spring', stiffness: 200, damping: 20 }
		);

		// Animate number with scale
		const numberAnim = animate(
			numberEl,
			{ transform: ['scale(0.5)', 'scale(1)'], opacity: [0, 1] },
			{ type: 'spring', stiffness: 150, damping: 15, delay: 0.3 }
		);

		// Animate subtitle
		const subtitleAnim = animate(
			subtitleEl,
			{ opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] },
			{ duration: 0.5, delay: 0.6 }
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
		gap: 1rem;
		z-index: 1;
	}

	.title {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.stat-number {
		font-size: clamp(3rem, 10vw, 6rem);
		font-weight: 800;
		color: var(--primary);
		margin: 0.5rem 0;
		text-shadow: 0 4px 20px hsl(var(--primary) / 0.3);
	}

	.subtitle {
		font-size: 1.25rem;
		color: var(--muted-foreground);
	}

	.extra {
		margin-top: 2rem;
	}

	/* Mobile: compact typography */
	@media (max-width: 767px) {
		.title {
			font-size: 1.25rem;
		}

		.subtitle {
			font-size: 1.125rem;
		}
	}

	/* Tablet: medium typography */
	@media (min-width: 768px) and (max-width: 1023px) {
		.title {
			font-size: 1.75rem;
		}

		.stat-number {
			font-size: clamp(3.5rem, 10vw, 6.5rem);
		}

		.subtitle {
			font-size: 1.375rem;
		}
	}

	/* Desktop: large typography */
	@media (min-width: 1024px) {
		.title {
			font-size: 2rem;
		}

		.stat-number {
			font-size: clamp(4rem, 12vw, 7rem);
			text-shadow: 0 6px 30px hsl(var(--primary) / 0.35);
		}

		.subtitle {
			font-size: 1.5rem;
		}
	}
</style>
