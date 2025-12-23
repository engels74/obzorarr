<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { TopViewersSlideProps } from './types';

	/**
	 * TopViewersSlide Component
	 *
	 * Displays the top contributors/viewers on the server for server-wide wrapped.
	 * Shows ranked list of usernames with their total watch time.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	let {
		topViewers,
		limit = 10,
		active = true,
		onAnimationComplete,
		class: klass = '',
		children
	}: TopViewersSlideProps = $props();

	// Limit the displayed viewers
	const displayedViewers = $derived(topViewers.slice(0, limit));
	const hasViewers = $derived(displayedViewers.length > 0);

	// Element references
	let container: HTMLElement | undefined = $state();
	let listItems: HTMLElement[] = $state([]);

	// Format watch time in hours/days
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

	// Format watch time for accessibility/tooltips
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

<BaseSlide {active} class="top-viewers-slide {klass}">
	<div bind:this={container} class="content">
		<h2 class="title">Top Contributors</h2>

		{#if hasViewers}
			<ol class="viewer-list">
				{#each displayedViewers as viewer, i}
					<li bind:this={listItems[i]} class="viewer-item">
						<span class="rank">#{viewer.rank}</span>
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
		color: var(--primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.viewer-list {
		list-style: none;
		padding: 0;
		margin: 0;
		width: 100%;
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.5rem;
	}

	.viewer-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 0.5rem;
		transition: background-color 0.2s;
	}

	.viewer-item:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.rank {
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--primary);
		min-width: 2.5rem;
	}

	.avatar-placeholder {
		width: 50px;
		height: 50px;
		background: var(--muted);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.avatar-icon {
		color: var(--muted-foreground);
	}

	.icon {
		width: 24px;
		height: 24px;
	}

	.viewer-info {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		flex: 1;
	}

	.username {
		font-size: 1rem;
		font-weight: 600;
		color: var(--foreground);
	}

	.watch-time {
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

	/* Mobile: compact single column */
	@media (max-width: 767px) {
		.viewer-item {
			padding: 0.5rem;
			gap: 0.75rem;
		}

		.avatar-placeholder {
			width: 40px;
			height: 40px;
		}

		.icon {
			width: 20px;
			height: 20px;
		}
	}

	/* Tablet: wider single column */
	@media (min-width: 768px) and (max-width: 1023px) {
		.content {
			max-width: var(--content-max-md, 800px);
		}

		.viewer-item {
			padding: 1rem 1.25rem;
		}

		.avatar-placeholder {
			width: 55px;
			height: 55px;
		}

		.icon {
			width: 26px;
			height: 26px;
		}
	}

	/* Desktop: 2-column grid */
	@media (min-width: 1024px) {
		.content {
			max-width: var(--content-max-lg, 900px);
		}

		.viewer-list {
			grid-template-columns: repeat(2, 1fr);
			gap: 0.75rem;
		}

		.viewer-item {
			padding: 1rem 1.25rem;
		}

		.avatar-placeholder {
			width: 55px;
			height: 55px;
		}

		.icon {
			width: 26px;
			height: 26px;
		}

		.username {
			font-size: 1.0625rem;
		}
	}
</style>
