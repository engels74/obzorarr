<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { TopShowsSlideProps } from './types';
	import { getThumbUrl } from '$lib/utils/plex-thumb';
	import type { SlideMessagingContext } from './messaging-context';
	import { getPossessive, createPersonalContext } from './messaging-context';
	import { SPRING_PRESETS, STAGGER_PRESETS, DELAY_PRESETS } from '$lib/utils/animation-presets';

	/**
	 * TopShowsSlide Component
	 *
	 * Displays the user's top TV shows with premium glassmorphism cards.
	 * Features staggered list animation and hover effects.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	interface Props extends TopShowsSlideProps {
		messagingContext?: SlideMessagingContext;
	}

	let {
		topShows,
		limit = 6,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children,
		messagingContext = createPersonalContext()
	}: Props = $props();

	// Get possessive for messaging
	const possessive = $derived(getPossessive(messagingContext));

	// Limit the displayed shows
	const displayedShows = $derived(topShows.slice(0, limit));
	const hasShows = $derived(displayedShows.length > 0);

	// Element references
	let container: HTMLElement | undefined = $state();
	let listItems: HTMLElement[] = $state([]);

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !active || !hasShows) return;

		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate) {
			container.style.opacity = '1';
			listItems.forEach((el) => {
				if (el) {
					el.style.opacity = '1';
					el.style.transform = 'none';
				}
			});
			onAnimationComplete?.();
			return;
		}

		// Animate container
		const containerAnim = animate(
			container,
			{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
			{ type: 'spring', ...SPRING_PRESETS.snappy }
		);

		// Animate list items with stagger
		const validItems = listItems.filter(Boolean);
		if (validItems.length > 0) {
			const itemsAnim = animate(
				validItems,
				{
					opacity: [0, 1],
					transform: ['translateX(-30px) scale(0.95)', 'translateX(0) scale(1)']
				},
				{
					type: 'spring',
					...SPRING_PRESETS.snappy,
					delay: stagger(STAGGER_PRESETS.normal, { startDelay: DELAY_PRESETS.short })
				}
			);

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

<BaseSlide {active} class="top-shows-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Top Shows</h2>

		{#if hasShows}
			<ol class="show-list">
				{#each displayedShows as show, i}
					<li bind:this={listItems[i]} class="show-item" class:first={i === 0}>
						<span class="rank">#{show.rank}</span>
						{#if getThumbUrl(show.thumb)}
							<img src={getThumbUrl(show.thumb)} alt="" class="thumb" loading="lazy" />
						{:else}
							<div class="thumb-placeholder"></div>
						{/if}
						<div class="show-info">
							<span class="show-title">{show.title}</span>
							<span class="episode-count"
								>{show.count} {show.count === 1 ? 'episode' : 'episodes'}</span
							>
						</div>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="empty-message">No shows watched this year</p>
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
		max-width: 600px;
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.05em;
		text-shadow: 0 0 30px hsl(var(--primary) / 0.3);
	}

	.show-list {
		list-style: none;
		padding: 0;
		margin: 0;
		width: 100%;
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.625rem;
	}

	.show-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.875rem 1.125rem;
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.4));
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--slide-glass-border, hsl(var(--primary-hue) 30% 40% / 0.2));
		border-radius: calc(var(--radius) * 1.5);
		box-shadow: var(--shadow-elevation-low, 0 2px 4px hsl(0 0% 0% / 0.2));
		transition:
			transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
			box-shadow 0.3s ease,
			border-color 0.3s ease;
	}

	.show-item:hover {
		transform: translateY(-2px) scale(1.01);
		box-shadow: var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.3));
		border-color: hsl(var(--primary) / 0.3);
	}

	/* First item gets special treatment */
	.show-item.first {
		border-color: hsl(var(--primary) / 0.3);
		background: linear-gradient(
			135deg,
			hsl(var(--primary) / 0.15) 0%,
			var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.4)) 100%
		);
	}

	.show-item.first::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(90deg, transparent, hsl(var(--primary) / 0.5), transparent);
		border-radius: inherit;
	}

	.rank {
		font-size: 1rem;
		font-weight: 800;
		color: hsl(var(--primary));
		min-width: 2.5rem;
		padding: 0.25rem 0.5rem;
		background: hsl(var(--primary) / 0.15);
		border-radius: var(--radius);
		text-align: center;
		text-shadow: 0 0 10px hsl(var(--primary) / 0.3);
	}

	.first .rank {
		background: linear-gradient(135deg, hsl(var(--primary) / 0.25), hsl(var(--accent) / 0.15));
		box-shadow: 0 0 15px hsl(var(--primary) / 0.2);
	}

	.thumb {
		width: 50px;
		height: 75px;
		object-fit: cover;
		border-radius: calc(var(--radius) * 0.75);
		background: hsl(var(--muted));
		box-shadow: var(--shadow-elevation-low, 0 2px 4px hsl(0 0% 0% / 0.3));
		transition:
			transform 0.3s ease,
			box-shadow 0.3s ease;
	}

	.show-item:hover .thumb {
		transform: scale(1.05);
		box-shadow: var(--shadow-elevation-medium, 0 4px 8px hsl(0 0% 0% / 0.4));
	}

	.thumb-placeholder {
		width: 50px;
		height: 75px;
		background: linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--secondary)) 100%);
		border-radius: calc(var(--radius) * 0.75);
	}

	.show-info {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		flex: 1;
		gap: 0.25rem;
	}

	.show-title {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		line-height: 1.3;
	}

	.episode-count {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.empty-message {
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}

	.extra {
		margin-top: 1rem;
	}

	/* Mobile: compact single column */
	@media (max-width: 767px) {
		.content {
			gap: 1.5rem;
		}

		.title {
			font-size: 1.5rem;
		}

		.show-list {
			gap: 0.5rem;
		}

		.show-item {
			padding: 0.625rem 0.75rem;
			gap: 0.75rem;
		}

		.thumb,
		.thumb-placeholder {
			width: 40px;
			height: 60px;
		}

		.rank {
			font-size: 0.875rem;
			min-width: 2rem;
		}

		.show-title {
			font-size: 0.9375rem;
		}
	}

	/* Tablet: wider single column */
	@media (min-width: 768px) and (max-width: 1023px) {
		.content {
			max-width: var(--content-max-md, 800px);
		}

		.show-item {
			padding: 1rem 1.25rem;
		}

		.thumb,
		.thumb-placeholder {
			width: 55px;
			height: 82px;
		}
	}

	/* Desktop: 2-column grid */
	@media (min-width: 1024px) {
		.content {
			max-width: var(--content-max-lg, 900px);
		}

		.title {
			font-size: 2rem;
		}

		.show-list {
			grid-template-columns: repeat(2, 1fr);
			gap: 0.75rem;
		}

		.show-item {
			padding: 1rem 1.25rem;
			position: relative;
		}

		.thumb,
		.thumb-placeholder {
			width: 55px;
			height: 82px;
		}

		.show-title {
			font-size: 1.0625rem;
		}
	}
</style>
