<script lang="ts">
import { animate } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import { browser } from '$app/environment';
import { enhance } from '$app/forms';
import { shouldUseRedirectAuth } from '$lib/client/auth-mode';
import {
	commitRedirectFromPopupBlocked,
	type PlexLoginController,
	startPlexLoginPopup,
	startPlexLoginRedirect
} from '$lib/client/plex-login';
import PopupBlockedModal from '$lib/components/auth/PopupBlockedModal.svelte';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import Logo from '$lib/components/Logo.svelte';
import { Input } from '$lib/components/ui/input';
import type { ActionData, PageData } from './$types';

/**
 * Public Landing Page
 *
 * Soviet/communist themed landing page for Obzorarr with:
 * - Username-based quick access to wrapped pages (primary CTA)
 * - Plex OAuth login button for dashboard access (secondary)
 */

let { data, form }: { data: PageData; form: ActionData } = $props();

// Username lookup state
let username = $state('');
let usernameTouched = $state(false);
let isLookingUp = $state(false);

// Sync username from form response (preserves user input on error)
$effect(() => {
	if (form?.username) {
		username = form.username;
	}
});

// Plex OAuth state
let isOAuthLoading = $state(false);
let isRedirecting = $state(false);
let oauthError = $state<string | null>(null);
let loginController: PlexLoginController | null = null;

// Popup fallback state
let showPopupBlockedModal = $state(false);
let pendingPinId = $state<number | null>(null);
let pendingAuthUrl = $state<string | null>(null);

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
		loginController?.cancel();
		loginController = null;
	};
});

async function handlePlexLogin() {
	if (!browser) return;

	oauthError = null;

	const useRedirect = shouldUseRedirectAuth(new URL(window.location.href).searchParams);

	if (useRedirect) {
		loginController?.cancel();
		loginController = null;
		isRedirecting = true;
		await startPlexLoginRedirect({
			context: 'landing',
			onError: (message) => {
				isRedirecting = false;
				oauthError = message;
			}
		});
		return;
	}

	isOAuthLoading = true;
	loginController?.cancel();
	loginController = startPlexLoginPopup({
		context: 'landing',
		onSuccess: (user) => {
			window.location.href = user.isAdmin ? '/admin' : '/dashboard';
		},
		onError: (message) => {
			isOAuthLoading = false;
			oauthError = message;
		},
		onPopupBlocked: (pinId, authUrl) => {
			isOAuthLoading = false;
			pendingPinId = pinId;
			pendingAuthUrl = authUrl;
			showPopupBlockedModal = true;
		}
	});
}

function handleContinueWithRedirect(): void {
	if (!pendingPinId || !pendingAuthUrl || !browser) return;

	showPopupBlockedModal = false;
	try {
		commitRedirectFromPopupBlocked(pendingPinId, pendingAuthUrl, 'landing');
	} catch (err) {
		oauthError = err instanceof Error ? err.message : 'Failed to initiate redirect login';
	}
}

function handleCancelRedirect(): void {
	pendingPinId = null;
	pendingAuthUrl = null;
	showPopupBlockedModal = false;
	oauthError = 'Login cancelled. Try enabling popups for this site.';
}
</script>

<div class="landing">
	<!-- Hero Section -->
	<section class="hero" bind:this={heroContainer}>
		<div class="hero-content">
			<!-- Logo Decorative Element -->
			<div class="logo-glow" aria-hidden="true">
				<Logo size={120} />
			</div>

			<h1 class="hero-title">
				<span class="title-main">OBZORARR</span>
				<span class="title-sub">Year in Review</span>
			</h1>

			<p class="hero-description">
				Discover your Plex viewing journey. Beautiful statistics, stunning animations, and shareable
				summaries of your media consumption.
			</p>

			<!-- PRIMARY CTA: Username Lookup -->
			<div class="username-section">
				<form
					method="POST"
					action="?/lookupUser"
					use:enhance={() => {
						isLookingUp = true;
						return async ({ update }) => {
							isLookingUp = false;
							await update();
						};
					}}
					class="username-form"
				>
					<div class="username-input-group">
						<label for="username-input" class="sr-only">Plex username</label>
						<Input
							id="username-input"
							type="text"
							name="username"
							bind:value={username}
							placeholder="Enter your Plex username"
							disabled={isLookingUp}
							class="username-input"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
							onblur={() => (usernameTouched = true)}
						/>
						<SubmitButton
							class="view-button tap-target"
							submitting={isLookingUp}
							disabled={!username.trim()}
						>
							{#snippet children()}
								View My {data.currentYear} Wrapped
							{/snippet}
							{#snippet submittingLabel()}
								Looking up...
							{/snippet}
						</SubmitButton>
					</div>

					{#if form?.error}
						<p class="error-message" role="alert">
							{form.error}
							{#if form.requiresAuth}
								<button type="button" class="link-button" onclick={handlePlexLogin}>
									Sign in now
								</button>
							{/if}
						</p>
					{/if}

					{#if usernameTouched && username.trim() === '' && username.length > 0}
						<p class="error-message" role="alert">
							Username cannot be empty or whitespace only.
						</p>
					{/if}
				</form>
			</div>

			<!-- SECONDARY: Plex OAuth Login -->
			<div class="login-section">
				<p class="login-prompt">Want to access your dashboard or change settings?</p>
				<button
					type="button"
					class="login-button secondary"
					onclick={handlePlexLogin}
					disabled={isOAuthLoading || isRedirecting}
				>
					{#if isRedirecting}
						<span class="button-loading">
							<span class="spinner" aria-hidden="true"></span>
							Redirecting to Plex...
						</span>
					{:else if isOAuthLoading}
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

				{#if oauthError}
					<p class="error-message" role="alert">{oauthError}</p>
				{/if}
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="footer">
		<p>Spotify Wrapped-style summaries for your Plex Media Server</p>
	</footer>
</div>

<PopupBlockedModal
	bind:open={showPopupBlockedModal}
	onContinue={handleContinueWithRedirect}
	onCancel={handleCancelRedirect}
/>

<style>
	.landing {
			min-height: 100vh;
			display: flex;
			flex-direction: column;
			background: oklch(var(--background));
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
			background: radial-gradient(ellipse at center, oklch(var(--primary) / 0.1) 0%, transparent 70%);
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
			filter: drop-shadow(0 0 20px oklch(var(--primary) / 0.5))
				drop-shadow(0 0 40px oklch(var(--primary) / 0.3));
		}

		.hero-title {
			margin: 0 0 1.5rem;
		}

		.title-main {
			display: block;
			font-size: clamp(2.5rem, 8vw, 4rem);
			font-weight: 900;
			letter-spacing: 0.15em;
			color: oklch(var(--primary));
			text-shadow:
				2px 2px 0 oklch(var(--primary) / 0.3),
				4px 4px 0 oklch(var(--primary) / 0.1);
		}

		.title-sub {
			display: block;
			font-size: clamp(1rem, 3vw, 1.5rem);
			font-weight: 400;
			letter-spacing: 0.3em;
			text-transform: uppercase;
			color: oklch(var(--accent));
			margin-top: 0.5rem;
		}

		.hero-description {
			font-size: 1.125rem;
			line-height: 1.7;
			color: oklch(var(--muted-foreground));
			margin: 0 0 2rem;
		}

		/* Username Section - PRIMARY CTA */
		.username-section {
			margin-bottom: 2rem;
		}

		.username-form {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
		}

		.username-input-group {
			display: flex;
			gap: 0.5rem;
			flex-wrap: wrap;
			justify-content: center;
		}

		.sr-only {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}

		/* Paired :global hoist for the username form input — same migration
		   story as `.view-button` above: PR-3 / US-024 swaps the native
		   <input class="username-input"> for the shadcn Input primitive
		   which renders inside a child component beyond Svelte 5's
		   component-scope. Globalising the rules now preserves the
		   hand-tuned focus ring + max-width without forcing the Input
		   consumer to re-implement them. */
		:global(.username-input) {
			flex: 1;
			min-width: 200px;
			max-width: 300px;
			padding: 0.875rem 1rem;
			font-size: 1rem;
			background: oklch(var(--input));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			color: oklch(var(--foreground));
			transition:
				border-color 0.2s ease,
				box-shadow 0.2s ease;
		}

		:global(.username-input::placeholder) {
			color: oklch(var(--muted-foreground));
		}

		:global(.username-input:focus) {
			outline: none;
			border-color: oklch(var(--ring));
			box-shadow: 0 0 0 2px oklch(var(--ring) / 0.2);
		}

		:global(.username-input:disabled) {
			opacity: 0.7;
			cursor: not-allowed;
		}

		/* `.view-button` is consumed at scope today by the native <button> in the
		   username form, but PR-3 / US-024 will swap that for the shadcn
		   SubmitButton primitive which renders the button element inside a
		   child component — Svelte 5 component-scoped CSS doesn't reach
		   inside a child, so the styling has to be globalised now. The rules
		   are unchanged; only the selector scope is bumped to :global so the
		   primitive consumer can keep the hero CTA's hover translate-y + glow
		   without re-implementing them. The .username-input rules below have
		   the same migration story; the matching :global hoist is paired with
		   the shadcn Input swap pre-work. */
		:global(.view-button) {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			padding: 0.875rem 1.5rem;
			font-size: 1rem;
			font-weight: 600;
			color: oklch(var(--primary-foreground));
			background: oklch(var(--primary));
			border: none;
			border-radius: var(--radius);
			cursor: pointer;
			transition: all 0.2s ease;
			white-space: nowrap;
			box-shadow:
				0 4px 14px oklch(var(--primary) / 0.4),
				0 0 0 0 oklch(var(--accent) / 0);
		}

		:global(.view-button:hover:not(:disabled)) {
			background: oklch(var(--primary) / 0.9);
			transform: translateY(-2px);
			box-shadow:
				0 6px 20px oklch(var(--primary) / 0.5),
				0 0 0 3px oklch(var(--accent) / 0.3);
		}

		:global(.view-button:active:not(:disabled)) {
			transform: translateY(0);
		}

		:global(.view-button:disabled) {
			opacity: 0.6;
			cursor: not-allowed;
		}

		/* Login Section - SECONDARY */
		.login-section {
			padding-top: 1.5rem;
			border-top: 1px solid oklch(var(--border) / 0.5);
		}

		.login-prompt {
			font-size: 0.875rem;
			color: oklch(var(--muted-foreground));
			margin: 0 0 0.75rem;
		}

		/* `.login-button` is the secondary Plex-OAuth CTA. Same :global hoist
		   story as .view-button + .username-input above — prep for the
		   future shadcn Button swap so the child component's rendered
		   element inherits the styling across Svelte 5's component-scope
		   boundary. Rule bodies are byte-identical. */
		:global(.login-button) {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 200px;
			padding: 0.75rem 1.5rem;
			font-size: 1rem;
			font-weight: 600;
			border: none;
			border-radius: var(--radius);
			cursor: pointer;
			transition: all 0.2s ease;
		}

		:global(.login-button.secondary) {
			background: oklch(var(--secondary));
			color: oklch(var(--secondary-foreground));
			border: 1px solid oklch(var(--border));
			box-shadow: none;
		}

		:global(.login-button.secondary:hover:not(:disabled)) {
			background: oklch(var(--muted));
			transform: none;
		}

		:global(.login-button:disabled) {
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
			font-size: 1.125rem;
		}

		/* Shared Elements */
		.spinner {
			display: inline-block;
			width: 1.25rem;
			height: 1.25rem;
			border: 2px solid oklch(var(--primary-foreground) / 0.3);
			border-top-color: oklch(var(--primary-foreground));
			border-radius: 50%;
			animation: spin 1s linear infinite;
		}

		@keyframes spin {
			to {
				transform: rotate(360deg);
			}
		}

		.error-message {
			margin-top: 0.75rem;
			padding: 0.75rem 1rem;
			background: oklch(var(--destructive) / 0.2);
			border: 1px solid oklch(var(--destructive));
			border-radius: var(--radius);
			color: oklch(var(--destructive-foreground));
			font-size: 0.875rem;
		}

		.link-button {
			background: none;
			border: none;
			color: oklch(var(--primary));
			text-decoration: underline;
			cursor: pointer;
			font-size: inherit;
			padding: 0;
			margin-left: 0.25rem;
		}

		.link-button:hover {
			opacity: 0.8;
		}

		/* Footer */
		.footer {
			padding: 1.5rem 2rem;
			text-align: center;
			border-top: 1px solid oklch(var(--border));
		}

		.footer p {
			margin: 0;
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
			letter-spacing: 0.05em;
		}

		/* Responsive */
		@media (max-width: 640px) {
			.hero {
				min-height: 70vh;
				padding: 1.5rem;
			}

			.logo-glow :global(.logo) {
				width: 96px;
				height: 96px;
			}

			.hero-description {
				font-size: 1rem;
			}

			.username-input-group {
				flex-direction: column;
				align-items: stretch;
			}

			:global(.username-input) {
				max-width: none;
			}

			:global(.view-button) {
				justify-content: center;
				width: 100%;
			}

			:global(.login-button) {
				width: 100%;
				min-width: unset;
			}
		}

		/* Reduced motion */
		@media (prefers-reduced-motion: reduce) {
			.spinner {
				animation: none;
			}

			:global(.view-button),
			:global(.login-button),
			:global(.username-input) {
				transition: none;
			}
		}
</style>
