<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { UserStats, ServerStats } from '$lib/server/stats/types';
	import { isUserStats } from '$lib/server/stats/types';

	/**
	 * SummaryPage Component
	 *
	 * Full-page summary shown after the wrapped slideshow completes.
	 * Displays key statistics and provides navigation actions.
	 */

	interface Props {
		stats: UserStats | ServerStats;
		year: number;
		username?: string;
		onRestart: () => void;
		onHome: () => void;
		onShare: () => void;
		class?: string;
	}

	let { stats, year, username, onRestart, onHome, onShare, class: klass = '' }: Props = $props();

	// Computed stats
	const isPersonal = $derived(isUserStats(stats));
	const hours = $derived(Math.floor(stats.totalWatchTimeMinutes / 60));
	const topMovie = $derived(stats.topMovies[0]?.title ?? null);
	const topShow = $derived(stats.topShows[0]?.title ?? null);
	const topGenre = $derived(stats.topGenres[0]?.title ?? null);
	const percentile = $derived(isUserStats(stats) ? stats.percentileRank : null);
	const bingeHours = $derived(
		stats.longestBinge ? Math.round(stats.longestBinge.totalMinutes / 60) : null
	);
	const bingeEpisodes = $derived(stats.longestBinge?.plays ?? null);

	// Element refs for animations
	let container: HTMLElement | undefined = $state();
	let header: HTMLElement | undefined = $state();
	let statsGrid: HTMLElement | undefined = $state();
	let buttonsRow: HTMLElement | undefined = $state();

	// Entrance animation
	$effect(() => {
		if (!container || !header || !statsGrid || !buttonsRow) return;

		const shouldAnimate = !prefersReducedMotion.current;
		if (!shouldAnimate) {
			container.style.opacity = '1';
			header.style.opacity = '1';
			statsGrid.style.opacity = '1';
			buttonsRow.style.opacity = '1';
			return;
		}

		// Set initial styles
		container.style.opacity = '0';
		header.style.opacity = '0';
		statsGrid.style.opacity = '0';
		buttonsRow.style.opacity = '0';

		const containerAnim = animate(container, { opacity: [0, 1] }, { duration: 0.4, delay: 0.1 });

		const headerAnim = animate(
			header,
			{ opacity: [0, 1], transform: ['translateY(-20px)', 'translateY(0)'] },
			{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }
		);

		const gridAnim = animate(
			statsGrid,
			{ opacity: [0, 1], transform: ['scale(0.95)', 'scale(1)'] },
			{ type: 'spring', stiffness: 180, damping: 18, delay: 0.4 }
		);

		const buttonsAnim = animate(
			buttonsRow,
			{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
			{ duration: 0.5, delay: 0.7 }
		);

		return () => {
			containerAnim.stop();
			headerAnim.stop();
			gridAnim.stop();
			buttonsAnim.stop();
		};
	});
</script>

<section bind:this={container} class="summary-page {klass}">
	<div bind:this={header} class="header">
		<h1 class="title">
			{#if username}
				{username}'s {year} Wrapped
			{:else}
				{year} Server Wrapped
			{/if}
		</h1>
		<p class="subtitle">Your Year in Review</p>
	</div>

	<div bind:this={statsGrid} class="stats-grid">
		<!-- Total Watch Time -->
		<div class="stat-card highlight">
			<span class="stat-icon">&#128249;</span>
			<span class="stat-value">{hours.toLocaleString()}</span>
			<span class="stat-label">hours watched</span>
		</div>

		<!-- Top Movie -->
		{#if topMovie}
			<div class="stat-card">
				<span class="stat-icon">&#127909;</span>
				<span class="stat-value truncate">{topMovie}</span>
				<span class="stat-label">#1 Movie</span>
			</div>
		{/if}

		<!-- Top Show -->
		{#if topShow}
			<div class="stat-card">
				<span class="stat-icon">&#128250;</span>
				<span class="stat-value truncate">{topShow}</span>
				<span class="stat-label">#1 Show</span>
			</div>
		{/if}

		<!-- Top Genre -->
		{#if topGenre}
			<div class="stat-card">
				<span class="stat-icon">&#127916;</span>
				<span class="stat-value">{topGenre}</span>
				<span class="stat-label">Top Genre</span>
			</div>
		{/if}

		<!-- Percentile (User only) -->
		{#if percentile !== null}
			<div class="stat-card accent">
				<span class="stat-icon">&#127942;</span>
				<span class="stat-value">Top {Math.max(1, Math.round(100 - percentile))}%</span>
				<span class="stat-label">Server Ranking</span>
			</div>
		{/if}

		<!-- Longest Binge -->
		{#if bingeHours}
			<div class="stat-card">
				<span class="stat-icon">&#128164;</span>
				<span class="stat-value">{bingeHours}h</span>
				<span class="stat-label">
					Longest Binge{#if bingeEpisodes}
						({bingeEpisodes} eps){/if}
				</span>
			</div>
		{/if}
	</div>

	<div bind:this={buttonsRow} class="actions">
		<button type="button" class="btn btn-secondary" onclick={onRestart}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
				<path d="M3 3v5h5" />
			</svg>
			Watch Again
		</button>

		<button type="button" class="btn btn-primary" onclick={onShare}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="18" cy="5" r="3" />
				<circle cx="6" cy="12" r="3" />
				<circle cx="18" cy="19" r="3" />
				<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
				<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
			</svg>
			Share
		</button>

		<button type="button" class="btn btn-secondary" onclick={onHome}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
				<polyline points="9 22 9 12 15 12 15 22" />
			</svg>
			Return Home
		</button>
	</div>
</section>

<style>
	.summary-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background: linear-gradient(
			180deg,
			var(--slide-bg-start, #1a0a0a) 0%,
			var(--slide-bg-end, #0d0505) 100%
		);
		color: var(--foreground);
		position: relative;
		overflow: hidden;
	}

	/* Radial overlay for depth */
	.summary-page::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.4) 100%);
		pointer-events: none;
	}

	.header {
		text-align: center;
		margin-bottom: 2.5rem;
		z-index: 1;
	}

	.title {
		font-size: clamp(1.75rem, 5vw, 3rem);
		font-weight: 800;
		color: var(--primary);
		margin: 0 0 0.5rem;
		text-shadow: 0 4px 20px rgba(204, 0, 0, 0.3);
	}

	.subtitle {
		font-size: 1.125rem;
		color: var(--muted-foreground);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 1rem;
		max-width: 800px;
		width: 100%;
		margin-bottom: 2.5rem;
		z-index: 1;
	}

	.stat-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1.25rem 1rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		backdrop-filter: blur(8px);
		transition:
			transform 0.2s ease,
			border-color 0.2s ease;
	}

	.stat-card:hover {
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.stat-card.highlight {
		border-color: var(--primary);
		background: linear-gradient(135deg, rgba(204, 0, 0, 0.15) 0%, rgba(204, 0, 0, 0.05) 100%);
	}

	.stat-card.accent {
		border-color: var(--accent, #ffd700);
		background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 215, 0, 0.03) 100%);
	}

	.stat-icon {
		font-size: 1.5rem;
	}

	.stat-value {
		font-size: clamp(1.25rem, 3vw, 1.75rem);
		font-weight: 700;
		color: var(--foreground);
		line-height: 1.2;
	}

	.stat-value.truncate {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stat-label {
		font-size: 0.875rem;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.actions {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		justify-content: center;
		z-index: 1;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.875rem 1.5rem;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			background-color 0.2s ease,
			box-shadow 0.2s ease;
		border: none;
	}

	.btn:hover {
		transform: translateY(-1px);
	}

	.btn:active {
		transform: translateY(0);
	}

	.btn-primary {
		background: var(--primary);
		color: var(--primary-foreground);
		box-shadow: 0 4px 14px rgba(204, 0, 0, 0.3);
	}

	.btn-primary:hover {
		background: hsl(0, 100%, 35%);
		box-shadow: 0 6px 20px rgba(204, 0, 0, 0.4);
	}

	.btn-secondary {
		background: rgba(255, 255, 255, 0.1);
		color: var(--foreground);
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	.btn-secondary:hover {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.25);
	}

	/* Mobile: stack buttons vertically */
	@media (max-width: 479px) {
		.summary-page {
			padding: 1.5rem 1rem;
		}

		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 0.75rem;
		}

		.stat-card {
			padding: 1rem 0.75rem;
		}

		.actions {
			flex-direction: column;
			width: 100%;
			max-width: 280px;
		}

		.btn {
			width: 100%;
			justify-content: center;
		}
	}

	/* Tablet */
	@media (min-width: 480px) and (max-width: 767px) {
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	/* Desktop */
	@media (min-width: 768px) {
		.stats-grid {
			grid-template-columns: repeat(3, 1fr);
			gap: 1.25rem;
		}

		.stat-card {
			padding: 1.5rem 1.25rem;
		}

		.btn {
			padding: 1rem 2rem;
		}
	}
</style>
