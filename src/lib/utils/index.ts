import { type ClassValue, clsx } from 'clsx';

/**
 * Utility function for merging class names
 * Uses clsx for conditional class handling
 */
export function cn(...inputs: ClassValue[]): string {
	return clsx(inputs);
}
