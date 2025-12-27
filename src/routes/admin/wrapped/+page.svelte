<script lang="ts">
	import type { PageData } from './$types';
	import Star from '@lucide/svelte/icons/star';
	import Server from '@lucide/svelte/icons/server';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Shield from '@lucide/svelte/icons/shield';
	import Palette from '@lucide/svelte/icons/palette';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Play from '@lucide/svelte/icons/play';

	/**
	 * Admin Wrapped Hub Page
	 *
	 * Central hub for accessing wrapped presentations and configuration.
	 * Features a cinematic, premium design with distinct visual identities
	 * for personal and server-wide wrapped experiences.
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
	<!-- Atmospheric Background Effects -->
	<div class="ambient-glow amber"></div>
	<div class="ambient-glow cyan"></div>

	<!-- Hero Header -->
	<header class="hero-header">
		<div class="hero-content">
			<div class="year-badge">
				<Sparkles class="sparkle-icon" />
				<span>Year in Review</span>
			</div>
			<h1 class="hero-title">
				<span class="year-display">{data.currentYear}</span>
				<span class="title-text">Wrapped</span>
			</h1>
			<p class="hero-subtitle">Discover viewing journeys and manage the wrapped experience</p>
		</div>
		<div class="hero-decoration">
			<div class="floating-ring ring-1"></div>
			<div class="floating-ring ring-2"></div>
			<div class="floating-ring ring-3"></div>
		</div>
	</header>

	<!-- View Wrapped Section -->
	<section class="wrapped-showcase">
		<div class="section-label">
			<Play class="section-icon" />
			<span>View Wrapped</span>
		</div>

		<div class="wrapped-cards">
			<!-- Personal Wrapped Card -->
			<a href="/wrapped/{data.currentYear}/u/{data.adminUser.id}" class="showcase-card personal">
				<div class="card-glow"></div>
				<div class="card-shimmer"></div>
				<div class="card-content">
					<div class="card-icon-wrap">
						<Star class="card-icon" />
					</div>
					<div class="card-text">
						<h2 class="card-title">My Wrapped</h2>
						<p class="card-description">
							Your personal viewing journey and stats for {data.currentYear}
						</p>
					</div>
					<div class="card-cta">
						<span class="cta-text">View your story</span>
						<ArrowRight class="cta-arrow" />
					</div>
				</div>
				<div class="card-accent"></div>
			</a>

			<!-- Server Wrapped Card -->
			<a href="/wrapped/{data.currentYear}" class="showcase-card server">
				<div class="card-glow"></div>
				<div class="card-shimmer"></div>
				<div class="card-content">
					<div class="card-icon-wrap">
						<Server class="card-icon" />
					</div>
					<div class="card-text">
						<h2 class="card-title">Server Wrapped</h2>
						<p class="card-description">Server-wide viewing stats and community highlights</p>
					</div>
					<div class="card-cta">
						<span class="cta-text">Explore together</span>
						<ArrowRight class="cta-arrow" />
					</div>
				</div>
				<div class="card-accent"></div>
			</a>
		</div>
	</section>

	<!-- Configuration Section -->
	<section class="config-section">
		<div class="section-label">
			<SlidersHorizontal class="section-icon" />
			<span>Configuration</span>
		</div>

		<div class="config-grid">
			<a href="/admin/slides" class="config-card">
				<div class="config-icon-wrap">
					<SlidersHorizontal class="config-icon" />
				</div>
				<div class="config-content">
					<span class="config-title">Slide Configuration</span>
					<span class="config-desc">Reorder, enable/disable, and create custom slides</span>
				</div>
				<ArrowRight class="config-arrow" />
			</a>

			<a href="/admin/settings?tab=privacy" class="config-card">
				<div class="config-icon-wrap">
					<Shield class="config-icon" />
				</div>
				<div class="config-content">
					<span class="config-title">Privacy & Sharing</span>
					<span class="config-desc">Configure sharing defaults and privacy settings</span>
				</div>
				<ArrowRight class="config-arrow" />
			</a>

			<a href="/admin/settings" class="config-card">
				<div class="config-icon-wrap">
					<Palette class="config-icon" />
				</div>
				<div class="config-content">
					<span class="config-title">Display Settings</span>
					<span class="config-desc">Theme, logo visibility, and anonymization</span>
				</div>
				<ArrowRight class="config-arrow" />
			</a>
		</div>
	</section>
</div>

<style>
	.wrapped-hub {
		position: relative;
		max-width: 1000px;
		margin: 0 auto;
		padding: 1.5rem 2rem 3rem;
		overflow: hidden;
	}

	/* Ambient Background Glows */
	.ambient-glow {
		position: absolute;
		width: 500px;
		height: 500px;
		border-radius: 50%;
		filter: blur(120px);
		opacity: 0.12;
		pointer-events: none;
		animation: ambientPulse 8s ease-in-out infinite;
	}

	.ambient-glow.amber {
		top: -200px;
		left: -150px;
		background: hsl(38 92% 50%);
		animation-delay: 0s;
	}

	.ambient-glow.cyan {
		bottom: -200px;
		right: -150px;
		background: hsl(175 70% 50%);
		animation-delay: 4s;
	}

	/* Hero Header */
	.hero-header {
		position: relative;
		text-align: center;
		padding: 2rem 0 3rem;
		margin-bottom: 2rem;
	}

	.hero-content {
		position: relative;
		z-index: 1;
	}

	.year-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: hsl(var(--primary) / 0.1);
		border: 1px solid hsl(var(--primary) / 0.2);
		border-radius: 9999px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 1.25rem;
		animation: fadeSlideDown 0.6s ease backwards;
	}

	.year-badge :global(.sparkle-icon) {
		width: 1rem;
		height: 1rem;
		animation: sparkle 2s ease-in-out infinite;
	}

	.hero-title {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		margin: 0 0 1rem;
		animation: fadeSlideDown 0.6s ease 0.1s backwards;
	}

	.year-display {
		font-size: 4.5rem;
		font-weight: 900;
		letter-spacing: -0.04em;
		line-height: 1;
		background: linear-gradient(
			135deg,
			hsl(38 92% 60%) 0%,
			hsl(var(--primary)) 50%,
			hsl(175 70% 55%) 100%
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		filter: drop-shadow(0 4px 12px hsl(var(--primary) / 0.3));
	}

	.title-text {
		font-size: 1.75rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		letter-spacing: -0.02em;
	}

	.hero-subtitle {
		font-size: 1rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
		max-width: 400px;
		margin: 0 auto;
		animation: fadeSlideDown 0.6s ease 0.2s backwards;
	}

	/* Hero Decoration Rings */
	.hero-decoration {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 300px;
		height: 300px;
		pointer-events: none;
	}

	.floating-ring {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		border: 1px solid hsl(var(--primary) / 0.1);
		animation: ringExpand 4s ease-in-out infinite;
	}

	.ring-1 {
		width: 200px;
		height: 200px;
		animation-delay: 0s;
	}

	.ring-2 {
		width: 280px;
		height: 280px;
		animation-delay: 1.3s;
	}

	.ring-3 {
		width: 360px;
		height: 360px;
		animation-delay: 2.6s;
	}

	/* Section Labels */
	.section-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-bottom: 1rem;
	}

	.section-label :global(.section-icon) {
		width: 1rem;
		height: 1rem;
		opacity: 0.7;
	}

	/* Wrapped Showcase Section */
	.wrapped-showcase {
		margin-bottom: 2.5rem;
		animation: fadeIn 0.6s ease 0.3s backwards;
	}

	.wrapped-cards {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	/* Showcase Cards */
	.showcase-card {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 2rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 1rem;
		text-decoration: none;
		overflow: hidden;
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		min-height: 220px;
	}

	.showcase-card:hover {
		transform: translateY(-6px);
		box-shadow:
			0 20px 40px -12px hsl(var(--primary) / 0.2),
			0 0 0 1px hsl(var(--primary) / 0.15);
	}

	/* Card Glow Effect */
	.card-glow {
		position: absolute;
		top: -100%;
		left: 50%;
		transform: translateX(-50%);
		width: 300px;
		height: 300px;
		border-radius: 50%;
		opacity: 0;
		transition: opacity 0.4s ease;
		pointer-events: none;
	}

	.showcase-card.personal .card-glow {
		background: radial-gradient(circle, hsl(38 92% 50% / 0.25) 0%, transparent 70%);
	}

	.showcase-card.server .card-glow {
		background: radial-gradient(circle, hsl(175 70% 50% / 0.25) 0%, transparent 70%);
	}

	.showcase-card:hover .card-glow {
		opacity: 1;
	}

	/* Card Shimmer Effect */
	.card-shimmer {
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(
			90deg,
			transparent 0%,
			hsl(var(--foreground) / 0.03) 50%,
			transparent 100%
		);
		transition: left 0.6s ease;
		pointer-events: none;
	}

	.showcase-card:hover .card-shimmer {
		left: 100%;
	}

	/* Card Content */
	.card-content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.card-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.875rem;
		margin-bottom: 1.25rem;
		transition: all 0.3s ease;
	}

	.showcase-card.personal .card-icon-wrap {
		background: linear-gradient(135deg, hsl(38 92% 50% / 0.2) 0%, hsl(38 92% 40% / 0.1) 100%);
		box-shadow: 0 4px 16px -4px hsl(38 92% 50% / 0.3);
	}

	.showcase-card.server .card-icon-wrap {
		background: linear-gradient(135deg, hsl(175 70% 50% / 0.2) 0%, hsl(175 70% 40% / 0.1) 100%);
		box-shadow: 0 4px 16px -4px hsl(175 70% 50% / 0.3);
	}

	.showcase-card:hover .card-icon-wrap {
		transform: scale(1.1);
	}

	.showcase-card :global(.card-icon) {
		width: 1.75rem;
		height: 1.75rem;
	}

	.showcase-card.personal :global(.card-icon) {
		color: hsl(38 92% 60%);
	}

	.showcase-card.server :global(.card-icon) {
		color: hsl(175 70% 55%);
	}

	.card-text {
		flex: 1;
	}

	.card-title {
		font-size: 1.375rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
		letter-spacing: -0.02em;
	}

	.card-description {
		font-size: 0.9375rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
		line-height: 1.5;
	}

	/* Card CTA */
	.card-cta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
	}

	.cta-text {
		font-size: 0.875rem;
		font-weight: 600;
		transition: color 0.2s ease;
	}

	.showcase-card.personal .cta-text {
		color: hsl(38 92% 60%);
	}

	.showcase-card.server .cta-text {
		color: hsl(175 70% 55%);
	}

	.showcase-card :global(.cta-arrow) {
		width: 1rem;
		height: 1rem;
		transition: transform 0.2s ease;
	}

	.showcase-card.personal :global(.cta-arrow) {
		color: hsl(38 92% 60%);
	}

	.showcase-card.server :global(.cta-arrow) {
		color: hsl(175 70% 55%);
	}

	.showcase-card:hover :global(.cta-arrow) {
		transform: translateX(4px);
	}

	/* Card Accent Line */
	.card-accent {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.showcase-card.personal .card-accent {
		background: linear-gradient(90deg, hsl(38 92% 50%), hsl(38 92% 60%));
	}

	.showcase-card.server .card-accent {
		background: linear-gradient(90deg, hsl(175 70% 45%), hsl(175 70% 55%));
	}

	.showcase-card:hover .card-accent {
		opacity: 1;
	}

	/* Configuration Section */
	.config-section {
		animation: fadeIn 0.6s ease 0.4s backwards;
	}

	.config-grid {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.config-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.75rem;
		text-decoration: none;
		transition: all 0.25s ease;
	}

	.config-card:hover {
		background: hsl(var(--primary) / 0.05);
		border-color: hsl(var(--primary) / 0.3);
		transform: translateX(4px);
	}

	.config-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		background: hsl(var(--secondary));
		border-radius: 0.625rem;
		flex-shrink: 0;
		transition: all 0.25s ease;
	}

	.config-card:hover .config-icon-wrap {
		background: hsl(var(--primary) / 0.15);
	}

	.config-card :global(.config-icon) {
		width: 1.125rem;
		height: 1.125rem;
		color: hsl(var(--muted-foreground));
		transition: color 0.25s ease;
	}

	.config-card:hover :global(.config-icon) {
		color: hsl(var(--primary));
	}

	.config-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.config-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.config-desc {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.config-card :global(.config-arrow) {
		width: 1rem;
		height: 1rem;
		color: hsl(var(--muted-foreground) / 0.5);
		transition: all 0.25s ease;
	}

	.config-card:hover :global(.config-arrow) {
		color: hsl(var(--primary));
		transform: translateX(2px);
	}

	/* Animations */
	@keyframes ambientPulse {
		0%,
		100% {
			opacity: 0.12;
			transform: scale(1);
		}
		50% {
			opacity: 0.18;
			transform: scale(1.1);
		}
	}

	@keyframes fadeSlideDown {
		from {
			opacity: 0;
			transform: translateY(-16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes ringExpand {
		0%,
		100% {
			transform: translate(-50%, -50%) scale(0.8);
			opacity: 0;
		}
		50% {
			transform: translate(-50%, -50%) scale(1);
			opacity: 0.15;
		}
	}

	@keyframes sparkle {
		0%,
		100% {
			transform: scale(1) rotate(0deg);
		}
		50% {
			transform: scale(1.2) rotate(15deg);
		}
	}

	/* Responsive Design */
	@media (max-width: 768px) {
		.wrapped-hub {
			padding: 1rem 1.25rem 2rem;
		}

		.hero-header {
			padding: 1.5rem 0 2rem;
		}

		.year-display {
			font-size: 3.5rem;
		}

		.title-text {
			font-size: 1.5rem;
		}

		.hero-decoration {
			display: none;
		}

		.wrapped-cards {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.showcase-card {
			min-height: auto;
			padding: 1.5rem;
		}

		.card-icon-wrap {
			width: 3rem;
			height: 3rem;
		}

		.showcase-card :global(.card-icon) {
			width: 1.5rem;
			height: 1.5rem;
		}

		.card-title {
			font-size: 1.25rem;
		}

		.card-description {
			font-size: 0.875rem;
		}

		.ambient-glow {
			width: 300px;
			height: 300px;
		}
	}

	@media (max-width: 480px) {
		.wrapped-hub {
			padding: 0.75rem 1rem 1.5rem;
		}

		.year-badge {
			padding: 0.375rem 0.75rem;
			font-size: 0.6875rem;
		}

		.year-display {
			font-size: 2.75rem;
		}

		.title-text {
			font-size: 1.25rem;
		}

		.hero-subtitle {
			font-size: 0.875rem;
		}

		.showcase-card {
			padding: 1.25rem;
		}

		.config-card {
			padding: 0.875rem 1rem;
		}

		.config-title {
			font-size: 0.875rem;
		}

		.config-desc {
			font-size: 0.75rem;
		}
	}
</style>
