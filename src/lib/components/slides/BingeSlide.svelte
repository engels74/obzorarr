<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { BingeSlideProps } from './types';

	/**
	 * BingeSlide Component
	 *
	 * Displays information about the user's longest binge watching session.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	interface Props extends BingeSlideProps {}

	let {
		longestBinge,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children
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
			if (statEl) statEl.style.opacity = '1';
			if (detailsEl) detailsEl.style.opacity = '1';
			onAnimationComplete?.();
			return;
		}

		// Animate container
		const containerAnim = animate(
			container,
			{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
			{ duration: 0.5 }
		);

		const animations = [containerAnim];

		if (statEl) {
			const statAnim = animate(
				statEl,
				{ transform: ['scale(0.8)', 'scale(1)'], opacity: [0, 1] },
				{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }
			);
			animations.push(statAnim);
		}

		if (detailsEl) {
			const detailsAnim = animate(detailsEl, { opacity: [0, 1] }, { duration: 0.4, delay: 0.5 });
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
		gap: 1.5rem;
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
		padding: 2rem 3rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 1rem;
		border: 2px solid var(--primary);
	}

	.duration {
		font-size: clamp(2.5rem, 8vw, 4rem);
		font-weight: 800;
		color: var(--primary);
	}

	.plays {
		font-size: 1.25rem;
		color: var(--foreground);
		margin-top: 0.5rem;
	}

	.details {
		text-align: center;
	}

	.date {
		font-size: 1.125rem;
		color: var(--foreground);
		font-weight: 500;
	}

	.time-range {
		font-size: 0.875rem;
		color: var(--muted-foreground);
		margin-top: 0.25rem;
	}

	.no-binge {
		text-align: center;
		padding: 2rem;
	}

	.no-binge-message {
		font-size: 1.25rem;
		color: var(--muted-foreground);
		font-style: italic;
	}

	.no-binge-hint {
		font-size: 0.875rem;
		color: var(--muted-foreground);
		opacity: 0.7;
		margin-top: 0.5rem;
	}

	.extra {
		margin-top: 1.5rem;
	}
</style>
