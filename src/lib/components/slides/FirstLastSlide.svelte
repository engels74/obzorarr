<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { FirstLastSlideProps } from './types';
	import { getThumbUrl } from '$lib/utils/plex-thumb';
	import type { SlideMessagingContext } from './messaging-context';
	import { getPossessive, createPersonalContext } from './messaging-context';

	/**
	 * FirstLastSlide Component
	 *
	 * Displays the first and last content watched in the year.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	interface Props extends FirstLastSlideProps {
		messagingContext?: SlideMessagingContext;
	}

	let {
		firstWatch,
		lastWatch,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children,
		messagingContext = createPersonalContext()
	}: Props = $props();

	// Get possessive for messaging
	const possessive = $derived(getPossessive(messagingContext));

	// Check if we have data
	const hasFirst = $derived(firstWatch !== null);
	const hasLast = $derived(lastWatch !== null);
	const hasAny = $derived(hasFirst || hasLast);

	// Format dates
	const firstDate = $derived.by(() => {
		if (!firstWatch) return '';
		return new Date(firstWatch.viewedAt * 1000).toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric'
		});
	});

	const lastDate = $derived.by(() => {
		if (!lastWatch) return '';
		return new Date(lastWatch.viewedAt * 1000).toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric'
		});
	});

	// Format type labels
	const firstTypeLabel = $derived.by(() => {
		if (!firstWatch) return '';
		switch (firstWatch.type) {
			case 'movie':
				return 'Movie';
			case 'episode':
				return 'Episode';
			case 'track':
				return 'Track';
			default:
				return '';
		}
	});

	const lastTypeLabel = $derived.by(() => {
		if (!lastWatch) return '';
		switch (lastWatch.type) {
			case 'movie':
				return 'Movie';
			case 'episode':
				return 'Episode';
			case 'track':
				return 'Track';
			default:
				return '';
		}
	});

	// Element references
	let container: HTMLElement | undefined = $state();
	let firstCard: HTMLElement | undefined = $state();
	let lastCard: HTMLElement | undefined = $state();

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !active) return;

		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate) {
			container.style.opacity = '1';
			if (firstCard) {
				firstCard.style.opacity = '1';
				firstCard.style.transform = 'none';
			}
			if (lastCard) {
				lastCard.style.opacity = '1';
				lastCard.style.transform = 'none';
			}
			onAnimationComplete?.();
			return;
		}

		const animations: ReturnType<typeof animate>[] = [];

		// Animate container
		const containerAnim = animate(container, { opacity: [0, 1] }, { duration: 0.4 });
		animations.push(containerAnim);

		// Animate first card
		if (firstCard) {
			const firstAnim = animate(
				firstCard,
				{ opacity: [0, 1], transform: ['translateX(-30px)', 'translateX(0)'] },
				{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }
			);
			animations.push(firstAnim);
		}

		// Animate last card
		if (lastCard) {
			const lastAnim = animate(
				lastCard,
				{ opacity: [0, 1], transform: ['translateX(30px)', 'translateX(0)'] },
				{ type: 'spring', stiffness: 200, damping: 20, delay: 0.4 }
			);
			animations.push(lastAnim);

			lastAnim.finished.then(() => {
				onAnimationComplete?.();
			});
		} else if (animations.length > 0) {
			animations[animations.length - 1]?.finished.then(() => {
				onAnimationComplete?.();
			});
		}

		return () => {
			animations.forEach((a) => a.stop());
		};
	});
</script>

<BaseSlide {active} class="first-last-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Year in Review</h2>

		{#if hasAny}
			<div class="cards">
				{#if hasFirst && firstWatch}
					<div bind:this={firstCard} class="card first">
						<span class="card-label">First Watch</span>
						{#if getThumbUrl(firstWatch.thumb)}
							<img src={getThumbUrl(firstWatch.thumb)} alt="" class="thumb" loading="lazy" />
						{:else}
							<div class="thumb-placeholder"></div>
						{/if}
						<div class="card-info">
							<span class="card-title">{firstWatch.title}</span>
							<span class="card-meta">{firstTypeLabel} · {firstDate}</span>
						</div>
					</div>
				{/if}

				{#if hasLast && lastWatch}
					<div bind:this={lastCard} class="card last">
						<span class="card-label">Last Watch</span>
						{#if getThumbUrl(lastWatch.thumb)}
							<img src={getThumbUrl(lastWatch.thumb)} alt="" class="thumb" loading="lazy" />
						{:else}
							<div class="thumb-placeholder"></div>
						{/if}
						<div class="card-info">
							<span class="card-title">{lastWatch.title}</span>
							<span class="card-meta">{lastTypeLabel} · {lastDate}</span>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<p class="no-data">No watch history for this year</p>
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
		max-width: 700px;
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.cards {
		display: flex;
		gap: 2rem;
		width: 100%;
		justify-content: center;
		flex-wrap: wrap;
	}

	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.5rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 1rem;
		min-width: 200px;
		max-width: 280px;
		flex: 1;
	}

	.card-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--primary);
		margin-bottom: 1rem;
		font-weight: 600;
	}

	.thumb {
		width: 120px;
		height: 180px;
		object-fit: cover;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	}

	.thumb-placeholder {
		width: 120px;
		height: 180px;
		background: var(--muted);
		border-radius: 0.5rem;
		margin-bottom: 1rem;
	}

	.card-info {
		text-align: center;
	}

	.card-title {
		display: block;
		font-size: 1rem;
		font-weight: 600;
		color: var(--foreground);
		margin-bottom: 0.25rem;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.card-meta {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.no-data {
		color: var(--muted-foreground);
		font-style: italic;
	}

	.extra {
		margin-top: 1rem;
	}

	/* Mobile: stacked cards */
	@media (max-width: 767px) {
		.title {
			font-size: 1.5rem;
		}

		.cards {
			flex-direction: column;
			align-items: center;
			gap: 1.5rem;
		}

		.card {
			width: 100%;
			max-width: 260px;
			padding: 1.25rem;
		}

		.thumb {
			width: 100px;
			height: 150px;
		}

		.thumb-placeholder {
			width: 100px;
			height: 150px;
		}

		.card-title {
			font-size: 0.9375rem;
		}
	}

	/* Tablet: side-by-side with medium sizing */
	@media (min-width: 768px) and (max-width: 1023px) {
		.content {
			max-width: 750px;
		}

		.title {
			font-size: 2rem;
		}

		.card {
			max-width: 320px;
			padding: 1.75rem;
		}

		.card-label {
			font-size: 0.8125rem;
		}

		.thumb {
			width: 140px;
			height: 210px;
		}

		.thumb-placeholder {
			width: 140px;
			height: 210px;
		}

		.card-title {
			font-size: 1.0625rem;
		}

		.card-meta {
			font-size: 0.8125rem;
		}
	}

	/* Desktop: large cards with prominent thumbnails */
	@media (min-width: 1024px) {
		.content {
			max-width: 900px;
		}

		.title {
			font-size: 2.25rem;
		}

		.cards {
			gap: 3rem;
		}

		.card {
			max-width: 380px;
			padding: 2rem;
			border-radius: 1.25rem;
		}

		.card-label {
			font-size: 0.875rem;
			margin-bottom: 1.25rem;
		}

		.thumb {
			width: 160px;
			height: 240px;
			border-radius: 0.625rem;
			margin-bottom: 1.25rem;
			box-shadow: 0 6px 30px rgba(0, 0, 0, 0.35);
		}

		.thumb-placeholder {
			width: 160px;
			height: 240px;
			border-radius: 0.625rem;
			margin-bottom: 1.25rem;
		}

		.card-title {
			font-size: 1.125rem;
		}

		.card-meta {
			font-size: 0.875rem;
		}
	}
</style>
