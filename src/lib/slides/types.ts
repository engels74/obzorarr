import { z } from 'zod';

/**
 * Shared Slides Types
 *
 * Client-safe type definitions for the slides system.
 * These types can be imported in both client and server code.
 *
 * @module slides/types
 */

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Slide type schema for validation
 */
export const SlideTypeSchema = z.enum([
	'total-time',
	'top-movies',
	'top-shows',
	'genres',
	'distribution',
	'percentile',
	'binge',
	'first-last',
	'custom'
]);

export type SlideTypeValue = z.infer<typeof SlideTypeSchema>;

/**
 * Input for updating slide config
 */
export const UpdateSlideConfigSchema = z.object({
	enabled: z.boolean().optional(),
	sortOrder: z.number().int().nonnegative().optional()
});

export type UpdateSlideConfig = z.infer<typeof UpdateSlideConfigSchema>;

/**
 * Input for creating custom slide
 */
export const CreateCustomSlideSchema = z.object({
	title: z.string().min(1).max(200),
	content: z.string().min(1).max(10000),
	enabled: z.boolean().default(true),
	sortOrder: z.number().int().nonnegative(),
	year: z.number().int().min(2000).max(2100).nullable().optional()
});

export type CreateCustomSlide = z.infer<typeof CreateCustomSlideSchema>;

/**
 * Input for updating custom slide
 */
export const UpdateCustomSlideSchema = z.object({
	title: z.string().min(1).max(200).optional(),
	content: z.string().min(1).max(10000).optional(),
	enabled: z.boolean().optional(),
	sortOrder: z.number().int().nonnegative().optional(),
	year: z.number().int().min(2000).max(2100).nullable().optional()
});

export type UpdateCustomSlide = z.infer<typeof UpdateCustomSlideSchema>;

// =============================================================================
// TypeScript Interfaces
// =============================================================================

/**
 * Slide configuration record from database
 */
export interface SlideConfig {
	id: number;
	slideType: SlideTypeValue;
	enabled: boolean;
	sortOrder: number;
}

/**
 * Custom slide record from database
 */
export interface CustomSlide {
	id: number;
	title: string;
	content: string;
	enabled: boolean;
	sortOrder: number;
	year: number | null;
}

/**
 * Rendered slide info for presentation
 */
export interface RenderedSlide {
	type: SlideTypeValue;
	sortOrder: number;
	customSlideId?: number;
}

/**
 * Markdown validation result
 */
export interface MarkdownValidationResult {
	valid: boolean;
	errors: string[];
}
