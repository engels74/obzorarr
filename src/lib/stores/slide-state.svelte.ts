/**
 * Slide Navigation State
 *
 * Shared reactive state for slide navigation in Story Mode.
 * Uses Svelte 5 runes for reactivity.
 *
 * @module stores/slide-state
 */

/**
 * Slide navigation store class
 *
 * Manages current slide position, animation state, and navigation.
 */
export class SlideStateStore {
	/** Current slide index (0-based) */
	currentSlide = $state(0);

	/** Total number of slides */
	totalSlides = $state(0);

	/** Whether a slide transition animation is in progress */
	isAnimating = $state(false);

	/** Direction of current/last navigation */
	direction = $state<'forward' | 'backward'>('forward');

	// Derived values
	/** Whether we can go to the next slide */
	canGoNext = $derived(this.currentSlide < this.totalSlides - 1 && !this.isAnimating);

	/** Whether we can go to the previous slide */
	canGoPrevious = $derived(this.currentSlide > 0 && !this.isAnimating);

	/** Whether we're on the first slide */
	isFirst = $derived(this.currentSlide === 0);

	/** Whether we're on the last slide */
	isLast = $derived(this.currentSlide >= this.totalSlides - 1);

	/** Progress as a percentage (0-100) */
	progress = $derived(this.totalSlides > 0 ? ((this.currentSlide + 1) / this.totalSlides) * 100 : 0);

	/**
	 * Initialize the store with total slide count
	 */
	initialize(total: number, startIndex: number = 0): void {
		this.totalSlides = total;
		this.currentSlide = Math.max(0, Math.min(startIndex, total - 1));
		this.isAnimating = false;
		this.direction = 'forward';
	}

	/**
	 * Go to the next slide
	 */
	goToNext(): boolean {
		if (!this.canGoNext) return false;

		this.direction = 'forward';
		this.currentSlide++;
		return true;
	}

	/**
	 * Go to the previous slide
	 */
	goToPrevious(): boolean {
		if (!this.canGoPrevious) return false;

		this.direction = 'backward';
		this.currentSlide--;
		return true;
	}

	/**
	 * Go to a specific slide
	 */
	goToSlide(index: number): boolean {
		if (this.isAnimating) return false;
		if (index < 0 || index >= this.totalSlides) return false;
		if (index === this.currentSlide) return false;

		this.direction = index > this.currentSlide ? 'forward' : 'backward';
		this.currentSlide = index;
		return true;
	}

	/**
	 * Go to the first slide
	 */
	goToFirst(): boolean {
		return this.goToSlide(0);
	}

	/**
	 * Go to the last slide
	 */
	goToLast(): boolean {
		return this.goToSlide(this.totalSlides - 1);
	}

	/**
	 * Start animation (called when slide transition begins)
	 */
	startAnimation(): void {
		this.isAnimating = true;
	}

	/**
	 * End animation (called when slide transition completes)
	 */
	endAnimation(): void {
		this.isAnimating = false;
	}

	/**
	 * Reset to initial state
	 */
	reset(): void {
		this.currentSlide = 0;
		this.totalSlides = 0;
		this.isAnimating = false;
		this.direction = 'forward';
	}
}

/**
 * Create a new slide state store instance
 *
 * Use this to create isolated stores for different wrapped pages.
 */
export function createSlideState(): SlideStateStore {
	return new SlideStateStore();
}

/**
 * Default slide state instance for single-page use
 */
export const slideState = new SlideStateStore();
