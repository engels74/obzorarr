<script lang="ts">
	import type { PageData } from './$types';

	/**
	 * Admin Wrapped Hub Page
	 *
	 * Central hub for accessing wrapped presentations and configuration.
	 * Provides quick access to:
	 * - Personal wrapped view
	 * - Server-wide wrapped view
	 * - Slide configuration
	 */

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>Wrapped - Admin - Obzorarr</title>
</svelte:head>

<div class="wrapped-hub">
	<header class="page-header">
		<h1>Wrapped</h1>
		<p class="page-subtitle">View and manage Year in Review presentations</p>
	</header>

	<!-- View Wrapped Section -->
	<section class="section">
		<h2>View Wrapped</h2>
		<p class="section-description">
			Access your personal and server-wide Year in Review for {data.currentYear}
		</p>

		<div class="wrapped-cards">
			<a href="/wrapped/{data.currentYear}/u/{data.adminUser.id}" class="wrapped-card personal">
				<div class="card-icon">&#9733;</div>
				<div class="card-content">
					<h3 class="card-title">My Wrapped</h3>
					<p class="card-description">Your personal viewing stats for {data.currentYear}</p>
				</div>
				<span class="card-arrow">&#8594;</span>
			</a>

			<a href="/wrapped/{data.currentYear}" class="wrapped-card server">
				<div class="card-icon">&#127919;</div>
				<div class="card-content">
					<h3 class="card-title">Server Wrapped</h3>
					<p class="card-description">Server-wide viewing stats for {data.currentYear}</p>
				</div>
				<span class="card-arrow">&#8594;</span>
			</a>
		</div>
	</section>

	<!-- Configuration Section -->
	<section class="section">
		<h2>Configuration</h2>
		<p class="section-description">Customize the wrapped experience for all users</p>

		<div class="config-grid">
			<a href="/admin/slides" class="config-card">
				<span class="config-icon">&#9998;</span>
				<span class="config-label">Slide Configuration</span>
				<span class="config-desc">Reorder, enable/disable, and create custom slides</span>
			</a>

			<a href="/admin/users" class="config-card">
				<span class="config-icon">&#9787;</span>
				<span class="config-label">Share Settings</span>
				<span class="config-desc">Manage user sharing permissions</span>
			</a>

			<a href="/admin/settings" class="config-card">
				<span class="config-icon">&#9881;</span>
				<span class="config-label">Display Settings</span>
				<span class="config-desc">Theme, logo visibility, and anonymization</span>
			</a>
		</div>
	</section>
</div>

<style>
	.wrapped-hub {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}

	.page-header {
		margin-bottom: 2rem;
	}

	.page-header h1 {
		font-size: 2rem;
		font-weight: 700;
		color: hsl(var(--primary));
		margin: 0 0 0.5rem;
	}

	.page-subtitle {
		font-size: 1rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	/* Sections */
	.section {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.section h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
	}

	.section-description {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin: 0 0 1.5rem;
	}

	/* Wrapped Cards */
	.wrapped-cards {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.wrapped-card {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1.5rem;
		background: hsl(var(--secondary));
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
		font-size: 2.5rem;
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
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 0.25rem;
	}

	.card-description {
		font-size: 0.875rem;
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

	/* Config Grid */
	.config-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.config-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.5rem;
		background: hsl(var(--secondary));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		text-decoration: none;
		text-align: center;
		transition: all 0.15s ease;
	}

	.config-card:hover {
		background: hsl(var(--primary) / 0.1);
		border-color: hsl(var(--primary));
	}

	.config-icon {
		font-size: 2rem;
		color: hsl(var(--primary));
		margin-bottom: 0.75rem;
	}

	.config-label {
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin-bottom: 0.375rem;
	}

	.config-desc {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.4;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.wrapped-hub {
			padding: 1.5rem;
		}

		.wrapped-card {
			padding: 1.25rem;
			gap: 1rem;
		}

		.card-icon {
			font-size: 2rem;
		}

		.card-title {
			font-size: 1.125rem;
		}

		.config-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
