export const SPRING_PRESETS = {
	gentle: { stiffness: 120, damping: 20 },
	snappy: { stiffness: 200, damping: 18 },
	bouncy: { stiffness: 180, damping: 12 },
	dramatic: { stiffness: 100, damping: 15 }
} as const;

export const STAGGER_PRESETS = {
	fast: 0.05,
	normal: 0.1,
	slow: 0.15,
	dramatic: 0.2
} as const;

export const DURATION_PRESETS = {
	instant: 0.2,
	fast: 0.3,
	normal: 0.5,
	slow: 0.7,
	dramatic: 1.0
} as const;

export const EASING_PRESETS = {
	smooth: [0.4, 0, 0.2, 1] as const,
	bounce: [0.34, 1.56, 0.64, 1] as const,
	sharp: [0.4, 0, 0.6, 1] as const,
	easeOut: [0, 0, 0.2, 1] as const,
	easeIn: [0.4, 0, 1, 1] as const
} as const;

export const DELAY_PRESETS = {
	none: 0,
	minimal: 0.1,
	short: 0.2,
	medium: 0.4,
	long: 0.6
} as const;

/** Animate a number with easeOutExpo easing. Returns cleanup function. */
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

export function formatNumber(num: number): string {
	return num.toLocaleString('en-US');
}

export const KEYFRAMES = {
	fadeInUp: {
		opacity: [0, 1],
		transform: ['translateY(20px)', 'translateY(0)']
	},
	fadeInDown: {
		opacity: [0, 1],
		transform: ['translateY(-20px)', 'translateY(0)']
	},
	fadeInLeft: {
		opacity: [0, 1],
		transform: ['translateX(-20px)', 'translateX(0)']
	},
	fadeInRight: {
		opacity: [0, 1],
		transform: ['translateX(20px)', 'translateX(0)']
	},
	scaleIn: {
		opacity: [0, 1],
		transform: ['scale(0.8)', 'scale(1)']
	},
	scaleInBounce: {
		opacity: [0, 1],
		transform: ['scale(0)', 'scale(1.1)', 'scale(1)']
	},
	fadeIn: {
		opacity: [0, 1]
	},
	barGrow: {
		transform: ['scaleY(0)', 'scaleY(1)']
	},
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
