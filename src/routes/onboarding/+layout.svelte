<script lang="ts">
	import type { LayoutData } from './$types';
	import StepIndicator from '$lib/components/onboarding/StepIndicator.svelte';
	import { animate } from 'motion';

	let { data, children }: { data: LayoutData; children: any } = $props();

	let logoRef: HTMLElement | undefined = $state();
	let contentRef: HTMLElement | undefined = $state();

	// Animate logo on mount
	$effect(() => {
		if (!logoRef) return;

		animate(
			logoRef,
			{ opacity: [0, 1], y: [-20, 0] },
			{ duration: 0.8, easing: [0.22, 1, 0.36, 1] }
		);
	});
</script>

<svelte:head>
	<title>Setup - Obzorarr</title>
	<meta name="description" content="Set up Obzorarr for your Plex server" />
</svelte:head>

<div class="onboarding-layout">
	<!-- Background effects -->
	<div class="bg-gradient"></div>
	<div class="bg-noise"></div>
	<div class="bg-vignette"></div>

	<!-- Content container -->
	<div class="onboarding-container">
		<!-- Logo -->
		<header bind:this={logoRef} class="onboarding-header">
			<div class="logo-wrapper">
				<svg class="logo" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
					<rect
						x="4"
						y="8"
						width="40"
						height="32"
						rx="4"
						fill="url(#logo-gradient)"
						stroke="rgba(255,255,255,0.2)"
						stroke-width="1.5"
					/>
					<path d="M20 18L32 24L20 30V18Z" fill="white" fill-opacity="0.9" />
					<circle cx="24" cy="24" r="10" stroke="white" stroke-opacity="0.3" stroke-width="1" />
					<defs>
						<linearGradient
							id="logo-gradient"
							x1="4"
							y1="8"
							x2="44"
							y2="40"
							gradientUnits="userSpaceOnUse"
						>
							<stop stop-color="hsl(35, 100%, 50%)" />
							<stop offset="1" stop-color="hsl(15, 100%, 45%)" />
						</linearGradient>
					</defs>
				</svg>
				<span class="logo-text">Obzorarr</span>
			</div>
			<p class="setup-label">Initial Setup</p>
		</header>

		<!-- Step indicator -->
		<div class="step-indicator-wrapper">
			<StepIndicator steps={data.steps} currentStep={data.currentStepIndex} />
		</div>

		<!-- Page content -->
		<main bind:this={contentRef} class="onboarding-content">
			{@render children()}
		</main>

		<!-- Footer -->
		<footer class="onboarding-footer">
			<p>Your Plex viewing history, beautifully wrapped.</p>
		</footer>
	</div>
</div>

<style>
	.onboarding-layout {
		min-height: 100vh;
		min-height: 100dvh;
		width: 100%;
		position: relative;
		overflow-x: hidden;
		display: flex;
		flex-direction: column;
		background: hsl(220, 20%, 8%);
	}

	/* Background gradient - cinematic theater lighting */
	.bg-gradient {
		position: fixed;
		inset: 0;
		background:
			radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 140, 50, 0.08) 0%, transparent 50%),
			radial-gradient(ellipse 60% 40% at 20% 80%, rgba(255, 80, 50, 0.05) 0%, transparent 40%),
			radial-gradient(ellipse 60% 40% at 80% 80%, rgba(180, 100, 255, 0.03) 0%, transparent 40%),
			linear-gradient(180deg, hsl(220, 25%, 6%) 0%, hsl(220, 20%, 10%) 100%);
		z-index: 0;
		pointer-events: none;
	}

	/* Film grain texture */
	.bg-noise {
		position: fixed;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
		opacity: 0.025;
		z-index: 1;
		pointer-events: none;
	}

	/* Vignette effect */
	.bg-vignette {
		position: fixed;
		inset: 0;
		background: radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.4) 100%);
		z-index: 2;
		pointer-events: none;
	}

	.onboarding-container {
		position: relative;
		z-index: 10;
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem 1.5rem;
		max-width: 800px;
		margin: 0 auto;
		width: 100%;
	}

	.onboarding-header {
		text-align: center;
		margin-bottom: 2.5rem;
		opacity: 0; /* Start hidden for animation */
	}

	.logo-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.logo {
		width: 48px;
		height: 48px;
	}

	.logo-text {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.95) 0%,
			rgba(255, 255, 255, 0.7) 100%
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.setup-label {
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: rgba(255, 160, 50, 0.7);
		margin: 0;
	}

	.step-indicator-wrapper {
		width: 100%;
		max-width: 600px;
		margin-bottom: 2.5rem;
	}

	.onboarding-content {
		flex: 1;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.onboarding-footer {
		margin-top: 3rem;
		padding-top: 2rem;
		text-align: center;
	}

	.onboarding-footer p {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.3);
		margin: 0;
		letter-spacing: 0.02em;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.onboarding-container {
			padding: 1.5rem 1rem;
		}

		.onboarding-header {
			margin-bottom: 2rem;
		}

		.logo {
			width: 40px;
			height: 40px;
		}

		.logo-text {
			font-size: 1.5rem;
		}

		.step-indicator-wrapper {
			margin-bottom: 2rem;
		}

		.onboarding-footer {
			margin-top: 2rem;
			padding-top: 1.5rem;
		}
	}
</style>
