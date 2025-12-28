<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { SeriesCompletionSlideProps } from './types';
	import type { SlideMessagingContext } from './messaging-context';
	import { getPossessive, createPersonalContext } from './messaging-context';
	import { SPRING_PRESETS, DELAY_PRESETS, getAdaptiveStagger } from '$lib/utils/animation-presets';
	import { getThumbUrl } from '$lib/utils/plex-thumb';

	interface Props extends SeriesCompletionSlideProps {
		messagingContext?: SlideMessagingContext;
	}

	let {
		seriesCompletion,
		limit = 5,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children,
		messagingContext = createPersonalContext()
	}: Props = $props();

	const possessive = $derived(getPossessive(messagingContext));
	const displayedSeries = $derived(seriesCompletion.slice(0, limit));
	const hasSeries = $derived(displayedSeries.length > 0);

	const completedCount = $derived(
		seriesCompletion.filter((s) => s.percentComplete >= 100).length
	);

	const personality = $derived.by(() => {
		if (seriesCompletion.length === 0) return null;
		if (completedCount >= 5) return 'Completionist';
		if (completedCount >= 2) return 'Dedicated Viewer';
		if (seriesCompletion.length >= 10) return 'Serial Sampler';
		return 'Explorer';
	});

	function getProgressColor(percent: number): string {
		if (percent >= 100) return 'hsl(120 50% 45%)';
		if (percent >= 75) return 'hsl(80 50% 50%)';
		if (percent >= 50) return 'hsl(45 70% 50%)';
		if (percent >= 25) return 'hsl(30 70% 50%)';
		return 'hsl(var(--primary))';
	}

	let container: HTMLElement | undefined = $state();
	let cards: HTMLElement[] = $state([]);
	let badge: HTMLElement | undefined = $state();

	$effect(() => {
		if (!container || !active) return;

		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate) {
			container.style.opacity = '1';
			container.style.transform = 'none';
			cards.forEach((el) => {
				if (el) {
					el.style.opacity = '1';
					el.style.transform = 'none';
				}
			});
			if (badge) {
				badge.style.opacity = '1';
				badge.style.transform = 'none';
			}
			onAnimationComplete?.();
			return;
		}

		const containerAnim = animate(
			container,
			{ opacity: [0, 1], transform: ['translateY(25px) scale(0.98)', 'translateY(0) scale(1)'] },
			{ type: 'spring', ...SPRING_PRESETS.snappy }
		);

		const validCards = cards.filter(Boolean);
		const adaptiveStagger = getAdaptiveStagger(validCards.length);

		if (validCards.length > 0) {
			const cardsAnim = animate(
				validCards,
				{ opacity: [0, 1], transform: ['translateY(15px)', 'translateY(0)'] },
				{
					type: 'spring',
					...SPRING_PRESETS.gentle,
					delay: stagger(adaptiveStagger, { startDelay: DELAY_PRESETS.short })
				}
			);

			if (badge) {
				const badgeAnim = animate(
					badge,
					{ opacity: [0, 1], transform: ['scale(0.8)', 'scale(1)'] },
					{
						type: 'spring',
						...SPRING_PRESETS.bouncy,
						delay: DELAY_PRESETS.long
					}
				);

				badgeAnim.finished.then(() => {
					onAnimationComplete?.();
				});

				return () => {
					containerAnim.stop();
					cardsAnim.stop();
					badgeAnim.stop();
				};
			}

			cardsAnim.finished.then(() => {
				onAnimationComplete?.();
			});

			return () => {
				containerAnim.stop();
				cardsAnim.stop();
			};
		}

		return () => {
			containerAnim.stop();
		};
	});
</script>

<BaseSlide {active} class="series-completion-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{possessive} Series Progress</h2>

		{#if hasSeries}
			<div class="series-list">
				{#each displayedSeries as series, i}
					{@const isComplete = series.percentComplete >= 100}
					<div bind:this={cards[i]} class="series-card" class:complete={isComplete}>
						<div class="thumb-container">
							{#if series.thumb}
								<img src={getThumbUrl(series.thumb) ?? ''} alt="" class="thumb" loading="lazy" />
							{:else}
								<div class="thumb-placeholder">📺</div>
							{/if}
							{#if isComplete}
								<span class="complete-badge">✓</span>
							{/if}
						</div>
						<div class="series-info">
							<span class="series-title">{series.show}</span>
							<div class="progress-container">
								<div class="progress-track">
									<div
										class="progress-bar"
										style="width: {series.percentComplete}%; background: {getProgressColor(series.percentComplete)};"
									></div>
								</div>
								<span class="progress-text">
									{series.watchedEpisodes} / {series.totalEpisodes}
								</span>
							</div>
						</div>
						<span class="percent-badge" style="color: {getProgressColor(series.percentComplete)};">
							{Math.round(series.percentComplete)}%
						</span>
					</div>
				{/each}
			</div>

			{#if personality}
				<div bind:this={badge} class="personality-badge" class:completionist={completedCount >= 2}>
					<span class="badge-icon">{completedCount >= 2 ? '🏆' : '📊'}</span>
					<span class="badge-text">{personality}</span>
					{#if completedCount > 0}
						<span class="badge-stat">{completedCount} series completed</span>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="no-series">
				<span class="no-series-icon">📺</span>
				<p class="empty-message">No series data available</p>
				<p class="empty-hint">Watch some TV shows to see your progress!</p>
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
		width: 100%;
		max-width: var(--content-max-md, 600px);
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.05em;
		text-shadow: 0 0 30px var(--slide-glow-color, hsl(var(--primary) / 0.3));
	}

	.series-list {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.series-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.4));
		backdrop-filter: blur(var(--slide-glass-blur, 12px));
		-webkit-backdrop-filter: blur(var(--slide-glass-blur, 12px));
		border: 1px solid var(--slide-glass-border, hsl(var(--primary-hue) 30% 40% / 0.2));
		border-radius: calc(var(--radius) * 1.5);
		transition:
			transform 0.3s ease,
			border-color 0.3s ease;
	}

	.series-card:hover {
		transform: translateX(4px);
		border-color: hsl(var(--primary) / 0.3);
	}

	.series-card.complete {
		border-color: hsl(120 50% 45% / 0.3);
	}

	.thumb-container {
		position: relative;
		width: 50px;
		height: 50px;
		border-radius: var(--radius);
		overflow: hidden;
		flex-shrink: 0;
	}

	.thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.thumb-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--muted) / 0.3);
		font-size: 1.5rem;
	}

	.complete-badge {
		position: absolute;
		bottom: -4px;
		right: -4px;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(120 50% 45%);
		border-radius: 50%;
		font-size: 0.75rem;
		color: white;
		font-weight: bold;
	}

	.series-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
	}

	.series-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress-container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.progress-track {
		flex: 1;
		height: 6px;
		background: hsl(var(--muted) / 0.3);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		border-radius: 3px;
		transition: width 0.5s ease-out;
	}

	.progress-text {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
	}

	.percent-badge {
		font-size: 1rem;
		font-weight: 700;
		min-width: 45px;
		text-align: right;
	}

	.personality-badge {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.1));
		border: 1px solid hsl(var(--primary) / 0.3);
		border-radius: 2rem;
	}

	.personality-badge.completionist {
		background: linear-gradient(135deg, hsl(120 50% 45% / 0.2), hsl(120 50% 45% / 0.1));
		border-color: hsl(120 50% 45% / 0.3);
	}

	.badge-icon {
		font-size: 1.5rem;
	}

	.badge-text {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.personality-badge.completionist .badge-text {
		color: hsl(120 50% 45%);
	}

	.badge-stat {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.no-series {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.no-series-icon {
		font-size: 3rem;
		opacity: 0.5;
	}

	.empty-message {
		color: hsl(var(--muted-foreground));
		font-style: italic;
		font-size: 1.125rem;
		margin: 0;
	}

	.empty-hint {
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		opacity: 0.7;
		margin: 0;
	}

	.extra {
		margin-top: 1rem;
	}

	@media (max-width: 767px) {
		.content {
			gap: 1rem;
		}

		.title {
			font-size: 1.5rem;
		}

		.series-card {
			padding: 0.625rem 0.75rem;
			gap: 0.75rem;
		}

		.thumb-container {
			width: 40px;
			height: 40px;
		}

		.series-title {
			font-size: 0.875rem;
		}

		.progress-track {
			height: 5px;
		}

		.percent-badge {
			font-size: 0.875rem;
			min-width: 40px;
		}
	}
</style>
