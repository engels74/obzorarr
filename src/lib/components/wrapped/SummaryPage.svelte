<script lang="ts">
	import { animate, stagger } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { UserStats, ServerStats } from '$lib/stats/types';
	import { isUserStats } from '$lib/stats/types';
	import { SPRING_PRESETS, STAGGER_PRESETS, DELAY_PRESETS } from '$lib/utils/animation-presets';

	/**
	 * SummaryPage Component
	 *
	 * Full-page summary shown after the wrapped slideshow completes.
	 * Displays key statistics in glassmorphism cards with premium styling.
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
	let statCards: HTMLElement[] = $state([]);
	let buttonsRow: HTMLElement | undefined = $state();

	// Entrance animation
	$effect(() => {
		if (!container || !header || !statsGrid || !buttonsRow) return;

		const shouldAnimate = !prefersReducedMotion.current;
		if (!shouldAnimate) {
			container.style.opacity = '1';
			header.style.opacity = '1';
			header.style.transform = 'none';
			statsGrid.style.opacity = '1';
			statCards.forEach((el) => {
				if (el) {
					el.style.opacity = '1';
					el.style.transform = 'none';
				}
			});
			buttonsRow.style.opacity = '1';
			buttonsRow.style.transform = 'none';
			return;
		}

		const animations: ReturnType<typeof animate>[] = [];

		// Animate container
		const containerAnim = animate(container, { opacity: [0, 1] }, { duration: 0.4, delay: 0.1 });
		animations.push(containerAnim);

		// Animate header
		const headerAnim = animate(
			header,
			{ opacity: [0, 1], transform: ['translateY(-20px)', 'translateY(0)'] },
			{ type: 'spring', ...SPRING_PRESETS.snappy, delay: DELAY_PRESETS.short }
		);
		animations.push(headerAnim);

		// Animate stats grid container
		const gridAnim = animate(
			statsGrid,
			{ opacity: [0, 1] },
			{ duration: 0.3, delay: DELAY_PRESETS.medium }
		);
		animations.push(gridAnim);

		// Animate individual stat cards with stagger
		const validCards = statCards.filter(Boolean);
		if (validCards.length > 0) {
			const cardsAnim = animate(
				validCards,
				{
					opacity: [0, 1],
					transform: ['translateY(20px) scale(0.95)', 'translateY(0) scale(1)']
				},
				{
					type: 'spring',
					...SPRING_PRESETS.snappy,
					delay: stagger(STAGGER_PRESETS.normal, { startDelay: DELAY_PRESETS.medium })
				}
			);
			animations.push(cardsAnim);
		}

		// Animate buttons
		const buttonsAnim = animate(
			buttonsRow,
			{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
			{ type: 'spring', ...SPRING_PRESETS.gentle, delay: DELAY_PRESETS.long + 0.3 }
		);
		animations.push(buttonsAnim);

		return () => {
			animations.forEach((a) => a.stop());
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
		<div bind:this={statCards[0]} class="stat-card highlight">
			<span class="stat-icon">&#128249;</span>
			<span class="stat-value">{hours.toLocaleString()}</span>
			<span class="stat-label">hours watched</span>
		</div>

		<!-- Top Movie -->
		{#if topMovie}
			<div bind:this={statCards[1]} class="stat-card">
				<span class="stat-icon">&#127909;</span>
				<span class="stat-value truncate">{topMovie}</span>
				<span class="stat-label">#1 Movie</span>
			</div>
		{/if}

		<!-- Top Show -->
		{#if topShow}
			<div bind:this={statCards[2]} class="stat-card">
				<span class="stat-icon">&#128250;</span>
				<span class="stat-value truncate">{topShow}</span>
				<span class="stat-label">#1 Show</span>
			</div>
		{/if}

		<!-- Top Genre -->
		{#if topGenre}
			<div bind:this={statCards[3]} class="stat-card">
				<span class="stat-icon">&#127916;</span>
				<span class="stat-value">{topGenre}</span>
				<span class="stat-label">Top Genre</span>
			</div>
		{/if}

		<!-- Percentile (User only) -->
		{#if percentile !== null}
			<div bind:this={statCards[4]} class="stat-card accent">
				<span class="stat-icon">&#127942;</span>
				<span class="stat-value">Top {Math.max(1, Math.round(100 - percentile))}%</span>
				<span class="stat-label">Server Ranking</span>
			</div>
		{/if}

		<!-- Longest Binge -->
		{#if bingeHours}
			<div bind:this={statCards[5]} class="stat-card">
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
		background: var(
			--slide-bg-gradient,
			linear-gradient(
				180deg,
				hsl(var(--primary-hue) 30% 8%) 0%,
				hsl(var(--primary-hue) 25% 5%) 100%
			)
		);
		color: hsl(var(--foreground));
		position: relative;
		overflow: hidden;
	}

	/* Radial overlay for depth */
	.summary-page::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, transparent 0%, hsl(0 0% 0% / 0.5) 100%);
		pointer-events: none;
	}

	/* Noise texture */
	.summary-page::after {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
		opacity: var(--slide-noise-opacity, 0.03);
		mix-blend-mode: overlay;
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
		margin: 0 0 0.75rem;
		/* Gradient text effect */
		background: linear-gradient(
			180deg,
			hsl(var(--primary)) 0%,
			hsl(calc(var(--primary-hue) + 20) 70% 65%) 100%
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		filter: drop-shadow(0 0 25px hsl(var(--primary) / 0.4));
	}

	.subtitle {
		font-size: 1.125rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 1rem;
		max-width: 850px;
		width: 100%;
		margin-bottom: 2.5rem;
		z-index: 1;
	}

	.stat-card {
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 12% / 0.4));
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid var(--slide-glass-border, hsl(var(--primary-hue) 30% 40% / 0.2));
		border-radius: calc(var(--radius) * 2);
		padding: 1.5rem 1.25rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.625rem;
		box-shadow: var(--shadow-elevation-low, 0 2px 8px hsl(0 0% 0% / 0.25));
		position: relative;
		transition:
			transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
			box-shadow 0.3s ease,
			border-color 0.3s ease;
	}

	/* Top highlight line */
	.stat-card::before {
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

	.stat-card:hover {
		transform: translateY(-4px) scale(1.02);
		box-shadow:
			var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.35)),
			0 0 25px hsl(var(--primary) / 0.1);
		border-color: hsl(var(--primary) / 0.3);
	}

	.stat-card:hover::before {
		opacity: 1;
	}

	/* Highlight card (Total Watch Time) */
	.stat-card.highlight {
		border-color: hsl(var(--primary) / 0.4);
		background: linear-gradient(
			135deg,
			hsl(var(--primary) / 0.2) 0%,
			hsl(var(--primary) / 0.08) 100%
		);
		box-shadow:
			var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.3)),
			0 0 30px hsl(var(--primary) / 0.15);
	}

	.stat-card.highlight::before {
		background: linear-gradient(90deg, transparent, hsl(var(--primary) / 0.5), transparent);
		opacity: 1;
	}

	.stat-card.highlight .stat-value {
		background: linear-gradient(
			180deg,
			hsl(var(--primary)) 0%,
			hsl(calc(var(--primary-hue) + 20) 70% 65%) 100%
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* Accent card (Percentile/Ranking) */
	.stat-card.accent {
		border-color: hsl(45 90% 50% / 0.4);
		background: linear-gradient(135deg, hsl(45 90% 50% / 0.15) 0%, hsl(45 90% 50% / 0.05) 100%);
		box-shadow:
			var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.3)),
			0 0 25px hsl(45 90% 50% / 0.12);
	}

	.stat-card.accent::before {
		background: linear-gradient(90deg, transparent, hsl(45 90% 50% / 0.5), transparent);
		opacity: 1;
	}

	.stat-card.accent .stat-value {
		background: linear-gradient(180deg, hsl(45 90% 55%) 0%, hsl(35 85% 50%) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.stat-icon {
		font-size: 1.75rem;
		filter: drop-shadow(0 0 8px hsl(var(--primary) / 0.3));
	}

	.stat-value {
		font-size: clamp(1.25rem, 3vw, 1.75rem);
		font-weight: 700;
		color: hsl(var(--foreground));
		line-height: 1.2;
	}

	.stat-value.truncate {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stat-label {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
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
		border-radius: calc(var(--radius) * 1.5);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
			background-color 0.2s ease,
			box-shadow 0.2s ease,
			border-color 0.2s ease;
		border: none;
	}

	.btn:hover {
		transform: translateY(-2px);
	}

	.btn:active {
		transform: translateY(0);
	}

	.btn-primary {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		box-shadow:
			0 4px 14px hsl(var(--primary) / 0.35),
			inset 0 1px 0 hsl(0 0% 100% / 0.15);
	}

	.btn-primary:hover {
		background: hsl(
			var(--primary-hue) var(--primary-saturation) calc(var(--primary-lightness) + 5%)
		);
		box-shadow:
			0 6px 20px hsl(var(--primary) / 0.45),
			inset 0 1px 0 hsl(0 0% 100% / 0.2);
	}

	.btn-secondary {
		background: var(--slide-glass-bg, hsl(var(--primary-hue) 20% 15% / 0.5));
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--primary) / 0.2);
		box-shadow: var(--shadow-elevation-low, 0 2px 8px hsl(0 0% 0% / 0.2));
	}

	.btn-secondary:hover {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary) / 0.35);
		box-shadow:
			var(--shadow-elevation-medium, 0 4px 12px hsl(0 0% 0% / 0.25)),
			0 0 15px hsl(var(--primary) / 0.1);
	}

	/* Mobile: stack buttons vertically */
	@media (max-width: 479px) {
		.summary-page {
			padding: 1.5rem 1rem;
		}

		.header {
			margin-bottom: 2rem;
		}

		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 0.75rem;
		}

		.stat-card {
			padding: 1.125rem 0.875rem;
			gap: 0.5rem;
		}

		.stat-icon {
			font-size: 1.5rem;
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
			padding: 1.75rem 1.5rem;
		}

		.stat-icon {
			font-size: 2rem;
		}

		.btn {
			padding: 1rem 2rem;
		}
	}
</style>
