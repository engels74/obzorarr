<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		StoryMode,
		ScrollMode,
		ModeToggle,
		SummaryPage,
		ShareModal
	} from '$lib/components/wrapped';
	import Logo from '$lib/components/Logo.svelte';
	import { createServerContext } from '$lib/components/slides/messaging-context';
	import type { PageProps } from './$types';

	/**
	 * Server-wide Wrapped Page
	 *
	 * Displays the server-wide Year in Review statistics.
	 * Supports both Story Mode (full-screen slides) and Scroll Mode.
	 *
	 * @module routes/wrapped/[year]
	 */

	let { data }: PageProps = $props();

	// Create messaging context for server-wide wrapped (reactive to data changes)
	const messagingContext = $derived(createServerContext(data.serverName));

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
</script>

<svelte:head>
	<title>Server Wrapped {data.year} - Obzorarr</title>
	<meta name="description" content="Year in Review statistics for {data.year}" />
</svelte:head>

<div class="wrapped-page">
	<!-- Logo Watermark -->
	{#if data.showLogo}
		<div class="logo-watermark">
			<Logo size="sm" />
		</div>
	{/if}

	<!-- Mode Toggle Button -->
	<div class="mode-toggle-container">
		<ModeToggle mode={viewMode} onModeChange={handleModeChange} />
	</div>

	<!-- Wrapped Content -->
	{#if showSummary}
		<SummaryPage
			stats={data.stats}
			year={data.year}
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

	<!-- Share Modal (simplified for server-wide - always public) -->
	<ShareModal
		bind:open={showShareModal}
		onOpenChange={(v) => (showShareModal = v)}
		currentUrl={data.currentUrl}
		isOwner={false}
		isAdmin={data.isAdmin}
		isServerWrapped={true}
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

	.mode-toggle-container {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
	}
</style>
