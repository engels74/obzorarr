<script lang="ts">
	import type { SlideRenderConfig, SlideType } from '$lib/components/slides/types';
	import type { UserStats, ServerStats } from '$lib/server/stats/types';
	import type { CustomSlide } from '$lib/server/slides/types';
	import {
		TotalTimeSlide,
		TopMoviesSlide,
		TopShowsSlide,
		GenresSlide,
		DistributionSlide,
		PercentileSlide,
		BingeSlide,
		FirstLastSlide,
		FunFactSlide,
		CustomSlide as CustomSlideComponent
	} from '$lib/components/slides';

	/**
	 * SlideRenderer Component
	 *
	 * Dynamically renders the appropriate slide component based on type.
	 * Maps slide configuration and stats to component props.
	 *
	 * @module components/wrapped/SlideRenderer
	 */

	interface Props {
		/** Slide configuration */
		slide: SlideRenderConfig;
		/** Statistics data (user or server) */
		stats: UserStats | ServerStats;
		/** Custom slides data for custom type slides */
		customSlides?: Map<number, CustomSlide>;
		/** Whether this slide is currently active/visible */
		active?: boolean;
		/** Callback when slide animation completes */
		onAnimationComplete?: () => void;
		/** Additional CSS classes */
		class?: string;
	}

	let {
		slide,
		stats,
		customSlides,
		active = true,
		onAnimationComplete,
		class: klass = ''
	}: Props = $props();

	// Type guard for user stats
	function isUserStats(s: UserStats | ServerStats): s is UserStats {
		return 'userId' in s && 'percentileRank' in s;
	}

	// Get custom slide data if applicable
	const customSlideData = $derived(
		slide.type === 'custom' && slide.customSlideId !== undefined
			? customSlides?.get(slide.customSlideId)
			: undefined
	);

	// Get percentile rank (only available in UserStats)
	const percentileRank = $derived(isUserStats(stats) ? stats.percentileRank : 50);
	const totalUsers = $derived(!isUserStats(stats) ? stats.totalUsers : undefined);
</script>

<div class="slide-renderer {klass}">
	{#if slide.type === 'total-time'}
		<TotalTimeSlide
			totalWatchTimeMinutes={stats.totalWatchTimeMinutes}
			{active}
			{onAnimationComplete}
		/>
	{:else if slide.type === 'top-movies'}
		<TopMoviesSlide topMovies={stats.topMovies} {active} {onAnimationComplete} />
	{:else if slide.type === 'top-shows'}
		<TopShowsSlide topShows={stats.topShows} {active} {onAnimationComplete} />
	{:else if slide.type === 'genres'}
		<GenresSlide topGenres={stats.topGenres} {active} {onAnimationComplete} />
	{:else if slide.type === 'distribution'}
		<DistributionSlide
			watchTimeByMonth={stats.watchTimeByMonth}
			watchTimeByHour={stats.watchTimeByHour}
			view="monthly"
			{active}
			{onAnimationComplete}
		/>
	{:else if slide.type === 'percentile'}
		<PercentileSlide {percentileRank} {totalUsers} {active} {onAnimationComplete} />
	{:else if slide.type === 'binge'}
		<BingeSlide longestBinge={stats.longestBinge} {active} {onAnimationComplete} />
	{:else if slide.type === 'first-last'}
		<FirstLastSlide
			firstWatch={stats.firstWatch}
			lastWatch={stats.lastWatch}
			{active}
			{onAnimationComplete}
		/>
	{:else if slide.type === 'fun-fact'}
		<FunFactSlide
			fact="You've watched an incredible amount of content this year!"
			comparison="That's more than the average viewer!"
			{active}
			{onAnimationComplete}
		/>
	{:else if slide.type === 'custom' && customSlideData}
		<CustomSlideComponent
			title={customSlideData.title}
			content={customSlideData.content}
			{active}
			{onAnimationComplete}
		/>
	{:else if slide.type === 'custom' && slide.customTitle && slide.customContent}
		<!-- Fallback for inline custom slide data -->
		<CustomSlideComponent
			title={slide.customTitle}
			content={slide.customContent}
			{active}
			{onAnimationComplete}
		/>
	{:else}
		<!-- Fallback for unknown slide types -->
		<div class="unknown-slide">
			<p>Unknown slide type: {slide.type}</p>
		</div>
	{/if}
</div>

<style>
	.slide-renderer {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.unknown-slide {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted-foreground);
		font-size: 1rem;
	}
</style>
