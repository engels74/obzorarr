<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { GenresSlideProps } from './types';
	import type { SlideMessagingContext } from './messaging-context';
	import { getPossessive, createPersonalContext } from './messaging-context';
	import * as Tooltip from '$lib/components/ui/tooltip';

	/**
	 * GenresSlide Component
	 *
	 * Displays the user's top genres with visual representation.
	 * Each genre has a unique color and interactive tooltips.
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

	// Genre color palette - unique colors for visual distinction
	const GENRE_COLORS: Record<string, string> = {
		Action: 'oklch(0.55 0.18 25)',
		Adventure: 'oklch(0.60 0.15 50)',
		Animation: 'oklch(0.65 0.16 145)',
		Comedy: 'oklch(0.70 0.18 85)',
		Crime: 'oklch(0.45 0.10 260)',
		Documentary: 'oklch(0.55 0.12 180)',
		Drama: 'oklch(0.50 0.20 15)',
		Family: 'oklch(0.65 0.14 120)',
		Fantasy: 'oklch(0.55 0.18 290)',
		History: 'oklch(0.55 0.10 60)',
		Horror: 'oklch(0.40 0.15 350)',
		Music: 'oklch(0.60 0.20 320)',
		Mystery: 'oklch(0.50 0.12 240)',
		Romance: 'oklch(0.60 0.18 10)',
		'Science Fiction': 'oklch(0.55 0.15 210)',
		'Sci-Fi': 'oklch(0.55 0.15 210)',
		Thriller: 'oklch(0.45 0.12 280)',
		War: 'oklch(0.50 0.08 90)',
		Western: 'oklch(0.55 0.12 55)'
	};

	const DEFAULT_GENRE_COLOR = 'hsl(var(--primary))';

	function getGenreColor(genreTitle: string): string {
		return GENRE_COLORS[genreTitle.trim()] ?? DEFAULT_GENRE_COLOR;
	}

	function formatPlays(plays: number): string {
		return `${plays} ${plays === 1 ? 'play' : 'plays'}`;
	}

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
			<Tooltip.Provider>
				<div class="genre-list">
					{#each genresWithPercentage as genre, i}
						<div class="genre-item">
							<div class="genre-header">
								<span class="genre-name">{genre.title}</span>
								<span class="genre-count">{formatPlays(genre.count)}</span>
							</div>
							<div class="bar-container">
								<Tooltip.Root>
									<Tooltip.Trigger>
										<div
											bind:this={bars[i]}
											class="bar"
											style="width: {genre.percentage}%; --genre-color: {getGenreColor(
												genre.title
											)};"
											role="img"
											aria-label="{genre.title}: {formatPlays(genre.count)}"
										></div>
									</Tooltip.Trigger>
									<Tooltip.Content side="top" class="tooltip-content">
										<div class="tooltip-inner">
											<strong class="tooltip-title">{genre.title}</strong>
											<p class="tooltip-stat">{formatPlays(genre.count)}</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
						</div>
					{/each}
				</div>
			</Tooltip.Provider>
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
		padding: 0 1rem;
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.05em;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.genre-list {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.genre-item {
		width: 100%;
		padding: 0.5rem;
		border-radius: 8px;
		background: hsl(var(--card) / 0.3);
		transition: background-color 0.2s ease;
	}

	.genre-item:hover {
		background: hsl(var(--card) / 0.5);
	}

	.genre-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.genre-name {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 70%;
	}

	.genre-count {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		font-weight: 500;
	}

	.bar-container {
		width: 100%;
		height: 12px;
		background: hsl(var(--muted) / 0.3);
		border-radius: 6px;
		overflow: visible;
	}

	.bar-container :global(button[data-slot='tooltip-trigger']) {
		display: block;
		width: 100%;
		height: 100%;
		background: transparent;
		border: none;
		padding: 0;
		margin: 0;
		outline: none;
		-webkit-appearance: none;
		appearance: none;
	}

	.bar-container :global(button[data-slot='tooltip-trigger']:focus-visible) {
		outline: 2px solid hsl(var(--primary) / 0.5);
		outline-offset: 2px;
		border-radius: 4px;
	}

	.bar {
		height: 100%;
		background: linear-gradient(
			90deg,
			var(--genre-color),
			color-mix(in oklch, var(--genre-color) 70%, black)
		);
		border-radius: 6px;
		transform-origin: left center;
		min-width: 4px;
		transition:
			transform 0.2s ease,
			filter 0.2s ease,
			box-shadow 0.2s ease;
		cursor: pointer;
	}

	.bar:hover {
		transform: scaleY(1.3) scaleX(1.02) !important;
		filter: brightness(1.2);
		box-shadow: 0 0 12px var(--genre-color);
	}

	.empty-message {
		color: hsl(var(--muted-foreground));
		font-style: italic;
		font-size: 1.125rem;
	}

	.empty-hint {
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		opacity: 0.7;
	}

	.extra {
		margin-top: 1rem;
	}

	/* Tooltip styling */
	:global(.tooltip-content) {
		background: hsl(var(--card)) !important;
		color: hsl(var(--card-foreground)) !important;
		border: 1px solid hsl(var(--border));
		padding: 0.75rem !important;
	}

	.tooltip-inner {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-align: center;
	}

	.tooltip-title {
		color: hsl(var(--primary));
		font-size: 0.875rem;
	}

	.tooltip-stat {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	/* Mobile: compact layout */
	@media (max-width: 767px) {
		.content {
			max-width: 100%;
			padding: 0 0.5rem;
		}

		.title {
			font-size: 1.5rem;
		}

		.genre-list {
			gap: 1rem;
		}

		.genre-item {
			padding: 0.375rem;
		}

		.genre-header {
			flex-wrap: wrap;
			gap: 0.25rem;
		}

		.genre-name {
			font-size: 0.875rem;
		}

		.genre-count {
			font-size: 0.75rem;
		}

		.bar-container {
			height: 10px;
		}
	}

	/* Tablet: medium layout */
	@media (min-width: 768px) and (max-width: 1023px) {
		.content {
			max-width: 650px;
		}

		.title {
			font-size: 2rem;
		}

		.genre-list {
			gap: 1.5rem;
		}

		.genre-item {
			padding: 0.625rem;
		}

		.genre-name {
			font-size: 1.0625rem;
		}

		.genre-count {
			font-size: 0.9375rem;
		}

		.bar-container {
			height: 14px;
			border-radius: 7px;
		}

		.bar {
			border-radius: 7px;
		}
	}

	/* Desktop: wide layout */
	@media (min-width: 1024px) {
		.content {
			max-width: 800px;
		}

		.title {
			font-size: 2.25rem;
		}

		.genre-list {
			gap: 1.5rem;
		}

		.genre-item {
			padding: 0.75rem;
			border-radius: 10px;
		}

		.genre-name {
			font-size: 1.125rem;
		}

		.genre-count {
			font-size: 1rem;
		}

		.bar-container {
			height: 16px;
			border-radius: 8px;
		}

		.bar {
			border-radius: 8px;
		}
	}
</style>
