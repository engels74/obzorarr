<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import { createSlideState } from '$lib/stores/slide-state.svelte';
	import type { SlideRenderConfig } from '$lib/components/slides/types';
	import type { UserStats, ServerStats } from '$lib/stats/types';
	import type { CustomSlide } from '$lib/slides/types';
	import type { SlideMessagingContext } from '$lib/components/slides/messaging-context';
	import { createPersonalContext } from '$lib/components/slides/messaging-context';
	import ProgressBar from './ProgressBar.svelte';
	import SlideRenderer from './SlideRenderer.svelte';

	/**
	 * StoryMode Component
	 *
	 * Full-screen slide presentation with tap/click/swipe navigation.
	 * Displays statistics slides in a Spotify Wrapped-style experience.
	 *
	 * Implements Requirements:
	 * - 5.1: Full-screen slides
	 * - 5.2: Tap/click to advance
	 * - 5.3: Swipe left / tap right edge → next
	 * - 5.4: Swipe right / tap left edge → previous
	 * - 5.5: Progress indicator
	 * - 5.6: Smooth animations with Motion One
	 *
	 * @module components/wrapped/StoryMode
	 */

	interface Props {
		/** Statistics data to display */
		stats: UserStats | ServerStats;
		/** Ordered slide configuration */
		slides: SlideRenderConfig[];
		/** Custom slides data (keyed by id) */
		customSlides?: Map<number, CustomSlide>;
		/** Callback when presentation completes (last slide advanced) */
		onComplete?: () => void;
		/** Callback to close/exit story mode */
		onClose?: () => void;
		/** Additional CSS classes */
		class?: string;
		/** Messaging context for server-wide vs personal wrapped */
		messagingContext?: SlideMessagingContext;
	}

	let {
		stats,
		slides,
		customSlides,
		onComplete,
		onClose,
		class: klass = '',
		messagingContext = createPersonalContext()
	}: Props = $props();

	// ==========================================================================
	// Constants
	// ==========================================================================

	/** Edge zone percentage for tap navigation (15% on each side) */
	const EDGE_ZONE_PERCENT = 0.15;

	/** Minimum swipe distance to trigger navigation (pixels) */
	const SWIPE_THRESHOLD = 50;

	/** Animation duration (milliseconds) */
	const ANIMATION_DURATION = 400;

	// ==========================================================================
	// State
	// ==========================================================================

	// Slide navigation state using the store
	const navigation = createSlideState();

	// Initialize when slides change
	$effect(() => {
		navigation.initialize(slides.length);
	});

	// Touch tracking state
	let touchStartX = $state(0);
	let touchStartY = $state(0);
	let isTouching = $state(false);

	// Element references
	let container: HTMLElement | undefined = $state();
	let currentSlideEl: HTMLElement | undefined = $state();
	let previousSlideEl: HTMLElement | undefined = $state();

	// Animation state
	let isTransitioning = $state(false);
	let showPreviousSlide = $state(false);
	let previousSlideIndex = $state(-1);

	// ==========================================================================
	// Derived Values
	// ==========================================================================

	/** Current slide configuration */
	const currentSlide = $derived(slides[navigation.currentSlide]);

	/** Previous slide configuration (for exit animation) */
	const previousSlide = $derived(previousSlideIndex >= 0 ? slides[previousSlideIndex] : null);

	// ==========================================================================
	// Navigation Handlers
	// ==========================================================================

	/**
	 * Navigate to the next slide
	 */
	function goToNext(): void {
		if (isTransitioning || !navigation.canGoNext) {
			// If on last slide and trying to go next, call onComplete
			if (navigation.isLast && !isTransitioning) {
				onComplete?.();
			}
			return;
		}

		previousSlideIndex = navigation.currentSlide;
		showPreviousSlide = true;
		isTransitioning = true;

		navigation.goToNext();
		animateTransition('forward');
	}

	/**
	 * Navigate to the previous slide
	 */
	function goToPrevious(): void {
		if (isTransitioning || !navigation.canGoPrevious) return;

		previousSlideIndex = navigation.currentSlide;
		showPreviousSlide = true;
		isTransitioning = true;

		navigation.goToPrevious();
		animateTransition('backward');
	}

	/**
	 * Animate the slide transition
	 */
	function animateTransition(direction: 'forward' | 'backward'): void {
		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate || !currentSlideEl) {
			// Instant transition for reduced motion
			finishTransition();
			return;
		}

		navigation.startAnimation();

		const enterFrom = direction === 'forward' ? 'translateX(100%)' : 'translateX(-100%)';
		const exitTo = direction === 'forward' ? 'translateX(-100%)' : 'translateX(100%)';

		// Get element reference for animation
		const slideEl = currentSlideEl;
		if (!slideEl) {
			finishTransition();
			return;
		}

		// Animate current slide entering (using any to bypass Motion overload inference issue)
		const enterKeyframes = { opacity: [0, 1], transform: [enterFrom, 'translateX(0)'] } as Record<
			string,
			unknown
		>;
		const enterAnim = (
			animate as (
				el: Element,
				kf: Record<string, unknown>,
				opts: Record<string, unknown>
			) => { finished: Promise<void>; stop: () => void }
		)(slideEl, enterKeyframes, { duration: ANIMATION_DURATION / 1000, easing: [0.4, 0, 0.2, 1] });

		// Animate previous slide exiting
		const prevEl = previousSlideEl;
		if (prevEl && showPreviousSlide) {
			const exitKeyframes = { opacity: [1, 0], transform: ['translateX(0)', exitTo] } as Record<
				string,
				unknown
			>;
			(
				animate as (el: Element, kf: Record<string, unknown>, opts: Record<string, unknown>) => void
			)(prevEl, exitKeyframes, { duration: ANIMATION_DURATION / 1000, easing: [0.4, 0, 0.2, 1] });
		}

		enterAnim.finished.then(() => {
			finishTransition();
		});
	}

	/**
	 * Finish the transition and clean up
	 */
	function finishTransition(): void {
		showPreviousSlide = false;
		previousSlideIndex = -1;
		isTransitioning = false;
		navigation.endAnimation();
	}

	// ==========================================================================
	// Event Handlers
	// ==========================================================================

	/**
	 * Handle click/tap events
	 */
	function handleClick(event: MouseEvent): void {
		if (isTransitioning) return;

		const target = event.target as HTMLElement;

		// Don't navigate if clicking on interactive elements
		if (target.closest('a, button, input, select, textarea')) {
			return;
		}

		const rect = container?.getBoundingClientRect();
		if (!rect) return;

		const clickX = event.clientX - rect.left;
		const relativeX = clickX / rect.width;

		// Left edge zone → previous
		if (relativeX < EDGE_ZONE_PERCENT) {
			goToPrevious();
		}
		// Right edge zone or center → next
		else {
			goToNext();
		}
	}

	/**
	 * Handle touch start
	 */
	function handleTouchStart(event: TouchEvent): void {
		if (event.touches.length !== 1) return;

		const touch = event.touches[0];
		if (!touch) return;

		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
		isTouching = true;
	}

	/**
	 * Handle touch end - detect swipe
	 */
	function handleTouchEnd(event: TouchEvent): void {
		if (!isTouching) return;

		const touch = event.changedTouches[0];
		if (!touch) {
			isTouching = false;
			return;
		}

		const deltaX = touch.clientX - touchStartX;
		const deltaY = touch.clientY - touchStartY;

		// Only process horizontal swipes (more horizontal than vertical)
		if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
			if (deltaX < 0) {
				// Swipe left → next
				goToNext();
			} else {
				// Swipe right → previous
				goToPrevious();
			}
		}

		isTouching = false;
	}

	/**
	 * Handle keyboard navigation
	 */
	function handleKeyDown(event: KeyboardEvent): void {
		if (isTransitioning) return;

		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
			case ' ':
			case 'Enter':
				event.preventDefault();
				goToNext();
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				event.preventDefault();
				goToPrevious();
				break;
			case 'Escape':
				event.preventDefault();
				onClose?.();
				break;
			case 'Home':
				event.preventDefault();
				if (navigation.currentSlide !== 0) {
					previousSlideIndex = navigation.currentSlide;
					showPreviousSlide = true;
					isTransitioning = true;
					navigation.goToFirst();
					animateTransition('backward');
				}
				break;
			case 'End':
				event.preventDefault();
				if (!navigation.isLast) {
					previousSlideIndex = navigation.currentSlide;
					showPreviousSlide = true;
					isTransitioning = true;
					navigation.goToLast();
					animateTransition('forward');
				}
				break;
		}
	}

	/**
	 * Handle slide animation complete
	 */
	function handleSlideAnimationComplete(): void {
		// Slide internal animation completed
		// Could trigger additional effects here if needed
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={container}
	class="story-mode {klass}"
	role="application"
	aria-label="Story presentation - use arrow keys to navigate"
	onclick={handleClick}
	onkeydown={handleKeyDown}
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
	tabindex="0"
>
	<!-- Progress indicator -->
	<ProgressBar current={navigation.currentSlide} total={slides.length} />

	<!-- Slide container -->
	<div class="slides-container">
		<!-- Previous slide (for exit animation) -->
		{#if showPreviousSlide && previousSlide}
			<div bind:this={previousSlideEl} class="slide previous-slide">
				<SlideRenderer
					slide={previousSlide}
					{stats}
					{customSlides}
					active={false}
					{messagingContext}
				/>
			</div>
		{/if}

		<!-- Current slide -->
		{#if currentSlide}
			{#key navigation.currentSlide}
				<div bind:this={currentSlideEl} class="slide current-slide">
					<SlideRenderer
						slide={currentSlide}
						{stats}
						{customSlides}
						active={!isTransitioning}
						onAnimationComplete={handleSlideAnimationComplete}
						{messagingContext}
					/>
				</div>
			{/key}
		{/if}
	</div>

	<!-- Navigation hint (first slide only) -->
	{#if navigation.isFirst && !isTransitioning}
		<div class="navigation-hint">
			<span>Tap to continue</span>
		</div>
	{/if}

	<!-- Close button -->
	{#if onClose}
		<button
			type="button"
			class="close-button"
			onclick={(e) => {
				e.stopPropagation();
				onClose?.();
			}}
			aria-label="Close presentation"
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M18 6L6 18M6 6l12 12" />
			</svg>
		</button>
	{/if}
</div>

<style>
	.story-mode {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100dvh;
		background: var(--background, #0f0f0f);
		overflow: hidden;
		outline: none;
		touch-action: pan-y pinch-zoom;
		user-select: none;
		-webkit-user-select: none;
	}

	.slides-container {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.slide {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		padding-top: 4rem; /* Space for progress bar */
	}

	.previous-slide {
		z-index: 1;
	}

	.current-slide {
		z-index: 2;
	}

	.navigation-hint {
		position: absolute;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		padding: 0.5rem 1rem;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2rem;
		font-size: 0.875rem;
		color: var(--muted-foreground, rgba(255, 255, 255, 0.6));
		animation: fadeInOut 3s ease-in-out infinite;
		pointer-events: none;
	}

	@keyframes fadeInOut {
		0%,
		100% {
			opacity: 0.6;
		}
		50% {
			opacity: 1;
		}
	}

	.close-button {
		position: absolute;
		top: 1rem;
		right: 1rem;
		z-index: 101;
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
		border: none;
		border-radius: 50%;
		color: var(--foreground, white);
		cursor: pointer;
		transition:
			background-color 0.2s,
			transform 0.2s;
	}

	.close-button:hover {
		background: rgba(0, 0, 0, 0.7);
		transform: scale(1.1);
	}

	.close-button:focus-visible {
		outline: 2px solid var(--primary, #dc2626);
		outline-offset: 2px;
	}

	.close-button svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	/* Mobile: compact layout */
	@media (max-width: 767px) {
		.slide {
			padding: 2rem 1rem;
			padding-top: 3rem;
		}

		.navigation-hint {
			bottom: 1.5rem;
			font-size: 0.75rem;
		}

		.close-button {
			top: 0.75rem;
			right: 0.75rem;
			width: 2rem;
			height: 2rem;
		}

		.close-button svg {
			width: 1rem;
			height: 1rem;
		}
	}

	/* Tablet: medium layout */
	@media (min-width: 768px) {
		.slide {
			padding: 3rem 2rem;
			padding-top: 4rem;
		}
	}

	/* Desktop: generous layout */
	@media (min-width: 1024px) {
		.slide {
			padding: 4rem 3rem;
			padding-top: 4.5rem;
		}

		.close-button {
			width: 2.75rem;
			height: 2.75rem;
		}

		.close-button svg {
			width: 1.5rem;
			height: 1.5rem;
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.navigation-hint {
			animation: none;
			opacity: 0.8;
		}
	}
</style>
