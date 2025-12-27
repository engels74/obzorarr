<script lang="ts">
	import type { PageData } from './$types';
	import Star from '@lucide/svelte/icons/star';
	import Server from '@lucide/svelte/icons/server';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	/**
	 * User Dashboard Page
	 *
	 * Shows options for viewing personal and server-wide wrapped presentations.
	 */

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>Dashboard - Obzorarr</title>
</svelte:head>

<div class="dashboard-page">
	<header class="page-header">
		<div class="header-content">
			<div class="greeting">
				<Sparkles class="greeting-icon" />
				<span class="greeting-text">Welcome back</span>
			</div>
			<h1 class="page-title">{data.user.username}</h1>
			<p class="page-subtitle">Your Plex Wrapped for {data.currentYear} is ready to explore</p>
		</div>
		<div class="header-glow"></div>
	</header>

	<div class="cards-container">
		<a href="/wrapped/{data.currentYear}/u/{data.user.id}" class="wrapped-card personal">
			<div class="card-glow"></div>
			<div class="card-badge">
				<span>Personal</span>
			</div>
			<div class="card-icon-wrap">
				<Star class="card-icon" />
			</div>
			<div class="card-content">
				<h2 class="card-title">My Wrapped</h2>
				<p class="card-description">
					Discover your personal viewing journey - your top shows, movies, and more
				</p>
			</div>
			<div class="card-action">
				<span>View your stats</span>
				<ArrowRight class="card-arrow" />
			</div>
		</a>

		<a href="/wrapped/{data.currentYear}" class="wrapped-card server">
			<div class="card-glow"></div>
			<div class="card-badge">
				<span>Community</span>
			</div>
			<div class="card-icon-wrap">
				<Server class="card-icon" />
			</div>
			<div class="card-content">
				<h2 class="card-title">Server Wrapped</h2>
				<p class="card-description">
					See how the entire server watched together - trending content and shared favorites
				</p>
			</div>
			<div class="card-action">
				<span>Explore server stats</span>
				<ArrowRight class="card-arrow" />
			</div>
		</a>
	</div>

	<div class="year-info">
		<span class="year-badge">{data.currentYear}</span>
		<span class="year-text">Year in Review</span>
	</div>
</div>

<style>
	.dashboard-page {
		padding: 2rem;
		max-width: 900px;
		margin: 0 auto;
		min-height: calc(100vh - 4rem);
		display: flex;
		flex-direction: column;
	}

	.page-header {
		position: relative;
		text-align: center;
		margin-bottom: 3rem;
		padding: 1rem 0;
	}

	.header-content {
		position: relative;
		z-index: 1;
	}

	.greeting {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.875rem;
		background: hsl(var(--primary) / 0.1);
		border: 1px solid hsl(var(--primary) / 0.2);
		border-radius: 9999px;
		margin-bottom: 1rem;
	}

	.greeting :global(.greeting-icon) {
		width: 0.875rem;
		height: 0.875rem;
		color: hsl(var(--primary));
	}

	.greeting-text {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.page-title {
		font-size: 2.5rem;
		font-weight: 800;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
		letter-spacing: -0.025em;
		background: linear-gradient(135deg, hsl(var(--foreground)) 0%, hsl(var(--primary)) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.page-subtitle {
		font-size: 1rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
		max-width: 400px;
		margin-inline: auto;
	}

	.header-glow {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 300px;
		height: 150px;
		background: radial-gradient(ellipse, hsl(var(--primary) / 0.12) 0%, transparent 70%);
		pointer-events: none;
	}

	.cards-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		flex: 1;
	}

	.wrapped-card {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 2rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 1rem;
		text-decoration: none;
		overflow: hidden;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.wrapped-card:hover {
		border-color: hsl(var(--primary) / 0.5);
		transform: translateY(-4px);
		box-shadow:
			0 12px 32px -8px hsl(var(--primary) / 0.2),
			0 0 0 1px hsl(var(--primary) / 0.1);
	}

	.card-glow {
		position: absolute;
		top: -50%;
		right: -20%;
		width: 300px;
		height: 300px;
		border-radius: 50%;
		opacity: 0;
		transition: opacity 0.4s ease;
		pointer-events: none;
	}

	.wrapped-card.personal .card-glow {
		background: radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, transparent 70%);
	}

	.wrapped-card.server .card-glow {
		background: radial-gradient(circle, hsl(175 70% 50% / 0.2) 0%, transparent 70%);
	}

	.wrapped-card:hover .card-glow {
		opacity: 1;
	}

	.card-badge {
		position: absolute;
		top: 1.25rem;
		right: 1.25rem;
		padding: 0.25rem 0.625rem;
		border-radius: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.wrapped-card.personal .card-badge {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
		border: 1px solid hsl(var(--primary) / 0.2);
	}

	.wrapped-card.server .card-badge {
		background: hsl(175 70% 50% / 0.15);
		color: hsl(175 70% 55%);
		border: 1px solid hsl(175 70% 50% / 0.2);
	}

	.card-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.75rem;
		margin-bottom: 1.25rem;
		transition: transform 0.3s ease;
	}

	.wrapped-card:hover .card-icon-wrap {
		transform: scale(1.1);
	}

	.wrapped-card.personal .card-icon-wrap {
		background: linear-gradient(
			135deg,
			hsl(var(--primary) / 0.2) 0%,
			hsl(var(--primary) / 0.1) 100%
		);
		border: 1px solid hsl(var(--primary) / 0.2);
	}

	.wrapped-card.server .card-icon-wrap {
		background: linear-gradient(135deg, hsl(175 70% 50% / 0.2) 0%, hsl(175 70% 50% / 0.1) 100%);
		border: 1px solid hsl(175 70% 50% / 0.2);
	}

	.wrapped-card :global(.card-icon) {
		width: 1.75rem;
		height: 1.75rem;
	}

	.wrapped-card.personal :global(.card-icon) {
		color: hsl(var(--primary));
	}

	.wrapped-card.server :global(.card-icon) {
		color: hsl(175 70% 55%);
	}

	.card-content {
		flex: 1;
		position: relative;
		z-index: 1;
	}

	.card-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
		letter-spacing: -0.01em;
	}

	.card-description {
		font-size: 0.9375rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
		line-height: 1.5;
		max-width: 400px;
	}

	.card-action {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		transition: all 0.2s ease;
	}

	.wrapped-card:hover .card-action {
		color: hsl(var(--primary));
	}

	.wrapped-card.server:hover .card-action {
		color: hsl(175 70% 55%);
	}

	.card-action :global(.card-arrow) {
		width: 1rem;
		height: 1rem;
		transition: transform 0.2s ease;
	}

	.wrapped-card:hover .card-action :global(.card-arrow) {
		transform: translateX(4px);
	}

	.year-info {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 2rem;
		padding-top: 2rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
	}

	.year-badge {
		font-size: 1.25rem;
		font-weight: 800;
		color: hsl(var(--primary));
		letter-spacing: -0.02em;
	}

	.year-text {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	@media (max-width: 768px) {
		.dashboard-page {
			padding: 1.5rem;
		}

		.page-title {
			font-size: 2rem;
		}

		.wrapped-card {
			padding: 1.5rem;
		}

		.card-icon-wrap {
			width: 3rem;
			height: 3rem;
		}

		.wrapped-card :global(.card-icon) {
			width: 1.5rem;
			height: 1.5rem;
		}

		.card-title {
			font-size: 1.25rem;
		}

		.card-description {
			font-size: 0.875rem;
		}
	}
</style>
