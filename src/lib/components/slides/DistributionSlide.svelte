<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { DistributionSlideProps } from './types';

	/**
	 * DistributionSlide Component
	 *
	 * Displays watch time distribution by month or hour with bar charts.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	interface Props extends DistributionSlideProps {}

	let {
		watchTimeByMonth,
		watchTimeByHour,
		view = 'monthly',
		active = true,
		onAnimationComplete,
		class: klass = '',
		children
	}: Props = $props();

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

	// Calculate max values for scaling
	const maxMonthly = $derived(Math.max(...watchTimeByMonth, 1));
	const maxHourly = $derived(Math.max(...watchTimeByHour, 1));

	// Prepare data with percentages
	const monthlyData = $derived(
		watchTimeByMonth.map((minutes, i) => ({
			label: months[i] ?? '',
			value: minutes,
			percentage: (minutes / maxMonthly) * 100
		}))
	);

	const hourlyData = $derived(
		watchTimeByHour.map((minutes, i) => ({
			label: `${i.toString().padStart(2, '0')}:00`,
			value: minutes,
			percentage: (minutes / maxHourly) * 100
		}))
	);

	// Active dataset based on view
	const activeData = $derived(view === 'hourly' ? hourlyData : monthlyData);
	const title = $derived(view === 'hourly' ? 'When You Watch' : 'Your Year in Months');

	// Find peak
	const peakIndex = $derived(
		activeData.reduce((maxIdx, curr, idx, arr) => {
			const maxItem = arr[maxIdx];
			return maxItem && curr.value > maxItem.value ? idx : maxIdx;
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
</script>

<BaseSlide {active} class="distribution-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">{title}</h2>

		<div class="chart-container" class:hourly={view === 'hourly'}>
			{#each activeData as item, i}
				<div class="bar-wrapper" class:peak={i === peakIndex}>
					<div
						bind:this={bars[i]}
						class="bar"
						style="height: {item.percentage}%"
						title="{item.label}: {formatMinutes(item.value)}"
					></div>
					<span class="label">{view === 'hourly' ? i : item.label}</span>
				</div>
			{/each}
		</div>

		{#if activeData[peakIndex]}
			<p class="peak-info">
				Peak: <strong>{activeData[peakIndex].label}</strong>
				({formatMinutes(activeData[peakIndex].value)})
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
		color: var(--primary);
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
	}

	.hourly .bar-wrapper {
		max-width: 20px;
	}

	.bar {
		width: 100%;
		background: linear-gradient(180deg, var(--primary), oklch(0.4 0.1 25));
		border-radius: 2px 2px 0 0;
		transform-origin: bottom center;
		min-height: 4px;
		transition: background-color 0.2s;
	}

	.peak .bar {
		background: linear-gradient(180deg, oklch(0.7 0.2 60), oklch(0.5 0.15 50));
	}

	.label {
		font-size: 0.625rem;
		color: var(--muted-foreground);
		margin-top: 0.25rem;
		white-space: nowrap;
	}

	.hourly .label {
		font-size: 0.5rem;
	}

	.peak-info {
		font-size: 1rem;
		color: var(--muted-foreground);
	}

	.peak-info strong {
		color: var(--primary);
	}

	.extra {
		margin-top: 1rem;
	}

	@media (max-width: 768px) {
		.chart-container {
			height: 150px;
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
	}
</style>
