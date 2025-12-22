import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for merging class names with Tailwind/UnoCSS conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Type helper for excluding children props from component props
 */
export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'>;
