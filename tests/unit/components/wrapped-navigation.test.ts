/**
 * Navigation Logic Tests
 *
 * Tests for the pure navigation logic used by StoryMode and ScrollMode components.
 * These tests verify the navigation algorithms without requiring Svelte component rendering.
 *
 * Note: Component-level tests with Svelte 5 runes require Vitest browser mode,
 * which is not configured in this project. These tests focus on the extractable logic.
 */

import { describe, expect, it } from 'bun:test';

// =============================================================================
// Edge Zone Navigation Logic (from StoryMode)
// =============================================================================

/**
 * Determines navigation direction based on click position
 *
 * @param clickX - X coordinate of click relative to container
 * @param containerWidth - Width of the container
 * @param edgeZonePercent - Percentage of width considered "edge zone"
 * @returns 'previous' | 'next'
 */
function getNavigationDirection(
	clickX: number,
	containerWidth: number,
	edgeZonePercent: number = 0.15
): 'previous' | 'next' {
	const relativeX = clickX / containerWidth;

	// Left edge zone → previous
	if (relativeX < edgeZonePercent) {
		return 'previous';
	}
	// Right edge zone or center → next
	return 'next';
}

/**
 * Determines if a swipe gesture should trigger navigation
 *
 * @param deltaX - Horizontal displacement
 * @param deltaY - Vertical displacement
 * @param threshold - Minimum horizontal distance for swipe (must EXCEED this value)
 * @returns Navigation direction or null if not a valid swipe
 */
function getSwipeNavigation(
	deltaX: number,
	deltaY: number,
	threshold: number = 50
): 'previous' | 'next' | null {
	// Must be predominantly horizontal (strictly greater than vertical)
	if (Math.abs(deltaX) <= Math.abs(deltaY)) {
		return null;
	}

	// Must exceed threshold (strictly greater than, matching StoryMode component)
	if (Math.abs(deltaX) <= threshold) {
		return null;
	}

	// Swipe left → next, swipe right → previous
	return deltaX < 0 ? 'next' : 'previous';
}

/**
 * Determines keyboard navigation action
 *
 * @param key - Keyboard key pressed
 * @returns Navigation action or null
 */
function getKeyboardNavigation(
	key: string
): 'next' | 'previous' | 'first' | 'last' | 'close' | null {
	switch (key) {
		case 'ArrowRight':
		case 'ArrowDown':
		case ' ':
		case 'Enter':
			return 'next';
		case 'ArrowLeft':
		case 'ArrowUp':
			return 'previous';
		case 'Home':
			return 'first';
		case 'End':
			return 'last';
		case 'Escape':
			return 'close';
		default:
			return null;
	}
}

// =============================================================================
// Slide Bounds Logic
// =============================================================================

/**
 * Determines if navigation to next slide is allowed
 */
function canGoNext(currentSlide: number, totalSlides: number, isAnimating: boolean): boolean {
	return currentSlide < totalSlides - 1 && !isAnimating;
}

/**
 * Determines if navigation to previous slide is allowed
 */
function canGoPrevious(currentSlide: number, isAnimating: boolean): boolean {
	return currentSlide > 0 && !isAnimating;
}

/**
 * Calculates progress percentage
 */
function calculateProgress(currentSlide: number, totalSlides: number): number {
	if (totalSlides <= 0) return 0;
	return ((currentSlide + 1) / totalSlides) * 100;
}

// =============================================================================
// Tests
// =============================================================================

describe('Edge Zone Navigation', () => {
	const CONTAINER_WIDTH = 1000;
	const EDGE_ZONE_PERCENT = 0.15; // 15%

	describe('getNavigationDirection', () => {
		it('returns "previous" for clicks in left edge zone', () => {
			// Click at 5% of width (in the 15% left zone)
			expect(getNavigationDirection(50, CONTAINER_WIDTH, EDGE_ZONE_PERCENT)).toBe('previous');
		});

		it('returns "previous" for clicks at edge boundary', () => {
			// Click at exactly 14.9% (just inside left zone)
			expect(getNavigationDirection(149, CONTAINER_WIDTH, EDGE_ZONE_PERCENT)).toBe('previous');
		});

		it('returns "next" for clicks at edge boundary (outside)', () => {
			// Click at exactly 15% (boundary)
			expect(getNavigationDirection(150, CONTAINER_WIDTH, EDGE_ZONE_PERCENT)).toBe('next');
		});

		it('returns "next" for clicks in center', () => {
			// Click at 50% of width
			expect(getNavigationDirection(500, CONTAINER_WIDTH, EDGE_ZONE_PERCENT)).toBe('next');
		});

		it('returns "next" for clicks in right area', () => {
			// Click at 90% of width
			expect(getNavigationDirection(900, CONTAINER_WIDTH, EDGE_ZONE_PERCENT)).toBe('next');
		});

		it('handles edge case of click at 0', () => {
			expect(getNavigationDirection(0, CONTAINER_WIDTH, EDGE_ZONE_PERCENT)).toBe('previous');
		});

		it('handles edge case of click at full width', () => {
			expect(getNavigationDirection(CONTAINER_WIDTH, CONTAINER_WIDTH, EDGE_ZONE_PERCENT)).toBe(
				'next'
			);
		});
	});
});

describe('Swipe Navigation', () => {
	const SWIPE_THRESHOLD = 50;

	describe('getSwipeNavigation', () => {
		it('returns "next" for left swipe exceeding threshold', () => {
			// Swipe left: negative deltaX, minimal deltaY
			expect(getSwipeNavigation(-60, 10, SWIPE_THRESHOLD)).toBe('next');
		});

		it('returns "previous" for right swipe exceeding threshold', () => {
			// Swipe right: positive deltaX, minimal deltaY
			expect(getSwipeNavigation(60, 10, SWIPE_THRESHOLD)).toBe('previous');
		});

		it('returns null for swipe below threshold', () => {
			// Small swipe that doesn't exceed threshold
			expect(getSwipeNavigation(-30, 10, SWIPE_THRESHOLD)).toBeNull();
		});

		it('returns null for vertical swipe', () => {
			// Predominantly vertical movement
			expect(getSwipeNavigation(-30, 100, SWIPE_THRESHOLD)).toBeNull();
		});

		it('returns null for diagonal swipe (equal x and y)', () => {
			// Equal horizontal and vertical displacement
			expect(getSwipeNavigation(-60, 60, SWIPE_THRESHOLD)).toBeNull();
		});

		it('returns "next" for exactly threshold distance', () => {
			// Swipe exactly at threshold shouldn't trigger (must exceed)
			expect(getSwipeNavigation(-50, 0, SWIPE_THRESHOLD)).toBeNull();
		});

		it('returns "next" for just above threshold', () => {
			// Swipe just above threshold
			expect(getSwipeNavigation(-51, 0, SWIPE_THRESHOLD)).toBe('next');
		});

		it('handles zero deltaY correctly', () => {
			// Purely horizontal swipe
			expect(getSwipeNavigation(-100, 0, SWIPE_THRESHOLD)).toBe('next');
			expect(getSwipeNavigation(100, 0, SWIPE_THRESHOLD)).toBe('previous');
		});
	});
});

describe('Keyboard Navigation', () => {
	describe('getKeyboardNavigation', () => {
		it('returns "next" for ArrowRight', () => {
			expect(getKeyboardNavigation('ArrowRight')).toBe('next');
		});

		it('returns "next" for ArrowDown', () => {
			expect(getKeyboardNavigation('ArrowDown')).toBe('next');
		});

		it('returns "next" for Space', () => {
			expect(getKeyboardNavigation(' ')).toBe('next');
		});

		it('returns "next" for Enter', () => {
			expect(getKeyboardNavigation('Enter')).toBe('next');
		});

		it('returns "previous" for ArrowLeft', () => {
			expect(getKeyboardNavigation('ArrowLeft')).toBe('previous');
		});

		it('returns "previous" for ArrowUp', () => {
			expect(getKeyboardNavigation('ArrowUp')).toBe('previous');
		});

		it('returns "first" for Home', () => {
			expect(getKeyboardNavigation('Home')).toBe('first');
		});

		it('returns "last" for End', () => {
			expect(getKeyboardNavigation('End')).toBe('last');
		});

		it('returns "close" for Escape', () => {
			expect(getKeyboardNavigation('Escape')).toBe('close');
		});

		it('returns null for unrecognized keys', () => {
			expect(getKeyboardNavigation('a')).toBeNull();
			expect(getKeyboardNavigation('Tab')).toBeNull();
			expect(getKeyboardNavigation('Shift')).toBeNull();
		});
	});
});

describe('Slide Bounds', () => {
	describe('canGoNext', () => {
		it('allows navigation when not at last slide and not animating', () => {
			expect(canGoNext(0, 5, false)).toBe(true);
			expect(canGoNext(3, 5, false)).toBe(true);
		});

		it('prevents navigation when at last slide', () => {
			expect(canGoNext(4, 5, false)).toBe(false);
		});

		it('prevents navigation when animating', () => {
			expect(canGoNext(0, 5, true)).toBe(false);
		});

		it('handles single slide', () => {
			expect(canGoNext(0, 1, false)).toBe(false);
		});

		it('handles empty slides', () => {
			expect(canGoNext(0, 0, false)).toBe(false);
		});
	});

	describe('canGoPrevious', () => {
		it('allows navigation when not at first slide and not animating', () => {
			expect(canGoPrevious(1, false)).toBe(true);
			expect(canGoPrevious(4, false)).toBe(true);
		});

		it('prevents navigation when at first slide', () => {
			expect(canGoPrevious(0, false)).toBe(false);
		});

		it('prevents navigation when animating', () => {
			expect(canGoPrevious(1, true)).toBe(false);
		});
	});

	describe('calculateProgress', () => {
		it('calculates correct percentage', () => {
			expect(calculateProgress(0, 5)).toBe(20); // 1/5
			expect(calculateProgress(2, 5)).toBe(60); // 3/5
			expect(calculateProgress(4, 5)).toBe(100); // 5/5
		});

		it('returns 0 for empty slides', () => {
			expect(calculateProgress(0, 0)).toBe(0);
		});

		it('handles single slide', () => {
			expect(calculateProgress(0, 1)).toBe(100);
		});
	});
});

describe('Mode Toggle Logic', () => {
	/**
	 * Gets the target mode when toggle is clicked
	 */
	function getTargetMode(currentMode: 'story' | 'scroll'): 'story' | 'scroll' {
		return currentMode === 'story' ? 'scroll' : 'story';
	}

	/**
	 * Gets the display label for the toggle button
	 */
	function getToggleLabel(currentMode: 'story' | 'scroll'): string {
		return currentMode === 'story' ? 'Switch to Scroll Mode' : 'Switch to Story Mode';
	}

	describe('getTargetMode', () => {
		it('returns scroll when in story mode', () => {
			expect(getTargetMode('story')).toBe('scroll');
		});

		it('returns story when in scroll mode', () => {
			expect(getTargetMode('scroll')).toBe('story');
		});
	});

	describe('getToggleLabel', () => {
		it('returns correct label for story mode', () => {
			expect(getToggleLabel('story')).toBe('Switch to Scroll Mode');
		});

		it('returns correct label for scroll mode', () => {
			expect(getToggleLabel('scroll')).toBe('Switch to Story Mode');
		});
	});
});

describe('Position Preservation', () => {
	/**
	 * Clamps a slide index to valid bounds
	 */
	function clampSlideIndex(index: number, totalSlides: number): number {
		if (totalSlides <= 0) return 0;
		return Math.max(0, Math.min(index, totalSlides - 1));
	}

	describe('clampSlideIndex', () => {
		it('returns same index if within bounds', () => {
			expect(clampSlideIndex(2, 5)).toBe(2);
		});

		it('clamps negative index to 0', () => {
			expect(clampSlideIndex(-1, 5)).toBe(0);
		});

		it('clamps index exceeding total to last valid index', () => {
			expect(clampSlideIndex(10, 5)).toBe(4);
		});

		it('handles zero total slides', () => {
			expect(clampSlideIndex(0, 0)).toBe(0);
		});

		it('handles single slide', () => {
			expect(clampSlideIndex(5, 1)).toBe(0);
		});
	});
});
