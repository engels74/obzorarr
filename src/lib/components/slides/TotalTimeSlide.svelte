<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import {
		animateNumber,
		DELAY_PRESETS,
		formatNumber,
		KEYFRAMES,
		SPRING_PRESETS
	} from '$lib/utils/animation-presets';
	import BaseSlide from './BaseSlide.svelte';
	import type { SlideMessagingContext } from './messaging-context';
	import { createPersonalContext, getSubject } from './messaging-context';
	import type { TotalTimeSlideProps } from './types';

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

	const subject = $derived(getSubject(messagingContext));

	// Derived computed values
	const hours = $derived(Math.floor(totalWatchTimeMinutes / 60));
	const minutes = $derived(Math.round(totalWatchTimeMinutes % 60));
	const days = $derived(Number((totalWatchTimeMinutes / 60 / 24).toFixed(1)));
	const weeks = $derived(Number((totalWatchTimeMinutes / 60 / 24 / 7).toFixed(1)));

	// State for animated number display
	let displayedHours = $state(0);

	// Separate number and unit to prevent layout jitter during animation
	const formattedValue = $derived.by(() => {
		if (totalWatchTimeMinutes < 60) {
			return `${Math.round(totalWatchTimeMinutes)}`;
		}
		return formatNumber(hours);
	});

	const unit = $derived(totalWatchTimeMinutes < 60 ? 'minutes' : 'hours');

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
	let valueEl: HTMLElement | undefined = $state();
	let subtitleEl: HTMLElement | undefined = $state();

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !numberEl || !valueEl || !subtitleEl || !active) return;

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
						const updateDOM = (value: number) => {
							if (valueEl) {
								valueEl.textContent = formatNumber(value);
							}
						};
						return animateNumber(0, hours, 1800, updateDOM, () => {
							displayedHours = hours;
						});
					})()
				: (() => {
						displayedHours = hours;
						return () => {};
					})();

		// Animate container with zoom-in effect
		const containerAnim = animate(container, KEYFRAMES.zoomFadeIn, {
			type: 'spring',
			...SPRING_PRESETS.snappy
		});

		// Animate number with impactful scale (more pronounced overshoot)
		const numberAnim = animate(
			numberEl,
			{
				transform: ['scale(0.5)', 'scale(1)'],
				opacity: [0, 1]
			},
			{
				type: 'spring',
				...SPRING_PRESETS.impactful,
				delay: DELAY_PRESETS.short + DELAY_PRESETS.micro
			}
		);

		// Animate subtitle with gentle fade-up
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

		<div bind:this={numberEl} class="stat-number">
			<span bind:this={valueEl} class="stat-value">{formattedValue}</span>
			<span class="stat-unit">{unit}</span>
		</div>

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
		gap: 1.5rem;
		max-width: var(--content-max-sm, 600px);
		z-index: 1;
	}

	.title {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.1em;
		opacity: 0.9;
	}

	.stat-number {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: 0.5rem 0;
		line-height: 1;
	}

	.stat-value {
		font-size: clamp(3rem, 12vw, 7rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		background: linear-gradient(
			180deg,
			hsl(var(--primary)) 0%,
			hsl(calc(var(--primary-hue) + 15) 60% 55%) 100%
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		filter: drop-shadow(0 0 30px var(--slide-glow-color, hsl(var(--primary) / 0.5)))
			drop-shadow(0 0 60px var(--slide-accent-glow, hsl(var(--primary) / 0.3)));
	}

	.stat-unit {
		font-size: clamp(2rem, 8vw, 5rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		background: linear-gradient(
			180deg,
			hsl(var(--primary)) 0%,
			hsl(calc(var(--primary-hue) + 15) 60% 55%) 100%
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		filter: drop-shadow(0 0 30px var(--slide-glow-color, hsl(var(--primary) / 0.5)))
			drop-shadow(0 0 60px var(--slide-accent-glow, hsl(var(--primary) / 0.3)));
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
			gap: 1.25rem;
		}

		.title {
			font-size: 0.875rem;
		}

		.stat-value {
			font-size: clamp(2.5rem, 14vw, 4rem);
			filter: drop-shadow(0 0 20px var(--slide-glow-color, hsl(var(--primary) / 0.4)))
				drop-shadow(0 0 40px var(--slide-accent-glow, hsl(var(--primary) / 0.2)));
		}

		.stat-unit {
			font-size: clamp(1.5rem, 10vw, 2.5rem);
			filter: drop-shadow(0 0 20px var(--slide-glow-color, hsl(var(--primary) / 0.4)))
				drop-shadow(0 0 40px var(--slide-accent-glow, hsl(var(--primary) / 0.2)));
		}

		.subtitle {
			font-size: 1rem;
		}
	}

	/* Tablet: medium typography */
	@media (min-width: 768px) and (max-width: 1023px) {
		.title {
			font-size: 1.125rem;
		}

		.stat-value {
			font-size: clamp(3.5rem, 10vw, 5.5rem);
		}

		.stat-unit {
			font-size: clamp(2rem, 7vw, 3.5rem);
		}

		.subtitle {
			font-size: 1.375rem;
		}
	}

	/* Desktop: large typography with enhanced glow */
	@media (min-width: 1024px) {
		.content {
			gap: 2rem;
		}

		.title {
			font-size: 1.25rem;
			letter-spacing: 0.12em;
		}

		.stat-value {
			font-size: clamp(4rem, 12vw, 8rem);
			filter: drop-shadow(0 0 40px var(--slide-glow-color, hsl(var(--primary) / 0.5)))
				drop-shadow(0 0 80px var(--slide-accent-glow, hsl(var(--primary) / 0.35)))
				drop-shadow(0 0 120px hsl(var(--primary) / 0.2));
		}

		.stat-unit {
			font-size: clamp(2.5rem, 8vw, 5.5rem);
			filter: drop-shadow(0 0 40px var(--slide-glow-color, hsl(var(--primary) / 0.5)))
				drop-shadow(0 0 80px var(--slide-accent-glow, hsl(var(--primary) / 0.35)))
				drop-shadow(0 0 120px hsl(var(--primary) / 0.2));
		}

		.subtitle {
			font-size: 1.5rem;
		}
	}
</style>
