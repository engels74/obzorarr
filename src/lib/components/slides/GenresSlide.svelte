<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { GenresSlideProps } from './types';
	import type { SlideMessagingContext } from './messaging-context';
	import { getPossessive, createPersonalContext } from './messaging-context';

	/**
	 * GenresSlide Component
	 *
	 * Displays the user's top genres with visual representation.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	interface Props extends GenresSlideProps {
		messagingContext?: SlideMessagingContext;
	}

	let {
		topGenres,
		limit = 5,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children,
		messagingContext = createPersonalContext()
	}: Props = $props();

	// Get possessive for messaging
	const possessive = $derived(getPossessive(messagingContext));

	// Limit and calculate percentages
	const displayedGenres = $derived(topGenres.slice(0, limit));
	const hasGenres = $derived(displayedGenres.length > 0);
	const maxCount = $derived(
		displayedGenres.length > 0 ? Math.max(...displayedGenres.map((g) => g.count)) : 0
	);

	// Calculate bar width percentages
	const genresWithPercentage = $derived(
		displayedGenres.map((genre) => ({
			...genre,
			percentage: maxCount > 0 ? (genre.count / maxCount) * 100 : 0
		}))
	);

	// Element references
	let container: HTMLElement | undefined = $state();
	let bars: HTMLElement[] = $state([]);

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !active) return;

		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate) {
			container.style.opacity = '1';
			bars.forEach((el) => {
				if (el) el.style.transform = 'scaleX(1)';
			});
			onAnimationComplete?.();
			return;
		}

		// Animate container
		const containerAnim = animate(container, { opacity: [0, 1] }, { duration: 0.4 });

		// Animate bars with stagger
		const validBars = bars.filter(Boolean);
		if (validBars.length > 0) {
			const barsAnim = animate(
				validBars,
				{ transform: ['scaleX(0)', 'scaleX(1)'] },
				{
					type: 'spring',
					stiffness: 100,
					damping: 15,
					delay: stagger(0.1, { startDelay: 0.3 })
				}
			);

			barsAnim.finished.then(() => {
				onAnimationComplete?.();
			});

			return () => {
				containerAnim.stop();
				barsAnim.stop();
			};
		}

		return () => {
			containerAnim.stop();
		};
	});
</script>

<BaseSlide {active} class="genres-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Favorite Genres</h2>

		{#if hasGenres}
			<div class="genre-list">
				{#each genresWithPercentage as genre, i}
					<div class="genre-item">
						<div class="genre-header">
							<span class="genre-name">{genre.title}</span>
							<span class="genre-count">{genre.count}</span>
						</div>
						<div class="bar-container">
							<div bind:this={bars[i]} class="bar" style="width: {genre.percentage}%"></div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty-message">No genre data available</p>
			<p class="empty-hint">Genre information will be available in a future update</p>
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
		width: 100%;
		max-width: 500px;
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.genre-list {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.genre-item {
		width: 100%;
	}

	.genre-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
	}

	.genre-name {
		font-size: 1rem;
		font-weight: 600;
		color: var(--foreground);
	}

	.genre-count {
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}

	.bar-container {
		width: 100%;
		height: 8px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		overflow: hidden;
	}

	.bar {
		height: 100%;
		background: linear-gradient(90deg, var(--primary), oklch(0.6 0.15 25));
		border-radius: 4px;
		transform-origin: left center;
	}

	.empty-message {
		color: var(--muted-foreground);
		font-style: italic;
		font-size: 1.125rem;
	}

	.empty-hint {
		color: var(--muted-foreground);
		font-size: 0.875rem;
		opacity: 0.7;
	}

	.extra {
		margin-top: 1rem;
	}
</style>
