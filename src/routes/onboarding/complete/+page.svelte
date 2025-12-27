<script lang="ts">
	import { enhance } from '$app/forms';
	import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
	import type { PageData } from './$types';

	/**
	 * Onboarding Step 4: Completion
	 *
	 * Celebratory success page with animated elements and configuration summary.
	 * Shows sync status if still running in background.
	 */

	let { data }: { data: PageData } = $props();

	// Animation states
	let showCheckmark = $state(false);
	let showContent = $state(false);
	let showParticles = $state(false);

	// Trigger animations on mount
	$effect(() => {
		// Stagger the animations
		const checkmarkTimer = setTimeout(() => {
			showCheckmark = true;
		}, 100);

		const contentTimer = setTimeout(() => {
			showContent = true;
		}, 600);

		const particlesTimer = setTimeout(() => {
			showParticles = true;
		}, 300);

		return () => {
			clearTimeout(checkmarkTimer);
			clearTimeout(contentTimer);
			clearTimeout(particlesTimer);
		};
	});

	// Summary items with icons
	const summaryItems = $derived([
		{
			icon: 'server',
			label: 'Server',
			value: data.configSummary.serverName
		},
		{
			icon: 'palette',
			label: 'Dashboard Theme',
			value: data.configSummary.uiTheme
		},
		{
			icon: 'shield',
			label: 'Privacy Mode',
			value: data.configSummary.anonymizationMode
		},
		{
			icon: 'share',
			label: 'Default Sharing',
			value: data.configSummary.shareMode
		}
	]);
</script>

<OnboardingCard
	title=""
	subtitle=""
>
	{#snippet children()}
		<div class="completion-container">
			<!-- Floating particles background -->
			<div class="particles-container" class:active={showParticles}>
				{#each Array(20) as _, i}
					<div
						class="particle"
						style="
							--delay: {Math.random() * 3}s;
							--duration: {3 + Math.random() * 4}s;
							--x-start: {Math.random() * 100}%;
							--x-end: {(Math.random() - 0.5) * 40}px;
							--size: {2 + Math.random() * 4}px;
							--opacity: {0.3 + Math.random() * 0.5};
						"
					></div>
				{/each}
			</div>

			<!-- Success Icon with animated checkmark -->
			<div class="success-icon-container" class:animate={showCheckmark}>
				<div class="success-glow"></div>
				<div class="success-ring"></div>
				<svg class="success-checkmark" viewBox="0 0 52 52">
					<circle class="checkmark-circle" cx="26" cy="26" r="24" fill="none" />
					<path class="checkmark-check" fill="none" d="M14 27l7 7 16-16" />
				</svg>
			</div>

			<!-- Title -->
			<div class="completion-header" class:visible={showContent}>
				<h2 class="completion-title">Setup Complete!</h2>
				<p class="completion-subtitle">Your Plex Wrapped is ready to go</p>
			</div>

			<!-- Configuration Summary -->
			<div class="summary-section" class:visible={showContent}>
				<h3 class="summary-title">Your Configuration</h3>
				<div class="summary-grid">
					{#each summaryItems as item, i}
						<div class="summary-card" style="--delay: {i * 80}ms">
							<div class="summary-icon {item.icon}">
								{#if item.icon === 'server'}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
										<rect x="2" y="3" width="20" height="6" rx="1" />
										<rect x="2" y="11" width="20" height="6" rx="1" />
										<circle cx="6" cy="6" r="1" fill="currentColor" />
										<circle cx="6" cy="14" r="1" fill="currentColor" />
									</svg>
								{:else if item.icon === 'palette'}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
										<circle cx="12" cy="12" r="10" />
										<circle cx="12" cy="8" r="2" fill="currentColor" />
										<circle cx="8" cy="14" r="2" fill="currentColor" />
										<circle cx="16" cy="14" r="2" fill="currentColor" />
									</svg>
								{:else if item.icon === 'shield'}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
										<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
									</svg>
								{:else if item.icon === 'share'}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
										<circle cx="18" cy="5" r="3" />
										<circle cx="6" cy="12" r="3" />
										<circle cx="18" cy="19" r="3" />
										<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
										<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
									</svg>
								{/if}
							</div>
							<div class="summary-content">
								<span class="summary-label">{item.label}</span>
								<span class="summary-value">{item.value}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Sync Status (if running) -->
			{#if data.syncStatus.running}
				<div class="sync-status" class:visible={showContent}>
					<div class="sync-indicator">
						<div class="sync-pulse"></div>
						<div class="sync-dot"></div>
					</div>
					<div class="sync-text">
						<span class="sync-label">Sync running in background</span>
						<span class="sync-detail">
							{#if data.syncStatus.progress}
								{data.syncStatus.progress.recordsProcessed.toLocaleString()} records processed
							{:else}
								Processing your viewing history...
							{/if}
						</span>
					</div>
				</div>
			{:else if data.syncStatus.historyCount > 0}
				<div class="sync-complete" class:visible={showContent}>
					<svg class="sync-complete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
					<span>{data.syncStatus.historyCount.toLocaleString()} viewing records synced</span>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="footer-content" class:visible={showContent}>
			<form method="POST" action="?/goToDashboard" use:enhance>
				<button type="submit" class="btn-dashboard">
					<span>Go to Dashboard</span>
					<svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M5 12h14M12 5l7 7-7 7" />
					</svg>
				</button>
			</form>
			<p class="footer-note">You can change these settings anytime from the admin panel</p>
		</div>
	{/snippet}
</OnboardingCard>

<style>
	/* Container */
	.completion-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		position: relative;
		padding: 1rem 0;
		min-height: 380px;
	}

	/* Particles */
	.particles-container {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		opacity: 0;
		transition: opacity 1s ease;
	}

	.particles-container.active {
		opacity: 1;
	}

	.particle {
		position: absolute;
		bottom: -20px;
		left: var(--x-start);
		width: var(--size);
		height: var(--size);
		background: radial-gradient(circle, #fbbf24 0%, #f59e0b 100%);
		border-radius: 50%;
		opacity: 0;
		animation: float-up var(--duration) ease-out var(--delay) infinite;
	}

	@keyframes float-up {
		0% {
			opacity: 0;
			transform: translateY(0) translateX(0) scale(0);
		}
		10% {
			opacity: var(--opacity);
			transform: translateY(-20px) translateX(0) scale(1);
		}
		90% {
			opacity: var(--opacity);
		}
		100% {
			opacity: 0;
			transform: translateY(-400px) translateX(var(--x-end)) scale(0.5);
		}
	}

	/* Success Icon */
	.success-icon-container {
		position: relative;
		width: 100px;
		height: 100px;
		margin-bottom: 1.5rem;
	}

	.success-glow {
		position: absolute;
		inset: -20px;
		background: radial-gradient(circle, rgba(251, 191, 36, 0.4) 0%, transparent 70%);
		border-radius: 50%;
		opacity: 0;
		transform: scale(0.5);
		transition: all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.success-icon-container.animate .success-glow {
		opacity: 1;
		transform: scale(1);
		animation: glow-pulse 2s ease-in-out infinite;
	}

	@keyframes glow-pulse {
		0%, 100% {
			opacity: 0.6;
			transform: scale(1);
		}
		50% {
			opacity: 0.8;
			transform: scale(1.1);
		}
	}

	.success-ring {
		position: absolute;
		inset: 0;
		border: 3px solid rgba(251, 191, 36, 0.3);
		border-radius: 50%;
		opacity: 0;
		transform: scale(0.8);
		transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s;
	}

	.success-icon-container.animate .success-ring {
		opacity: 1;
		transform: scale(1);
	}

	.success-checkmark {
		width: 100%;
		height: 100%;
		position: relative;
		z-index: 1;
	}

	.checkmark-circle {
		stroke: #fbbf24;
		stroke-width: 2;
		stroke-dasharray: 166;
		stroke-dashoffset: 166;
		transition: stroke-dashoffset 0.6s cubic-bezier(0.65, 0, 0.45, 1) 0.1s;
	}

	.success-icon-container.animate .checkmark-circle {
		stroke-dashoffset: 0;
	}

	.checkmark-check {
		stroke: #fbbf24;
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 48;
		stroke-dashoffset: 48;
		transition: stroke-dashoffset 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.5s;
	}

	.success-icon-container.animate .checkmark-check {
		stroke-dashoffset: 0;
	}

	/* Header */
	.completion-header {
		margin-bottom: 2rem;
		opacity: 0;
		transform: translateY(20px);
		transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.completion-header.visible {
		opacity: 1;
		transform: translateY(0);
	}

	.completion-title {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 700;
		background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #fbbf24 100%);
		background-size: 200% auto;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		animation: shimmer 3s linear infinite;
		font-family: 'DM Sans', system-ui, sans-serif;
	}

	@keyframes shimmer {
		to {
			background-position: 200% center;
		}
	}

	.completion-subtitle {
		margin: 0.5rem 0 0;
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.6);
	}

	/* Summary Section */
	.summary-section {
		width: 100%;
		opacity: 0;
		transform: translateY(20px);
		transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
	}

	.summary-section.visible {
		opacity: 1;
		transform: translateY(0);
	}

	.summary-title {
		margin: 0 0 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: rgba(255, 255, 255, 0.4);
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	@media (max-width: 480px) {
		.summary-grid {
			grid-template-columns: 1fr;
		}
	}

	.summary-card {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.875rem 1rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(251, 191, 36, 0.1);
		border-radius: 0.875rem;
		text-align: left;
		opacity: 0;
		transform: translateY(10px);
		animation: card-in 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
		animation-delay: calc(0.6s + var(--delay));
	}

	@keyframes card-in {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.summary-icon {
		width: 2.25rem;
		height: 2.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.625rem;
		flex-shrink: 0;
	}

	.summary-icon svg {
		width: 1.125rem;
		height: 1.125rem;
	}

	.summary-icon.server {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1));
		color: #60a5fa;
	}

	.summary-icon.palette {
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(139, 92, 246, 0.1));
		color: #a78bfa;
	}

	.summary-icon.shield {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1));
		color: #4ade80;
	}

	.summary-icon.share {
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.1));
		color: #fbbf24;
	}

	.summary-content {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.summary-label {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.45);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.summary-value {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Sync Status */
	.sync-status {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		margin-top: 1.5rem;
		padding: 0.875rem 1.25rem;
		background: rgba(251, 191, 36, 0.08);
		border: 1px solid rgba(251, 191, 36, 0.2);
		border-radius: 0.875rem;
		opacity: 0;
		transform: translateY(10px);
		transition: all 0.5s ease 0.8s;
	}

	.sync-status.visible {
		opacity: 1;
		transform: translateY(0);
	}

	.sync-indicator {
		position: relative;
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.sync-pulse {
		position: absolute;
		inset: 0;
		background: #fbbf24;
		border-radius: 50%;
		animation: pulse-ring 1.5s ease-out infinite;
	}

	@keyframes pulse-ring {
		0% {
			transform: scale(0.8);
			opacity: 0.8;
		}
		100% {
			transform: scale(2);
			opacity: 0;
		}
	}

	.sync-dot {
		position: absolute;
		inset: 3px;
		background: #fbbf24;
		border-radius: 50%;
	}

	.sync-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		text-align: left;
	}

	.sync-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
	}

	.sync-detail {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Sync Complete */
	.sync-complete {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-top: 1.5rem;
		padding: 0.75rem 1rem;
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.2);
		border-radius: 0.75rem;
		font-size: 0.875rem;
		color: #4ade80;
		opacity: 0;
		transform: translateY(10px);
		transition: all 0.5s ease 0.8s;
	}

	.sync-complete.visible {
		opacity: 1;
		transform: translateY(0);
	}

	.sync-complete-icon {
		width: 1.125rem;
		height: 1.125rem;
		flex-shrink: 0;
	}

	/* Footer */
	.footer-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		width: 100%;
		opacity: 0;
		transform: translateY(10px);
		transition: all 0.5s ease;
	}

	.footer-content.visible {
		opacity: 1;
		transform: translateY(0);
	}

	.btn-dashboard {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		width: 100%;
		max-width: 280px;
		padding: 1rem 2rem;
		background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
		border: none;
		border-radius: 0.875rem;
		color: #1a1410;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow:
			0 4px 20px rgba(251, 191, 36, 0.3),
			0 0 40px rgba(251, 191, 36, 0.1);
	}

	.btn-dashboard:hover {
		transform: translateY(-3px);
		box-shadow:
			0 8px 30px rgba(251, 191, 36, 0.4),
			0 0 60px rgba(251, 191, 36, 0.15);
	}

	.btn-dashboard:active {
		transform: translateY(-1px);
	}

	.arrow-icon {
		width: 1.25rem;
		height: 1.25rem;
		transition: transform 0.25s ease;
	}

	.btn-dashboard:hover .arrow-icon {
		transform: translateX(4px);
	}

	.footer-note {
		margin: 0;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
	}
</style>
