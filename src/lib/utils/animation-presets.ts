/**
 * Animation Presets for Premium Wrapped Slides
 *
 * Provides consistent timing, easing, and physics across all slide animations.
 * Used with Motion One library for unified animation behavior.
 */

/** Spring physics presets for Motion One */
export const SPRING_PRESETS = {
	/** Gentle, relaxed spring - good for background elements */
	gentle: { stiffness: 120, damping: 20 },
	/** Snappy, responsive spring - good for UI elements */
	snappy: { stiffness: 200, damping: 18 },
	/** Bouncy spring with overshoot - good for emphasis */
	bouncy: { stiffness: 180, damping: 12 },
	/** Dramatic, slower spring - good for hero elements */
	dramatic: { stiffness: 100, damping: 15 }
} as const;

/** Stagger timing presets (in seconds) */
export const STAGGER_PRESETS = {
	/** Fast stagger for quick lists */
	fast: 0.05,
	/** Normal stagger for standard lists */
	normal: 0.1,
	/** Slow stagger for emphasis */
	slow: 0.15,
	/** Dramatic stagger for showcasing items */
	dramatic: 0.2
} as const;

/** Duration presets (in seconds) */
export const DURATION_PRESETS = {
	instant: 0.2,
	fast: 0.3,
	normal: 0.5,
	slow: 0.7,
	dramatic: 1.0
} as const;

/** Easing curve presets (CSS cubic-bezier arrays) */
export const EASING_PRESETS = {
	/** Smooth ease-in-out */
	smooth: [0.4, 0, 0.2, 1] as const,
	/** Bouncy with slight overshoot */
	bounce: [0.34, 1.56, 0.64, 1] as const,
	/** Sharp, decisive movement */
	sharp: [0.4, 0, 0.6, 1] as const,
	/** Smooth ease-out */
	easeOut: [0, 0, 0.2, 1] as const,
	/** Smooth ease-in */
	easeIn: [0.4, 0, 1, 1] as const
} as const;

/** Start delays for common animation sequences */
export const DELAY_PRESETS = {
	/** No delay */
	none: 0,
	/** Minimal delay for staggering */
	minimal: 0.1,
	/** Short delay after container appears */
	short: 0.2,
	/** Medium delay for secondary content */
	medium: 0.4,
	/** Long delay for tertiary content */
	long: 0.6
} as const;

/**
 * Create a number counting animation (odometer effect)
 *
 * Animates from a start value to an end value with easing,
 * calling the update callback with the current value on each frame.
 *
 * @param from - Starting number
 * @param to - Target number
 * @param duration - Animation duration in milliseconds
 * @param onUpdate - Callback with current value on each frame
 * @param onComplete - Optional callback when animation completes
 * @returns Cleanup function to stop the animation
 *
 * @example
 * ```ts
 * const stop = animateNumber(0, 4561, 1500, (value) => {
 *   displayedHours = value;
 * });
 *
 * // In cleanup:
 * return () => stop();
 * ```
 */
export function animateNumber(
	from: number,
	to: number,
	duration: number,
	onUpdate: (value: number) => void,
	onComplete?: () => void
): () => void {
	const startTime = performance.now();
	let animationId: number;
	let stopped = false;

	function update() {
		if (stopped) return;

		const elapsed = performance.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);

		// easeOutExpo - fast start, slow end
		const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
		const current = Math.round(from + (to - from) * eased);

		onUpdate(current);

		if (progress < 1) {
			animationId = requestAnimationFrame(update);
		} else {
			onComplete?.();
		}
	}

	animationId = requestAnimationFrame(update);

	return () => {
		stopped = true;
		cancelAnimationFrame(animationId);
	};
}

/**
 * Create a decimal number counting animation
 *
 * Similar to animateNumber but preserves decimal precision.
 *
 * @param from - Starting number
 * @param to - Target number
 * @param duration - Animation duration in milliseconds
 * @param decimals - Number of decimal places to show
 * @param onUpdate - Callback with current value on each frame
 * @param onComplete - Optional callback when animation completes
 * @returns Cleanup function to stop the animation
 */
export function animateDecimal(
	from: number,
	to: number,
	duration: number,
	decimals: number,
	onUpdate: (value: number) => void,
	onComplete?: () => void
): () => void {
	const startTime = performance.now();
	let animationId: number;
	let stopped = false;
	const multiplier = Math.pow(10, decimals);

	function update() {
		if (stopped) return;

		const elapsed = performance.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);

		// easeOutExpo
		const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
		const current = Math.round((from + (to - from) * eased) * multiplier) / multiplier;

		onUpdate(current);

		if (progress < 1) {
			animationId = requestAnimationFrame(update);
		} else {
			onComplete?.();
		}
	}

	animationId = requestAnimationFrame(update);

	return () => {
		stopped = true;
		cancelAnimationFrame(animationId);
	};
}

/**
 * Format a large number with commas
 *
 * @param num - Number to format
 * @returns Formatted string with commas
 *
 * @example
 * formatNumber(4561) // "4,561"
 * formatNumber(1234567) // "1,234,567"
 */
export function formatNumber(num: number): string {
	return num.toLocaleString('en-US');
}

/**
 * Common animation keyframes for consistent entrance effects
 */
export const KEYFRAMES = {
	/** Fade in from below */
	fadeInUp: {
		opacity: [0, 1],
		transform: ['translateY(20px)', 'translateY(0)']
	},
	/** Fade in from above */
	fadeInDown: {
		opacity: [0, 1],
		transform: ['translateY(-20px)', 'translateY(0)']
	},
	/** Fade in from left */
	fadeInLeft: {
		opacity: [0, 1],
		transform: ['translateX(-20px)', 'translateX(0)']
	},
	/** Fade in from right */
	fadeInRight: {
		opacity: [0, 1],
		transform: ['translateX(20px)', 'translateX(0)']
	},
	/** Scale in from small */
	scaleIn: {
		opacity: [0, 1],
		transform: ['scale(0.8)', 'scale(1)']
	},
	/** Scale in with bounce */
	scaleInBounce: {
		opacity: [0, 1],
		transform: ['scale(0)', 'scale(1.1)', 'scale(1)']
	},
	/** Simple fade */
	fadeIn: {
		opacity: [0, 1]
	},
	/** Bar chart grow from bottom */
	barGrow: {
		transform: ['scaleY(0)', 'scaleY(1)']
	},
	/** Horizontal bar grow from left */
	barGrowX: {
		transform: ['scaleX(0)', 'scaleX(1)']
	}
} as const;

export type SpringPreset = keyof typeof SPRING_PRESETS;
export type StaggerPreset = keyof typeof STAGGER_PRESETS;
export type DurationPreset = keyof typeof DURATION_PRESETS;
export type EasingPreset = keyof typeof EASING_PRESETS;
export type DelayPreset = keyof typeof DELAY_PRESETS;
export type KeyframePreset = keyof typeof KEYFRAMES;
