<script lang="ts">
	import { StoryMode, ScrollMode, ModeToggle } from '$lib/components/wrapped';
	import type { PageProps } from './$types';

	/**
	 * Server-wide Wrapped Page
	 *
	 * Displays the server-wide Year in Review statistics.
	 * Supports both Story Mode (full-screen slides) and Scroll Mode.
	 *
	 * Implements Requirements:
	 * - 5.1-5.7: Story Mode functionality
	 * - 6.1-6.4: Scroll Mode functionality
	 * - 12.1: URL format /wrapped/{year}
	 * - 14.3: Router serves server-wide wrapped
	 *
	 * @module routes/wrapped/[year]
	 */

	let { data }: PageProps = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	/** Current viewing mode */
	type ViewMode = 'story' | 'scroll';
	let viewMode = $state<ViewMode>('story');

	/** Current slide index for mode switching (preserves position) */
	let currentSlideIndex = $state(0);

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
	 * Handle story mode completion
	 */
	function handleComplete(): void {
		// Could show a completion screen or navigate elsewhere
		console.log('Wrapped presentation complete');
	}

	/**
	 * Handle close/exit action
	 */
	function handleClose(): void {
		// Navigate back to home or previous page
		window.history.back();
	}
</script>

<svelte:head>
	<title>Server Wrapped {data.year} - Obzorarr</title>
	<meta name="description" content="Year in Review statistics for {data.year}" />
</svelte:head>

<div class="wrapped-page">
	<!-- Mode Toggle Button -->
	<div class="mode-toggle-container">
		<ModeToggle mode={viewMode} onModeChange={handleModeChange} />
	</div>

	<!-- Wrapped Content -->
	{#if viewMode === 'story'}
		<StoryMode
			stats={data.stats}
			slides={data.slides}
			customSlides={data.customSlidesMap}
			onComplete={handleComplete}
			onClose={handleClose}
		/>
	{:else}
		<ScrollMode
			stats={data.stats}
			slides={data.slides}
			customSlides={data.customSlidesMap}
			initialSlideIndex={currentSlideIndex}
			onModeSwitch={handleScrollModeSwitch}
			onClose={handleClose}
		/>
	{/if}
</div>

<style>
	.wrapped-page {
		position: relative;
		width: 100%;
		min-height: 100vh;
		background: var(--background);
	}

	.mode-toggle-container {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 100;
	}
</style>
