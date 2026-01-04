<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import {
		DELAY_PRESETS,
		getAdaptiveStagger,
		KEYFRAMES,
		SPRING_PRESETS
	} from '$lib/utils/animation-presets';
	import BaseSlide from './BaseSlide.svelte';
	import type { TopViewersSlideProps } from './types';

	let {
		topViewers,
		limit = 10,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children
	}: TopViewersSlideProps = $props();

	const medalColors = {
		1: { bg: 'hsl(45 90% 50%)', glow: 'hsl(45 90% 50% / 0.4)' }, // Gold
		2: { bg: 'hsl(210 10% 70%)', glow: 'hsl(210 10% 70% / 0.4)' }, // Silver
		3: { bg: 'hsl(30 60% 45%)', glow: 'hsl(30 60% 45% / 0.4)' } // Bronze
	} as const;

	const displayedViewers = $derived(topViewers.slice(0, limit));
	const hasViewers = $derived(displayedViewers.length > 0);

	// Element references
	let container: HTMLElement | undefined = $state();
	let listItems: HTMLElement[] = $state([]);

	function formatWatchTime(minutes: number): string {
		if (minutes < 60) {
			return `${Math.round(minutes)}m`;
		}
		const hours = Math.floor(minutes / 60);
		if (hours < 24) {
			return `${hours}h`;
		}
		const days = Math.floor(hours / 24);
		const remainingHours = hours % 24;
		if (remainingHours === 0) {
			return `${days}d`;
		}
		return `${days}d ${remainingHours}h`;
	}

	function formatWatchTimeDetailed(minutes: number): string {
		if (minutes < 60) {
			return `${Math.round(minutes)} minutes`;
		}
		const hours = Math.floor(minutes / 60);
		const mins = Math.round(minutes % 60);
		if (hours < 24) {
			if (mins === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
			return `${hours}h ${mins}m`;
		}
		const days = Math.floor(hours / 24);
		const remainingHours = hours % 24;
		if (remainingHours === 0) {
			return `${days} ${days === 1 ? 'day' : 'days'}`;
		}
		return `${days}d ${remainingHours}h`;
	}

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !active || !hasViewers) return;

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

		const animations: ReturnType<typeof animate>[] = [];

		// Animate container with directional entry from left
		const containerAnim = animate(container, KEYFRAMES.slideFromLeft, {
			type: 'spring',
			...SPRING_PRESETS.snappy
		});
		animations.push(containerAnim);

		// Animate list items with adaptive stagger
		const validItems = listItems.filter(Boolean);
		if (validItems.length > 0) {
			const adaptiveStagger = getAdaptiveStagger(validItems.length);

			// Animate first item with bouncy spring for emphasis
			const firstItemAnim =
				validItems[0] &&
				animate(
					validItems[0],
					{
						opacity: [0, 1],
						transform: ['translateX(-20px) scale(0.95)', 'translateX(0) scale(1)']
					},
					{
						type: 'spring',
						...SPRING_PRESETS.bouncy,
						delay: DELAY_PRESETS.short
					}
				);
			if (firstItemAnim) animations.push(firstItemAnim);

			// Animate remaining items with listItem spring
			const remainingItems = validItems.slice(1);
			const itemsAnim =
				remainingItems.length > 0 &&
				animate(
					remainingItems,
					{
						opacity: [0, 1],
						transform: ['translateX(-20px) scale(0.95)', 'translateX(0) scale(1)']
					},
					{
						type: 'spring',
						...SPRING_PRESETS.listItem,
						delay: stagger(adaptiveStagger, { startDelay: DELAY_PRESETS.short + adaptiveStagger })
					}
				);
			if (itemsAnim) animations.push(itemsAnim);

			const lastAnim = itemsAnim || firstItemAnim;
			if (lastAnim) {
				lastAnim.finished.then(() => {
					onAnimationComplete?.();
				});
			}
		} else {
			containerAnim.finished.then(() => {
				onAnimationComplete?.();
			});
		}

		return () => {
			animations.forEach((a) => a.stop());
		};
	});
</script>

<BaseSlide {active} class="top-viewers-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">Top Contributors</h2>

		{#if hasViewers}
			<ol class="viewer-list">
				{#each displayedViewers as viewer, i}
					{@const isTopThree = viewer.rank <= 3}
					{@const medal = medalColors[viewer.rank as 1 | 2 | 3]}
					<li
						bind:this={listItems[i]}
						class="viewer-item"
						class:top-three={isTopThree}
						class:first={viewer.rank === 1}
						class:second={viewer.rank === 2}
						class:third={viewer.rank === 3}
					>
						{#if isTopThree && medal}
							<div class="medal-badge" style="--medal-bg: {medal.bg}; --medal-glow: {medal.glow};">
								<span class="medal-rank">{viewer.rank}</span>
							</div>
						{:else}
							<span class="rank">#{viewer.rank}</span>
						{/if}
						<div class="avatar-placeholder">
							<span class="avatar-icon">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="icon"
								>
									<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
									<circle cx="12" cy="7" r="4" />
								</svg>
							</span>
						</div>
						<div class="viewer-info">
							<span class="username">{viewer.username}</span>
							<span class="watch-time" title={formatWatchTimeDetailed(viewer.totalMinutes)}>
								{formatWatchTime(viewer.totalMinutes)}
							</span>
						</div>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="empty-message">No viewing data available</p>
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

	.viewer-list {
		list-style: none;
		padding: 0;
		margin: 0;
		width: 100%;
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
	}

	.viewer-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.4));
		backdrop-filter: blur(var(--slide-glass-blur, 20px));
		-webkit-backdrop-filter: blur(var(--slide-glass-blur, 20px));
		border: 1px solid var(--slide-glass-border, hsl(var(--primary-hue) 30% 40% / 0.2));
		border-radius: calc(var(--radius) * 1.5);
		box-shadow:
			var(--shadow-elevation-low, 0 2px 8px hsl(0 0% 0% / 0.25)),
			inset 0 1px 0 hsl(0 0% 100% / 0.05);
		position: relative;
		transition:
			transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
			box-shadow 0.3s ease,
			border-color 0.3s ease;
	}

	/* Top highlight line */
	.viewer-item::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(90deg, transparent, hsl(var(--primary) / 0.3), transparent);
		border-radius: inherit;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.viewer-item:hover {
		transform: translateY(-3px) scale(1.01);
		box-shadow:
			var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.35)),
			0 0 20px hsl(var(--primary) / 0.1);
		border-color: hsl(var(--primary) / 0.25);
	}

	.viewer-item:hover::before {
		opacity: 1;
	}

	/* Top 3 special styling */
	.viewer-item.top-three {
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.45));
		border-color: hsl(var(--primary) / 0.25);
	}

	.viewer-item.first {
		border-color: hsl(45 90% 50% / 0.4);
		box-shadow:
			var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.3)),
			0 0 25px hsl(45 90% 50% / 0.15);
	}

	.viewer-item.first::before {
		background: linear-gradient(90deg, transparent, hsl(45 90% 50% / 0.5), transparent);
		opacity: 1;
	}

	.viewer-item.second {
		border-color: hsl(210 10% 70% / 0.4);
		box-shadow:
			var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.3)),
			0 0 20px hsl(210 10% 70% / 0.1);
	}

	.viewer-item.third {
		border-color: hsl(30 60% 45% / 0.4);
		box-shadow:
			var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.3)),
			0 0 15px hsl(30 60% 45% / 0.1);
	}

	.rank {
		font-size: 1.125rem;
		font-weight: 700;
		color: hsl(var(--muted-foreground));
		min-width: 2.5rem;
		text-align: center;
	}

	/* Medal badge for top 3 */
	.medal-badge {
		width: 40px;
		height: 40px;
		min-width: 40px;
		border-radius: 50%;
		background: var(--medal-bg);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow:
			0 2px 10px var(--medal-glow),
			inset 0 1px 0 hsl(0 0% 100% / 0.3),
			inset 0 -1px 0 hsl(0 0% 0% / 0.2);
		position: relative;
	}

	.medal-badge::after {
		content: '';
		position: absolute;
		inset: 2px;
		border-radius: 50%;
		background: linear-gradient(
			135deg,
			hsl(0 0% 100% / 0.25) 0%,
			transparent 50%,
			hsl(0 0% 0% / 0.1) 100%
		);
	}

	.medal-rank {
		font-size: 0.875rem;
		font-weight: 800;
		color: hsl(0 0% 10%);
		text-shadow: 0 1px 0 hsl(0 0% 100% / 0.3);
		position: relative;
		z-index: 1;
	}

	.avatar-placeholder {
		width: 52px;
		height: 52px;
		background: linear-gradient(
			135deg,
			hsl(var(--primary) / 0.2) 0%,
			hsl(var(--primary) / 0.1) 100%
		);
		border: 1px solid hsl(var(--primary) / 0.2);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition:
			transform 0.3s ease,
			box-shadow 0.3s ease;
	}

	.viewer-item:hover .avatar-placeholder {
		transform: scale(1.05);
	}

	.avatar-icon {
		color: hsl(var(--primary) / 0.6);
	}

	.icon {
		width: 22px;
		height: 22px;
	}

	.viewer-info {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		flex: 1;
		gap: 0.125rem;
	}

	.username {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.watch-time {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		padding: 0.125rem 0.5rem;
		background: hsl(var(--primary) / 0.08);
		border-radius: calc(var(--radius) * 0.75);
	}

	.empty-message {
		color: hsl(var(--muted-foreground));
		font-style: italic;
		padding: 2rem;
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.3));
		border-radius: calc(var(--radius) * 1.5);
		border: 1px solid var(--slide-glass-border, hsl(var(--primary-hue) 30% 40% / 0.2));
	}

	.extra {
		margin-top: 1.5rem;
	}

	/* Mobile: compact single column */
	@media (max-width: 767px) {
		.content {
			gap: 1.5rem;
		}

		.title {
			font-size: 1.5rem;
		}

		.viewer-list {
			gap: 0.625rem;
		}

		.viewer-item {
			padding: 0.75rem 1rem;
			gap: 0.875rem;
		}

		.medal-badge {
			width: 34px;
			height: 34px;
			min-width: 34px;
		}

		.medal-rank {
			font-size: 0.8125rem;
		}

		.avatar-placeholder {
			width: 44px;
			height: 44px;
		}

		.icon {
			width: 20px;
			height: 20px;
		}

		.username {
			font-size: 0.9375rem;
		}

		.watch-time {
			font-size: 0.75rem;
		}
	}

	/* Tablet: wider single column */
	@media (min-width: 768px) and (max-width: 1023px) {
		.content {
			max-width: var(--content-max-md, 750px);
		}

		.title {
			font-size: 2rem;
		}

		.viewer-item {
			padding: 1rem 1.5rem;
		}

		.medal-badge {
			width: 40px;
			height: 40px;
			min-width: 40px;
		}

		.avatar-placeholder {
			width: 52px;
			height: 52px;
		}

		.icon {
			width: 24px;
			height: 24px;
		}

		.username {
			font-size: 1.0625rem;
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

		.viewer-list {
			grid-template-columns: repeat(2, 1fr);
			gap: 1rem;
		}

		.viewer-item {
			padding: 1.25rem 1.5rem;
		}

		.medal-badge {
			width: 44px;
			height: 44px;
			min-width: 44px;
		}

		.medal-rank {
			font-size: 1rem;
		}

		.avatar-placeholder {
			width: 60px;
			height: 60px;
		}

		.icon {
			width: 28px;
			height: 28px;
		}

		.username {
			font-size: 1.0625rem;
		}

		.watch-time {
			font-size: 0.875rem;
		}
	}
</style>
