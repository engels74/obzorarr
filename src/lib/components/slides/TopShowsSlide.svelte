<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { TopShowsSlideProps } from './types';
	import { getThumbUrl } from '$lib/utils/plex-thumb';

	/**
	 * TopShowsSlide Component
	 *
	 * Displays the user's top TV shows with staggered list animation.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	interface Props extends TopShowsSlideProps {}

	let {
		topShows,
		limit = 5,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children
	}: Props = $props();

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
		const containerAnim = animate(container, { opacity: [0, 1] }, { duration: 0.4 });

		// Animate list items with stagger
		const validItems = listItems.filter(Boolean);
		if (validItems.length > 0) {
			const itemsAnim = animate(
				validItems,
				{ opacity: [0, 1], transform: ['translateX(-20px)', 'translateX(0)'] },
				{
					type: 'spring',
					stiffness: 200,
					damping: 20,
					delay: stagger(0.1, { startDelay: 0.2 })
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
		<h2 class="title">Your Top Shows</h2>

		{#if hasShows}
			<ol class="show-list">
				{#each displayedShows as show, i}
					<li bind:this={listItems[i]} class="show-item">
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
		color: var(--primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.show-list {
		list-style: none;
		padding: 0;
		margin: 0;
		width: 100%;
	}

	.show-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 0.5rem;
		margin-bottom: 0.5rem;
		transition: background-color 0.2s;
	}

	.show-item:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.rank {
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--primary);
		min-width: 2.5rem;
	}

	.thumb {
		width: 50px;
		height: 75px;
		object-fit: cover;
		border-radius: 0.25rem;
		background: var(--muted);
	}

	.thumb-placeholder {
		width: 50px;
		height: 75px;
		background: var(--muted);
		border-radius: 0.25rem;
	}

	.show-info {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		flex: 1;
	}

	.show-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--foreground);
	}

	.episode-count {
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}

	.empty-message {
		color: var(--muted-foreground);
		font-style: italic;
	}

	.extra {
		margin-top: 1rem;
	}

	@media (max-width: 768px) {
		.show-item {
			padding: 0.5rem;
			gap: 0.75rem;
		}

		.thumb {
			width: 40px;
			height: 60px;
		}

		.thumb-placeholder {
			width: 40px;
			height: 60px;
		}
	}
</style>
