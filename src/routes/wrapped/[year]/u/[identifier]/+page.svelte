<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		StoryMode,
		ScrollMode,
		ModeToggle,
		SummaryPage,
		ShareModal
	} from '$lib/components/wrapped';
	import Logo from '$lib/components/Logo.svelte';
	import { createPersonalContext } from '$lib/components/slides/messaging-context';
	import type { PageProps } from './$types';

	/**
	 * Per-user Wrapped Page
	 *
	 * Displays the user-specific Year in Review statistics.
	 * Supports both Story Mode (full-screen slides) and Scroll Mode.
	 *
	 * @module routes/wrapped/[year]/u/[identifier]
	 */

	let { data }: PageProps = $props();

	// Create messaging context for personal wrapped
	const messagingContext = createPersonalContext();

	/** Override for optimistic updates (null means use server value) */
	let showLogoOverride = $state<boolean | null>(null);
	/** Effective logo visibility - uses override if pending, otherwise server value */
	let showLogo = $derived(showLogoOverride ?? data.showLogo);

	// ==========================================================================
	// State
	// ==========================================================================

	/** Current viewing mode */
	type ViewMode = 'story' | 'scroll';
	let viewMode = $state<ViewMode>('story');

	/** Current slide index for mode switching (preserves position) */
	let currentSlideIndex = $state(0);

	/** Whether to show the summary page */
	let showSummary = $state(false);

	/** Whether to show the share modal */
	let showShareModal = $state(false);

	/** Key for forcing StoryMode remount on restart */
	let storyKey = $state(0);

	// ==========================================================================
	// Event Handlers
	// ==========================================================================

	/**
	 * Handle mode change from ModeToggle
	 */
	function handleModeChange(newMode: ViewMode): void {
		viewMode = newMode;
	}

	/**
	 * Handle scroll mode requesting switch (preserves position)
	 */
	function handleScrollModeSwitch(slideIndex: number): void {
		currentSlideIndex = slideIndex;
		viewMode = 'story';
	}

	/**
	 * Handle story mode completion - show summary page
	 */
	function handleComplete(): void {
		showSummary = true;
	}

	/**
	 * Handle close/exit action
	 */
	function handleClose(): void {
		// Navigate back to home or previous page
		window.history.back();
	}

	/**
	 * Handle restart - return to slideshow from summary
	 */
	function handleRestart(): void {
		showSummary = false;
		viewMode = 'story';
		currentSlideIndex = 0;
		storyKey++; // Force StoryMode remount
	}

	/**
	 * Handle return home from summary
	 */
	function handleHome(): void {
		goto('/');
	}

	/**
	 * Handle share button click from summary
	 */
	function handleShare(): void {
		showShareModal = true;
	}

	/**
	 * Handle logo toggle (optimistic update)
	 */
	function handleLogoToggle(): void {
		showLogoOverride = !showLogo;
	}
</script>

<svelte:head>
	<title>{data.username}'s Wrapped {data.year} - Obzorarr</title>
	<meta name="description" content="{data.username}'s Year in Review statistics for {data.year}" />
</svelte:head>

<div class="wrapped-page">
	<!-- Logo Watermark -->
	{#if showLogo}
		<div class="logo-watermark">
			<Logo size="sm" />
		</div>
	{/if}

	<!-- Controls Container (top right) -->
	<div class="controls-container">
		{#if data.canUserControlLogo}
			<form
				method="POST"
				action="?/toggleLogo"
				use:enhance={() => {
					handleLogoToggle();
					return async () => {
						// Form submitted - reset override so server value takes precedence
						showLogoOverride = null;
					};
				}}
			>
				<input type="hidden" name="showLogo" value={!showLogo} />
				<button type="submit" class="logo-toggle" title={showLogo ? 'Hide logo' : 'Show logo'}>
					{#if showLogo}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
							<path
								d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"
							/>
							<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
							<line x1="2" x2="22" y1="2" y2="22" />
						</svg>
					{/if}
				</button>
			</form>
		{/if}
		<ModeToggle mode={viewMode} onModeChange={handleModeChange} />
	</div>

	<!-- User Header -->
	<div class="user-header" class:with-logo={showLogo}>
		<h1 class="user-title">{data.username}'s Year in Review</h1>
	</div>

	<!-- Wrapped Content -->
	{#if showSummary}
		<SummaryPage
			stats={data.stats}
			year={data.year}
			username={data.username}
			onRestart={handleRestart}
			onHome={handleHome}
			onShare={handleShare}
		/>
	{:else if viewMode === 'story'}
		{#key storyKey}
			<StoryMode
				stats={data.stats}
				slides={data.slides}
				customSlides={data.customSlidesMap}
				onComplete={handleComplete}
				onClose={handleClose}
				{messagingContext}
			/>
		{/key}
	{:else}
		<ScrollMode
			stats={data.stats}
			slides={data.slides}
			customSlides={data.customSlidesMap}
			initialSlideIndex={currentSlideIndex}
			onModeSwitch={handleScrollModeSwitch}
			onClose={handleClose}
			{messagingContext}
		/>
	{/if}

	<!-- Share Modal -->
	<ShareModal
		bind:open={showShareModal}
		onOpenChange={(v) => (showShareModal = v)}
		currentUrl={data.currentUrl}
		shareSettings={data.shareSettings}
		isOwner={data.isOwner}
		isAdmin={data.isAdmin}
	/>
</div>

<style>
	.wrapped-page {
		position: relative;
		width: 100%;
		min-height: 100vh;
		min-height: 100dvh;
		background: var(
			--slide-bg-gradient,
			linear-gradient(
				135deg,
				hsl(var(--primary-hue, 217) 30% 12%) 0%,
				hsl(var(--primary-hue, 217) 20% 8%) 100%
			)
		);
	}

	.logo-watermark {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 99;
		opacity: 0.8;
		pointer-events: none;
	}

	.controls-container {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.logo-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: none;
		border-radius: 0.375rem;
		background: var(--card);
		color: var(--foreground);
		cursor: pointer;
		opacity: 0.8;
		transition:
			opacity 0.2s,
			background 0.2s;
	}

	.logo-toggle:hover {
		opacity: 1;
		background: var(--muted);
	}

	.user-header {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 100;
		pointer-events: none;
	}

	.user-header.with-logo {
		left: 3.5rem;
	}

	.user-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--foreground);
		opacity: 0.8;
		margin: 0;
	}
</style>
