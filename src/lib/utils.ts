import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * shadcn-svelte v1.x helper types for Svelte 5 components. Each primitive
 * imports these from `$lib/utils.js` so the registry's generated components
 * compile out of the box.
 */
export type WithElementRef<T, R = HTMLElement> = T & { ref?: R | null };
export type WithoutChildren<T> = Omit<T, 'children'>;
export type WithoutChild<T> = Omit<T, 'child'>;
export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'>;
