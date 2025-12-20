<script lang="ts">
	import { gsap } from 'gsap';
	import { ScrollTrigger } from 'gsap/ScrollTrigger';
	import { tick } from 'svelte';
	import type { SlideRenderConfig } from '$lib/components/slides/types';
	import type { UserStats, ServerStats } from '$lib/server/stats/types';
	import type { CustomSlide } from '$lib/server/slides/types';
	import type { FunFact } from '$lib/server/funfacts';
	import SlideRenderer from './SlideRenderer.svelte';

	// Register GSAP plugin at module level (per bun-svelte-pro.md)
	gsap.registerPlugin(ScrollTrigger);

	/**
	 * ScrollMode Component
	 *
	 * Displays all statistics on a single scrollable page with scroll-triggered
	 * animations using GSAP ScrollTrigger.
	 *
	 * Implements Requirements:
	 * - 6.1: Display all statistics on a single scrollable page
	 * - 6.2: Trigger scroll-based animations when sections enter viewport
	 * - 6.3: Maintain same visual styling as Story Mode
	 * - 6.4: Preserve position when toggling between modes
	 *
	 * @module components/wrapped/ScrollMode
	 */

	interface Props {
		/** Statistics data to display */
		stats: UserStats | ServerStats;
		/** Ordered slide configuration */
		slides: SlideRenderConfig[];
		/** Custom slides data (keyed by id) */
		customSlides?: Map<number, CustomSlide>;
		/** Fun facts data for fun-fact slides */
		funFacts?: FunFact[];
		/** Initial scroll position (slide index from Story Mode) */
		initialSlideIndex?: number;
		/** Callback when mode toggle requested, provides current visible slide index */
		onModeSwitch?: (currentSlideIndex: number) => void;
		/** Callback to close/exit scroll mode */
		onClose?: () => void;
		/** Additional CSS classes */
		class?: string;
	}

	let {
		stats,
		slides,
		customSlides,
		funFacts,
		initialSlideIndex = 0,
		onModeSwitch,
		onClose,
		class: klass = ''
	}: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	/** Container element reference */
	let container: HTMLElement | undefined = $state();

	/** Section element references (indexed by slide index) */
	let sectionRefs: (HTMLElement | undefined)[] = $state([]);

	/** Currently visible section index (for position preservation) */
	let visibleSectionIndex = $state(0);

	/** Whether initial scroll has been performed */
	let hasScrolledToInitial = $state(false);

	// ==========================================================================
	// Derived Values
	// ==========================================================================

	/** Filter to only enabled slides */
	const enabledSlides = $derived(slides.filter((s) => s.enabled));

	/** Total number of enabled slides */
	const totalSlides = $derived(enabledSlides.length);

	// ==========================================================================
	// Initial Scroll Position (Story Mode → Scroll Mode)
	// ==========================================================================

	$effect(() => {
		// Only run once after sections are rendered
		if (hasScrolledToInitial || !container) return;
		if (sectionRefs.filter(Boolean).length < enabledSlides.length) return;

		const targetIndex = Math.max(0, Math.min(initialSlideIndex, enabledSlides.length - 1));

		if (targetIndex > 0) {
			// Use tick to ensure DOM is ready, then scroll
			tick().then(() => {
				const targetSection = sectionRefs[targetIndex];
				if (targetSection) {
					targetSection.scrollIntoView({
						behavior: 'instant',
						block: 'start'
					});
				}
				hasScrolledToInitial = true;
			});
		} else {
			hasScrolledToInitial = true;
		}
	});

	// ==========================================================================
	// GSAP ScrollTrigger Animations
	// ==========================================================================

	$effect(() => {
		if (!container) return;

		// Wait for sections to be rendered
		const validSections = sectionRefs.filter(Boolean);
		if (validSections.length === 0) return;

		// Create GSAP context for scoped animations and cleanup
		const ctx = gsap.context(() => {
			// Use matchMedia for reduced motion support
			const mm = gsap.matchMedia();

			// Full animations for users who prefer motion
			mm.add('(prefers-reduced-motion: no-preference)', () => {
				sectionRefs.forEach((section, index) => {
					if (!section) return;

					const content = section.querySelector('.slide-content');
					if (!content) return;

					// Animate slide content on viewport entry
					gsap.from(content, {
						scrollTrigger: {
							trigger: section,
							start: 'top 85%',
							end: 'top 15%',
							toggleActions: 'play none none reverse',
							onEnter: () => {
								visibleSectionIndex = index;
							},
							onEnterBack: () => {
								visibleSectionIndex = index;
							}
						},
						y: 60,
						opacity: 0,
						scale: 0.95,
						duration: 0.7,
						ease: 'power3.out'
					});
				});
			});

			// Reduced animations for users who prefer reduced motion
			mm.add('(prefers-reduced-motion: reduce)', () => {
				sectionRefs.forEach((section, index) => {
					if (!section) return;

					const content = section.querySelector('.slide-content');
					if (!content) return;

					// Set content visible immediately (no animation)
					gsap.set(content, { opacity: 1 });

					// Still track visible sections for position preservation
					ScrollTrigger.create({
						trigger: section,
						start: 'top 80%',
						onEnter: () => {
							visibleSectionIndex = index;
						},
						onEnterBack: () => {
							visibleSectionIndex = index;
						}
					});
				});
			});
		}, container);

		// CRITICAL: Cleanup function to dispose GSAP context
		return () => {
			ctx.revert();
		};
	});

	// ==========================================================================
	// Event Handlers
	// ==========================================================================

	/**
	 * Handle mode switch request - passes current visible section to callback
	 */
	function handleModeSwitch(): void {
		onModeSwitch?.(visibleSectionIndex);
	}

	/**
	 * Handle keyboard events for navigation
	 */
	function handleKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose?.();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div bind:this={container} class="scroll-mode {klass}" role="main" aria-label="Wrapped statistics">
	<!-- Scrollable content -->
	<div class="scroll-content">
		{#each enabledSlides as slide, index (slide.type + '-' + index)}
			<section
				bind:this={sectionRefs[index]}
				class="scroll-section"
				class:active={visibleSectionIndex === index}
				data-slide-index={index}
			>
				<div class="slide-content">
					<SlideRenderer {slide} {stats} {customSlides} {funFacts} active={true} />
				</div>
			</section>
		{/each}
	</div>

	<!-- Scroll progress indicator -->
	<div class="scroll-progress" aria-hidden="true">
		<span class="progress-text">{visibleSectionIndex + 1} / {totalSlides}</span>
	</div>

	<!-- Close button (if onClose provided) -->
	{#if onClose}
		<button
			type="button"
			class="close-button"
			onclick={(e) => {
				e.stopPropagation();
				onClose?.();
			}}
			aria-label="Close"
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M18 6L6 18M6 6l12 12" />
			</svg>
		</button>
	{/if}
</div>

<style>
	.scroll-mode {
		width: 100%;
		min-height: 100vh;
		background: var(--background, #0f0f0f);
		color: var(--foreground, white);
		position: relative;
	}

	.scroll-content {
		/* Extra space at bottom for last section to scroll into view */
		padding-bottom: 50vh;
	}

	.scroll-section {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		position: relative;
	}

	/* Alternate background for visual separation */
	.scroll-section:nth-child(even) {
		background: rgba(255, 255, 255, 0.02);
	}

	.slide-content {
		width: 100%;
		max-width: 800px;
		margin: 0 auto;
	}

	.scroll-progress {
		position: fixed;
		bottom: 2rem;
		right: 2rem;
		padding: 0.5rem 1rem;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		z-index: 50;
	}

	.progress-text {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--muted-foreground, rgba(255, 255, 255, 0.6));
	}

	.close-button {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 101;
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
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

	/* Mobile optimizations */
	@media (max-width: 768px) {
		.scroll-section {
			padding: 3rem 1rem;
		}

		.scroll-progress {
			bottom: 1.5rem;
			right: 1rem;
			padding: 0.375rem 0.75rem;
		}

		.progress-text {
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

	/* Reduced motion - instant visibility */
	@media (prefers-reduced-motion: reduce) {
		.slide-content {
			opacity: 1 !important;
			transform: none !important;
		}
	}
</style>
