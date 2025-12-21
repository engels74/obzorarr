<script lang="ts">
	import type { PageData } from './$types';

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
		<h1 class="page-title">Welcome, {data.user.username}!</h1>
		<p class="page-subtitle">Your Plex Wrapped is ready</p>
	</header>

	<div class="cards-container">
		<a href="/wrapped/{data.currentYear}/u/{data.user.id}" class="wrapped-card personal">
			<div class="card-icon">&#9733;</div>
			<div class="card-content">
				<h2 class="card-title">My Wrapped</h2>
				<p class="card-description">See your personal viewing stats for {data.currentYear}</p>
			</div>
			<span class="card-arrow">&#8594;</span>
		</a>

		<a href="/wrapped/{data.currentYear}" class="wrapped-card server">
			<div class="card-icon">&#127919;</div>
			<div class="card-content">
				<h2 class="card-title">Server Wrapped</h2>
				<p class="card-description">See the server-wide stats for {data.currentYear}</p>
			</div>
			<span class="card-arrow">&#8594;</span>
		</a>
	</div>
</div>

<style>
	.dashboard-page {
		padding: 2rem;
		max-width: 800px;
		margin: 0 auto;
	}

	.page-header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.page-title {
		font-size: 2rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
	}

	.page-subtitle {
		font-size: 1.125rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.cards-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.wrapped-card {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 2rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		text-decoration: none;
		transition: all 0.2s ease;
	}

	.wrapped-card:hover {
		border-color: hsl(var(--primary));
		box-shadow: 0 4px 12px hsl(var(--primary) / 0.15);
		transform: translateY(-2px);
	}

	.card-icon {
		font-size: 3rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.personal .card-icon {
		color: hsl(var(--primary));
	}

	.server .card-icon {
		color: oklch(0.7 0.15 200);
	}

	.card-content {
		flex: 1;
	}

	.card-title {
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
	}

	.card-description {
		font-size: 1rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.card-arrow {
		font-size: 1.5rem;
		color: hsl(var(--muted-foreground));
		transition: transform 0.2s ease;
	}

	.wrapped-card:hover .card-arrow {
		transform: translateX(4px);
		color: hsl(var(--primary));
	}

	@media (max-width: 768px) {
		.dashboard-page {
			padding: 1.5rem;
		}

		.wrapped-card {
			padding: 1.5rem;
			gap: 1rem;
		}

		.card-icon {
			font-size: 2rem;
		}

		.card-title {
			font-size: 1.25rem;
		}

		.card-description {
			font-size: 0.875rem;
		}
	}
</style>
