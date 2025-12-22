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
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	interface Props extends DistributionSlideProps {
		messagingContext?: SlideMessagingContext;
	}

	let {
		watchTimeByMonth,
		watchTimeByHour,
		view = 'monthly',
		active = true,
		onAnimationComplete,
		class: klass = '',
		children,
		messagingContext = createPersonalContext()
	}: Props = $props();

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

	// Active dataset based on view
	const activeData = $derived(view === 'hourly' ? hourlyData : monthlyData);
	const title = $derived(
		view === 'hourly' ? `When ${subject} Watch` : `${possessive} Year in Months`
	);

	// Find peak
	const peakIndex = $derived(
		activeData.reduce((maxIdx, curr, idx, arr) => {
			const maxItem = arr[maxIdx];
			return maxItem && curr.minutes > maxItem.minutes ? idx : maxIdx;
		}, 0)
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
				if (el) el.style.transform = 'scaleY(1)';
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
				{ transform: ['scaleY(0)', 'scaleY(1)'] },
				{
					type: 'spring',
					stiffness: 150,
					damping: 15,
					delay: stagger(0.03, { startDelay: 0.2 })
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
	<div bind:this={container} class="content">
		<h2 class="title">{title}</h2>

		<Tooltip.Provider>
			<div class="chart-container" class:hourly={view === 'hourly'}>
				{#each activeData as item, i}
					<div class="bar-wrapper" class:peak={i === peakIndex}>
						<span class="data-label" class:visible={item.minutes > 0}>
							{item.minutes > 0 ? formatMinutes(item.minutes) : ''}
						</span>
						<Tooltip.Root>
							<Tooltip.Trigger>
								<div
									bind:this={bars[i]}
									class="bar"
									style="height: {item.percentage}%"
									role="img"
									aria-label="{item.labelFull}: {formatMinutesDetailed(item.minutes)}, {formatPlays(
										item.plays
									)}"
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
						<span class="label">{view === 'hourly' ? i : item.label}</span>
					</div>
				{/each}
			</div>
		</Tooltip.Provider>

		{#if activeData[peakIndex]}
			<p class="peak-info">
				Peak: <strong>{activeData[peakIndex].labelFull}</strong>
				({formatMinutesDetailed(activeData[peakIndex].minutes)})
			</p>
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
		background: linear-gradient(180deg, hsl(var(--primary)), oklch(0.4 0.1 25));
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
		background: linear-gradient(180deg, oklch(0.7 0.2 60), oklch(0.5 0.15 50));
	}

	.peak .bar:hover {
		box-shadow: 0 0 12px oklch(0.7 0.2 60 / 0.5);
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

	@media (max-width: 768px) {
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
</style>
