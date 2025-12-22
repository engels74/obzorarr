<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { PercentileSlideProps } from './types';
	import type { SlideMessagingContext } from './messaging-context';
	import { getPossessive, createPersonalContext } from './messaging-context';

	/**
	 * PercentileSlide Component
	 *
	 * Displays the user's percentile ranking among all server users.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

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

	// Get possessive for messaging
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
			numberEl.style.opacity = '1';
			numberEl.style.transform = 'none';
			messageEl.style.opacity = '1';
			onAnimationComplete?.();
			return;
		}

		// Animate container
		const containerAnim = animate(container, { opacity: [0, 1] }, { duration: 0.4 });

		// Animate number with bounce (spring physics creates natural overshoot)
		const numberAnim = animate(
			numberEl,
			{
				transform: ['scale(0)', 'scale(1)'],
				opacity: [0, 1]
			},
			{
				type: 'spring',
				stiffness: 180,
				damping: 12,
				delay: 0.2
			}
		);

		// Animate message
		const messageAnim = animate(
			messageEl,
			{ opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] },
			{ duration: 0.5, delay: 0.6 }
		);

		messageAnim.finished.then(() => {
			onAnimationComplete?.();
		});

		return () => {
			containerAnim.stop();
			numberAnim.stop();
			messageAnim.stop();
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

		<div bind:this={numberEl} class="stat-container" class:top-performer={isTopPerformer}>
			<span class="prefix">Top</span>
			<span class="percentage">{topPercentage}%</span>
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

	.stat-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.05);
		border: 4px solid var(--primary);
		width: 200px;
		height: 200px;
		justify-content: center;
	}

	.top-performer {
		border-color: var(--slide-peak-start);
		box-shadow: 0 0 40px color-mix(in oklch, var(--slide-peak-start) 30%, transparent);
	}

	.prefix {
		font-size: 1.25rem;
		color: var(--muted-foreground);
		text-transform: uppercase;
	}

	.percentage {
		font-size: clamp(3rem, 8vw, 4.5rem);
		font-weight: 800;
		color: var(--primary);
	}

	.top-performer .percentage {
		color: var(--slide-peak-start);
	}

	.message {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--foreground);
		text-align: center;
	}

	.total-users {
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}

	.extra {
		margin-top: 1.5rem;
	}

	/* Mobile: compact circle */
	@media (max-width: 767px) {
		.title {
			font-size: 1.25rem;
		}

		.stat-container {
			width: 150px;
			height: 150px;
			padding: 1.5rem;
			border-width: 3px;
		}

		.prefix {
			font-size: 1rem;
		}

		.message {
			font-size: 1.25rem;
		}
	}

	/* Tablet: medium circle */
	@media (min-width: 768px) and (max-width: 1023px) {
		.title {
			font-size: 1.75rem;
		}

		.stat-container {
			width: 220px;
			height: 220px;
			padding: 2.25rem;
		}

		.percentage {
			font-size: clamp(3.5rem, 9vw, 5rem);
		}

		.message {
			font-size: 1.625rem;
		}
	}

	/* Desktop: large circle */
	@media (min-width: 1024px) {
		.title {
			font-size: 2rem;
		}

		.stat-container {
			width: 250px;
			height: 250px;
			padding: 2.5rem;
			border-width: 5px;
		}

		.prefix {
			font-size: 1.375rem;
		}

		.percentage {
			font-size: clamp(4rem, 10vw, 5.5rem);
		}

		.top-performer {
			box-shadow: 0 0 60px color-mix(in oklch, var(--slide-peak-start) 35%, transparent);
		}

		.message {
			font-size: 1.75rem;
		}

		.total-users {
			font-size: 1rem;
		}
	}
</style>
