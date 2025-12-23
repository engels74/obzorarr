import { toast as sonnerToast } from 'svelte-sonner';

/**
 * Toast Notification Service
 *
 * Provides a consistent API for showing toast notifications with:
 * - Debouncing to prevent notification spam
 * - Type-specific default durations
 * - Theme-aware styling (via CSS in app.css)
 *
 * @module services/toast
 */

// =============================================================================
// Debouncing
// =============================================================================

/** Track recent toast messages to prevent duplicates */
const recentToasts = new Map<string, number>();

/** Minimum time between identical toasts (ms) */
const DEBOUNCE_MS = 300;

/**
 * Check if a message should be debounced
 * @param message - The toast message
 * @returns true if message was shown recently
 */
function shouldDebounce(message: string): boolean {
	const now = Date.now();
	const lastShown = recentToasts.get(message);

	if (lastShown && now - lastShown < DEBOUNCE_MS) {
		return true;
	}

	recentToasts.set(message, now);

	// Cleanup old entries to prevent memory leaks
	if (recentToasts.size > 50) {
		const oldest = [...recentToasts.entries()].sort((a, b) => a[1] - b[1]).slice(0, 25);
		oldest.forEach(([key]) => recentToasts.delete(key));
	}

	return false;
}

// =============================================================================
// Toast Options
// =============================================================================

interface ToastOptions {
	/** Custom duration in ms (overrides default) */
	duration?: number;
	/** Optional description below the title */
	description?: string;
}

// =============================================================================
// Toast API
// =============================================================================

export const toast = {
	/**
	 * Show a success toast
	 * @param message - The success message
	 * @param options - Optional duration and description
	 */
	success(message: string, options?: ToastOptions) {
		if (shouldDebounce(message)) return;
		return sonnerToast.success(message, {
			duration: options?.duration ?? 4000,
			description: options?.description
		});
	},

	/**
	 * Show an error toast (longer duration by default)
	 * @param message - The error message
	 * @param options - Optional duration and description
	 */
	error(message: string, options?: ToastOptions) {
		if (shouldDebounce(message)) return;
		return sonnerToast.error(message, {
			duration: options?.duration ?? 7000,
			description: options?.description
		});
	},

	/**
	 * Show a warning toast
	 * @param message - The warning message
	 * @param options - Optional duration and description
	 */
	warning(message: string, options?: ToastOptions) {
		if (shouldDebounce(message)) return;
		return sonnerToast.warning(message, {
			duration: options?.duration ?? 5000,
			description: options?.description
		});
	},

	/**
	 * Show an info toast
	 * @param message - The info message
	 * @param options - Optional duration and description
	 */
	info(message: string, options?: ToastOptions) {
		if (shouldDebounce(message)) return;
		return sonnerToast.info(message, {
			duration: options?.duration ?? 4000,
			description: options?.description
		});
	},

	/**
	 * Dismiss a specific toast or all toasts
	 * @param toastId - Optional ID of toast to dismiss (dismisses all if omitted)
	 */
	dismiss(toastId?: string | number) {
		return sonnerToast.dismiss(toastId);
	}
};
