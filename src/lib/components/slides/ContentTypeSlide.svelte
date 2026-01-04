<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import { DELAY_PRESETS, SPRING_PRESETS } from '$lib/utils/animation-presets';
	import BaseSlide from './BaseSlide.svelte';
	import type { SlideMessagingContext } from './messaging-context';
	import { createPersonalContext, getSubject } from './messaging-context';
	import type { ContentTypeSlideProps } from './types';

	interface Props extends ContentTypeSlideProps {
		messagingContext?: SlideMessagingContext;
	}

	let {
		contentTypes,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children,
		messagingContext = createPersonalContext()
	}: Props = $props();

	const subject = $derived(getSubject(messagingContext));

	const total = $derived(
		contentTypes.movies.count + contentTypes.episodes.count + contentTypes.tracks.count
	);

	const moviePercent = $derived(total > 0 ? (contentTypes.movies.count / total) * 100 : 0);
	const episodePercent = $derived(total > 0 ? (contentTypes.episodes.count / total) * 100 : 0);
	const trackPercent = $derived(total > 0 ? (contentTypes.tracks.count / total) * 100 : 0);

	const personality = $derived.by(() => {
		if (total === 0) return 'Explorer';
		if (moviePercent >= 60) return 'Movie Buff';
		if (episodePercent >= 60) return 'TV Addict';
		if (trackPercent >= 60) return 'Music Lover';
		if (moviePercent >= 40 && episodePercent >= 40) return 'All-Rounder';
		return 'Balanced Viewer';
	});

	const dominantType = $derived.by(() => {
		if (contentTypes.movies.count >= contentTypes.episodes.count) {
			if (contentTypes.movies.count >= contentTypes.tracks.count) return 'movies';
		}
		if (contentTypes.episodes.count >= contentTypes.tracks.count) return 'episodes';
		return 'tracks';
	});

	function formatCount(count: number): string {
		return count.toLocaleString();
	}

	function formatMinutes(minutes: number): string {
		const hours = Math.floor(minutes / 60);
		if (hours >= 24) {
			const days = Math.floor(hours / 24);
			return `${days}d ${hours % 24}h`;
		}
		return `${hours}h ${Math.round(minutes % 60)}m`;
	}

	let container: HTMLElement | undefined = $state();
	let ring: SVGCircleElement | undefined = $state();
	let statCards: HTMLElement[] = $state([]);
	let badge: HTMLElement | undefined = $state();

	$effect(() => {
		if (!container || !active) return;

		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate) {
			container.style.opacity = '1';
			container.style.transform = 'none';
			statCards.forEach((el) => {
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

		const validCards = statCards.filter(Boolean);
		let lastAnim = containerAnim;

		if (validCards.length > 0) {
			const cardsAnim = animate(
				validCards,
				{ opacity: [0, 1], transform: ['scale(0.9)', 'scale(1)'] },
				{
					type: 'spring',
					...SPRING_PRESETS.bouncy,
					delay: DELAY_PRESETS.medium
				}
			);
			lastAnim = cardsAnim;
		}

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
				badgeAnim.stop();
			};
		}

		lastAnim.finished.then(() => {
			onAnimationComplete?.();
		});

		return () => {
			containerAnim.stop();
		};
	});
</script>

<BaseSlide {active} class="content-type-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{subject}'s Content Mix</h2>

		<div class="chart-container">
			<svg viewBox="0 0 200 200" class="donut-chart">
				<circle
					class="donut-segment movies"
					cx="100"
					cy="100"
					r="80"
					stroke-dasharray="{(moviePercent / 100) * 502.65} 502.65"
					stroke-dashoffset="0"
				/>
				<circle
					class="donut-segment episodes"
					cx="100"
					cy="100"
					r="80"
					stroke-dasharray="{(episodePercent / 100) * 502.65} 502.65"
					stroke-dashoffset="-{(moviePercent / 100) * 502.65}"
				/>
				<circle
					class="donut-segment tracks"
					cx="100"
					cy="100"
					r="80"
					stroke-dasharray="{(trackPercent / 100) * 502.65} 502.65"
					stroke-dashoffset="-{((moviePercent + episodePercent) / 100) * 502.65}"
				/>
			</svg>
			<div class="chart-center">
				<span class="total-label">Total</span>
				<span class="total-count">{formatCount(total)}</span>
			</div>
		</div>

		<div class="stat-cards">
			<div
				bind:this={statCards[0]}
				class="stat-card movies"
				class:dominant={dominantType === 'movies'}
			>
				<span class="stat-icon">🎬</span>
				<span class="stat-label">Movies</span>
				<span class="stat-count">{formatCount(contentTypes.movies.count)}</span>
				<span class="stat-time">{formatMinutes(contentTypes.movies.minutes)}</span>
				<span class="stat-percent">{Math.round(moviePercent)}%</span>
			</div>
			<div
				bind:this={statCards[1]}
				class="stat-card episodes"
				class:dominant={dominantType === 'episodes'}
			>
				<span class="stat-icon">📺</span>
				<span class="stat-label">Episodes</span>
				<span class="stat-count">{formatCount(contentTypes.episodes.count)}</span>
				<span class="stat-time">{formatMinutes(contentTypes.episodes.minutes)}</span>
				<span class="stat-percent">{Math.round(episodePercent)}%</span>
			</div>
			{#if contentTypes.tracks.count > 0}
				<div
					bind:this={statCards[2]}
					class="stat-card tracks"
					class:dominant={dominantType === 'tracks'}
				>
					<span class="stat-icon">🎵</span>
					<span class="stat-label">Tracks</span>
					<span class="stat-count">{formatCount(contentTypes.tracks.count)}</span>
					<span class="stat-time">{formatMinutes(contentTypes.tracks.minutes)}</span>
					<span class="stat-percent">{Math.round(trackPercent)}%</span>
				</div>
			{/if}
		</div>

		<div bind:this={badge} class="personality-badge">
			<span class="badge-text">{personality}</span>
		</div>

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

	.chart-container {
		position: relative;
		width: 180px;
		height: 180px;
	}

	.donut-chart {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.donut-segment {
		fill: none;
		stroke-width: 25;
		transition: stroke-dasharray 0.5s ease;
	}

	.donut-segment.movies {
		stroke: hsl(220 70% 55%);
	}

	.donut-segment.episodes {
		stroke: hsl(280 60% 55%);
	}

	.donut-segment.tracks {
		stroke: hsl(150 60% 45%);
	}

	.chart-center {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.total-label {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.total-count {
		font-size: 1.5rem;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.stat-cards {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 1rem 1.25rem;
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.4));
		backdrop-filter: blur(var(--slide-glass-blur, 12px));
		-webkit-backdrop-filter: blur(var(--slide-glass-blur, 12px));
		border: 1px solid var(--slide-glass-border, hsl(var(--primary-hue) 30% 40% / 0.2));
		border-radius: calc(var(--radius) * 1.5);
		min-width: 100px;
		transition:
			transform 0.3s ease,
			border-color 0.3s ease;
	}

	.stat-card:hover {
		transform: translateY(-2px);
	}

	.stat-card.dominant {
		border-color: hsl(var(--primary) / 0.5);
		box-shadow: 0 0 20px hsl(var(--primary) / 0.2);
	}

	.stat-card.movies.dominant {
		border-color: hsl(220 70% 55% / 0.5);
		box-shadow: 0 0 20px hsl(220 70% 55% / 0.2);
	}

	.stat-card.episodes.dominant {
		border-color: hsl(280 60% 55% / 0.5);
		box-shadow: 0 0 20px hsl(280 60% 55% / 0.2);
	}

	.stat-card.tracks.dominant {
		border-color: hsl(150 60% 45% / 0.5);
		box-shadow: 0 0 20px hsl(150 60% 45% / 0.2);
	}

	.stat-icon {
		font-size: 1.5rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-count {
		font-size: 1.25rem;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.stat-time {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.stat-percent {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--primary));
	}

	.personality-badge {
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.1));
		border: 1px solid hsl(var(--primary) / 0.3);
		border-radius: 2rem;
	}

	.badge-text {
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.1em;
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

		.chart-container {
			width: 150px;
			height: 150px;
		}

		.stat-cards {
			gap: 0.75rem;
		}

		.stat-card {
			padding: 0.75rem 1rem;
			min-width: 85px;
		}

		.stat-icon {
			font-size: 1.25rem;
		}

		.stat-count {
			font-size: 1rem;
		}

		.personality-badge {
			padding: 0.5rem 1rem;
		}

		.badge-text {
			font-size: 1rem;
		}
	}

	@media (min-width: 1024px) {
		.chart-container {
			width: 200px;
			height: 200px;
		}

		.stat-card {
			padding: 1.25rem 1.5rem;
			min-width: 120px;
		}
	}
</style>
