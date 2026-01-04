<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		DELAY_PRESETS,
		getAdaptiveStagger,
		KEYFRAMES,
		SPRING_PRESETS
	} from '$lib/utils/animation-presets';
	import BaseSlide from './BaseSlide.svelte';
	import type { SlideMessagingContext } from './messaging-context';
	import { createPersonalContext, getPossessive } from './messaging-context';
	import type { GenresSlideProps } from './types';

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

	const GENRE_COLORS: Record<string, string> = {
		Action: 'hsl(15 70% 50%)',
		Adventure: 'hsl(35 65% 55%)',
		Animation: 'hsl(145 55% 50%)',
		Comedy: 'hsl(50 70% 55%)',
		Crime: 'hsl(240 30% 45%)',
		Documentary: 'hsl(180 45% 45%)',
		Drama: 'hsl(5 65% 45%)',
		Family: 'hsl(120 45% 50%)',
		Fantasy: 'hsl(280 55% 50%)',
		History: 'hsl(40 35% 50%)',
		Horror: 'hsl(350 50% 35%)',
		Music: 'hsl(310 60% 55%)',
		Mystery: 'hsl(220 40% 45%)',
		Romance: 'hsl(350 60% 55%)',
		'Science Fiction': 'hsl(200 50% 50%)',
		'Sci-Fi': 'hsl(200 50% 50%)',
		Thriller: 'hsl(270 35% 40%)',
		War: 'hsl(80 25% 45%)',
		Western: 'hsl(30 45% 50%)'
	};

	const DEFAULT_GENRE_COLOR = 'hsl(var(--primary))';

	function getGenreColor(genreTitle: string): string {
		return GENRE_COLORS[genreTitle.trim()] ?? DEFAULT_GENRE_COLOR;
	}

	function formatPlays(plays: number): string {
		return `${plays} ${plays === 1 ? 'play' : 'plays'}`;
	}

	const possessive = $derived(getPossessive(messagingContext));

	const displayedGenres = $derived(topGenres.slice(0, limit));
	const hasGenres = $derived(displayedGenres.length > 0);
	const maxCount = $derived(
		displayedGenres.length > 0 ? Math.max(...displayedGenres.map((g) => g.count)) : 0
	);

	const genresWithPercentage = $derived(
		displayedGenres.map((genre) => ({
			...genre,
			percentage: maxCount > 0 ? (genre.count / maxCount) * 100 : 0
		}))
	);

	// Element references
	let container: HTMLElement | undefined = $state();
	let genreItems: HTMLElement[] = $state([]);
	let bars: HTMLElement[] = $state([]);

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !active || !hasGenres) return;

		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate) {
			container.style.opacity = '1';
			container.style.transform = 'none';
			genreItems.forEach((el) => {
				if (el) {
					el.style.opacity = '1';
					el.style.transform = 'none';
				}
			});
			bars.forEach((el) => {
				if (el) el.style.transform = 'scaleX(1)';
			});
			onAnimationComplete?.();
			return;
		}

		// Animate container with subtle lift
		const containerAnim = animate(
			container,
			{ opacity: [0, 1], transform: ['translateY(25px) scale(0.98)', 'translateY(0) scale(1)'] },
			{ type: 'spring', ...SPRING_PRESETS.snappy }
		);

		// Animate genre items with stagger
		const validItems = genreItems.filter(Boolean);
		const validBars = bars.filter(Boolean);
		const adaptiveStagger = getAdaptiveStagger(validItems.length);

		if (validItems.length > 0) {
			const itemsAnim = animate(
				validItems,
				{
					opacity: [0, 1],
					transform: ['translateY(15px)', 'translateY(0)']
				},
				{
					type: 'spring',
					...SPRING_PRESETS.snappy,
					delay: stagger(adaptiveStagger, { startDelay: DELAY_PRESETS.short })
				}
			);

			// Animate bars with dramatic spring and additional per-bar delay
			if (validBars.length > 0) {
				const barsAnim = animate(
					validBars,
					{ transform: ['scaleX(0)', 'scaleX(1)'] },
					{
						type: 'spring',
						...SPRING_PRESETS.dramatic,
						delay: stagger(adaptiveStagger + DELAY_PRESETS.micro, {
							startDelay: DELAY_PRESETS.medium
						})
					}
				);

				barsAnim.finished.then(() => {
					onAnimationComplete?.();
				});

				return () => {
					containerAnim.stop();
					itemsAnim.stop();
					barsAnim.stop();
				};
			}

			itemsAnim.finished.then(() => {
				onAnimationComplete?.();
			});

			return () => {
				containerAnim.stop();
				itemsAnim.stop();
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
						<div bind:this={genreItems[i]} class="genre-item" class:first={i === 0}>
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
										>
											<div class="bar-highlight"></div>
										</div>
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
		max-width: var(--content-max-md, 800px);
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.05em;
		text-shadow: 0 0 30px var(--slide-glow-color, hsl(var(--primary) / 0.3));
	}

	.genre-list {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.4));
		backdrop-filter: blur(var(--slide-glass-blur, 20px));
		-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
		border: 1px solid var(--slide-glass-border, hsl(var(--primary-hue) 30% 40% / 0.2));
		border-radius: calc(var(--radius) * 2);
		box-shadow:
			var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.3)),
			inset 0 1px 0 hsl(0 0% 100% / 0.05);
		position: relative;
	}

	/* Glass top highlight line */
	.genre-list::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(90deg, transparent, hsl(var(--primary) / 0.4), transparent);
		border-radius: inherit;
	}

	.genre-item {
		padding: 1rem 1.25rem;
		border-radius: calc(var(--radius) * 1.25);
		background: hsl(var(--primary-hue) 20% 15% / 0.3);
		border: 1px solid transparent;
		position: relative;
		transition:
			transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
			background-color 0.3s ease,
			border-color 0.3s ease,
			box-shadow 0.3s ease;
	}

	.genre-item:hover {
		transform: translateX(4px);
		background: hsl(var(--primary-hue) 20% 18% / 0.4);
		border-color: hsl(var(--primary) / 0.2);
		box-shadow: 0 2px 12px hsl(0 0% 0% / 0.25);
	}

	/* First genre gets special treatment */
	.genre-item.first {
		border-color: hsl(var(--primary) / 0.25);
		background: linear-gradient(
			135deg,
			hsl(var(--primary) / 0.12) 0%,
			hsl(var(--primary-hue) 20% 15% / 0.3) 100%
		);
	}

	.genre-item.first::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(90deg, transparent, hsl(var(--primary) / 0.4), transparent);
		border-radius: inherit;
	}

	.genre-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.625rem;
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

	.first .genre-name {
		color: hsl(var(--primary));
		text-shadow: 0 0 10px hsl(var(--primary) / 0.3);
	}

	.genre-count {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		background: hsl(var(--primary) / 0.08);
		border-radius: var(--radius);
	}

	.bar-container {
		width: 100%;
		height: 12px;
		background: hsl(var(--muted) / 0.2);
		border-radius: 6px;
		overflow: visible;
		position: relative;
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
			var(--genre-color) 0%,
			color-mix(in srgb, var(--genre-color) 85%, white) 50%,
			var(--genre-color) 100%
		);
		border-radius: 6px;
		transform-origin: left center;
		min-width: 4px;
		position: relative;
		overflow: hidden;
		cursor: pointer;
		box-shadow:
			0 0 10px color-mix(in srgb, var(--genre-color) 40%, transparent),
			inset 0 1px 0 hsl(0 0% 100% / 0.2);
		transition:
			transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
			filter 0.3s ease,
			box-shadow 0.3s ease;
	}

	.bar-highlight {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 40%;
		background: linear-gradient(180deg, hsl(0 0% 100% / 0.25) 0%, hsl(0 0% 100% / 0) 100%);
		border-radius: 6px 6px 0 0;
		pointer-events: none;
	}

	.bar:hover {
		transform: scaleY(1.2) scaleX(1.05) !important;
		filter: brightness(1.1);
		box-shadow:
			0 0 15px var(--genre-color),
			0 0 30px color-mix(in srgb, var(--genre-color) 40%, transparent),
			inset 0 1px 0 hsl(0 0% 100% / 0.3);
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

	/* Tooltip styling - premium glass effect */
	:global(.tooltip-content) {
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.8)) !important;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: hsl(var(--foreground)) !important;
		border: 1px solid var(--slide-glass-border, hsl(var(--primary-hue) 30% 40% / 0.3)) !important;
		padding: 0.75rem 1rem !important;
		border-radius: var(--radius) !important;
		box-shadow: var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.3)) !important;
	}

	.tooltip-inner {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-align: center;
	}

	.tooltip-title {
		color: hsl(var(--primary));
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.tooltip-stat {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	/* Mobile: compact layout */
	@media (max-width: 767px) {
		.content {
			gap: 1.5rem;
		}

		.title {
			font-size: 1.5rem;
		}

		.genre-list {
			gap: 0.625rem;
			padding: 1rem;
		}

		.genre-item {
			padding: 0.625rem 0.75rem;
		}

		.genre-header {
			margin-bottom: 0.5rem;
		}

		.genre-name {
			font-size: 0.9375rem;
		}

		.genre-count {
			font-size: 0.75rem;
		}

		.bar-container {
			height: 8px;
		}

		.bar {
			border-radius: 4px;
		}

		.bar-highlight {
			border-radius: 4px 4px 0 0;
		}
	}

	/* Tablet: medium layout */
	@media (min-width: 768px) and (max-width: 1023px) {
		.content {
			max-width: var(--content-max-md, 700px);
		}

		.title {
			font-size: 2rem;
		}

		.genre-list {
			gap: 0.875rem;
			padding: 1.5rem;
		}

		.genre-item {
			padding: 0.875rem 1.125rem;
		}

		.genre-name {
			font-size: 1.0625rem;
		}

		.genre-count {
			font-size: 0.875rem;
		}

		.bar-container {
			height: 12px;
			border-radius: 6px;
		}

		.bar {
			border-radius: 6px;
		}

		.bar-highlight {
			border-radius: 6px 6px 0 0;
		}
	}

	/* Desktop: wide layout */
	@media (min-width: 1024px) {
		.content {
			max-width: var(--content-max-lg, 800px);
		}

		.title {
			font-size: 2rem;
		}

		.genre-list {
			gap: 1rem;
			padding: 1.75rem;
		}

		.genre-item {
			padding: 1rem 1.25rem;
		}

		.genre-name {
			font-size: 1.125rem;
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

		.bar-highlight {
			border-radius: 7px 7px 0 0;
		}
	}
</style>
