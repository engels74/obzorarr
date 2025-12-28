<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { PercentileSlideProps } from './types';
	import type { SlideMessagingContext } from './messaging-context';
	import { getPossessive, createPersonalContext } from './messaging-context';
	import { SPRING_PRESETS, DELAY_PRESETS } from '$lib/utils/animation-presets';

	interface Props extends PercentileSlideProps {
		messagingContext?: SlideMessagingContext;
	}

	let {
		percentileRank,
		totalUsers,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children,
		messagingContext = createPersonalContext()
	}: Props = $props();

	const possessive = $derived(getPossessive(messagingContext));

	// Compute the "top X%" value
	const topPercentage = $derived(Math.max(1, Math.round(100 - percentileRank)));
	const isTopPerformer = $derived(topPercentage <= 10);

	// Generate message based on percentile
	const message = $derived.by(() => {
		if (topPercentage <= 1) return "You're the #1 viewer!";
		if (topPercentage <= 5) return "You're in the top 5%!";
		if (topPercentage <= 10) return "You're a super fan!";
		if (topPercentage <= 25) return "You're in the top quarter!";
		if (topPercentage <= 50) return 'You watch more than most!';
		return 'Keep watching!';
	});

	// Element references
	let container: HTMLElement | undefined = $state();
	let numberEl: HTMLElement | undefined = $state();
	let messageEl: HTMLElement | undefined = $state();

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !numberEl || !messageEl || !active) return;

		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate) {
			container.style.opacity = '1';
			container.style.transform = 'none';
			numberEl.style.opacity = '1';
			numberEl.style.transform = 'none';
			messageEl.style.opacity = '1';
			messageEl.style.transform = 'none';
			onAnimationComplete?.();
			return;
		}

		const animations: ReturnType<typeof animate>[] = [];

		// Animate container
		const containerAnim = animate(
			container,
			{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
			{ type: 'spring', ...SPRING_PRESETS.snappy }
		);
		animations.push(containerAnim);

		// Animate number with dramatic bounce (spring physics creates natural overshoot)
		const numberAnim = animate(
			numberEl,
			{
				transform: ['scale(0) rotate(-10deg)', 'scale(1) rotate(0deg)'],
				opacity: [0, 1]
			},
			{
				type: 'spring',
				...SPRING_PRESETS.bouncy,
				delay: DELAY_PRESETS.short
			}
		);
		animations.push(numberAnim);

		// Animate message
		const messageAnim = animate(
			messageEl,
			{ opacity: [0, 1], transform: ['translateY(15px)', 'translateY(0)'] },
			{ type: 'spring', ...SPRING_PRESETS.gentle, delay: DELAY_PRESETS.long }
		);
		animations.push(messageAnim);

		messageAnim.finished.then(() => {
			onAnimationComplete?.();
		});

		return () => {
			animations.forEach((a) => a.stop());
		};
	});
</script>

<BaseSlide
	{active}
	class="percentile-slide {klass}"
	variant={isTopPerformer ? 'highlight' : 'default'}
>
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Ranking</h2>

		<div class="stat-wrapper" class:top-performer={isTopPerformer}>
			<div class="gradient-ring" class:animate-spin={active}></div>
			<div bind:this={numberEl} class="stat-container">
				<span class="prefix">Top</span>
				<span class="percentage">{topPercentage}%</span>
			</div>
		</div>

		<p bind:this={messageEl} class="message">
			{message}
		</p>

		{#if totalUsers && totalUsers > 1}
			<p class="total-users">
				Out of {totalUsers} viewers on this server
			</p>
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
		gap: 1.5rem;
		z-index: 1;
	}

	.title {
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	/* Wrapper for gradient ring effect */
	.stat-wrapper {
		position: relative;
		width: 220px;
		height: 220px;
		aspect-ratio: 1;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Rotating conic gradient ring */
	.gradient-ring {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: conic-gradient(
			from 0deg,
			hsl(var(--primary)),
			hsl(calc(var(--primary-hue) + 60) 70% 60%),
			hsl(calc(var(--primary-hue) + 120) 70% 60%),
			hsl(calc(var(--primary-hue) + 180) 70% 60%),
			hsl(calc(var(--primary-hue) + 240) 70% 60%),
			hsl(calc(var(--primary-hue) + 300) 70% 60%),
			hsl(var(--primary))
		);
		mask: radial-gradient(farthest-side, transparent calc(100% - 5px), black calc(100% - 4px));
		-webkit-mask: radial-gradient(
			farthest-side,
			transparent calc(100% - 5px),
			black calc(100% - 4px)
		);
		filter: blur(1px);
		opacity: 0.7;
	}

	.gradient-ring.animate-spin {
		animation: spin 8s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Disable animation for reduced motion preference */
	@media (prefers-reduced-motion: reduce) {
		.gradient-ring.animate-spin {
			animation: none;
		}
	}

	/* Top performer gold gradient */
	.top-performer .gradient-ring {
		background: conic-gradient(
			from 0deg,
			hsl(45 90% 50%),
			hsl(35 85% 55%),
			hsl(55 90% 60%),
			hsl(45 90% 50%),
			hsl(35 85% 55%),
			hsl(55 90% 60%),
			hsl(45 90% 50%)
		);
		opacity: 0.9;
		filter: blur(0.5px);
	}

	.stat-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		border-radius: 50%;
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.5));
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		width: calc(100% - 10px);
		aspect-ratio: 1;
		justify-content: center;
		box-shadow:
			inset 0 2px 4px hsl(0 0% 100% / 0.1),
			inset 0 -2px 4px hsl(0 0% 0% / 0.2),
			var(--shadow-elevation-high, 0 8px 24px hsl(0 0% 0% / 0.4));
		position: relative;
		z-index: 1;
	}

	/* Glow effect for top performer */
	.top-performer .stat-container {
		box-shadow:
			inset 0 2px 4px hsl(0 0% 100% / 0.15),
			inset 0 -2px 4px hsl(0 0% 0% / 0.2),
			var(--shadow-elevation-high, 0 8px 24px hsl(0 0% 0% / 0.4)),
			0 0 50px hsl(45 90% 50% / 0.25);
	}

	.prefix {
		font-size: 1.125rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 500;
	}

	.percentage {
		font-size: clamp(3rem, 8vw, 4.5rem);
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
		filter: drop-shadow(0 0 15px hsl(var(--primary) / 0.4));
	}

	/* Gold gradient for top performer */
	.top-performer .percentage {
		background: linear-gradient(180deg, hsl(45 90% 55%) 0%, hsl(35 85% 50%) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		filter: drop-shadow(0 0 20px hsl(45 90% 50% / 0.5));
	}

	.message {
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		text-align: center;
		padding: 0.5rem 1.25rem;
		background: hsl(var(--primary) / 0.08);
		border-radius: calc(var(--radius) * 1.5);
	}

	/* Gold styling for top performer message */
	.top-performer ~ .message {
		background: hsl(45 90% 50% / 0.1);
		color: hsl(45 75% 65%);
	}

	.total-users {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		padding: 0.25rem 0.75rem;
		background: hsl(var(--primary) / 0.05);
		border-radius: var(--radius);
	}

	.extra {
		margin-top: 1.5rem;
	}

	/* Mobile: compact circle */
	@media (max-width: 767px) {
		.content {
			gap: 1.25rem;
		}

		.title {
			font-size: 1.25rem;
		}

		.stat-wrapper {
			width: 170px;
			height: 170px;
		}

		.gradient-ring {
			mask: radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 3px));
			-webkit-mask: radial-gradient(
				farthest-side,
				transparent calc(100% - 4px),
				black calc(100% - 3px)
			);
		}

		.stat-container {
			padding: 1.25rem;
			width: calc(100% - 8px);
		}

		.prefix {
			font-size: 0.9375rem;
		}

		.message {
			font-size: 1.25rem;
			padding: 0.375rem 1rem;
		}
	}

	/* Tablet: medium circle */
	@media (min-width: 768px) and (max-width: 1023px) {
		.title {
			font-size: 1.75rem;
		}

		.stat-wrapper {
			width: 240px;
			height: 240px;
		}

		.stat-container {
			padding: 2.25rem;
		}

		.percentage {
			font-size: clamp(3.5rem, 9vw, 5rem);
		}

		.message {
			font-size: 1.625rem;
		}

		.total-users {
			font-size: 1rem;
		}
	}

	/* Desktop: large circle */
	@media (min-width: 1024px) {
		.content {
			gap: 2rem;
		}

		.title {
			font-size: 2rem;
		}

		.stat-wrapper {
			width: 280px;
			height: 280px;
		}

		.gradient-ring {
			mask: radial-gradient(farthest-side, transparent calc(100% - 6px), black calc(100% - 5px));
			-webkit-mask: radial-gradient(
				farthest-side,
				transparent calc(100% - 6px),
				black calc(100% - 5px)
			);
		}

		.stat-container {
			padding: 2.5rem;
			width: calc(100% - 12px);
		}

		.prefix {
			font-size: 1.25rem;
		}

		.percentage {
			font-size: clamp(4rem, 10vw, 5.5rem);
		}

		.message {
			font-size: 1.75rem;
		}

		.total-users {
			font-size: 1rem;
		}
	}
</style>
