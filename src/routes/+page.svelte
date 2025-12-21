<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import Logo from '$lib/components/Logo.svelte';

	/**
	 * Public Landing Page
	 *
	 * Soviet/communist themed landing page for Obzorarr with:
	 * - Hero section explaining the app
	 * - Plex OAuth login button
	 *
	 * Implements Requirement 14.1:
	 * - THE Router SHALL serve the public landing page at `/`
	 */

	// Auth state
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let pollIntervalId: ReturnType<typeof setInterval> | null = null;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	// Element refs for animation
	let heroContainer: HTMLElement | undefined = $state();

	// Entrance animation for hero
	$effect(() => {
		if (!heroContainer || prefersReducedMotion.current) return;
		const animation = animate(
			heroContainer,
			{ opacity: [0, 1], transform: ['translateY(30px)', 'translateY(0)'] },
			{ type: 'spring', stiffness: 100, damping: 15 }
		);
		return () => animation.stop();
	});

	// Cleanup polling on unmount
	$effect(() => {
		return () => {
			if (pollIntervalId) clearInterval(pollIntervalId);
			if (timeoutId) clearTimeout(timeoutId);
		};
	});

	// Plex OAuth handler
	async function handlePlexLogin() {
		isLoading = true;
		error = null;

		try {
			// 1. Get PIN info
			const response = await fetch('/auth/plex');
			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error(errData.message || 'Failed to initiate login');
			}
			const { pinId, authUrl } = (await response.json()) as { pinId: number; authUrl: string };

			// 2. Open Plex auth in new window
			const authWindow = window.open(authUrl, 'plex-auth', 'width=600,height=700');

			// 3. Poll for completion
			pollIntervalId = setInterval(async () => {
				try {
					const pollResponse = await fetch('/auth/plex', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ pinId })
					});

					if (!pollResponse.ok) {
						const status = pollResponse.status;
						if (status === 401) {
							// PIN expired
							if (pollIntervalId) clearInterval(pollIntervalId);
							pollIntervalId = null;
							isLoading = false;
							error = 'Authentication expired. Please try again.';
							return;
						}
						// Other error, keep polling
						return;
					}

					const result = (await pollResponse.json()) as { pending: true } | { authToken: string };

					if ('authToken' in result && result.authToken) {
						if (pollIntervalId) clearInterval(pollIntervalId);
						pollIntervalId = null;
						authWindow?.close();

						// 4. Complete auth via callback endpoint
						const callbackResponse = await fetch('/auth/plex/callback', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ authToken: result.authToken })
						});

						if (!callbackResponse.ok) {
							const errData = await callbackResponse.json().catch(() => ({}));
							throw new Error((errData as { message?: string }).message || 'Login failed');
						}

						const userData = (await callbackResponse.json()) as {
							user: { isAdmin: boolean };
						};

						// 5. Redirect based on role
						window.location.href = userData.user.isAdmin
							? '/admin'
							: `/wrapped/${new Date().getFullYear()}`;
					}
				} catch (err) {
					if (pollIntervalId) clearInterval(pollIntervalId);
					pollIntervalId = null;
					isLoading = false;
					error = err instanceof Error ? err.message : 'Login failed';
				}
			}, 2000);

			// Clean up after 5 minutes (PIN expires)
			timeoutId = setTimeout(
				() => {
					if (pollIntervalId) {
						clearInterval(pollIntervalId);
						pollIntervalId = null;
					}
					if (isLoading) {
						isLoading = false;
						error = 'Authentication timed out. Please try again.';
					}
				},
				5 * 60 * 1000
			);
		} catch (err) {
			isLoading = false;
			error = err instanceof Error ? err.message : 'Login failed';
		}
	}
</script>

<div class="landing">
	<!-- Hero Section -->
	<section class="hero" bind:this={heroContainer}>
		<div class="hero-content">
			<!-- Logo Decorative Element -->
			<div class="logo-glow" aria-hidden="true">
				<Logo size={80} />
			</div>

			<h1 class="hero-title">
				<span class="title-main">OBZORARR</span>
				<span class="title-sub">Year in Review</span>
			</h1>

			<p class="hero-description">
				Discover your Plex viewing journey. Beautiful statistics, stunning animations, and shareable
				summaries of your media consumption.
			</p>

			<!-- Login Button -->
			<button type="button" class="login-button" onclick={handlePlexLogin} disabled={isLoading}>
				{#if isLoading}
					<span class="button-loading">
						<span class="spinner" aria-hidden="true"></span>
						Connecting to Plex...
					</span>
				{:else}
					<span class="button-content">
						<span class="plex-icon" aria-hidden="true">&#9654;</span>
						Sign in with Plex
					</span>
				{/if}
			</button>

			{#if error}
				<p class="error-message" role="alert">{error}</p>
			{/if}
		</div>
	</section>

	<!-- Footer -->
	<footer class="footer">
		<p>Spotify Wrapped-style summaries for your Plex Media Server</p>
	</footer>
</div>

<style>
	.landing {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: hsl(var(--background));
	}

	/* Hero Section */
	.hero {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		min-height: 80vh;
		position: relative;
		overflow: hidden;
	}

	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, hsl(var(--primary) / 0.1) 0%, transparent 70%);
		pointer-events: none;
	}

	.hero-content {
		max-width: 600px;
		text-align: center;
		position: relative;
		z-index: 1;
	}

	.logo-glow {
		margin-bottom: 1rem;
		filter: drop-shadow(0 0 20px hsl(var(--primary) / 0.5))
			drop-shadow(0 0 40px hsl(var(--primary) / 0.3));
	}

	.hero-title {
		margin: 0 0 1.5rem;
	}

	.title-main {
		display: block;
		font-size: clamp(2.5rem, 8vw, 4rem);
		font-weight: 900;
		letter-spacing: 0.15em;
		color: hsl(var(--primary));
		text-shadow:
			2px 2px 0 hsl(var(--primary) / 0.3),
			4px 4px 0 hsl(var(--primary) / 0.1);
	}

	.title-sub {
		display: block;
		font-size: clamp(1rem, 3vw, 1.5rem);
		font-weight: 400;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: hsl(var(--accent));
		margin-top: 0.5rem;
	}

	.hero-description {
		font-size: 1.125rem;
		line-height: 1.7;
		color: hsl(var(--muted-foreground));
		margin: 0 0 2rem;
	}

	/* Login Button */
	.login-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 240px;
		padding: 1rem 2rem;
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--primary-foreground));
		background: hsl(var(--primary));
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow:
			0 4px 14px hsl(var(--primary) / 0.4),
			0 0 0 0 hsl(var(--accent) / 0);
	}

	.login-button:hover:not(:disabled) {
		background: hsl(var(--primary) / 0.9);
		transform: translateY(-2px);
		box-shadow:
			0 6px 20px hsl(var(--primary) / 0.5),
			0 0 0 3px hsl(var(--accent) / 0.3);
	}

	.login-button:active:not(:disabled) {
		transform: translateY(0);
	}

	.login-button:disabled {
		opacity: 0.8;
		cursor: not-allowed;
	}

	.button-content,
	.button-loading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.plex-icon {
		font-size: 1.25rem;
	}

	.spinner {
		display: inline-block;
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid hsl(var(--primary-foreground) / 0.3);
		border-top-color: hsl(var(--primary-foreground));
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-message {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--destructive) / 0.2);
		border: 1px solid hsl(var(--destructive));
		border-radius: var(--radius);
		color: hsl(var(--destructive-foreground));
		font-size: 0.875rem;
	}

	/* Footer */
	.footer {
		padding: 1.5rem 2rem;
		text-align: center;
		border-top: 1px solid hsl(var(--border));
	}

	.footer p {
		margin: 0;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		letter-spacing: 0.05em;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.hero {
			min-height: 70vh;
			padding: 1.5rem;
		}

		.logo-glow :global(.logo) {
			width: 64px;
			height: 64px;
		}

		.hero-description {
			font-size: 1rem;
		}

		.login-button {
			width: 100%;
			min-width: unset;
		}

	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}

		.login-button {
			transition: none;
		}
	}
</style>
