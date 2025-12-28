import { toast as sonnerToast } from 'svelte-sonner';

const recentToasts = new Map<string, number>();
const DEBOUNCE_MS = 300;

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

interface ToastOptions {
	duration?: number;
	description?: string;
}

export const toast = {
	success(message: string, options?: ToastOptions) {
		if (shouldDebounce(message)) return;
		return sonnerToast.success(message, {
			duration: options?.duration ?? 4000,
			description: options?.description
		});
	},

	error(message: string, options?: ToastOptions) {
		if (shouldDebounce(message)) return;
		return sonnerToast.error(message, {
			duration: options?.duration ?? 7000,
			description: options?.description
		});
	},

	warning(message: string, options?: ToastOptions) {
		if (shouldDebounce(message)) return;
		return sonnerToast.warning(message, {
			duration: options?.duration ?? 5000,
			description: options?.description
		});
	},

	info(message: string, options?: ToastOptions) {
		if (shouldDebounce(message)) return;
		return sonnerToast.info(message, {
			duration: options?.duration ?? 4000,
			description: options?.description
		});
	},

	dismiss(toastId?: string | number) {
		return sonnerToast.dismiss(toastId);
	}
};
