<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { DistributionSlideProps } from './types';
	import type { SlideMessagingContext } from './messaging-context';
	import { getSubject, getPossessive, createPersonalContext } from './messaging-context';
	import * as Tooltip from '$lib/components/ui/tooltip';

	/**
	 * DistributionSlide Component
	 *
	 * Displays watch time distribution by month or hour with bar charts.
	 * Shows data labels on bars and detailed tooltips on hover.
	 * On desktop/tablet (>=768px), shows both monthly and hourly side-by-side.
	 * On mobile (<768px), shows single chart with toggle.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	interface Props extends DistributionSlideProps {
		messagingContext?: SlideMessagingContext;
	}

	let {
		watchTimeByMonth,
		watchTimeByHour,
		view = 'both',
		active = true,
		onAnimationComplete,
		class: klass = '',
		children,
		messagingContext = createPersonalContext()
	}: Props = $props();

	// Viewport detection for responsive dual-view
	let isDesktopViewport = $state(false);

	$effect(() => {
		if (typeof window === 'undefined') return;

		const mediaQuery = window.matchMedia('(min-width: 768px)');
		isDesktopViewport = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			isDesktopViewport = e.matches;
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});

	// Mobile toggle state - explicit type annotation for union type
	type MobileViewType = 'monthly' | 'hourly';
	let mobileView: MobileViewType = $state<MobileViewType>('monthly');

	// Derive whether we have data for both views
	const hasMonthlyData = $derived(watchTimeByMonth.minutes.some((m) => m > 0));
	const hasHourlyData = $derived(watchTimeByHour.minutes.some((m) => m > 0));
	const hasBothData = $derived(hasMonthlyData && hasHourlyData);

	// Show dual view on tablet/desktop when both datasets have data
	const showDualView = $derived(
		isDesktopViewport && hasBothData && view !== 'monthly' && view !== 'hourly'
	);

	// Get messaging helpers
	const subject = $derived(getSubject(messagingContext));
	const possessive = $derived(getPossessive(messagingContext));

	// Month labels
	const months = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];

	// Full month names for tooltips
	const monthsFull = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];

	// Calculate max values for scaling
	const maxMonthly = $derived(Math.max(...watchTimeByMonth.minutes, 1));
	const maxHourly = $derived(Math.max(...watchTimeByHour.minutes, 1));

	// Prepare data with percentages
	const monthlyData = $derived(
		watchTimeByMonth.minutes.map((minutes, i) => ({
			label: months[i] ?? '',
			labelFull: monthsFull[i] ?? '',
			minutes,
			plays: watchTimeByMonth.plays[i] ?? 0,
			percentage: (minutes / maxMonthly) * 100
		}))
	);

	const hourlyData = $derived(
		watchTimeByHour.minutes.map((minutes, i) => ({
			label: `${i.toString().padStart(2, '0')}:00`,
			labelFull: `${i.toString().padStart(2, '0')}:00 - ${((i + 1) % 24).toString().padStart(2, '0')}:00`,
			minutes,
			plays: watchTimeByHour.plays[i] ?? 0,
			percentage: (minutes / maxHourly) * 100
		}))
	);

	// Active dataset based on mobile view selection
	const activeData = $derived(mobileView === 'hourly' ? hourlyData : monthlyData);
	const mobileTitle = $derived(
		mobileView === 'hourly' ? `When ${subject} Watch` : `${possessive} Year in Months`
	);

	// Find peaks for each dataset (independent peak highlighting)
	const monthlyPeakIndex = $derived(
		monthlyData.reduce((maxIdx, curr, idx, arr) => {
			const maxItem = arr[maxIdx];
			return maxItem && curr.minutes > maxItem.minutes ? idx : maxIdx;
		}, 0)
	);

	const hourlyPeakIndex = $derived(
		hourlyData.reduce((maxIdx, curr, idx, arr) => {
			const maxItem = arr[maxIdx];
			return maxItem && curr.minutes > maxItem.minutes ? idx : maxIdx;
		}, 0)
	);

	// For mobile single view
	const activePeakIndex = $derived(mobileView === 'hourly' ? hourlyPeakIndex : monthlyPeakIndex);

	// Element references
	let container: HTMLElement | undefined = $state();
	let monthlyBars: HTMLElement[] = $state([]);
	let hourlyBars: HTMLElement[] = $state([]);
	let singleViewBars: HTMLElement[] = $state([]);

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !active) return;

		const shouldAnimate = !prefersReducedMotion.current;
		const animations: { stop: () => void; finished: Promise<void> }[] = [];

		// Helper to set bars visible without animation
		const setVisible = (bars: HTMLElement[]) => {
			bars.forEach((el) => {
				if (el) el.style.transform = 'scaleY(1)';
			});
		};

		if (!shouldAnimate) {
			container.style.opacity = '1';
			if (showDualView) {
				setVisible(monthlyBars);
				setVisible(hourlyBars);
			} else {
				setVisible(singleViewBars);
			}
			onAnimationComplete?.();
			return;
		}

		// Animate container
		const containerAnim = animate(container, { opacity: [0, 1] }, { duration: 0.4 });
		animations.push(containerAnim);

		if (showDualView) {
			// Dual view: animate monthly bars first, then hourly
			const validMonthlyBars = monthlyBars.filter(Boolean);
			const validHourlyBars = hourlyBars.filter(Boolean);

			if (validMonthlyBars.length > 0) {
				const monthlyAnim = animate(
					validMonthlyBars,
					{ transform: ['scaleY(0)', 'scaleY(1)'] },
					{
						type: 'spring',
						stiffness: 150,
						damping: 15,
						delay: stagger(0.03, { startDelay: 0.2 })
					}
				);
				animations.push(monthlyAnim);
			}

			if (validHourlyBars.length > 0) {
				const hourlyAnim = animate(
					validHourlyBars,
					{ transform: ['scaleY(0)', 'scaleY(1)'] },
					{
						type: 'spring',
						stiffness: 150,
						damping: 15,
						delay: stagger(0.02, { startDelay: 0.6 }) // Start after monthly
					}
				);
				animations.push(hourlyAnim);

				hourlyAnim.finished.then(() => {
					onAnimationComplete?.();
				});
			} else if (validMonthlyBars.length > 0) {
				// Only monthly bars exist, wait for monthly animation to complete
				const monthlyAnimRef = animations[1];
				if (monthlyAnimRef) {
					monthlyAnimRef.finished.then(() => {
						onAnimationComplete?.();
					});
				}
			}
		} else {
			// Single view: animate all bars
			const validBars = singleViewBars.filter(Boolean);
			if (validBars.length > 0) {
				const barsAnim = animate(
					validBars,
					{ transform: ['scaleY(0)', 'scaleY(1)'] },
					{
						type: 'spring',
						stiffness: 150,
						damping: 15,
						delay: stagger(0.03, { startDelay: 0.2 })
					}
				);
				animations.push(barsAnim);

				barsAnim.finished.then(() => {
					onAnimationComplete?.();
				});
			}
		}

		return () => {
			animations.forEach((a) => a.stop());
		};
	});

	function formatMinutes(minutes: number): string {
		if (minutes < 60) return `${Math.round(minutes)}m`;
		const hours = Math.floor(minutes / 60);
		return `${hours}h`;
	}

	function formatMinutesDetailed(minutes: number): string {
		if (minutes < 60) return `${Math.round(minutes)} minutes`;
		const hours = Math.floor(minutes / 60);
		const mins = Math.round(minutes % 60);
		if (mins === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
		return `${hours}h ${mins}m`;
	}

	function formatPlays(plays: number): string {
		return `${plays} ${plays === 1 ? 'play' : 'plays'}`;
	}
</script>

<BaseSlide {active} class="distribution-slide {klass}">
	<div bind:this={container} class="content" class:dual-view={showDualView}>
		{#if showDualView}
			<!-- Desktop/Tablet: Side-by-side charts -->
			<h2 class="title">{possessive} Viewing Patterns</h2>

			<Tooltip.Provider>
				<div class="charts-grid">
					<!-- Monthly Chart -->
					<div class="chart-section">
						<h3 class="section-title">Year in Months</h3>
						<div class="chart-container monthly">
							{#each monthlyData as item, i}
								<div class="bar-wrapper" class:peak={i === monthlyPeakIndex}>
									<span class="data-label" class:visible={item.minutes > 0}>
										{item.minutes > 0 ? formatMinutes(item.minutes) : ''}
									</span>
									<Tooltip.Root>
										<Tooltip.Trigger>
											<div
												bind:this={monthlyBars[i]}
												class="bar"
												style="height: {item.percentage}%"
												role="img"
												aria-label="{item.labelFull}: {formatMinutesDetailed(
													item.minutes
												)}, {formatPlays(item.plays)}"
											></div>
										</Tooltip.Trigger>
										<Tooltip.Content side="top" class="tooltip-content">
											<div class="tooltip-inner">
												<strong class="tooltip-title">{item.labelFull}</strong>
												<p class="tooltip-stat">{formatMinutesDetailed(item.minutes)}</p>
												<p class="tooltip-stat">{formatPlays(item.plays)}</p>
											</div>
										</Tooltip.Content>
									</Tooltip.Root>
									<span class="label">{item.label}</span>
								</div>
							{/each}
						</div>
						{#if monthlyData[monthlyPeakIndex]}
							<p class="peak-info">
								Peak: <strong>{monthlyData[monthlyPeakIndex].labelFull}</strong>
							</p>
						{/if}
					</div>

					<!-- Hourly Chart -->
					<div class="chart-section">
						<h3 class="section-title">When {subject} Watch</h3>
						<div class="chart-container hourly">
							{#each hourlyData as item, i}
								<div class="bar-wrapper" class:peak={i === hourlyPeakIndex}>
									<span class="data-label" class:visible={item.minutes > 0}>
										{item.minutes > 0 ? formatMinutes(item.minutes) : ''}
									</span>
									<Tooltip.Root>
										<Tooltip.Trigger>
											<div
												bind:this={hourlyBars[i]}
												class="bar"
												style="height: {item.percentage}%"
												role="img"
												aria-label="{item.labelFull}: {formatMinutesDetailed(
													item.minutes
												)}, {formatPlays(item.plays)}"
											></div>
										</Tooltip.Trigger>
										<Tooltip.Content side="top" class="tooltip-content">
											<div class="tooltip-inner">
												<strong class="tooltip-title">{item.labelFull}</strong>
												<p class="tooltip-stat">{formatMinutesDetailed(item.minutes)}</p>
												<p class="tooltip-stat">{formatPlays(item.plays)}</p>
											</div>
										</Tooltip.Content>
									</Tooltip.Root>
									<span class="label">{i}</span>
								</div>
							{/each}
						</div>
						{#if hourlyData[hourlyPeakIndex]}
							<p class="peak-info">
								Peak: <strong>{hourlyData[hourlyPeakIndex].labelFull}</strong>
							</p>
						{/if}
					</div>
				</div>
			</Tooltip.Provider>
		{:else}
			<!-- Mobile: Single chart with toggle -->
			<div class="mobile-header">
				<h2 class="title">{mobileTitle}</h2>
				{#if hasBothData}
					<div class="view-toggle" role="tablist" aria-label="Chart view selection">
						<button
							role="tab"
							aria-selected={mobileView === 'monthly'}
							class:active={mobileView === 'monthly'}
							onclick={() => {
								mobileView = 'monthly';
							}}
						>
							Months
						</button>
						<button
							role="tab"
							aria-selected={mobileView === 'hourly'}
							class:active={mobileView === 'hourly'}
							onclick={() => {
								mobileView = 'hourly';
							}}
						>
							Hours
						</button>
					</div>
				{/if}
			</div>

			<Tooltip.Provider>
				<div class="chart-container" class:hourly={mobileView === 'hourly'}>
					{#each activeData as item, i}
						<div class="bar-wrapper" class:peak={i === activePeakIndex}>
							<span class="data-label" class:visible={item.minutes > 0}>
								{item.minutes > 0 ? formatMinutes(item.minutes) : ''}
							</span>
							<Tooltip.Root>
								<Tooltip.Trigger>
									<div
										bind:this={singleViewBars[i]}
										class="bar"
										style="height: {item.percentage}%"
										role="img"
										aria-label="{item.labelFull}: {formatMinutesDetailed(
											item.minutes
										)}, {formatPlays(item.plays)}"
									></div>
								</Tooltip.Trigger>
								<Tooltip.Content side="top" class="tooltip-content">
									<div class="tooltip-inner">
										<strong class="tooltip-title">{item.labelFull}</strong>
										<p class="tooltip-stat">{formatMinutesDetailed(item.minutes)}</p>
										<p class="tooltip-stat">{formatPlays(item.plays)}</p>
									</div>
								</Tooltip.Content>
							</Tooltip.Root>
							<span class="label">{mobileView === 'hourly' ? i : item.label}</span>
						</div>
					{/each}
				</div>
			</Tooltip.Provider>

			{#if activeData[activePeakIndex]}
				<p class="peak-info">
					Peak: <strong>{activeData[activePeakIndex].labelFull}</strong>
					({formatMinutesDetailed(activeData[activePeakIndex].minutes)})
				</p>
			{/if}
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
		max-width: 700px;
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.chart-container {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 0.25rem;
		height: 200px;
		width: 100%;
		padding: 0 1rem;
	}

	.chart-container.hourly {
		gap: 0.125rem;
	}

	.bar-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		flex: 1;
		max-width: 40px;
		height: 100%;
		position: relative;
	}

	.bar-wrapper :global(button[data-slot='tooltip-trigger']) {
		display: flex;
		align-items: flex-end;
		flex: 1;
		width: 100%;
		/* Reset browser button defaults */
		background: transparent;
		border: none;
		padding: 0;
		margin: 0;
		outline: none;
		-webkit-appearance: none;
		appearance: none;
	}

	.bar-wrapper :global(button[data-slot='tooltip-trigger']:focus-visible) {
		outline: 2px solid hsl(var(--primary) / 0.5);
		outline-offset: 2px;
	}

	.hourly .bar-wrapper {
		max-width: 20px;
	}

	.data-label {
		font-size: 0.5rem;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.125rem;
		opacity: 0;
		transition: opacity 0.2s ease;
		white-space: nowrap;
		min-height: 0.75rem;
	}

	.data-label.visible {
		opacity: 0.8;
	}

	.peak .data-label.visible {
		opacity: 1;
		color: hsl(var(--accent));
		font-weight: 600;
	}

	.bar {
		width: 100%;
		background: linear-gradient(180deg, hsl(var(--primary)), var(--slide-bar-end));
		border-radius: 2px 2px 0 0;
		transform-origin: bottom center;
		min-height: 4px;
		transition:
			transform 0.2s ease,
			filter 0.2s ease,
			box-shadow 0.2s ease;
		cursor: pointer;
	}

	.bar:hover {
		transform: scaleX(1.15) !important;
		filter: brightness(1.2);
		box-shadow: 0 0 8px hsl(var(--primary) / 0.4);
	}

	.peak .bar {
		background: linear-gradient(180deg, var(--slide-peak-start), var(--slide-peak-end));
	}

	.peak .bar:hover {
		box-shadow: 0 0 12px color-mix(in oklch, var(--slide-peak-start) 50%, transparent);
	}

	.label {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.25rem;
		white-space: nowrap;
	}

	.hourly .label {
		font-size: 0.5rem;
	}

	.peak-info {
		font-size: 1rem;
		color: hsl(var(--muted-foreground));
	}

	.peak-info strong {
		color: hsl(var(--primary));
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
		margin-bottom: 0.25rem;
	}

	.tooltip-stat {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	/* ==========================================================================
	   Dual-view styles (tablet/desktop side-by-side charts)
	   ========================================================================== */

	.content.dual-view {
		max-width: var(--content-max-xl, 1100px);
	}

	.charts-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 2rem;
		width: 100%;
	}

	.chart-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	/* Dual-view chart adjustments */
	.dual-view .chart-container {
		height: 160px;
	}

	.dual-view .monthly {
		gap: 0.2rem;
	}

	.dual-view .monthly .bar-wrapper {
		max-width: 35px;
	}

	.dual-view .hourly {
		gap: 0.1rem;
	}

	.dual-view .hourly .bar-wrapper {
		max-width: 16px;
	}

	.dual-view .peak-info {
		font-size: 0.875rem;
	}

	/* ==========================================================================
	   Mobile-only styles (single chart with toggle)
	   ========================================================================== */

	.mobile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.view-toggle {
		display: flex;
		gap: 0.25rem;
		background: hsl(var(--muted) / 0.3);
		padding: 0.25rem;
		border-radius: 0.5rem;
	}

	.view-toggle button {
		padding: 0.375rem 0.75rem;
		border: none;
		background: transparent;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		font-weight: 500;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.view-toggle button:hover {
		color: hsl(var(--foreground));
	}

	.view-toggle button.active {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.view-toggle button:focus-visible {
		outline: 2px solid hsl(var(--primary) / 0.5);
		outline-offset: 2px;
	}

	/* ==========================================================================
	   Responsive breakpoints
	   ========================================================================== */

	/* Mobile: compact layout */
	@media (max-width: 767px) {
		.chart-container {
			height: 150px;
		}

		.data-label {
			font-size: 0.4375rem;
		}

		.label {
			font-size: 0.5rem;
		}

		.hourly .label {
			display: none;
		}

		.hourly .bar-wrapper:nth-child(even) .label {
			display: block;
		}

		.hourly .data-label {
			display: none;
		}
	}

	/* Tablet: stacked dual-view with larger charts */
	@media (min-width: 768px) {
		.charts-grid {
			grid-template-columns: 1fr;
			gap: 2.5rem;
		}

		.dual-view .chart-container {
			height: 180px;
			max-width: 600px;
		}

		.dual-view .monthly .bar-wrapper {
			max-width: 40px;
		}

		.dual-view .hourly .bar-wrapper {
			max-width: 20px;
		}
	}

	/* Desktop: side-by-side dual-view */
	@media (min-width: 1024px) {
		.charts-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 3rem;
		}

		.dual-view .chart-container {
			height: 180px;
			max-width: none;
		}

		.dual-view .monthly .bar-wrapper {
			max-width: 35px;
		}

		.dual-view .hourly .bar-wrapper {
			max-width: 16px;
		}

		.section-title {
			font-size: 1.125rem;
		}
	}
</style>
